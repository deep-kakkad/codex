import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { Avatar } from './ReviewBits';
import { setUi, useUi } from '../ui';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // The candidate review is a working canvas: it uses the full width of the screen.
  const wide = useMatch('/app/candidates/:id') !== null;
  const ui = useUi();
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/app" className="brand" end>
          <Logo />
          Proofwork
        </NavLink>
        {user && <div className="org-name">{user.orgName}</div>}
        {user?.role === 'manager' && (
          <Link to="/app/new" className="btn btn-primary btn-sm side-cta">
            <Icon name="plus" size={14} />
            New assessment
          </Link>
        )}
        <nav className="side-nav" aria-label="Main">
          <NavLink to="/app" end>
            <Icon name="assessments" />
            Assessments
          </NavLink>
          <NavLink to="/app/library">
            <Icon name="library" />
            Role library
          </NavLink>
          <NavLink to="/app/team">
            <Icon name="team" />
            Team
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
              <Avatar name={user.name} size="md" />
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
