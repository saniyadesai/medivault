const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '';
const STORAGE_KEY = 'medivault.auth';

function getToken() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').token || '';
  } catch {
    return '';
  }
}

export async function updateProfile(role, data) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated.');

  const res = await fetch(`${API_BASE_URL}/api/profile/${encodeURIComponent(role)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.message || 'Failed to update profile.');
  return result;
}
