import { useCallback, useEffect, useMemo, useState, Fragment, type ChangeEvent } from 'react';
import { DashboardShell } from '../../dashboard-v2/DashboardShell';
import { PatientOverview } from '../../dashboard-v2/PatientOverview';
import { ToastStack } from '../../dashboard-v2/ToastStack';
import { useToast } from '../../dashboard-v2/useToast';
import type { PatientDashboardData, PatientView, SearchResultItem } from '../../dashboard-v2/types';

import DashboardSection from '../../components/dashboard/DashboardSection';
import DataTable from '../../components/dashboard/DataTable';
import ActivityFeed from '../../components/dashboard/ActivityFeed';
import { getPatientDashboardData } from '../../services/dashboardApi';
import { viewDocument } from '../../services/vaultApi';
import { getDocumentsByIds, resolveAccessRequest } from '../../services/accessApi';
import DocumentViewer from '../../components/dashboard/DocumentViewer';
import AISummaryModal from '../../components/dashboard/AISummaryModal';
import { updateProfile } from '../../services/profileApi';
import { useAuth } from '../../hooks/useAuth';
import ChatPanel from '../../components/chat/ChatPanel';

import {
  BellIcon,
  ClipboardIcon,
  FolderIcon,
  GridIcon,
  MessageIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from '../../dashboard-v2/icons';
import '../../theme/theme.css';
import '../../dashboard-v2/dashboard-v2.css';
import '../../components/dashboard/dashboard.css';

const documentColumns = [
  { key: 'name', label: 'Document' },
  { key: 'type', label: 'Type' },
  { key: 'uploadedBy', label: 'Uploaded By' },
  { key: 'date', label: 'Date' },
  {
    key: 'status',
    label: 'Status',
    render: (row: { status: string }) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
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
    render: (row: { status: string }) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

interface AuthUser {
  email?: string;
  profile?: { fullName?: string; bloodGroup?: string; emergencyContact?: string };
}

export default function PatientDashboardPage() {
  // useAuth's context is still untyped JS (defaults user to `null`), which
  // infers too narrowly for a TS consumer — widen it here at the boundary.
  const { user, logout } = useAuth() as { user: AuthUser | null; logout: () => void };
  const [data, setData] = useState<PatientDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    fullName: user?.profile?.fullName || '',
    bloodGroup: user?.profile?.bloodGroup || '',
    emergencyContact: user?.profile?.emergencyContact || '',
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [activeView, setActiveView] = useState<PatientView>('overview');
  const [viewerDoc, setViewerDoc] = useState<{ url: string; filename: string; mimeType: string } | null>(null);
  const [summaryDoc, setSummaryDoc] = useState<{ id: string; name: string } | null>(null);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [requestDocs, setRequestDocs] = useState<Record<string, any[]>>({});
  const { toasts, showToast } = useToast();

  const refreshData = useCallback(() => {
    setLoading(true);
    getPatientDashboardData().then((result: PatientDashboardData) => {
      setData(result);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleProfileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
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
      showToast('Profile saved');
    } catch (err: any) {
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

  const handleResolve = async (requestId: string, action: 'approve' | 'reject') => {
    setBusy(true);
    setFeedback('');
    try {
      await resolveAccessRequest(requestId, action);
      setFeedback(`Request ${action}d.`);
      showToast(`Request ${action}d`);
      refreshData();
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleRequestDocs = async (request: { id: string; documentIds?: string[] }) => {
    if (expandedRequest === request.id) {
      setExpandedRequest(null);
      return;
    }
    setExpandedRequest(request.id);

    if (request.documentIds && request.documentIds.length > 0 && !requestDocs[request.id]) {
      try {
        const result = await getDocumentsByIds(request.documentIds);
        setRequestDocs((prev) => ({ ...prev, [request.id]: result.documents || [] }));
      } catch (err) {
        console.error('Failed to fetch request documents:', err);
      }
    }
  };

  const handleSummary = (docId: string) => {
    const doc = (data?.documents || []).find((d) => d.id === docId);
    setSummaryDoc({ id: docId, name: doc?.name || 'Document' });
  };

  const docColumnsWithActions = [
    ...documentColumns,
    {
      key: 'actions',
      label: '',
      render: (row: { id: string }) => (
        <div className="dashboard-inline-actions">
          <button type="button" className="btn btn-outline" onClick={() => handleView(row.id)}>View</button>
          <button type="button" className="btn btn-ai-summary" onClick={() => handleSummary(row.id)}>AI Summary</button>
        </div>
      ),
    },
  ];

  const handleViewChange = (view: PatientView) => {
    setFeedback('');
    setActiveView(view);
  };

  const searchItems: SearchResultItem[] = useMemo(() => {
    if (!data) return [];
    const items: SearchResultItem[] = [];

    data.documents.forEach((doc) => {
      items.push({
        id: `doc-${doc.id}`,
        category: 'Document',
        label: doc.name,
        meta: `${doc.type.replace(/_/g, ' ')} · ${doc.uploadedBy} · ${doc.date}`,
        onSelect: () => handleView(doc.id),
      });
    });

    data.accessRequests.forEach((req) => {
      items.push({
        id: `req-${req.id}`,
        category: 'Access Request',
        label: req.requester,
        meta: `${req.role} · ${req.status}`,
        onSelect: () => handleViewChange('requests'),
      });
    });

    data.auditEvents.forEach((event) => {
      items.push({
        id: `audit-${event.id}`,
        category: 'Audit Event',
        label: event.title,
        meta: event.time,
        onSelect: () => handleViewChange('audit'),
      });
    });

    data.notifications.forEach((entry) => {
      items.push({
        id: `notif-${entry.id}`,
        category: 'Notification',
        label: entry.channel,
        meta: entry.description,
        onSelect: () => handleViewChange('notifications'),
      });
    });

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const navItems = [
    { key: 'overview' as const, label: 'Overview', icon: <GridIcon size={16} /> },
    { key: 'documents' as const, label: 'Storage Vault', icon: <FolderIcon size={16} /> },
    {
      key: 'requests' as const,
      label: 'Access Requests',
      icon: <ShieldCheckIcon size={16} />,
      badge: data?.accessRequests?.filter((r) => r.status === 'pending').length
        ? String(data.accessRequests.filter((r) => r.status === 'pending').length)
        : undefined,
    },
    { key: 'audit' as const, label: 'Audit Log', icon: <ClipboardIcon size={16} /> },
    { key: 'chat' as const, label: 'AI Chat', icon: <MessageIcon size={16} /> },
    { key: 'settings' as const, label: 'Settings', icon: <SettingsIcon size={16} /> },
    { key: 'notifications' as const, label: 'Notifications', icon: <BellIcon size={16} /> },
  ];

  const userName = user?.profile?.fullName || user?.email || 'Patient';
  const userInitials = userName
    .split(' ')
    .map((part: string) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const viewTitles: Record<PatientView, [string, string]> = {
    overview: ['Overview', 'Your latest vault and access activity at a glance.'],
    documents: ['Storage Vault', 'View and download your medical records.'],
    requests: ['Access Requests', 'Review and manage who can access your records.'],
    audit: ['Audit Log', 'Full trail of who accessed what and when.'],
    chat: ['AI Chat', 'Ask questions about the documents you have access to.'],
    settings: ['Profile & Settings', 'Update your core profile and emergency details.'],
    notifications: ['Notifications', 'Control how access and emergency alerts are delivered.'],
  };
  const [topbarTitle, topbarSubtitle] = viewTitles[activeView];

  const renderView = () => {
    if (loading || !data) {
      return <p className="dashboard-empty-state">Loading patient dashboard…</p>;
    }

    switch (activeView) {
      case 'overview':
        return (
          <PatientOverview
            data={data}
            onNavigate={handleViewChange}
            onViewDocument={handleView}
            showToast={showToast}
          />
        );

      case 'documents':
        return (
          <DashboardSection id="documents" title="Storage Vault" subtitle="View and download your medical records.">
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
            {data.accessRequests && data.accessRequests.length > 0 ? (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Requester</th><th>Role</th><th>Reason</th><th>Scope</th><th>Status</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accessRequests.map((req) => (
                      <Fragment key={req.id}>
                        <tr>
                          <td>{req.requester}</td>
                          <td>{req.role}</td>
                          <td>
                            {req.scope === 'specific_documents' ? (
                              <button type="button" className="btn btn-outline" onClick={() => handleToggleRequestDocs(req)} style={{ padding: '4px 8px', fontSize: '0.85rem' }}>
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
                          <tr>
                            <td colSpan={6} style={{ background: '#f8f9fa', padding: 12 }}>
                              <div style={{ fontWeight: 600, marginBottom: 8 }}>Requested Documents:</div>
                              <ul style={{ margin: 0, paddingLeft: 20 }}>
                                {requestDocs[req.id].map((doc: any) => (
                                  <li key={doc.id}>{doc.documentName || doc.originalFilename} - {doc.documentType} ({doc.visitDate || doc.uploadedAt?.split('T')[0]})</li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
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
            {feedback && <p style={{ color: feedback.includes('success') ? 'green' : '#c33', marginTop: 10 }}>{feedback}</p>}
          </DashboardSection>
        );

      case 'notifications':
        return (
          <DashboardSection id="notifications" title="Notifications" subtitle="Control how access and emergency alerts are delivered.">
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead><tr><th>Channel</th><th>Description</th><th>Enabled</th></tr></thead>
                <tbody>
                  {data.notifications.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.channel}</td>
                      <td>{entry.description}</td>
                      <td><input type="checkbox" defaultChecked={entry.enabled} aria-label={`Toggle ${entry.channel} notifications`} /></td>
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
      navItems={navItems}
      activeView={activeView}
      onViewChange={handleViewChange}
      title={topbarTitle}
      subtitle={topbarSubtitle}
      userName={userName}
      userEmail={user?.email || ''}
      userInitials={userInitials || 'P'}
      onLogout={logout}
      onHome={() => { window.location.href = '/'; }}
      searchItems={searchItems}
    >
      {renderView()}
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
      <ToastStack toasts={toasts} />
    </DashboardShell>
  );
}
