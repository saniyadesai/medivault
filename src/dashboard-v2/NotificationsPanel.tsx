import { useState } from 'react';
import type { NotificationSetting } from './types';

interface NotificationsPanelProps {
  notifications: NotificationSetting[];
}

export function NotificationsPanel({ notifications }: NotificationsPanelProps) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(notifications.map((n) => [n.id, n.enabled])),
  );

  return (
    <div className="mv-card">
      <div className="mv-card-body">
        {notifications.length === 0 ? (
          <div className="mv-empty">No notification settings available.</div>
        ) : (
          notifications.map((entry) => {
            const on = enabled[entry.id] ?? entry.enabled;
            return (
              <div key={entry.id} className="mv-row">
                <div style={{ minWidth: 0 }}>
                  <div className="mv-row-title">{entry.channel}</div>
                  <div className="mv-row-meta">{entry.description}</div>
                </div>
                <button
                  type="button"
                  className={`mv-switch${on ? ' is-on' : ''}`}
                  style={{ marginLeft: 'auto' }}
                  role="switch"
                  aria-checked={on}
                  aria-label={`Toggle ${entry.channel} notifications`}
                  onClick={() => setEnabled((prev) => ({ ...prev, [entry.id]: !on }))}
                >
                  <span className="mv-switch-knob" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
