import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Logo } from './Logo';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/app" className="brand" end>
            <Logo />
            Proofwork
          </NavLink>
          <nav className="nav">
            <NavLink to="/app" end>
              Assessments
            </NavLink>
            <NavLink to="/app/library">Role library</NavLink>
            <NavLink to="/app/team">Team</NavLink>
          </nav>
          <div className="topbar-user">
            <span className="muted small">
              {user?.name} · {user?.orgName}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
