import { useCallback, useEffect, useMemo, useState, Fragment, type ChangeEvent } from 'react';
import { DashboardShell } from '../../dashboard-v2/DashboardShell';
import { DoctorOverview } from '../../dashboard-v2/DoctorOverview';
import { ToastStack } from '../../dashboard-v2/ToastStack';
import { useToast } from '../../dashboard-v2/useToast';
import type { DoctorDashboardData, DoctorView, SearchResultItem } from '../../dashboard-v2/types';

import DashboardSection from '../../components/dashboard/DashboardSection';
import DataTable from '../../components/dashboard/DataTable';
import ActivityFeed from '../../components/dashboard/ActivityFeed';
import UploadModal from '../../components/dashboard/UploadModal';
import { getDoctorDashboardData } from '../../services/dashboardApi';
import { searchPatientByEmail, requestDocumentAccess } from '../../services/accessApi';
import { uploadDocument, viewDocument } from '../../services/vaultApi';
import DocumentViewer from '../../components/dashboard/DocumentViewer';
import AISummaryModal from '../../components/dashboard/AISummaryModal';
import EmergencyAccess from '../../components/dashboard/EmergencyAccess';
import DrugInteractions from '../../components/dashboard/DrugInteractions';
import ChatPanel from '../../components/chat/ChatPanel';
import { updateProfile } from '../../services/profileApi';
import { useAuth } from '../../hooks/useAuth';

import {
  ActivityIcon,
  BellIcon,
  ClipboardIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  MessageIcon,
  PillIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UploadIcon,
} from '../../dashboard-v2/icons';
import '../../theme/theme.css';
import '../../dashboard-v2/dashboard-v2.css';
// DocumentViewer/AISummaryModal/EmergencyAccess/DrugInteractions below still
// depend on classes defined in here (docviewer-*/aisummary-*/ea-*/di-*); see
// PatientDashboardPage.tsx for why this stays imported even post-migration.
import '../../components/dashboard/dashboard.css';

