import { useState } from 'react';
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { Avatar } from './ReviewBits';
import { setUi, useUi } from '../ui';

const SIDEBAR_KEY = 'proofwork-sidebar';

function storedCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // The candidate review is a working canvas: it uses the full width of the screen.
  const wide = useMatch('/app/candidates/:id') !== null;
  const ui = useUi();
  // A slim icon rail gives the page the width back; the choice is remembered.
  const [collapsed, setCollapsed] = useState(storedCollapsed);
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      // Storage can be refused in private windows; the choice still holds for this visit.
    }
  }

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <NavLink to="/app" className="brand" end aria-label="Proofwork">
            <Logo />
            <span className="side-label">Proofwork</span>
          </NavLink>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            data-tip={collapsed ? 'Expand sidebar' : undefined}
            title={collapsed ? undefined : 'Collapse sidebar'}
          >
            <Icon name={collapsed ? 'expand' : 'collapse'} />
          </button>
        </div>
        {user && <div className="org-name">{user.orgName}</div>}
        {user?.role === 'manager' && (
          <Link to="/app/new" className="btn btn-primary btn-sm side-cta" data-tip="New assessment">
            <Icon name="plus" size={14} />
            <span className="side-label">New assessment</span>
          </Link>
        )}
        <nav className="side-nav" aria-label="Main">
          <NavLink to="/app" end data-tip="Assessments">
            <Icon name="assessments" />
            <span className="side-label">Assessments</span>
          </NavLink>
          <NavLink to="/app/library" data-tip="Role library">
            <Icon name="library" />
            <span className="side-label">Role library</span>
          </NavLink>
          <NavLink to="/app/team" data-tip="Team">
            <Icon name="team" />
            <span className="side-label">Team</span>
          </NavLink>
        </nav>
        <div className="ui-switch" role="group" aria-label="Interface">
          <span className="ui-switch-label">Interface</span>
          <div className="ui-switch-buttons">
            {(
              [
                ['v1', 'UI 1'],
                ['v2', 'UI 2'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={ui === value ? 'is-on' : ''}
                aria-pressed={ui === value}
                title={value === 'v1' ? 'The earlier design' : 'The current design'}
                onClick={() => setUi(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-foot">
          {user && (
            <>
              <span className="sidebar-avatar" title={collapsed ? `${user.name} · ${user.email}` : undefined}>
                <Avatar name={user.name} size="md" />
              </span>
              <div className="sidebar-user">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
            </>
          )}
          <button
            className="btn btn-ghost btn-sm"
            title="Log out"
            aria-label="Log out"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="shell-main">
        <div className={`container ${wide ? 'container-wide' : ''}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
