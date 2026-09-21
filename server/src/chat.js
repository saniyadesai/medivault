// Persistent, multi-turn AI chat with RAG retrieval over vault documents.
// See CHAT_RAG_INTEGRATION.md for the design. Mounted at /api in app.js, so
// routes here (e.g. '/chat') become /api/chat.
import express from 'express';
import { pool } from './db.js';
import { requireAuth, camelRow, camelRows, fetchWithRetry } from './utils.js';
import { getAuthorizedDocumentIds, isAuthorizedForDocument } from './authz.js';
import { retrieveRelevantChunks, indexDocument, isEmbeddingConfigured } from './embeddings.js';
import { logAudit } from './audit.js';

const router = express.Router();

const AI_API_KEY = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '';
const AI_BASE_URL = (process.env.AI_BASE_URL || (process.env.GEMINI_API_KEY ? 'https://openrouter.ai/api/v1' : '')).replace(/\/$/, '');
const AI_MODEL = process.env.AI_MODEL || 'openai/gpt-4o';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 60000;

const HISTORY_LIMIT = 20; // recent messages included as conversation context

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
    const chunks = await retrieveRelevantChunks(message.trim(), authorizedDocIds);

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
      const upstream = await fetchWithRetry(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: upstreamMessages,
          max_tokens: 1500,
          temperature: 0.3,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => '');
        res.write(JSON.stringify({ type: 'error', message: `AI request failed: ${upstream.status}` }) + '\n');
        console.error('Chat upstream error:', upstream.status, errText);
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
        res.write(JSON.stringify({ type: 'error', message: streamErr.message }) + '\n');
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
