import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '../../components/dashboard/DashboardLayout';
import DashboardSection from '../../components/dashboard/DashboardSection';
import MetricCard from '../../components/dashboard/MetricCard';
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

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'upload', label: 'Upload Document' },
  { key: 'queue', label: 'Upload Queue' },
  { key: 'access', label: 'Staff Access' },
  { key: 'compliance', label: 'Compliance & Audit' },
  { key: 'emergency', label: '🚨 Emergency Access' },
  { key: 'chat', label: '💬 Chat' },
  { key: 'settings', label: 'Profile & Settings' },
  { key: 'notifications', label: 'Notifications' },
];

const queueColumns = [
  { key: 'patient', label: 'Patient' },
  { key: 'file', label: 'File' },
  { key: 'submittedAt', label: 'Submitted At' },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

const accessColumnsBase = [
  { key: 'doctor', label: 'Doctor' },
  { key: 'department', label: 'Department' },
  { key: 'grants', label: 'Active Grants' },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <span className={`dashboard-badge is-${row.status}`}>{row.status}</span>,
  },
];

export default function HospitalDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [activeView, setActiveView] = useState('overview');
  const [settings, setSettings] = useState({
    hospitalName: user?.profile?.hospitalName || '',
    supportEmail: user?.profile?.supportEmail || user?.profile?.officialEmail || '',
    contactPhone: user?.profile?.phone || '',
  });
  const [notifySettings, setNotifySettings] = useState({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const refreshData = useCallback(() => {
    setLoading(true);
    getHospitalDashboardData().then((result) => {
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

  const handleUpload = async (uploadForm) => {
    await uploadDocument(uploadForm);
    setFeedback('Document uploaded & stamped successfully!');
    refreshData();
  };

  const handleRevoke = async (granteeUserId) => {
    setBusy(true);
    setFeedback('');
    try {
      const result = await revokeGrantsByGrantee(granteeUserId);
      setFeedback(result.message);
      refreshData();
    } catch (err) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    setBusy(true);
    setFeedback('');
    try {
      await updateProfile('hospital', {
        hospitalName: settings.hospitalName,
        phone: settings.contactPhone,
      });
      setFeedback('Profile saved successfully!');
    } catch (err) {
      setFeedback(err.message);
    } finally {
      setBusy(false);
    }
  };

  const accessColumnsWithActions = [
    ...accessColumnsBase,
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="dashboard-inline-actions">
          <button type="button" className="btn btn-primary" onClick={() => handleRevoke(row.granteeUserId)} disabled={busy}>Revoke</button>
        </div>
      ),
    },
  ];

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
      <DashboardLayout title="Hospital Dashboard" subtitle="Operate institutional uploads and compliance controls." navItems={NAV_ITEMS} activeView={activeView} onViewChange={handleViewChange}>
        <p className="dashboard-empty-state">Loading hospital dashboard...</p>
      </DashboardLayout>
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'overview':
        return (
          <DashboardSection id="overview" title="Overview" subtitle="Institutional metrics and vault operations summary.">
            <div className="metrics-grid">
              {data.metrics.map((metric) => (
                <MetricCard key={metric.key} title={metric.title} value={metric.value} hint={metric.hint} />
              ))}
            </div>
          </DashboardSection>
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
          <DashboardSection id="chat" title="Chat" subtitle="Ask questions about the documents you have access to.">
            <ChatPanel />
          </DashboardSection>
        );

      case 'notifications':
        return (
          <DashboardSection id="notifications" title="Notifications" subtitle="Control institution alert channels.">
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
    <DashboardLayout title="Hospital Dashboard" subtitle="Operate institutional uploads and compliance controls." navItems={NAV_ITEMS} activeView={activeView} onViewChange={handleViewChange}>
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
    </DashboardLayout>
  );
}
