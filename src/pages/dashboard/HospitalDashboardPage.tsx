import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../../dashboard-v2/DashboardShell';
import { HospitalOverview } from '../../dashboard-v2/HospitalOverview';
import { ToastStack } from '../../dashboard-v2/ToastStack';
import { useToast } from '../../dashboard-v2/useToast';
import type { HospitalDashboardData, HospitalView, SearchResultItem } from '../../dashboard-v2/types';

import DashboardSection from '../../components/dashboard/DashboardSection';
import DataTable from '../../components/dashboard/DataTable';
import ActivityFeed from '../../components/dashboard/ActivityFeed';
import UploadModal from '../../components/dashboard/UploadModal';
import { getHospitalDashboardData } from '../../services/dashboardApi';
import { uploadDocument } from '../../services/vaultApi';
import { revokeGrantsByGrantee } from '../../services/accessApi';
import { updateProfile } from '../../services/profileApi';
import EmergencyAccess from '../../components/dashboard/EmergencyAccess';
import ChatPanel from '../../components/chat/ChatPanel';
import { useAuth } from '../../hooks/useAuth';

import {
  BellIcon,
  BuildingIcon,
  ClipboardIcon,
  GridIcon,
  MessageIcon,
  SettingsIcon,
  ShieldIcon,
  UploadIcon,
} from '../../dashboard-v2/icons';
import '../../theme/theme.css';
import '../../dashboard-v2/dashboard-v2.css';
import '../../components/dashboard/dashboard.css';

