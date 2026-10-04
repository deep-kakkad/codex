import { useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { enterDemo, exitDemo, useDemo } from './mode';
import { type TourId, endTour, startTour, useTour } from './tour';
import { TOURS } from './tourSteps';

/**
 * Leaves the demo for `to`. A full page load drops every trace of the sample
 * workspace at once, and the app starts again with whoever is really signed in.
 */
export function useLeaveDemo() {
  return useCallback(async (to: string) => {
    endTour();
    exitDemo();
    window.location.assign(to);
  }, []);
}

/** /demo/recruiter and /demo/candidate: open a fresh demo and start that side's guided tour. */
export function DemoStart({ side }: { side: TourId }) {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      enterDemo();
      await refresh();
      if (cancelled) return;
      // Replace this address, so Back from the tour doesn't start it over.
      navigate(TOURS[side][0].path, { replace: true });
      startTour(side);
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
  const tour = useTour();
  const leave = useLeaveDemo();
  const { pathname } = useLocation();
  if (!demo || /^\/demo(\/|$)/.test(pathname)) return null;
  const candidateSide = pathname.startsWith('/c/');
  const side: TourId = candidateSide ? 'candidate' : 'recruiter';
  return (
    <div className="demo-banner" role="status">
      <span className="demo-banner-tag">Demo</span>
      <span className="demo-banner-text">
        Sample data in your browser. <span className="demo-banner-more">Nothing you do here is saved.</span>
      </span>
      <span className="demo-banner-actions">
        {!tour && (
          <button
            type="button"
            onClick={() => {
              // The recruiter tour reads best on the untouched sample workspace.
              if (side === 'recruiter') enterDemo();
              startTour(side);
            }}
          >
            Take the tour
          </button>
        )}
        {candidateSide ? (
          <Link to="/demo/recruiter">Recruiter side</Link>
        ) : (
          <Link to="/demo/candidate">Candidate side</Link>
        )}
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
