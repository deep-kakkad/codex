import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TRIAL_REVIEWS } from '../../../../shared/plans';
import { Icon } from '../../components/Icon';
import { SiteFooter, StartFree, useLandingBody } from '../../components/Site';
import { ROLES } from '../../marketing/content';
import { roi } from '../Marketing';
import { FAQ, PreviewBar, PvNav } from './shared';

const BASE = {
  screened: 25,
  screenMinutes: 30,
  interviews: 6,
  interviewHours: 1.5,
  hourCost: 1000,
  finishRate: 70,
  readMinutes: 6,
  interviewsAfter: 3,
};

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Version 4, "Time back": for the person who signs off the budget. */
export function LandingV4() {
  useLandingBody();
  const [hires, setHires] = useState(12);
  const [query, setQuery] = useState('');
  const result = useMemo(() => roi({ ...BASE, hires }), [hires]);
  const share = result.before ? Math.round((result.saved / result.before) * 100) : 0;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROLES.slice(0, 8);
    return ROLES.filter((r) =>
      [r.name, ...r.roles, ...(r.catalog?.keywords ?? [])].join(' ').toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query]);

  return (
    <div className="lp v4">
      <PvNav />
      <main>
        <section className="lp-wrap v4-hero">
          <div>
            <span className="v4-kicker">For hiring teams that are out of hours</span>
            <h1>
              Stop screening.
              <br />
              Start deciding.
            </h1>
            <p className="v4-lead">
              Proofwork replaces CV screens and phone screens with a 35-minute practical assessment. You meet only the
              people who showed they can do the work, and you know why.
            </p>
            <div className="v4-actions">
              <StartFree size="lg" />
              <Link to="/roi" className="lp-textlink">
                Run your own numbers
              </Link>
            </div>
          </div>

          <aside className="v4-calc" aria-live="polite">
            <label className="v4-slider">
              <span>
                Hires a year <b>{hires}</b>
              </span>
              <input type="range" min={1} max={100} value={hires} onChange={(e) => setHires(Number(e.target.value))} />
            </label>
            <p className="v4-big">
              <span className="num">{Math.round(result.saved).toLocaleString('en-IN')}</span> hours
            </p>
            <p className="v4-big-sub">
              back each year, {share}% of the time your team spends screening and interviewing
            </p>
            <div className="v4-bars">
              <div>
                <span>Today</span>
                <i style={{ width: '100%' }} />
                <b>{Math.round(result.before)} h</b>
              </div>
              <div>
                <span>With Proofwork</span>
                <i className="is-after" style={{ width: `${(result.after / result.before) * 100}%` }} />
                <b>{Math.round(result.after)} h</b>
              </div>
            </div>
            <dl>
              <div>
                <dt>Team time saved</dt>
                <dd>{rupees(result.value)}</dd>
              </div>
              <div>
                <dt>Proofwork</dt>
                <dd>{rupees(result.plan.cost)}</dd>
              </div>
            </dl>
            <small>
              25 candidates screened per hire, 30 minutes each, 6 first-round interviews. Change these on the{' '}
              <Link to="/roi">ROI page</Link>.
            </small>
          </aside>
        </section>

        <section className="lp-wrap v4-where" aria-labelledby="v4-where">
          <h2 id="v4-where" className="v4-h2">
            Where the hours go, and where they come back.
          </h2>
          <div className="v4-compare">
            <div>
              <h3>Today</h3>
              <ol>
                <li>
                  <Icon name="file" size={16} /> Read 25 CVs that all look the same
                </li>
                <li>
                  <Icon name="clock" size={16} /> Book and run phone screens
                </li>
                <li>
                  <Icon name="team" size={16} /> Six first rounds, to find one or two who can do it
                </li>
              </ol>
            </div>
            <div className="is-us">
              <h3>With Proofwork</h3>
              <ol>
                <li>
                  <Icon name="mail" size={16} /> Send one link, or post it on the job ad
                </li>
                <li>
                  <Icon name="sparkle" size={16} /> Read scored reviews with quotes, ranked
                </li>
                <li>
                  <Icon name="check" size={16} /> Meet the top three, with questions already written
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="lp-wrap v4-finder" aria-labelledby="v4-finder">
          <h2 id="v4-finder" className="v4-h2">
            What are you hiring for?
          </h2>
          <label className="v4-search">
            <Icon name="search" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “SDR”, “FP&A” or “product manager”"
              aria-label="Find a role"
            />
          </label>
          <div className="v4-results">
            {matches.map((r) => (
              <Link key={r.id} to={`/roles/${r.id}`}>
                <strong>{r.name}</strong>
                <span>~{r.totalMinutes} min</span>
              </Link>
            ))}
            {matches.length === 0 && (
              <p>
                Not in the library yet: paste your job description after you <Link to="/signup">sign up</Link> and AI
                writes one.
              </p>
            )}
          </div>
        </section>

        <section className="lp-wrap v4-faq" aria-labelledby="v4-faq">
          <h2 id="v4-faq" className="v4-h2">
            Before you sign off
          </h2>
          <div className="v4-faq-grid">
            {FAQ.map(([q, a]) => (
              <div key={q}>
                <h3>{q}</h3>
                <p>{a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-wrap v4-cta">
          <div>
            <h2>Try it on one role this week.</h2>
            <p>{TRIAL_REVIEWS} reviewed candidates free. No card, no sales call.</p>
          </div>
          <StartFree size="lg" />
        </section>
      </main>
      <SiteFooter />
      <PreviewBar current={4} />
    </div>
  );
}
