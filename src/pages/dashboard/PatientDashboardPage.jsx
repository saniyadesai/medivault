import React, { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '../../components/dashboard/DashboardLayout';
import DashboardSection from '../../components/dashboard/DashboardSection';
import MetricCard from '../../components/dashboard/MetricCard';
import DataTable from '../../components/dashboard/DataTable';
import ActivityFeed from '../../components/dashboard/ActivityFeed';
import { getPatientDashboardData } from '../../services/dashboardApi';
import { viewDocument } from '../../services/vaultApi';
import { getDocumentsByIds } from '../../services/accessApi';
import DocumentViewer from '../../components/dashboard/DocumentViewer';
import AISummaryModal from '../../components/dashboard/AISummaryModal';
import { resolveAccessRequest } from '../../services/accessApi';
import { updateProfile } from '../../services/profileApi';
import { useAuth } from '../../hooks/useAuth';
import ChatPanel from '../../components/chat/ChatPanel';

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Storage Vault' },
  { key: 'requests', label: 'Access Requests' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'chat', label: '💬 Chat' },
  { key: 'settings', label: 'Profile & Settings' },
  { key: 'notifications', label: 'Notifications' },
];

const documentColumns = [
  { key: 'name', label: 'Document' },
  { key: 'type', label: 'Type' },
  { key: 'uploadedBy', label: 'Uploaded By' },
  { key: 'date', label: 'Date' },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

const requestColumnsBase = [
  { key: 'requester', label: 'Requester' },
  { key: 'role', label: 'Role' },
  { key: 'reason', label: 'Reason' },
  { key: 'scope', label: 'Scope' },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

export default function PatientDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    fullName: user?.profile?.fullName || '',
    bloodGroup: user?.profile?.bloodGroup || '',
    emergencyContact: user?.profile?.emergencyContact || '',
  });
  const [notifySettings, setNotifySettings] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [activeView, setActiveView] = useState('overview');
  const [viewerDoc, setViewerDoc] = useState(null);
  const [summaryDoc, setSummaryDoc] = useState(null);
  const [expandedRequest, setExpandedRequest] = useState(null);
  const [requestDocs, setRequestDocs] = useState({});

  const refreshData = useCallback(() => {
    setLoading(true);
    getPatientDashboardData().then((result) => {
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

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const toggleNotification = (id) => {
    setNotifySettings((prev) => ({ ...prev, [id]: !prev[id] }));
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

  const handleSaveProfile = async () => {
    setBusy(true);
    setFeedback('');
    try {
      await updateProfile('patient', {
        fullName: profile.fullName,
        bloodGroup: profile.bloodGroup,
        emergencyContactName: profile.emergencyContact,
      });
      setFeedback('Profile saved successfully!');
    } catch (err) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const filteredDocuments = (data?.documents || []).filter((doc) => {
    if (docTypeFilter && doc.type !== docTypeFilter) return false;
    if (dateFilter && doc.date !== dateFilter) return false;
    return true;
  });

  const handleResolve = async (requestId, action) => {
    setBusy(true);
    setFeedback('');
    try {
      await resolveAccessRequest(requestId, action);
      setFeedback(`Request ${action}d.`);
      refreshData();
    } catch (err) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleRequestDocs = async (request) => {
    if (expandedRequest === request.id) {
      setExpandedRequest(null);
      return;
    }
    setExpandedRequest(request.id);
    
    // If request has specific document IDs, fetch them
    if (request.documentIds && request.documentIds.length > 0 && !requestDocs[request.id]) {
      try {
        const result = await getDocumentsByIds(request.documentIds);
        setRequestDocs((prev) => ({ ...prev, [request.id]: result.documents || [] }));
      } catch (err) {
        console.error('Failed to fetch request documents:', err);
      }
    }
  };

  const handleSummary = (docId) => {
    const doc = (data?.documents || []).find((d) => d.id === docId);
    setSummaryDoc({ id: docId, name: doc?.name || 'Document' });
  };

  const docColumnsWithActions = [
    ...documentColumns,
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

  const requestColumnsWithActions = [
    ...requestColumnsBase,
    {
      key: 'actions',
      label: 'Actions',
      render: (row) =>
        row.status === 'pending' ? (
          <div className="dashboard-inline-actions">
            <button type="button" className="btn btn-outline" onClick={() => handleResolve(row.id, 'approve')} disabled={busy}>Approve</button>
            <button type="button" className="btn btn-primary" onClick={() => handleResolve(row.id, 'reject')} disabled={busy}>Reject</button>
          </div>
        ) : null,
    },
  ];

  const handleViewChange = (view) => {
    setFeedback('');
    setActiveView(view);
  };

  if (loading || !data) {
    return (
      <DashboardLayout title="Patient Dashboard" subtitle="Manage your medical vault and consent controls." navItems={NAV_ITEMS} activeView={activeView} onViewChange={handleViewChange}>
        <p className="dashboard-empty-state">Loading patient dashboard...</p>
      </DashboardLayout>
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'overview':
        return (
          <DashboardSection id="overview" title="Overview" subtitle="Your latest vault and access activity at a glance.">
            <div className="metrics-grid">
              {data.metrics.map((metric) => (
                <MetricCard key={metric.key} title={metric.title} value={metric.value} hint={metric.hint} />
              ))}
            </div>
          </DashboardSection>
        );

      case 'documents':
        return (
          <DashboardSection id="documents" title="Storage Vault" subtitle="View and download your medical records.">
            {feedback && <p style={{ color: feedback.includes('success') ? 'green' : '#c33', marginBottom: 10 }}>{feedback}</p>}
            <div className="dashboard-form-grid" style={{ marginBottom: 14 }}>
              <div className="dashboard-field">
                <label htmlFor="docTypeFilter">Filter by Type</label>
                <select id="docTypeFilter" value={docTypeFilter} onChange={(e) => setDocTypeFilter(e.target.value)}>
                  <option value="">All Types</option>
                  <option value="lab_report">Lab Report</option>
                  <option value="prescription">Prescription</option>
                  <option value="imaging">Imaging</option>
                  <option value="diagnosis">Diagnosis</option>
                  <option value="discharge_summary">Discharge Summary</option>
                </select>
              </div>
              <div className="dashboard-field">
                <label htmlFor="dateFilter">Filter by Date</label>
                <input id="dateFilter" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
              </div>
            </div>
            <DataTable columns={docColumnsWithActions} rows={filteredDocuments} emptyMessage="No documents uploaded yet." />
          </DashboardSection>
        );

      case 'requests':
        return (
          <DashboardSection id="requests" title="Access Requests" subtitle="Review and manage who can access your records.">
            {feedback && <p style={{ color: feedback.includes('d.') ? 'green' : '#c33', marginBottom: 10 }}>{feedback}</p>}
            {data.accessRequests && data.accessRequests.length > 0 ? (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Requester</th>
                      <th>Role</th>
                      <th>Reason</th>
                      <th>Scope</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accessRequests.map((req) => (
                      <React.Fragment key={req.id}>
                        <tr>
                          <td>{req.requester}</td>
                          <td>{req.role}</td>
                          <td>
                            {req.scope === 'specific_documents' ? (
                              <button 
                                type="button" 
                                className="btn btn-outline" 
                                onClick={() => handleToggleRequestDocs(req)}
                                style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                              >
                                {expandedRequest === req.id ? 'Hide' : 'View'} Documents ({req.documentIds?.length || 0})
                              </button>
                            ) : req.reason}
                          </td>
                          <td>{req.scope === 'specific_documents' ? 'Specific Documents' : req.scope}</td>
                          <td><span className={`dashboard-badge is-${req.status}`}>{req.status}</span></td>
                          <td>
                            {req.status === 'pending' ? (
                              <div className="dashboard-inline-actions">
                                <button type="button" className="btn btn-outline" onClick={() => handleResolve(req.id, 'approve')} disabled={busy}>Approve</button>
                                <button type="button" className="btn btn-primary" onClick={() => handleResolve(req.id, 'reject')} disabled={busy}>Reject</button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                        {expandedRequest === req.id && requestDocs[req.id] && (
                          <tr key={`${req.id}-docs`}>
                            <td colSpan={6} style={{ background: '#f8f9fa', padding: '12px' }}>
                              <div style={{ fontWeight: 600, marginBottom: 8 }}>Requested Documents:</div>
                              <ul style={{ margin: 0, paddingLeft: 20 }}>
                                {requestDocs[req.id].map((doc) => (
                                  <li key={doc.id}>{doc.documentName || doc.originalFilename} - {doc.documentType} ({doc.visitDate || doc.uploadedAt?.split('T')[0]})</li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dashboard-empty-state">No access requests available.</p>
            )}
          </DashboardSection>
        );

      case 'audit':
        return (
          <DashboardSection id="audit" title="Audit Log" subtitle="Full trail of who accessed what and when.">
            <ActivityFeed items={data.auditEvents} emptyMessage="No audit events yet." />
          </DashboardSection>
        );

      case 'chat':
        return (
          <DashboardSection id="chat" title="Chat" subtitle="Ask questions about the documents you have access to.">
            <ChatPanel />
          </DashboardSection>
        );

      case 'settings':
        return (
          <DashboardSection id="settings" title="Profile & Settings" subtitle="Update your core profile and emergency details.">
            {feedback && <p style={{ color: feedback.includes('success') ? 'green' : '#c33', marginBottom: 10 }}>{feedback}</p>}
            <div className="dashboard-form-grid">
              <div className="dashboard-field">
                <label htmlFor="fullName">Full Name</label>
                <input id="fullName" name="fullName" value={profile.fullName} onChange={handleProfileChange} />
              </div>
              <div className="dashboard-field">
                <label htmlFor="bloodGroup">Blood Group</label>
                <input id="bloodGroup" name="bloodGroup" value={profile.bloodGroup} onChange={handleProfileChange} />
              </div>
              <div className="dashboard-field span-2">
                <label htmlFor="emergencyContact">Emergency Contact</label>
                <input id="emergencyContact" name="emergencyContact" value={profile.emergencyContact} onChange={handleProfileChange} />
              </div>
              <div className="dashboard-field">
                <button type="button" className="btn btn-primary" onClick={handleSaveProfile} disabled={busy}>{busy ? 'Saving…' : 'Save Profile'}</button>
              </div>
            </div>
          </DashboardSection>
        );

      case 'notifications':
        return (
          <DashboardSection id="notifications" title="Notifications" subtitle="Control how access and emergency alerts are delivered.">
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
                          onChange={() => toggleNotification(entry.id)}
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
    <DashboardLayout title="Patient Dashboard" subtitle="Manage your medical vault and consent controls." navItems={NAV_ITEMS} activeView={activeView} onViewChange={handleViewChange}>
      <div className="dashboard-view-enter" key={activeView}>
        {renderView()}
      </div>
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
