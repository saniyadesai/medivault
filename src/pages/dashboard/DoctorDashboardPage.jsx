import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '../../components/dashboard/DashboardLayout';
import DashboardSection from '../../components/dashboard/DashboardSection';
import MetricCard from '../../components/dashboard/MetricCard';
import DataTable from '../../components/dashboard/DataTable';
import ActivityFeed from '../../components/dashboard/ActivityFeed';
import UploadModal from '../../components/dashboard/UploadModal';
import { getDoctorDashboardData } from '../../services/dashboardApi';
import { submitAccessRequest, searchPatientByEmail, requestDocumentAccess } from '../../services/accessApi';
import { uploadDocument, viewDocument } from '../../services/vaultApi';
import DocumentViewer from '../../components/dashboard/DocumentViewer';
import AISummaryModal from '../../components/dashboard/AISummaryModal';
import EmergencyAccess from '../../components/dashboard/EmergencyAccess';
import DrugInteractions from '../../components/dashboard/DrugInteractions';
import ChatPanel from '../../components/chat/ChatPanel';
import { updateProfile } from '../../services/profileApi';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'upload', label: 'Upload Document' },
  { key: 'shared-docs', label: 'Shared Documents' },
  { key: 'grants', label: 'Active Grants' },
  { key: 'request', label: 'Request Access' },
  { key: 'history', label: 'Request History' },
  { key: 'activity', label: 'Activity Log' },
  { key: 'emergency', label: '🚨 Emergency Access' },
  { key: 'drug-interactions', label: '💊 Drug Interactions' },
  { key: 'chat', label: '💬 Chat' },
  { key: 'settings', label: 'Profile & Settings' },
  { key: 'notifications', label: 'Notifications' },
];