const queueColumns = [
  { key: 'patient', label: 'Patient' },
  { key: 'file', label: 'File' },
  { key: 'submittedAt', label: 'Submitted At' },
  {
    key: 'status',
    label: 'Status',
    render: (row: { status: string }) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

interface AuthUser {
  email?: string;
  profile?: { hospitalName?: string; supportEmail?: string; officialEmail?: string; phone?: string };
}

export default function HospitalDashboardPage() {
  const { user, logout } = useAuth() as { user: AuthUser | null; logout: () => void };
  const [data, setData] = useState<HospitalDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [activeView, setActiveView] = useState<HospitalView>('overview');
  const [settings, setSettings] = useState({
    hospitalName: user?.profile?.hospitalName || '',
    supportEmail: user?.profile?.supportEmail || user?.profile?.officialEmail || '',
    contactPhone: user?.profile?.phone || '',
  });
  const [notifySettings, setNotifySettings] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const { toasts, showToast } = useToast();

  const refreshData = useCallback(() => {
    setLoading(true);
    getHospitalDashboardData().then((result: HospitalDashboardData) => {
      const initialNotifications: Record<string, boolean> = {};
      result.notifications.forEach((entry) => { initialNotifications[entry.id] = entry.enabled; });
      setNotifySettings(initialNotifications);
      setData(result);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleUpload = async (uploadForm: any) => {
    await uploadDocument(uploadForm);
    setFeedback('Document uploaded & stamped successfully!');
    showToast('Document uploaded & stamped');
    refreshData();
  };

  const handleRevoke = async (granteeUserId: string) => {
    setBusy(true);
    setFeedback('');
    try {
      const result = await revokeGrantsByGrantee(granteeUserId);
      setFeedback(result.message);
      showToast(result.message);
      refreshData();
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    setBusy(true);
    setFeedback('');
    try {
      await updateProfile('hospital', { hospitalName: settings.hospitalName, phone: settings.contactPhone });
      setFeedback('Profile saved successfully!');
      showToast('Profile saved');
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const accessColumnsWithActions = [
    { key: 'doctor', label: 'Doctor' },
    { key: 'department', label: 'Department' },
    { key: 'grants', label: 'Active Grants' },
    {
      key: 'status',
      label: 'Status',
      render: (row: { status: string }) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row: { granteeUserId: string }) => (
        <div className="dashboard-inline-actions">
          <button type="button" className="btn btn-primary" onClick={() => handleRevoke(row.granteeUserId)} disabled={busy}>Revoke</button>
        </div>
      ),
    },
  ];

  const handleViewChange = (view: HospitalView) => {
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

    data.uploadQueue.forEach((row) => {
      items.push({
        id: `queue-${row.id}`,
        category: 'Upload Queue',
        label: row.file,
        meta: `${row.patient} · ${row.status}`,
        onSelect: () => handleViewChange('queue'),
      });
    });

    data.staffAccess.forEach((row) => {
      items.push({
        id: `staff-${row.id}`,
        category: 'Staff Access',
        label: row.doctor,
        meta: `${row.department} · ${row.status}`,
        onSelect: () => handleViewChange('access'),
      });
    });

    data.complianceEvents.forEach((event) => {
      items.push({
        id: `compliance-${event.id}`,
        category: 'Compliance',
        label: event.title,
        meta: event.time,
        onSelect: () => handleViewChange('compliance'),
      });
    });

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const navGroups = [
    { label: 'Workspace', keys: ['overview', 'queue'] as HospitalView[] },
    { label: 'Access & Activity', keys: ['access', 'compliance', 'notifications'] as HospitalView[] },
    { label: 'Tools', keys: ['emergency', 'chat', 'settings'] as HospitalView[] },
  ];

  const navItems = [
    { key: 'overview' as const, label: 'Overview', icon: <GridIcon size={16} /> },
    { key: 'queue' as const, label: 'Upload Queue', icon: <UploadIcon size={16} /> },
    { key: 'access' as const, label: 'Staff Access', icon: <BuildingIcon size={16} /> },
    { key: 'compliance' as const, label: 'Compliance & Audit', icon: <ClipboardIcon size={16} /> },
    { key: 'emergency' as const, label: 'Emergency Access', icon: <ShieldIcon size={16} /> },
    { key: 'chat' as const, label: 'Chat', icon: <MessageIcon size={16} /> },
    { key: 'settings' as const, label: 'Profile & Settings', icon: <SettingsIcon size={16} /> },
    { key: 'notifications' as const, label: 'Notifications', icon: <BellIcon size={16} /> },
  ];

  const userName = user?.profile?.hospitalName || user?.email || 'Hospital';
  const userInitials = userName
    .split(' ')
    .map((part: string) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const viewTitles: Record<HospitalView, [string, string]> = {
    overview: ['Overview', 'Institutional metrics and vault operations summary.'],
    upload: ['Upload Document', 'Upload Document'],
    queue: ['Upload Queue', 'Monitor processing status of uploaded documents.'],
    access: ['Staff Access', 'Manage doctor-level access to patient records.'],
    compliance: ['Compliance & Audit', 'Review compliance and audit events.'],
    emergency: ['Emergency Access', 'Initiate 24-hour emergency access to patient records via biometric verification.'],
    chat: ['Chat', 'Ask questions about the documents you have access to.'],
    settings: ['Profile & Settings', 'Institution identity and communication settings.'],
    notifications: ['Notifications', 'Control institution alert channels.'],
  };
  const [topbarTitle, topbarSubtitle] = viewTitles[activeView];

  const renderView = () => {
    if (loading || !data) {
      return <p className="mv-empty">Loading hospital dashboard…</p>;
    }

    switch (activeView) {
      case 'overview':
        return (
          <HospitalOverview
            data={data}
            onNavigate={handleViewChange}
            onOpenUpload={() => setShowUpload(true)}
            showToast={showToast}
          />
        );

      case 'queue':
        return (
          <DashboardSection id="queue" title="Upload Queue" subtitle="Monitor processing status of uploaded documents.">
            <DataTable columns={queueColumns} rows={data.uploadQueue} emptyMessage="No upload jobs found." />
          </DashboardSection>
        );

      case 'access':
        return (
          <DashboardSection id="access" title="Staff Access" subtitle="Manage doctor-level access to patient records.">
            {feedback && <p style={{ color: feedback.includes('success') || feedback.includes('revoked') ? 'green' : '#c33', marginBottom: 10 }}>{feedback}</p>}
            <DataTable columns={accessColumnsWithActions} rows={data.staffAccess} emptyMessage="No staff access assignments found." />
          </DashboardSection>
        );

      case 'compliance':
        return (
          <DashboardSection id="compliance" title="Compliance & Audit" subtitle="Review compliance and audit events.">
            <ActivityFeed items={data.complianceEvents} emptyMessage="No compliance events yet." />
          </DashboardSection>
        );

      case 'settings':
        return (
          <DashboardSection id="settings" title="Profile & Settings" subtitle="Institution identity and communication settings.">
            {feedback && <p style={{ color: feedback.includes('success') ? 'green' : '#c33', marginBottom: 10 }}>{feedback}</p>}
            <div className="dashboard-form-grid">
              <div className="dashboard-field">
                <label htmlFor="hospitalName">Hospital Name</label>
                <input id="hospitalName" name="hospitalName" value={settings.hospitalName} onChange={(e) => setSettings((prev) => ({ ...prev, hospitalName: e.target.value }))} />
              </div>
              <div className="dashboard-field">
                <label htmlFor="supportEmail">Support Email</label>
                <input id="supportEmail" name="supportEmail" value={settings.supportEmail} onChange={(e) => setSettings((prev) => ({ ...prev, supportEmail: e.target.value }))} />
              </div>
              <div className="dashboard-field span-2">
                <label htmlFor="contactPhone">Contact Phone</label>
                <input id="contactPhone" name="contactPhone" value={settings.contactPhone} onChange={(e) => setSettings((prev) => ({ ...prev, contactPhone: e.target.value }))} />
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
            <EmergencyAccess />
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
          <DashboardSection id="notifications" title="Notifications" subtitle="Control institution alert channels.">
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr><th>Channel</th><th>Description</th><th>Enabled</th></tr>
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
    <DashboardShell
      navGroups={navGroups}
      navItems={navItems}
      activeView={activeView}
      onViewChange={handleViewChange}
      title={topbarTitle}
      subtitle={topbarSubtitle}
      userName={userName}
      userEmail={user?.email || ''}
      userInitials={userInitials || 'H'}
      roleLabel="Hospital"
      onLogout={logout}
      onHome={() => { window.location.href = '/'; }}
      onNotificationsClick={() => handleViewChange('notifications')}
      searchItems={searchItems}
    >
      {renderView()}
      {showUpload && (
        <UploadModal onUpload={handleUpload} onClose={() => setShowUpload(false)} busy={busy} />
      )}
      <ToastStack toasts={toasts} />
    </DashboardShell>
  );
}
