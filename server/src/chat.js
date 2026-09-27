// Persistent, multi-turn AI chat with RAG retrieval over vault documents.
// See CHAT_RAG_INTEGRATION.md for the design. Mounted at /api in app.js, so
// routes here (e.g. '/chat') become /api/chat.
import express from 'express';
import { pool } from './db.js';
import { requireAuth, camelRow, camelRows, callAIChatCompletion, describeAiFailure } from './utils.js';
import { getAuthorizedDocumentIds, isAuthorizedForDocument } from './authz.js';
import { retrieveRelevantChunks, indexDocument, isEmbeddingConfigured } from './embeddings.js';
import { logAudit } from './audit.js';

const router = express.Router();

const AI_API_KEY = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '';
const AI_BASE_URL = (process.env.AI_BASE_URL || (process.env.GEMINI_API_KEY ? 'https://openrouter.ai/api/v1' : '')).replace(/\/$/, '');
const AI_MODEL = process.env.AI_MODEL || 'openai/gpt-4o';
const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || '';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 60000;
// The intent-detection call needs a model that actually supports OpenAI-style
// tool calling — the main AI_MODEL may not (e.g. a vision-only Ollama model
// rejects `tools` outright with a 400). Lets that be configured separately
// from the model used for the real answer; falls back to the existing chain
// if unset, which is safe (detectDocumentSearchIntent fails open on a 400 too).
const AI_INTENT_MODEL = process.env.AI_INTENT_MODEL || AI_FALLBACK_MODEL || AI_MODEL;

const HISTORY_LIMIT = 20; // recent messages included as conversation context
const INTENT_HISTORY_LIMIT = 6; // only recent turns needed to judge intent

// Tool-calling based gate in front of RAG: rather than embedding + searching
// documents on every single message (including "hi", "thanks", etc.), ask the
// model to decide first, via a real tool call, whether this message actually
// needs a document lookup at all.
const INTENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_documents',
      description: "Search the user's authorized medical documents (lab reports, prescriptions, doctor's notes, imaging, etc.) for information needed to answer their question. Call this ONLY when answering requires specific facts from the user's own uploaded documents. Do NOT call it for greetings, small talk, thanks, or general medical knowledge questions that don't reference the user's own records.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'A concise search query capturing what to look for in the documents.' },
        },
        required: ['query'],
      },
    },
  },
];

/**
 * Decides whether the current message needs a RAG document search, via one
 * small non-streaming tool-calling completion. Fails OPEN (defaults to
 * searching) on any error or on a model that ignores/mishandles `tools` —
 * for a medical records app, an unnecessary search is much cheaper than a
 * missed one.
 */
