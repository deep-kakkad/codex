import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { Avatar } from './ReviewBits';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
