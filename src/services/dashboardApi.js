const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '';
const STORAGE_KEY = 'medivault.auth';

function getToken() {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return session.token || '';
  } catch {
    return '';
  }
}

async function dashboardRequest(path) {
  const token = getToken();
  if (!token) {
    return null;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  return res.json();
}

const PATIENT_EMPTY = {
  metrics: [
    { key: 'docs', title: 'Documents', value: '0', hint: 'No uploads yet' },
    { key: 'pending', title: 'Pending Requests', value: '0', hint: 'No pending requests' },
    { key: 'active', title: 'Active Grants', value: '0', hint: 'No active grants' },
    { key: 'audit', title: 'Audit Events', value: '0', hint: 'No activity yet' },
  ],
  documents: [],
  accessRequests: [],
  auditEvents: [],
  notifications: [],
};

const DOCTOR_EMPTY = {
  metrics: [
    { key: 'grants', title: 'Active Grants', value: '0', hint: 'No grants yet' },
    { key: 'pending', title: 'Pending Requests', value: '0', hint: 'No open requests' },
    { key: 'emergency', title: 'Emergency Sessions', value: '0', hint: 'No emergency sessions' },
    { key: 'views', title: 'Documents Reviewed', value: '0', hint: 'No reviewed documents' },
  ],
  grantedAccess: [],
  requestHistory: [],
  sharedDocuments: [],
  auditEvents: [],
  notifications: [],
};

const HOSPITAL_EMPTY = {
  metrics: [
    { key: 'staff', title: 'Staff Linked', value: '0', hint: 'No staff linked yet' },
    { key: 'uploads', title: 'Uploads This Week', value: '0', hint: 'No uploads yet' },
    { key: 'verify', title: 'Pending Verifications', value: '0', hint: 'No pending verifications' },
    { key: 'compliance', title: 'Compliance Flags', value: '0', hint: 'No compliance flags' },
  ],
  uploadQueue: [],
  staffAccess: [],
  complianceEvents: [],
  notifications: [],
};

export async function getPatientDashboardData() {
  const data = await dashboardRequest('/api/dashboard/patient');
  return data || PATIENT_EMPTY;
}

export async function getDoctorDashboardData() {
  const data = await dashboardRequest('/api/dashboard/doctor');
  return data || DOCTOR_EMPTY;
}

export async function getHospitalDashboardData() {
  const data = await dashboardRequest('/api/dashboard/hospital');
  return data || HOSPITAL_EMPTY;
}
