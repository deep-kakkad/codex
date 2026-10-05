import { type ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLeaveDemo } from '../demo/DemoBanner';
import { useDemo } from '../demo/mode';
import { Icon } from './Icon';

/** The public site's paper-white page, edge to edge, unlike the app's tinted background. */
export function useLandingBody() {
  useEffect(() => {
    document.body.classList.add('is-landing');
    return () => document.body.classList.remove('is-landing');
  }, []);
}

/** Header and footer for public pages other than the landing page. */
export function SiteLayout({ title, children }: { title: string; children: ReactNode }) {
  useLandingBody();
  useEffect(() => {
    document.title = `${title} · Proofwork`;
    return () => {
      document.title = 'Proofwork';
    };
  }, [title]);
  return (
    <div className="lp">
      <header className="lp-wrap lp-nav">
        <Link to="/" className="lp-wordmark">
          Proofwork
        </Link>
        <nav className="lp-links" aria-label="Site">
          <a href="/#how">How it works</a>
          <Link to="/trust">Trust</Link>
        </nav>
        <SiteActions />
      </header>
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteActions() {
  const { user, candidate } = useAuth();
  const demo = useDemo();
  const signedIn = Boolean(user) && !demo;
  return (
    <div className="lp-nav-actions">
      {signedIn || candidate ? (
        <Link to={signedIn ? '/app' : '/candidate'} className="lp-btn lp-btn-sm">
          {signedIn ? 'Open dashboard' : 'My assessments'}
        </Link>
      ) : (
        <>
          <Link to="/login" className="lp-navlink">
            Log in
          </Link>
          <StartFree size="sm" />
        </>
      )}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="lp-wrap lp-footer">
      <span className="lp-wordmark lp-wordmark-sm">Proofwork</span>
      <nav className="lp-footer-links" aria-label="Footer">
        <Link to="/demo/recruiter">Recruiter demo</Link>
        <Link to="/demo/candidate">Candidate walkthrough</Link>
        <Link to="/trust">Trust and security</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/login">Log in</Link>
        <Link to="/signup">Start free</Link>
      </nav>
      <span className="lp-footer-note">Practical skills, verified by people. AI reviews; your team decides.</span>
    </footer>
  );
}

/** Start free. In the demo, it leaves the demo first so the sign-up page opens. */
export function StartFree({ size, invert = false }: { size: 'sm' | 'lg'; invert?: boolean }) {
  const demo = useDemo();
  const leaveDemo = useLeaveDemo();
  const className = `lp-btn lp-btn-${size} ${invert ? 'lp-btn-invert' : ''}`;
  const content = (
    <>
      Start free
      {size === 'lg' && <Icon name="arrow" size={22} />}
    </>
  );
  if (demo) {
    return (
      <button type="button" className={className} onClick={() => void leaveDemo('/signup')}>
        {content}
      </button>
    );
  }
  return (
    <Link to="/signup" className={className}>
      {content}
    </Link>
  );
}