const grantedColumns = [
  { key: 'patient', label: 'Patient' },
  { key: 'scope', label: 'Scope' },
  { key: 'expiresAt', label: 'Expires' },
  {
    key: 'status',
    label: 'Status',
    render: (row: { status: string }) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

const historyColumns = [
  { key: 'patient', label: 'Patient' },
  { key: 'reason', label: 'Reason' },
  { key: 'scope', label: 'Scope' },
  {
    key: 'status',
    label: 'Status',
    render: (row: { status: string }) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

const sharedDocColumns = [
  { key: 'name', label: 'Document' },
  { key: 'type', label: 'Type' },
  { key: 'patient', label: 'Patient Name' },
  { key: 'patient_email', label: 'Patient Email' },
  { key: 'date', label: 'Date' },
  {
    key: 'status',
    label: 'Status',
    render: (row: { status: string }) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

interface AuthUser {
  email?: string;
  profile?: { fullName?: string; specialization?: string; licenseNumber?: string };
}

export default function DoctorDashboardPage() {
  const { user, logout } = useAuth() as { user: AuthUser | null; logout: () => void };
  const [data, setData] = useState<DoctorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<DoctorView>('overview');
  const [requestForm, setRequestForm] = useState({ patientEmail: '', reason: '', selectedDocs: [] as string[] });
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [profile, setProfile] = useState({
    fullName: user?.profile?.fullName || '',
    specialization: user?.profile?.specialization || '',
    licenseNumber: user?.profile?.licenseNumber || '',
  });
  const [notifySettings, setNotifySettings] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [viewerDoc, setViewerDoc] = useState<{ url: string; filename: string; mimeType: string } | null>(null);
  const [summaryDoc, setSummaryDoc] = useState<{ id: string; name: string } | null>(null);
  const { toasts, showToast } = useToast();

  const refreshData = useCallback(() => {
    setLoading(true);
    getDoctorDashboardData().then((result: DoctorDashboardData) => {
      const initialNotifications: Record<string, boolean> = {};
      result.notifications.forEach((entry) => { initialNotifications[entry.id] = entry.enabled; });
      setNotifySettings(initialNotifications);
      setData(result);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleRequestChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setRequestForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'patientEmail') setSearchResult(null);
  };

  const handleSearchPatient = async () => {
    if (!requestForm.patientEmail || !requestForm.patientEmail.includes('@')) {
      setFeedback('Please enter a valid patient email.');
      return;
    }
    setSearching(true);
    setFeedback('');
    try {
      const result = await searchPatientByEmail(requestForm.patientEmail);
      setSearchResult(result);
      setRequestForm((prev) => ({ ...prev, selectedDocs: [] }));
    } catch (err: any) {
      setFeedback(err.message || 'Patient not found.');
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  };

  const handleToggleDoc = (docId: string) => {
    setRequestForm((prev) => {
      const selected = prev.selectedDocs.includes(docId)
        ? prev.selectedDocs.filter((id) => id !== docId)
        : [...prev.selectedDocs, docId];
      return { ...prev, selectedDocs: selected };
    });
  };

  const handleSelectAllDocs = () => {
    if (!searchResult) return;
    setRequestForm((prev) => ({ ...prev, selectedDocs: searchResult.documents.map((d: any) => d.id) }));
  };

  const handleDeselectAllDocs = () => {
    setRequestForm((prev) => ({ ...prev, selectedDocs: [] }));
  };

  const handleProfileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitRequest = async () => {
    if (!searchResult || requestForm.selectedDocs.length === 0 || !requestForm.reason) {
      setFeedback('Search for a patient, select documents, and provide a reason.');
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      await requestDocumentAccess(searchResult.patient.id, requestForm.selectedDocs, requestForm.reason);
      setFeedback('Access request submitted!');
      showToast('Access request submitted');
      setRequestForm({ patientEmail: '', reason: '', selectedDocs: [] });
      setSearchResult(null);
      refreshData();
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (uploadForm: any) => {
    await uploadDocument(uploadForm);
    setFeedback('Document uploaded & stamped successfully!');
    showToast('Document uploaded & stamped');
    refreshData();
  };

  const handleView = async (docId: string) => {
    setFeedback('');
    try {
      const doc = await viewDocument(docId);
      setViewerDoc(doc);
    } catch (err: any) {
      setFeedback(err.message);
      showToast(err.message, 'info');
    }
  };

  const handleSummary = (docId: string) => {
    const doc = (data?.sharedDocuments || []).find((d) => d.id === docId);
    setSummaryDoc({ id: docId, name: doc?.name || 'Document' });
  };

  const sharedDocColumnsWithActions = [
    ...sharedDocColumns,
    {
      key: 'actions',
      label: '',
      render: (row: { id: string }) => (
        <div className="dashboard-inline-actions">
          <button type="button" className="btn btn-outline" onClick={() => handleView(row.id)}>View</button>
          <button type="button" className="btn btn-ai-summary" onClick={() => handleSummary(row.id)}>🤖 Summary</button>
        </div>
      ),
    },
  ];

  const handleSaveProfile = async () => {
    setBusy(true);
    setFeedback('');
    try {
      await updateProfile('doctor', { fullName: profile.fullName, specialization: profile.specialization });
      setFeedback('Profile saved successfully!');
      showToast('Profile saved');
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleViewChange = (view: DoctorView) => {
    setFeedback('');
    if (view === 'upload') {
      setShowUpload(true);
      return;
    }
    setActiveView(view);
  };

  const searchItems: SearchResultItem[] = useMemo(() => {
    if (!data) return [];
    const items: SearchResultItem[] = [];

    data.sharedDocuments.forEach((doc) => {
      items.push({
        id: `doc-${doc.id}`,
        category: 'Shared Document',
        label: doc.name,
        meta: `${doc.patient} · ${doc.date}`,
        onSelect: () => handleView(doc.id),
      });
    });

    data.grantedAccess.forEach((grant) => {
      items.push({
        id: `grant-${grant.id}`,
        category: 'Active Grant',
        label: grant.patient,
        meta: `${grant.scope} · expires ${grant.expiresAt}`,
        onSelect: () => handleViewChange('grants'),
      });
    });

    data.requestHistory.forEach((req) => {
      items.push({
        id: `hist-${req.id}`,
        category: 'Request History',
        label: req.patient,
        meta: `${req.status} · ${req.reason}`,
        onSelect: () => handleViewChange('history'),
      });
    });

    data.auditEvents.forEach((event) => {
      items.push({
        id: `audit-${event.id}`,
        category: 'Activity',
        label: event.title,
        meta: event.time,
        onSelect: () => handleViewChange('activity'),
      });
    });

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const navGroups = [
    { label: 'Workspace', keys: ['overview', 'shared-docs'] as DoctorView[] },
    { label: 'Access & Activity', keys: ['grants', 'request', 'history', 'activity', 'notifications'] as DoctorView[] },
    { label: 'Tools', keys: ['emergency', 'drug-interactions', 'chat', 'settings'] as DoctorView[] },
  ];

  const navItems = [
    { key: 'overview' as const, label: 'Overview', icon: <GridIcon size={16} /> },
    { key: 'shared-docs' as const, label: 'Shared Documents', icon: <FolderIcon size={16} /> },
    { key: 'grants' as const, label: 'Active Grants', icon: <ShieldCheckIcon size={16} /> },
    { key: 'request' as const, label: 'Request Access', icon: <FileIcon size={16} /> },
    { key: 'history' as const, label: 'Request History', icon: <ClipboardIcon size={16} /> },
    { key: 'activity' as const, label: 'Activity Log', icon: <ActivityIcon size={16} /> },
    { key: 'emergency' as const, label: 'Emergency Access', icon: <ShieldIcon size={16} /> },
    { key: 'drug-interactions' as const, label: 'Drug Interactions', icon: <PillIcon size={16} /> },
    { key: 'chat' as const, label: 'Chat', icon: <MessageIcon size={16} /> },
    { key: 'settings' as const, label: 'Profile & Settings', icon: <SettingsIcon size={16} /> },
    { key: 'notifications' as const, label: 'Notifications', icon: <BellIcon size={16} /> },
  ];

  const userName = user?.profile?.fullName || user?.email || 'Doctor';
  const userInitials = userName
    .split(' ')
    .map((part: string) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const viewTitles: Record<DoctorView, [string, string]> = {
    overview: ['Overview', 'Your current access and care workflow summary.'],
    upload: ['Upload Document', 'Upload Document'],
    'shared-docs': ['Shared Documents', 'Documents shared with you by patients.'],
    grants: ['Active Grants', 'Your currently active access grants.'],
    request: ['Request Access', 'Search for a patient and select specific documents to request.'],
    history: ['Request History', 'All your previous access requests.'],
    activity: ['Activity Log', 'Recent activities on your account.'],
    emergency: ['Emergency Access', 'Initiate 24-hour emergency access to patient records via biometric verification.'],
    'drug-interactions': ['Drug Interactions', 'Record and manage drug interaction notes for patients.'],
    chat: ['Chat', 'Ask questions about the documents you have access to.'],
    settings: ['Profile & Settings', 'Doctor profile details for interoperability and verification.'],
    notifications: ['Notifications', 'How you receive request and emergency alerts.'],
  };
  const [topbarTitle, topbarSubtitle] = viewTitles[activeView];

  const renderView = () => {
    if (loading || !data) {
      return <p className="mv-empty">Loading doctor dashboard…</p>;
    }

    switch (activeView) {
      case 'overview':
        return (
          <DoctorOverview
            data={data}
            onNavigate={handleViewChange}
            onViewDocument={handleView}
            onOpenUpload={() => setShowUpload(true)}
            showToast={showToast}
          />
        );

      case 'shared-docs':
        return (
          <DashboardSection id="shared-docs" title="Shared Documents" subtitle="Documents shared with you by patients.">
            <DataTable columns={sharedDocColumnsWithActions} rows={data.sharedDocuments || []} emptyMessage="No shared documents available." />
          </DashboardSection>
        );

      case 'grants':
        return (
          <DashboardSection id="grants" title="Active Grants" subtitle="Your currently active access grants.">
            <DataTable columns={grantedColumns} rows={data.grantedAccess} emptyMessage="No active grants available." />
          </DashboardSection>
        );

      case 'request':
        return (
          <DashboardSection id="request" title="Request Access" subtitle="Search for a patient and select specific documents to request.">
            {feedback && <p style={{ color: feedback.includes('submitted') ? 'green' : '#c33', marginBottom: 10 }}>{feedback}</p>}
            <div className="dashboard-form-grid" style={{ marginBottom: 16 }}>
              <div className="dashboard-field">
                <label htmlFor="patientEmail">Patient Email</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="patientEmail"
                    name="patientEmail"
                    value={requestForm.patientEmail}
                    onChange={handleRequestChange}
                    placeholder="patient@example.com"
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn-outline" onClick={handleSearchPatient} disabled={searching}>
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>
            </div>

            {searchResult && (
              <div style={{ marginBottom: 16, padding: 12, background: 'rgba(0,119,182,0.1)', borderRadius: 8, border: '1px solid rgba(0,119,182,0.3)' }}>
                <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: '#0077b6' }}>
                  Patient Found: {searchResult.patient.fullName}
                </p>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#555' }}>
                  Age: {searchResult.patient.age ?? 'N/A'} | Gender: {searchResult.patient.gender || 'N/A'} | Blood Group: {searchResult.patient.bloodGroup || 'N/A'} | DOB: {searchResult.patient.dateOfBirth || 'N/A'}
                </p>
              </div>
            )}

            {searchResult && searchResult.documents && searchResult.documents.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontWeight: 600 }}>Select Documents ({requestForm.selectedDocs.length} selected)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-outline" onClick={handleSelectAllDocs} style={{ padding: '4px 8px', fontSize: '0.85rem' }}>Select All</button>
                    <button type="button" className="btn btn-outline" onClick={handleDeselectAllDocs} style={{ padding: '4px 8px', fontSize: '0.85rem' }}>Deselect All</button>
                  </div>
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
                  {searchResult.documents.map((doc: any) => (
                    <label key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                      <input type="checkbox" checked={requestForm.selectedDocs.includes(doc.id)} onChange={() => handleToggleDoc(doc.id)} />
                      <span style={{ flex: 1 }}>{doc.documentName || doc.originalFilename}</span>
                      <span style={{ fontSize: '0.85rem', color: '#666' }}>{doc.documentType}</span>
                      <span style={{ fontSize: '0.8rem', color: '#888' }}>{doc.visitDate || doc.uploadedAt?.split('T')[0]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {searchResult && searchResult.documents && searchResult.documents.length === 0 && (
              <p style={{ color: '#888', marginBottom: 16 }}>No documents found for this patient.</p>
            )}

            <div className="dashboard-form-grid" style={{ marginBottom: 16 }}>
              <div className="dashboard-field span-2">
                <label htmlFor="reason">Reason for Request</label>
                <textarea id="reason" name="reason" value={requestForm.reason} onChange={handleRequestChange} placeholder="Explain why you need access to these documents..." />
              </div>
            </div>
            <div className="dashboard-inline-actions">
              <button type="button" className="btn btn-primary" onClick={handleSubmitRequest} disabled={busy || !searchResult || requestForm.selectedDocs.length === 0}>
                {busy ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </DashboardSection>
        );

      case 'history':
        return (
          <DashboardSection id="history" title="Request History" subtitle="All your previous access requests.">
            <DataTable columns={historyColumns} rows={data.requestHistory} emptyMessage="No request history available." />
          </DashboardSection>
        );

      case 'activity':
        return (
          <DashboardSection id="activity" title="Activity Log" subtitle="Recent activities on your account.">
            <ActivityFeed items={data.auditEvents} emptyMessage="No activity recorded yet." />
          </DashboardSection>
        );

      case 'settings':
        return (
          <DashboardSection id="settings" title="Profile & Settings" subtitle="Doctor profile details for interoperability and verification.">
            {feedback && <p style={{ color: feedback.includes('success') ? 'green' : '#c33', marginBottom: 10 }}>{feedback}</p>}
            <div className="dashboard-form-grid">
              <div className="dashboard-field">
                <label htmlFor="fullName">Full Name</label>
                <input id="fullName" name="fullName" value={profile.fullName} onChange={handleProfileChange} />
              </div>
              <div className="dashboard-field">
                <label htmlFor="specialization">Specialization</label>
                <input id="specialization" name="specialization" value={profile.specialization} onChange={handleProfileChange} />
              </div>
              <div className="dashboard-field span-2">
                <label htmlFor="licenseNumber">License Number</label>
                <input id="licenseNumber" name="licenseNumber" value={profile.licenseNumber} onChange={handleProfileChange} disabled />
              </div>
              <div className="dashboard-field">
                <button type="button" className="btn btn-primary" onClick={handleSaveProfile} disabled={busy}>{busy ? 'Saving…' : 'Save Profile'}</button>
              </div>
            </div>
          </DashboardSection>
        );

      case 'emergency':
        return (
          <DashboardSection id="emergency" title="Emergency Access" subtitle="Initiate 24-hour emergency access to patient records via biometric verification.">
            <EmergencyAccess onViewDocument={handleView} />
          </DashboardSection>
        );

      case 'drug-interactions':
        return (
          <DashboardSection id="drug-interactions" title="Drug Interactions" subtitle="Record and manage drug interaction notes for patients.">
            <DrugInteractions />
          </DashboardSection>
        );

      case 'chat':
        return (
          <div className="mv-chat">
            <ChatPanel />
          </div>
        );

      case 'notifications':
        return (
          <DashboardSection id="notifications" title="Notifications" subtitle="How you receive request and emergency alerts.">
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead><tr><th>Channel</th><th>Description</th><th>Enabled</th></tr></thead>
                <tbody>
                  {data.notifications.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.channel}</td>
                      <td>{entry.description}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(notifySettings[entry.id])}
                          onChange={() => setNotifySettings((prev) => ({ ...prev, [entry.id]: !prev[entry.id] }))}
                          aria-label={`Toggle ${entry.channel} notifications`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashboardSection>
        );

      default:
        return null;
    }
  };

  return (
    <DashboardShell
      navGroups={navGroups}
      navItems={navItems}
      activeView={activeView}
      onViewChange={handleViewChange}
      title={topbarTitle}
      subtitle={topbarSubtitle}
      userName={userName}
      userEmail={user?.email || ''}
      userInitials={userInitials || 'D'}
      roleLabel="Doctor"
      onLogout={logout}
      onHome={() => { window.location.href = '/'; }}
      onNotificationsClick={() => handleViewChange('notifications')}
      searchItems={searchItems}
    >
      {renderView()}
      {showUpload && (
        <UploadModal onUpload={handleUpload} onClose={() => setShowUpload(false)} busy={busy} />
      )}
      {viewerDoc && (
        <DocumentViewer
          url={viewerDoc.url}
          filename={viewerDoc.filename}
          mimeType={viewerDoc.mimeType}
          onClose={() => { URL.revokeObjectURL(viewerDoc.url); setViewerDoc(null); }}
          verifiedColor="var(--mv-accent-text)"
        />
      )}
      {summaryDoc && (
        <AISummaryModal documentId={summaryDoc.id} filename={summaryDoc.name} onClose={() => setSummaryDoc(null)} />
      )}
      <ToastStack toasts={toasts} />
    </DashboardShell>
  );
}
