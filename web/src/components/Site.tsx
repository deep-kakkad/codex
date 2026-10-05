import { type ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLeaveDemo } from '../demo/DemoBanner';
import { useDemo } from '../demo/mode';
import { VERSUS } from '../marketing/content';
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
          <Link to="/roles">Roles</Link>
          <Link to="/roi">ROI</Link>
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
    <footer className="lp-wrap lp-footer site-footer">
      <div className="site-footer-brand">
        <span className="lp-wordmark lp-wordmark-sm">Proofwork</span>
        <span className="lp-footer-note">Practical skills, verified by people. AI reviews; your team decides.</span>
      </div>
      <nav className="site-footer-cols" aria-label="Footer">
        <div>
          <h2>Product</h2>
          <Link to="/demo/recruiter">Recruiter demo</Link>
          <Link to="/demo/candidate">Candidate walkthrough</Link>
          <Link to="/roles">Role library</Link>
          <Link to="/roi">ROI calculator</Link>
          <Link to="/signup">Start free</Link>
          <Link to="/login">Log in</Link>
        </div>
        <div>
          <h2>Compare</h2>
          {VERSUS.map((v) => (
            <Link key={v.slug} to={`/compare/${v.slug}`}>
              vs {v.short}
            </Link>
          ))}
        </div>
        <div>
          <h2>Trust</h2>
          <Link to="/trust">Security</Link>
          <Link to="/privacy">Privacy notice</Link>
          <Link to="/dpa">Data processing agreement</Link>
        </div>
      </nav>
    </footer>
  );
}

/** The closing call to action on public pages. */
export function CtaBand({ title, line }: { title: string; line: string }) {
  const { user } = useAuth();
  const demo = useDemo();
  const signedIn = Boolean(user) && !demo;
  return (
    <section className="lp-cta" aria-labelledby="cta-title">
      <div className="lp-wrap lp-cta-inner">
        <div>
          <h2 id="cta-title">{title}</h2>
          <p>{line}</p>
        </div>
        <div className="lp-cta-actions">
          {signedIn ? (
            <Link to="/app" className="lp-btn lp-btn-lg lp-btn-invert">
              Open dashboard
              <Icon name="arrow" size={22} />
            </Link>
          ) : (
            <StartFree size="lg" invert />
          )}
          <Link to="/demo/recruiter" className="lp-textlink lp-textlink-invert">
            Try the live demo
          </Link>
        </div>
      </div>
    </section>
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
