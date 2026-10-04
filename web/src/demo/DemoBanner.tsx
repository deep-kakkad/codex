import { useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { DEMO_TOKEN, enterDemo, exitDemo, isDemo, useDemo } from './mode';

/** Leaves the demo, reloads who is signed in for real, then goes to `to`. */
export function useLeaveDemo() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  return useCallback(
    async (to: string) => {
      exitDemo();
      await refresh();
      navigate(to);
    },
    [refresh, navigate],
  );
}

/** /demo/recruiter and /demo/candidate: start the static demo and open that side of it. */
export function DemoStart({ side }: { side: 'recruiter' | 'candidate' }) {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isDemo()) enterDemo();
      if (side === 'candidate') (await import('./fakeApi')).restartCandidateDemo();
      await refresh();
      if (!cancelled) navigate(side === 'candidate' ? `/c/${DEMO_TOKEN}` : '/app', { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [side, refresh, navigate]);
  return <div className="page-loading">Opening the demo…</div>;
}

/** Shown on every page while the demo is on. */
export function DemoBanner() {
  const demo = useDemo();
  const leave = useLeaveDemo();
  const { pathname } = useLocation();
  if (!demo || /^\/demo(\/|$)/.test(pathname)) return null;
  const candidateSide = pathname.startsWith('/c/');
  return (
    <div className="demo-banner" role="status">
      <span className="demo-banner-tag">Demo</span>
      <span className="demo-banner-text">
        Sample data in your browser. <span className="demo-banner-more">Nothing is saved or sent.</span>
      </span>
      <span className="demo-banner-actions">
        {candidateSide ? <Link to="/app">Recruiter side</Link> : <Link to="/demo/candidate">Candidate side</Link>}
        <button type="button" onClick={() => void leave('/signup')}>
          Start free
        </button>
        <button type="button" onClick={() => void leave('/')}>
          Exit
        </button>
      </span>
    </div>
  );
}