async function detectDocumentSearchIntent(message, history) {
  try {
    // `history` already ends with this same message (it's fetched from the
    // DB right after the user message is inserted) — don't append it twice.
    const intentMessages = [
      {
        role: 'system',
        content: 'You are a routing step for a medical records assistant. Decide whether answering the user\'s latest message requires searching their uploaded medical documents. Call search_documents only when it genuinely does; otherwise just reply briefly and call no tool.',
      },
      ...history.slice(-INTENT_HISTORY_LIMIT).map((h) => ({ role: h.role, content: h.content })),
    ];

    const res = await callAIChatCompletion({
      url: `${AI_BASE_URL}/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
      },
      buildBody: (model) => ({
        model,
        messages: intentMessages,
        tools: INTENT_TOOLS,
        tool_choice: 'auto',
        max_tokens: 200,
        temperature: 0,
      }),
      primaryModel: AI_INTENT_MODEL,
      fallbackModel: '',
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`Chat intent model "${AI_INTENT_MODEL}" rejected the tools request (${res.status}), defaulting to search:`, errText.slice(0, 200));
      return { needsSearch: true, query: message };
    }

    const data = await res.json();
    const toolCalls = data.choices?.[0]?.message?.tool_calls || [];
    const call = toolCalls.find((tc) => tc.function?.name === 'search_documents');
    if (!call) return { needsSearch: false, query: message };

    let query = message;
    try {
      const args = JSON.parse(call.function.arguments || '{}');
      if (args.query) query = args.query;
    } catch {
      // Keep the original message as the query if arguments aren't valid JSON.
    }
    return { needsSearch: true, query };
  } catch (err) {
    console.warn('Chat intent detection failed, defaulting to search:', err.message);
    return { needsSearch: true, query: message };
  }
}

function buildSystemPrompt(contextChunks) {
  const base = `You are MediVault's chat assistant. Answer using ONLY the retrieved document excerpts below plus the conversation history. If the excerpts don't contain the answer, say so plainly — never guess or use outside medical knowledge as if it were the patient's data. Never diagnose. Cite which document each fact comes from by its number, like "(Doc 2)". Be concise.`;

  if (contextChunks.length === 0) {
    return `${base}\n\nNo relevant documents were found for this question (either none exist, or none are within your access).`;
  }

  const excerpts = contextChunks
    .map((c, i) => `[Doc ${i + 1}] "${c.documentName}" (${c.documentType}):\n${c.content}`)
    .join('\n\n---\n\n');

  return `${base}\n\nRetrieved excerpts:\n\n${excerpts}`;
}

async function assertOwnsSession(sessionId, userId) {
  const { rows } = await pool.query('SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
  return rows.length > 0;
}

// ── POST /chat — send a message, stream the answer back as NDJSON ──
router.post('/chat', requireAuth, async (req, res) => {
  const { sessionId: sessionIdInput, message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ message: 'message is required.' });
  }
  if (!isEmbeddingConfigured()) {
    return res.status(503).json({ message: 'Chat is not configured. Set EMBEDDING_BASE_URL and EMBEDDING_MODEL in .env.' });
  }
  if (!AI_BASE_URL) {
    return res.status(503).json({ message: 'AI service not configured. Set AI_BASE_URL and AI_MODEL in .env.' });
  }

  try {
    let sessionId = sessionIdInput;
    if (sessionId) {
      if (!(await assertOwnsSession(sessionId, req.userId))) {
        return res.status(404).json({ message: 'Chat session not found.' });
      }
    } else {
      const title = message.trim().slice(0, 80);
      const { rows } = await pool.query(
        'INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id',
        [req.userId, title]
      );
      sessionId = rows[0].id;
    }

    await pool.query(
      "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2)",
      [sessionId, message.trim()]
    );

    const { rows: historyRows } = await pool.query(
      `SELECT role, content FROM chat_messages WHERE session_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [sessionId, HISTORY_LIMIT]
    );
    const history = historyRows.reverse(); // chronological order

    // Retrieval: restrict the candidate set to authorized documents BEFORE
    // any similarity search runs (server/src/authz.js). Never search first
    // and filter after.
    const authorizedDocIds = await getAuthorizedDocumentIds(req.userId, req.userRole);

    // Gate the search behind a tool-calling intent check, but skip the check
    // entirely (and just fall through to no results) when there's nothing to
    // search anyway — no point asking the model to decide.
    let chunks = [];
    if (authorizedDocIds.length > 0) {
      const intent = await detectDocumentSearchIntent(message.trim(), history);
      if (intent.needsSearch) {
        chunks = await retrieveRelevantChunks(intent.query, authorizedDocIds);
      }
    }

    let contextChunks = [];
    if (chunks.length > 0) {
      const { rows: docRows } = await pool.query(
        'SELECT id, original_filename, document_type FROM documents WHERE id = ANY($1)',
        [[...new Set(chunks.map((c) => c.documentId))]]
      );
      const docById = new Map(docRows.map((d) => [d.id, d]));
      contextChunks = chunks.map((c) => ({
        ...c,
        documentName: docById.get(c.documentId)?.original_filename || 'Unknown document',
        documentType: docById.get(c.documentId)?.document_type || 'unknown',
      }));
    }

    const systemPrompt = buildSystemPrompt(contextChunks);
    const upstreamMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({ role: h.role, content: h.content })),
    ];

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Chat-Session-Id', sessionId);

    const citations = contextChunks.map((c) => ({
      documentId: c.documentId,
      documentName: c.documentName,
      documentType: c.documentType,
      chunkIndex: c.chunkIndex,
    }));
    res.write(JSON.stringify({ type: 'citations', sessionId, citations }) + '\n');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    req.on('close', () => controller.abort());

    let fullText = '';
    try {
      const upstream = await callAIChatCompletion({
        url: `${AI_BASE_URL}/chat/completions`,
        headers: {
          'Content-Type': 'application/json',
          ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
        },
        buildBody: (model) => ({
          model,
          messages: upstreamMessages,
          max_tokens: 1500,
          temperature: 0.3,
          stream: true,
        }),
        primaryModel: AI_MODEL,
        fallbackModel: AI_FALLBACK_MODEL,
        signal: controller.signal,
      });

      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => '');
        console.error('Chat upstream error:', upstream.status, errText);
        res.write(JSON.stringify({ type: 'error', message: 'The AI service ran into a problem answering that. Please try again in a moment.' }) + '\n');
        return res.end();
      }

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep the last (possibly incomplete) line
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          let parsed;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            res.write(JSON.stringify({ type: 'token', content: delta }) + '\n');
          }
        }
      }
    } catch (streamErr) {
      if (streamErr.name === 'AbortError') {
        console.warn('Chat stream aborted (timeout or client disconnect).');
      } else {
        console.error('Chat stream error:', streamErr.message);
        const { message: friendlyMessage } = describeAiFailure(streamErr);
        res.write(JSON.stringify({ type: 'error', message: friendlyMessage }) + '\n');
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!fullText.trim()) {
      res.end();
      return;
    }

    const { rows: msgRows } = await pool.query(
      "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2) RETURNING id",
      [sessionId, fullText]
    );
    const assistantMessageId = msgRows[0].id;

    for (const c of contextChunks) {
      await pool.query(
        'INSERT INTO chat_message_citations (message_id, document_id, chunk_index) VALUES ($1, $2, $3)',
        [assistantMessageId, c.documentId, c.chunkIndex]
      );
    }

    await pool.query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);

    // Audit chat-driven access to document content, once per distinct document
    // touched — matching the existing view_document/download_document pattern.
    const touchedDocumentIds = [...new Set(contextChunks.map((c) => c.documentId))];
    for (const documentId of touchedDocumentIds) {
      const { rows: patientRows } = await pool.query('SELECT patient_id FROM documents WHERE id = $1', [documentId]);
      await logAudit({
        patientId: patientRows[0]?.patient_id, documentId, actorUserId: req.userId,
        action: 'chat_query', req, metadata: { sessionId, question: message.trim().slice(0, 300) },
      });
    }

    res.write(JSON.stringify({ type: 'done', sessionId, messageId: assistantMessageId }) + '\n');
    res.end();
  } catch (err) {
    console.error('Chat error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Chat request failed.' });
    } else {
      res.write(JSON.stringify({ type: 'error', message: 'Chat request failed.' }) + '\n');
      res.end();
    }
  }
});

// ── GET /chat/sessions — list the authenticated user's sessions ──
router.get('/chat/sessions', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, created_at, updated_at FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.userId]
    );
    res.json({ sessions: camelRows(rows) });
  } catch (err) {
    console.error('List chat sessions error:', err.message);
    res.status(500).json({ message: 'Failed to list chat sessions.' });
  }
});

// ── GET /chat/sessions/:id — one session's messages + citations ──
router.get('/chat/sessions/:id', requireAuth, async (req, res) => {
  try {
    if (!(await assertOwnsSession(req.params.id, req.userId))) {
      return res.status(404).json({ message: 'Chat session not found.' });
    }
    const { rows: messages } = await pool.query(
      'SELECT id, role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    const messageIds = messages.map((m) => m.id);
    let citationsByMessage = {};
    if (messageIds.length > 0) {
      const { rows: citationRows } = await pool.query(
        `SELECT c.message_id, c.document_id, c.chunk_index, d.original_filename, d.document_type
         FROM chat_message_citations c
         JOIN documents d ON d.id = c.document_id
         WHERE c.message_id = ANY($1)`,
        [messageIds]
      );
      citationsByMessage = citationRows.reduce((acc, c) => {
        (acc[c.message_id] ||= []).push(camelRow(c));
        return acc;
      }, {});
    }
    res.json({
      messages: messages.map((m) => ({ ...camelRow(m), citations: citationsByMessage[m.id] || [] })),
    });
  } catch (err) {
    console.error('Get chat session error:', err.message);
    res.status(500).json({ message: 'Failed to load chat session.' });
  }
});

// ── DELETE /chat/sessions/:id ──
router.delete('/chat/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (rowCount === 0) return res.status(404).json({ message: 'Chat session not found.' });
    res.json({ message: 'Chat session deleted.' });
  } catch (err) {
    console.error('Delete chat session error:', err.message);
    res.status(500).json({ message: 'Failed to delete chat session.' });
  }
});

// ── POST /documents/:id/reindex — chunk + embed a document for retrieval ──
router.post('/documents/:id/reindex', requireAuth, async (req, res) => {
  try {
    if (!isEmbeddingConfigured()) {
      return res.status(503).json({ message: 'Embeddings are not configured. Set EMBEDDING_BASE_URL and EMBEDDING_MODEL in .env.' });
    }
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Document not found.' });
    const doc = rows[0];

    const authorized = await isAuthorizedForDocument(doc, req.userId, req.userRole);
    if (!authorized) return res.status(403).json({ message: 'Access denied.' });

    const result = await indexDocument(req.params.id);
    res.json({ message: result.skipped ? `Not indexed: ${result.skipped}` : 'Document indexed.', ...result });
  } catch (err) {
    console.error('Reindex error:', err.message);
    res.status(500).json({ message: 'Failed to index document.' });
  }
});

export default router;