const grantedColumns = [
  { key: 'patient', label: 'Patient' },
  { key: 'scope', label: 'Scope' },
  { key: 'expiresAt', label: 'Expires' },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

const historyColumns = [
  { key: 'patient', label: 'Patient' },
  { key: 'reason', label: 'Reason' },
  { key: 'scope', label: 'Scope' },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
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
    render: (row) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

export default function DoctorDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('overview');
  const [requestForm, setRequestForm] = useState({ patientEmail: '', reason: '', selectedDocs: [] });
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [profile, setProfile] = useState({
    fullName: user?.profile?.fullName || '',
    specialization: user?.profile?.specialization || '',
    licenseNumber: user?.profile?.licenseNumber || '',
  });
  const [notifySettings, setNotifySettings] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [viewerDoc, setViewerDoc] = useState(null);
  const [summaryDoc, setSummaryDoc] = useState(null);

  const refreshData = useCallback(() => {
    setLoading(true);
    getDoctorDashboardData().then((result) => {
      const initialNotifications = {};
      result.notifications.forEach((entry) => {
        initialNotifications[entry.id] = entry.enabled;
      });
      setNotifySettings(initialNotifications);
      setData(result);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleRequestChange = (event) => {
    const { name, value } = event.target;
    setRequestForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'patientEmail') {
      setSearchResult(null);
    }
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
    } catch (err) {
      setFeedback(err.message || 'Patient not found.');
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  };

  const handleToggleDoc = (docId) => {
    setRequestForm((prev) => {
      const selected = prev.selectedDocs.includes(docId)
        ? prev.selectedDocs.filter((id) => id !== docId)
        : [...prev.selectedDocs, docId];
      return { ...prev, selectedDocs: selected };
    });
  };

  const handleSelectAllDocs = () => {
    if (!searchResult) return;
    const allDocIds = searchResult.documents.map((d) => d.id);
    setRequestForm((prev) => ({ ...prev, selectedDocs: allDocIds }));
  };

  const handleDeselectAllDocs = () => {
    setRequestForm((prev) => ({ ...prev, selectedDocs: [] }));
  };

  const handleProfileChange = (event) => {
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
      setRequestForm({ patientEmail: '', reason: '', selectedDocs: [] });
      setSearchResult(null);
      refreshData();
    } catch (err) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (uploadForm) => {
    await uploadDocument(uploadForm);
    setFeedback('Document uploaded & stamped successfully!');
    refreshData();
  };

  const handleView = async (docId) => {
    setFeedback('');
    try {
      const doc = await viewDocument(docId);
      setViewerDoc(doc);
    } catch (err) {
      setFeedback(err.message);
    }
  };

  const handleSummary = (docId) => {
    const doc = (data.sharedDocuments || []).find((d) => d.id === docId);
    setSummaryDoc({ id: docId, name: doc?.name || 'Document' });
  };

  const sharedDocColumnsWithActions = [
    ...sharedDocColumns,
    {
      key: 'actions',
      label: '',
      render: (row) => (
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
      await updateProfile('doctor', {
        fullName: profile.fullName,
        specialization: profile.specialization,
      });
      setFeedback('Profile saved successfully!');
    } catch (err) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleViewChange = (view) => {
    setFeedback('');
    if (view === 'upload') {
      setShowUpload(true);
      return;
    }
    setActiveView(view);
  };

  if (loading || !data) {
    return (
      <DashboardLayout title="Doctor Dashboard" subtitle="Manage access requests and review shared patient records." navItems={NAV_ITEMS} activeView={activeView} onViewChange={handleViewChange}>
        <p className="dashboard-empty-state">Loading doctor dashboard...</p>
      </DashboardLayout>
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'overview':
        return (
          <DashboardSection id="overview" title="Overview" subtitle="Your current access and care workflow summary.">
            <div className="metrics-grid">
              {data.metrics.map((metric) => (
                <MetricCard key={metric.key} title={metric.title} value={metric.value} hint={metric.hint} />
              ))}
            </div>
          </DashboardSection>
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
                  <button 
                    type="button" 
                    className="btn btn-outline" 
                    onClick={handleSearchPatient}
                    disabled={searching}
                  >
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
                  Blood Group: {searchResult.patient.bloodGroup || 'N/A'} | DOB: {searchResult.patient.dateOfBirth || 'N/A'} | Gender: {searchResult.patient.gender || 'N/A'}
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
                  {searchResult.documents.map((doc) => (
                    <label key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                      <input
                        type="checkbox"
                        checked={requestForm.selectedDocs.includes(doc.id)}
                        onChange={() => handleToggleDoc(doc.id)}
                      />
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
                <textarea 
                  id="reason" 
                  name="reason" 
                  value={requestForm.reason} 
                  onChange={handleRequestChange}
                  placeholder="Explain why you need access to these documents..."
                />
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
          <DashboardSection id="chat" title="Chat" subtitle="Ask questions about the documents you have access to.">
            <ChatPanel />
          </DashboardSection>
        );

      case 'notifications':
        return (
          <DashboardSection id="notifications" title="Notifications" subtitle="How you receive request and emergency alerts.">
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Description</th>
                    <th>Enabled</th>
                  </tr>
                </thead>
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
    <DashboardLayout title="Doctor Dashboard" subtitle="Manage access requests and review shared patient records." navItems={NAV_ITEMS} activeView={activeView} onViewChange={handleViewChange}>
      <div className="dashboard-view-enter" key={activeView}>
        {renderView()}
      </div>
      {showUpload && (
        <UploadModal
          onUpload={handleUpload}
          onClose={() => setShowUpload(false)}
          busy={busy}
        />
      )}
      {viewerDoc && (
        <DocumentViewer
          url={viewerDoc.url}
          filename={viewerDoc.filename}
          mimeType={viewerDoc.mimeType}
          onClose={() => { URL.revokeObjectURL(viewerDoc.url); setViewerDoc(null); }}
        />
      )}
      {summaryDoc && (
        <AISummaryModal
          documentId={summaryDoc.id}
          filename={summaryDoc.name}
          onClose={() => setSummaryDoc(null)}
        />
      )}
    </DashboardLayout>
  );
}
