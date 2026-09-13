const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '';
const STORAGE_KEY = 'medivault.auth';

function getToken() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').token || '';
  } catch {
    return '';
  }
}

export async function uploadDocument({ file, documentType, description, visitDate, patientId }) {
  const token = getToken();
 if (!token) throw new Error('Not authenticated.');

  const form = new FormData();
  form.append('file', file);
  form.append('documentType', documentType);
  if (description) form.append('description', description);
  if (visitDate) form.append('visitDate', visitDate);
  if (patientId) form.append('patientId', patientId);

  const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Upload failed.');
  return data;
}

export async function downloadDocument(documentId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Download failed.');
  }

  const blob = await res.blob();
  const filename = res.headers.get('content-disposition')?.match(/filename="(.+?)"/)?.[1] || 'document';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function viewDocument(documentId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'View failed.');
  }

  const blob = await res.blob();
  const filename = res.headers.get('content-disposition')?.match(/filename="(.+?)"/)?.[1] || 'document';
  const url = URL.createObjectURL(blob);
  return { url, filename, mimeType: blob.type };
}

export async function summarizeDocument(documentId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`${API_BASE_URL}/api/ai/summarize/${encodeURIComponent(documentId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'AI summary failed.');
  return data;
}

export async function listChatSessions() {
  const token = getToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`${API_BASE_URL}/api/chat/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to load chat sessions.');
  return data.sessions;
}

export async function getChatSession(sessionId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`${API_BASE_URL}/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to load chat session.');
  return data.messages;
}

export async function deleteChatSession(sessionId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`${API_BASE_URL}/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to delete chat session.');
  return data;
}

/**
 * Send a chat message and stream the answer back. The API responds with
 * newline-delimited JSON events (`{"type":"citations"|"token"|"done"|"error", ...}`)
 * — this is an async generator so callers can `for await` the events and update
 * UI state incrementally as tokens arrive, instead of waiting for the full reply.
 *
 * @param {{ sessionId?: string, message: string }} params
 * @yields {{ type: 'citations', sessionId: string, citations: object[] }
 *        | { type: 'token', content: string }
 *        | { type: 'done', sessionId: string, messageId: string }
 *        | { type: 'error', message: string }}
 */
export async function* sendChatMessage({ sessionId, message }) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId, message }),
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Chat request failed.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line);
      } catch {
        // skip malformed line rather than breaking the whole stream
      }
    }
  }
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch {
      // ignore trailing partial line
    }
  }
}
