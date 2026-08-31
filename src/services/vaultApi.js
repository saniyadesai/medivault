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
  if (!API_BASE_URL || !token) throw new Error('Not authenticated.');

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
  if (!API_BASE_URL || !token) throw new Error('Not authenticated.');

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
  if (!API_BASE_URL || !token) throw new Error('Not authenticated.');

  const res = await fetch(`${API_BASE_URL}/api/ai/summarize/${encodeURIComponent(documentId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'AI summary failed.');
  return data;
}
