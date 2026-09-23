// Design sample (dashboard-redesign-ts branch) — not merged into main. See CLAUDE.md.
import { useState, type ReactNode } from 'react';
import { useTheme } from '../theme/useTheme';
import {
  BellIcon,
  HomeIcon,
  LogoutIcon,
  MoonIcon,
  PanelLeftIcon,
  SearchIcon,
  SunIcon,
} from './icons';
import type { NavItem, PatientView } from './types';

const NAV_GROUPS: { label: string; keys: PatientView[] }[] = [
  { label: 'Workspace', keys: ['overview', 'documents'] },
  { label: 'Access & Activity', keys: ['requests', 'audit', 'notifications'] },
  { label: 'Tools', keys: ['chat', 'settings'] },
];

interface DashboardShellProps {
  navItems: NavItem[];
  activeView: PatientView;
  onViewChange: (view: PatientView) => void;
  title: string;
  subtitle: string;
  userName: string;
  userInitials: string;
  onLogout: () => void;
  onHome: () => void;
  children: ReactNode;
}

export function DashboardShell({
  navItems,
  activeView,
  onViewChange,
  title,
  subtitle,
  userName,
  userInitials,
  onLogout,
  onHome,
  children,
}: DashboardShellProps) {
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mv-root" data-mv-theme={theme}>
      <div className="mv-shell">
        <aside className={`mv-sidebar${collapsed ? ' is-collapsed' : ''}`}>
          <div className="mv-sidebar-top">
            <div className="mv-brand">
              <img src="/MEDIVAULT BG REMOVER.png" alt="MediVault" />
              {!collapsed && <span>MediVault</span>}
              <button
                type="button"
                className="mv-collapse-btn"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <PanelLeftIcon size={15} />
              </button>
            </div>

            <nav className="mv-nav">
              {NAV_GROUPS.map((group) => {
                const items = group.keys
                  .map((key) => navItems.find((item) => item.key === key))
                  .filter((item): item is NavItem => Boolean(item));
                if (items.length === 0) return null;
                return (
                  <div className="mv-nav-group" key={group.label}>
                    {!collapsed && <div className="mv-nav-group-label">{group.label}</div>}
                    {items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`mv-nav-item${activeView === item.key ? ' is-active' : ''}`}
                        onClick={() => onViewChange(item.key)}
                        title={collapsed ? item.label : undefined}
                      >
                        {item.icon}
                        {!collapsed && <span>{item.label}</span>}
                        {item.badge && !collapsed ? <span className="mv-nav-badge">{item.badge}</span> : null}
                        {item.badge && collapsed ? <span className="mv-nav-dot" /> : null}
                      </button>
                    ))}
                  </div>
                );
              })}
            </nav>
          </div>

          <div>
            <div className="mv-profile-chip" title={collapsed ? userName : undefined}>
              <div className="mv-avatar">{userInitials}</div>
              {!collapsed && (
                <div>
                  <div className="mv-profile-name">{userName}</div>
                  <div className="mv-profile-role">Patient</div>
                </div>
              )}
            </div>
            <div className="mv-sidebar-actions">
              <button type="button" className="mv-link-btn" onClick={onHome} title={collapsed ? 'Home' : undefined}>
                <HomeIcon size={14} />
                {!collapsed && <span>Home</span>}
              </button>
              <button type="button" className="mv-link-btn is-logout" onClick={onLogout} title={collapsed ? 'Logout' : undefined}>
                <LogoutIcon size={14} />
                {!collapsed && <span>Logout</span>}
              </button>
            </div>
          </div>
        </aside>

        <div className="mv-main">
          <div className="mv-topbar">
            <div>
              <div className="mv-topbar-title">{title}</div>
              <div className="mv-topbar-sub">{subtitle}</div>
            </div>
            <div className="mv-search">
              <SearchIcon size={15} />
              <span>Search records, requests…</span>
              <span className="mv-kbd">⌘K</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button type="button" className="mv-icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
                {theme === 'dark' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
              </button>
              <div className="mv-icon-btn" style={{ cursor: 'default' }}>
                <BellIcon size={16} />
                <span className="mv-dot" />
              </div>
              <div className="mv-avatar mv-avatar-lg">{userInitials}</div>
            </div>
          </div>

          <div className="mv-content">{children}</div>
        </div>
      </div>
    </div>
  );
}
