import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import type { PlanView } from '../../../shared/api';
import { useAuth } from '../auth';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { Avatar } from './ReviewBits';
import { useApi } from '../hooks';

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
  const { pathname } = useLocation();
  const { data: plan, reload: reloadPlan } = useApi<PlanView>('/api/plan');
  // Usage changes as candidates finish; check again on each page.
  useEffect(() => {
    void reloadPlan();
  }, [pathname, reloadPlan]);
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
          <NavLink to="/app/plan" data-tip="Plan">
            <Icon name="card" />
            <span className="side-label">Plan</span>
          </NavLink>
        </nav>
        {plan && <TrialMeter plan={plan} />}
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

/** How much of the free trial (or prepaid credit) is left; hidden on unlimited and monthly plans. */
function TrialMeter({ plan }: { plan: PlanView }) {
  if (plan.plan === 'trial' && plan.included !== null) {
    const left = Math.max(0, plan.included - plan.used);
    return (
      <Link to="/app/plan" className={`trial-meter ${left === 0 ? 'is-out' : ''}`}>
        <span className="trial-meter-label">Free trial</span>
        <span className="trial-meter-count">
          {left === 0 ? 'No free reviews left' : `${left} of ${plan.included} free reviews left`}
        </span>
        <span className="trial-meter-bar" aria-hidden="true">
          <span style={{ width: `${(left / plan.included) * 100}%` }} />
        </span>
        {plan.locked > 0 && (
          <span className="trial-meter-locked">
            {plan.locked} review{plan.locked === 1 ? '' : 's'} waiting
          </span>
        )}
        <span className="trial-meter-cta">See plans</span>
      </Link>
    );
  }
  if (plan.plan === 'payg' && plan.credits !== null) {
    return (
      <Link to="/app/plan" className={`trial-meter ${plan.credits === 0 ? 'is-out' : ''}`}>
        <span className="trial-meter-label">Pay as you go</span>
        <span className="trial-meter-count">
          {plan.credits} review credit{plan.credits === 1 ? '' : 's'} left
        </span>
        {plan.locked > 0 && <span className="trial-meter-locked">{plan.locked} waiting</span>}
      </Link>
    );
  }
  return null;
}
