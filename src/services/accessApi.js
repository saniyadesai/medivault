const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '';
const STORAGE_KEY = 'medivault.auth';

function getToken() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').token || '';
  } catch {
    return '';
  }
}

async function authFetch(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed.');
  return data;
}

export async function submitAccessRequest({ patientEmail, reason, scope }) {
  return authFetch('/api/access-requests', {
    method: 'POST',
    body: JSON.stringify({ patientEmail, reason, scope }),
  });
}

export async function resolveAccessRequest(requestId, action) {
  return authFetch(`/api/access-requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
}

export async function revokeGrant(grantId) {
  return authFetch(`/api/grants/${encodeURIComponent(grantId)}/revoke`, { method: 'POST' });
}

export async function revokeGrantsByGrantee(granteeUserId) {
  return authFetch('/api/grants/revoke-by-grantee', {
    method: 'POST',
    body: JSON.stringify({ granteeUserId }),
  });
}

export async function searchPatientByEmail(email) {
  return authFetch(`/api/patients/search?email=${encodeURIComponent(email)}`);
}

export async function requestDocumentAccess(patientId, documentIds, reason) {
  return authFetch('/api/access-requests/documents', {
    method: 'POST',
    body: JSON.stringify({ patientId, documentIds, reason }),
  });
}

export async function getDocumentsByIds(ids) {
  return authFetch(`/api/documents/by-ids?ids=${ids.join(',')}`);
}

// ── Drug Interactions ──────────────────────────────────────────────────
export async function writeDrugInteraction({ patientId, drugA, drugB, severity, interactionType, description, recommendation }) {
  return authFetch('/api/drug-interactions', {
    method: 'POST',
    body: JSON.stringify({ patientId, drugA, drugB, severity, interactionType, description, recommendation }),
  });
}

export async function getDrugInteractions(patientId) {
  return authFetch(`/api/drug-interactions/${encodeURIComponent(patientId)}`);
}

export async function deleteDrugInteraction(id) {
  return authFetch(`/api/drug-interactions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
