// Design sample (dashboard-redesign-ts branch) — not merged into main. See CLAUDE.md.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTheme } from '../theme/useTheme';
import {
  BellIcon,
  ChevronDownIcon,
  HomeIcon,
  LogoutIcon,
  MoonIcon,
  PanelLeftIcon,
  SearchIcon,
  SunIcon,
} from './icons';
import type { NavItem, PatientView, SearchResultItem } from './types';

// Shared open/close behavior for the search and profile dropdowns: closes on
// an outside click or Escape. Not a hook per element type since both panels
// need identical dismissal behavior.
function useDropdown<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { open, setOpen, ref };
}

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
  userEmail: string;
  userInitials: string;
  onLogout: () => void;
  onHome: () => void;
  searchItems?: SearchResultItem[];
  children: ReactNode;
}

export function DashboardShell({
  navItems,
  activeView,
  onViewChange,
  title,
  subtitle,
  userName,
  userEmail,
  userInitials,
  onLogout,
  onHome,
  searchItems = [],
  children,
}: DashboardShellProps) {
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const search = useDropdown<HTMLDivElement>();
  const profile = useDropdown<HTMLDivElement>();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchItems
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.meta.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, searchItems]);

  const selectResult = (item: SearchResultItem) => {
    item.onSelect();
    setQuery('');
    search.setOpen(false);
    searchInputRef.current?.blur();
  };

  return (
    <div className="mv-root" data-mv-theme={theme}>
      <div className="mv-shell">
        <aside className={`mv-sidebar${collapsed ? ' is-collapsed' : ''}`}>
          <div className="mv-sidebar-top">
            <div className="mv-brand">
              {!collapsed && <img src="/MEDIVAULT BG REMOVER.png" alt="MediVault" />}
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
            <div className="mv-search" ref={search.ref}>
              <SearchIcon size={15} />
              <input
                ref={searchInputRef}
                type="text"
                className="mv-search-input"
                placeholder="Search records, requests…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => search.setOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') searchInputRef.current?.blur();
                }}
              />
              <span className="mv-kbd">⌘K</span>

              {search.open && (
                <div className="mv-search-results">
                  {query.trim() === '' ? (
                    <div className="mv-search-hint">Type to search documents, requests, activity…</div>
                  ) : results.length === 0 ? (
                    <div className="mv-search-hint">No matches for “{query.trim()}”</div>
                  ) : (
                    results.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="mv-search-result"
                        onClick={() => selectResult(item)}
                      >
                        <span className="mv-search-result-category">{item.category}</span>
                        <span className="mv-search-result-label">{item.label}</span>
                        <span className="mv-search-result-meta">{item.meta}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, justifySelf: 'end' }}>
              <button type="button" className="mv-icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
                {theme === 'dark' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
              </button>
              <div className="mv-icon-btn" style={{ cursor: 'default' }}>
                <BellIcon size={16} />
                <span className="mv-dot" />
              </div>

              <div className="mv-profile-menu" ref={profile.ref}>
                <button
                  type="button"
                  className="mv-profile-trigger"
                  onClick={() => profile.setOpen((o) => !o)}
                  aria-label="Account menu"
                >
                  <div className="mv-avatar mv-avatar-lg">{userInitials}</div>
                  <ChevronDownIcon size={13} />
                </button>

                {profile.open && (
                  <div className="mv-profile-dropdown">
                    <div className="mv-profile-dropdown-head">
                      <div className="mv-avatar">{userInitials}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="mv-profile-name">{userName}</div>
                        <div className="mv-profile-role">{userEmail}</div>
                      </div>
                    </div>
                    <div className="mv-profile-dropdown-divider" />
                    <button
                      type="button"
                      className="mv-profile-dropdown-item is-danger"
                      onClick={() => {
                        profile.setOpen(false);
                        onLogout();
                      }}
                    >
                      <LogoutIcon size={14} />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mv-content">{children}</div>
        </div>
      </div>
    </div>
  );
}
