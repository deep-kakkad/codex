import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EXTRA_REVIEW_INR, PAYG_REVIEW_INR, PLAN_OFFERS, TRIAL_REVIEWS } from '../../../shared/plans';
import { STAGE_KIND_LABEL } from '../../../shared/types';
import { Icon } from '../components/Icon';
import { CtaBand, SiteLayout, StartFree } from '../components/Site';
import { ROLES, VERSUS, pageMeta, roleById, rolesByFunction, versusBySlug } from '../marketing/content';
import { NotFound } from './NotFound';

const titleOf = (path: string) => pageMeta(path)?.title.replace(/ · Proofwork$/, '') ?? 'Proofwork';

// Role library -----------------------------------------------------------------------------

export function RolesPage() {
  return (
    <SiteLayout title={titleOf('/roles')}>
      <section className="lp-wrap doc-hero">
        <span className="doc-eyebrow">Role library</span>
        <h1 className="doc-title">A practical assessment for {ROLES.length} roles.</h1>
        <div className="doc-lead">
          <p>
            Each one is a realistic situation from the job, written by people who have done it: real numbers, a decision
            that changes what happens next, a plan with flaws to catch, and one task where any AI tool is allowed. About
            30 to 40 minutes.
          </p>
        </div>
      </section>
      {rolesByFunction().map(([group, roles]) => (
        <section key={group} className="lp-wrap doc-section" aria-label={group}>
          <h2 className="doc-h2">{group}</h2>
          <div className="role-grid">
            {roles.map((role) => (
              <Link key={role.id} to={`/roles/${role.id}`} className="role-tile">
                <strong>{role.name}</strong>
                <span>{role.roles.slice(0, 2).join(' · ')}</span>
                <span className="role-tile-meta">
                  ~{role.totalMinutes} min · {role.catalog?.seniority.join(', ')}
                  <Icon name="arrow" size={16} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <div className="doc-spacer" />
      <CtaBand
        title="Don’t see your role?"
        line="Paste a job description and AI writes a scenario in the same format, private to your team."
      />
    </SiteLayout>
  );
}

const KIND_TEXT: Record<string, string> = {
  warmup: 'A short spoken answer to settle in. Not scored.',
  scenario: 'Read the situation and the numbers, and say what matters.',
  decision: 'Commit to a call, with the trade-offs.',
  branch: 'The situation changes because of their decision. Do they adjust?',
  critique: 'Review someone else’s plan, with problems only the data shows.',
  ai_allowed: 'Any AI tool allowed. They paste the conversation, so you see how they use it.',
  past_work: 'Something real from their own career, told with specifics.',
};

export function RolePage() {
  const { id = '' } = useParams();
  const role = roleById(id);
  if (!role) return <NotFound />;
  const thinkAloud = role.stages.filter((s) => s.thinkAloud).length;
  const related = ROLES.filter((r) => r.id !== role.id && r.catalog?.function === role.catalog?.function).slice(0, 3);
  return (
    <SiteLayout title={titleOf(`/roles/${role.id}`)}>
      <section className="lp-wrap doc-hero">
        <nav className="doc-crumbs" aria-label="Breadcrumb">
          <Link to="/roles">Role library</Link>
          <Icon name="next" size={12} />
          <span>{role.catalog?.function}</span>
        </nav>
        <h1 className="doc-title role-title">{role.name} assessment</h1>
        <div className="doc-lead">
          <p>{role.summary}</p>
        </div>
        <ul className="role-facts">
          <li>
            <strong>~{role.totalMinutes} min</strong> in total
          </li>
          <li>
            <strong>{role.stages.length}</strong> questions
          </li>
          <li>
            <strong>{thinkAloud}</strong> think-aloud
          </li>
          {role.catalog && (
            <li>
              <strong>{role.catalog.seniority.join(', ')}</strong> level
            </li>
          )}
        </ul>
        <div className="role-actions">
          <StartFree size="sm" />
          <Link to="/demo/recruiter" className="lp-textlink">
            See a sample review
          </Link>
        </div>
      </section>

      <section className="lp-wrap doc-section" aria-labelledby="steps-title">
        <h2 id="steps-title" className="doc-h2">
          What candidates do
        </h2>
        <ol className="role-steps">
          {role.stages.map((stage, i) => (
            <li key={stage.id}>
              <span className="role-step-num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>
                  {stage.title}
                  {stage.thinkAloud && <span className="role-step-tag">Think aloud</span>}
                </h3>
                <p>{KIND_TEXT[stage.kind]}</p>
              </div>
              <span className="role-step-meta">
                {STAGE_KIND_LABEL[stage.kind]} · {Math.round(stage.timeLimitSec / 60)} min
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-wrap doc-section" aria-labelledby="fit-title">
        <h2 id="fit-title" className="doc-h2">
          Who it’s for
        </h2>
        <div className="doc-three">
          <div>
            <h3>Job titles</h3>
            <p>{[...role.roles, ...(role.catalog?.keywords ?? []).slice(0, 4)].join(', ')}</p>
          </div>
          <div>
            <h3>Skills it tests</h3>
            <p>{role.catalog?.skills.join(', ')}</p>
          </div>
          <div>
            <h3>Industries</h3>
            <p>{role.catalog?.industries.join(', ')}</p>
          </div>
        </div>
      </section>

      <section className="lp-wrap doc-section" aria-labelledby="get-title">
        <h2 id="get-title" className="doc-h2">
          What you get for each candidate
        </h2>
        <div className="doc-three">
          <div>
            <h3>Evidence, not a number</h3>
            <p>Every answer is scored against a rubric written for the role, quoting the candidate’s own words.</p>
          </div>
          <div>
            <h3>Their reasoning, out loud</h3>
            <p>Recordings of them working it out: sums, doubts and corrections. Live reasoning is hard to fake.</p>
          </div>
          <div>
            <h3>With and without AI</h3>
            <p>See what they do alone and what they do with AI, and whether they catch its mistakes.</p>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="lp-wrap doc-section" aria-labelledby="related-title">
          <h2 id="related-title" className="doc-h2">
            Related roles
          </h2>
          <div className="role-grid">
            {related.map((r) => (
              <Link key={r.id} to={`/roles/${r.id}`} className="role-tile">
                <strong>{r.name}</strong>
                <span>{r.roles.slice(0, 2).join(' · ')}</span>
                <span className="role-tile-meta">
                  ~{r.totalMinutes} min
                  <Icon name="arrow" size={16} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="doc-spacer" />
      <CtaBand
        title={`Hire your next ${role.roles[0]} on evidence.`}
        line={`${TRIAL_REVIEWS} reviewed candidates free. No card, no sales call.`}
      />
    </SiteLayout>
  );
}

// Comparisons ------------------------------------------------------------------------------

export function VersusPage() {
  const { slug = '' } = useParams();
  const versus = versusBySlug(slug);
  if (!versus) return <NotFound />;
  const others = VERSUS.filter((v) => v.slug !== versus.slug);
  return (
    <SiteLayout title={titleOf(`/compare/${versus.slug}`)}>
      <section className="lp-wrap doc-hero">
        <span className="doc-eyebrow">Compare</span>
        <h1 className="doc-title">Proofwork vs {versus.short}</h1>
        <div className="doc-lead">
          <p>{versus.lead}</p>
        </div>
      </section>

      <section className="lp-wrap doc-section" aria-labelledby="diff-title">
        <h2 id="diff-title" className="doc-h2">
          The difference
        </h2>
        <div className="doc-table-wrap">
          <table className="doc-table versus-table">
            <thead>
              <tr>
                <th>
                  <span className="lp-sr">Aspect</span>
                </th>
                <th className="is-us">Proofwork</th>
                <th>{versus.name[0].toUpperCase() + versus.name.slice(1)}</th>
              </tr>
            </thead>
            <tbody>
              {versus.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className="is-us">{row.us}</td>
                  <td>{row.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lp-wrap doc-section" aria-labelledby="choose-title">
        <h2 id="choose-title" className="doc-h2">
          Which fits
        </h2>
        <div className="doc-two versus-choose">
          <div className="trust-card">
            <h2>Choose {versus.short} when</h2>
            <ul>
              {versus.chooseThem.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="trust-card is-us">
            <h2>Choose Proofwork when</h2>
            <ul>
              {versus.chooseUs.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="doc-intro versus-note">{versus.together}</p>
      </section>

      <section className="lp-wrap doc-section" aria-labelledby="more-title">
        <h2 id="more-title" className="doc-h2">
          More comparisons
        </h2>
        <div className="role-grid">
          {others.map((v) => (
            <Link key={v.slug} to={`/compare/${v.slug}`} className="role-tile">
              <strong>Proofwork vs {v.short}</strong>
              <span>Best known for {v.goodFor}</span>
              <span className="role-tile-meta">
                Read <Icon name="arrow" size={16} />
              </span>
            </Link>
          ))}
        </div>
        <p className="doc-small versus-legal">
          Based on each product’s public information as of October 2026. Product names belong to their owners. Spotted
          something out of date? Let us know and we’ll fix it.
        </p>
      </section>
      <div className="doc-spacer" />
      <CtaBand title="See it on a real role." line="The guided demo takes four minutes. No sign-up." />
    </SiteLayout>
  );
}

// ROI calculator -----------------------------------------------------------------------------

interface Inputs {
  hires: number;
  screened: number;
  screenMinutes: number;
  interviews: number;
  interviewHours: number;
  hourCost: number;
  finishRate: number;
  readMinutes: number;
  interviewsAfter: number;
}

const DEFAULTS: Inputs = {
  hires: 12,
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
const hours = (n: number) => Math.round(n).toLocaleString('en-IN');

/** The cheapest way to pay for a year of reviews. */
function cheapestPlan(reviews: number) {
  const offer = (id: string) => PLAN_OFFERS.find((p) => p.id === id)!;
  const options = [
    { name: 'Pay as you go', cost: reviews * PAYG_REVIEW_INR },
    {
      name: 'Starter, billed yearly',
      cost: offer('starter').annualInr! + Math.max(0, reviews - 40 * 12) * EXTRA_REVIEW_INR,
    },
    {
      name: 'Growth, billed yearly',
      cost: offer('growth').annualInr! + Math.max(0, reviews - 150 * 12) * EXTRA_REVIEW_INR,
    },
  ];
  return options.reduce((best, o) => (o.cost < best.cost ? o : best));
}

export function roi(input: Inputs) {
  const before = input.hires * ((input.screened * input.screenMinutes) / 60 + input.interviews * input.interviewHours);
  const after =
    input.hires * ((input.screened * input.readMinutes) / 60 + input.interviewsAfter * input.interviewHours);
  const saved = Math.max(0, before - after);
  const value = saved * input.hourCost;
  const reviews = Math.round(input.hires * input.screened * (input.finishRate / 100));
  const plan = cheapestPlan(reviews);
  return {
    before,
    after,
    saved,
    value,
    reviews,
    plan,
    net: value - plan.cost,
    multiple: plan.cost ? value / plan.cost : 0,
  };
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="roi-field">
      <span className="roi-label">{label}</span>
      {hint && <span className="roi-hint">{hint}</span>}
      <span className="roi-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
          aria-label={`${label} (number)`}
        />
      </span>
    </label>
  );
}

export function RoiPage() {
  const [input, setInput] = useState<Inputs>(DEFAULTS);
  const [assumptions, setAssumptions] = useState(false);
  const result = useMemo(() => roi(input), [input]);
  const set = (key: keyof Inputs) => (n: number) => setInput({ ...input, [key]: n });
  const top = Math.max(result.before, 1);

  return (
    <SiteLayout title={titleOf('/roi')}>
      <section className="lp-wrap doc-hero">
        <span className="doc-eyebrow">ROI calculator</span>
        <h1 className="doc-title">What would Proofwork save your team?</h1>
        <div className="doc-lead">
          <p>
            Screening calls and first-round interviews eat recruiter and manager hours. Put in your numbers to see the
            time you get back, what it’s worth, and what Proofwork would cost.
          </p>
        </div>
      </section>

      <section className="lp-wrap roi">
        <div className="roi-inputs">
          <h2>Your hiring today</h2>
          <NumberField label="Hires a year" value={input.hires} min={1} max={500} onChange={set('hires')} />
          <NumberField
            label="Candidates you screen per hire"
            value={input.screened}
            min={2}
            max={200}
            onChange={set('screened')}
          />
          <NumberField
            label="Minutes spent screening each one"
            hint="Reading the CV and a phone screen"
            value={input.screenMinutes}
            min={5}
            max={120}
            step={5}
            onChange={set('screenMinutes')}
          />
          <NumberField
            label="First-round interviews per hire"
            value={input.interviews}
            min={1}
            max={30}
            onChange={set('interviews')}
          />
          <NumberField
            label="Team hours per first-round interview"
            hint="Everyone in the room, plus prep and debrief"
            value={input.interviewHours}
            min={0.5}
            max={8}
            step={0.5}
            onChange={set('interviewHours')}
          />
          <NumberField
            label="Cost of an hour of your team’s time (₹)"
            value={input.hourCost}
            min={200}
            max={10000}
            step={100}
            onChange={set('hourCost')}
          />
          <button
            type="button"
            className="roi-toggle"
            aria-expanded={assumptions}
            onClick={() => setAssumptions(!assumptions)}
          >
            <Icon name="chevron" size={14} /> {assumptions ? 'Hide' : 'Change'} our assumptions about Proofwork
          </button>
          {assumptions && (
            <div className="roi-assumptions">
              <NumberField
                label="Share of candidates who finish (%)"
                hint="Only finished candidates are reviewed and paid for"
                value={input.finishRate}
                min={10}
                max={100}
                step={5}
                onChange={set('finishRate')}
              />
              <NumberField
                label="Minutes to read a Proofwork review"
                value={input.readMinutes}
                min={1}
                max={30}
                onChange={set('readMinutes')}
              />
              <NumberField
                label="First-round interviews per hire with Proofwork"
                hint="You meet only the strongest few"
                value={input.interviewsAfter}
                min={1}
                max={30}
                onChange={set('interviewsAfter')}
              />
            </div>
          )}
        </div>

        <div className="roi-result" aria-live="polite">
          <span className="roi-eyebrow">Each year</span>
          <p className="roi-big">
            <span className="num">{hours(result.saved)}</span> hours back
          </p>
          <p className="roi-sub">
            {hours(result.saved / Math.max(1, input.hires))} hours per hire, worth{' '}
            <strong>{rupees(result.value)}</strong> of your team’s time.
          </p>
          <figure className="roi-bars" aria-label="Team hours a year, today and with Proofwork">
            <div className="roi-bar">
              <span className="roi-bar-label">Today</span>
              <span className="roi-bar-track">
                <span className="roi-bar-fill is-before" style={{ width: `${(result.before / top) * 100}%` }} />
              </span>
              <span className="roi-bar-value num">{hours(result.before)} h</span>
            </div>
            <div className="roi-bar">
              <span className="roi-bar-label">With Proofwork</span>
              <span className="roi-bar-track">
                <span className="roi-bar-fill" style={{ width: `${(result.after / top) * 100}%` }} />
              </span>
              <span className="roi-bar-value num">{hours(result.after)} h</span>
            </div>
          </figure>
          <dl className="roi-lines">
            <div>
              <dt>Candidates reviewed a year</dt>
              <dd className="num">{result.reviews.toLocaleString('en-IN')}</dd>
            </div>
            <div>
              <dt>Proofwork ({result.plan.name})</dt>
              <dd className="num">{rupees(result.plan.cost)}</dd>
            </div>
            <div className="is-total">
              <dt>Net saving</dt>
              <dd className="num">{rupees(result.net)}</dd>
            </div>
          </dl>
          {result.multiple >= 1 && (
            <p className="roi-multiple">
              About <strong>{result.multiple.toFixed(1)}×</strong> what you pay, before counting better hires.
            </p>
          )}
          <StartFree size="sm" invert />
        </div>
      </section>

      <section className="lp-wrap doc-section" aria-labelledby="how-title">
        <h2 id="how-title" className="doc-h2">
          How we work it out
        </h2>
        <div className="doc-three">
          <div>
            <h3>Hours today</h3>
            <p>Hires × (candidates screened × minutes each, plus first-round interviews × team hours each).</p>
          </div>
          <div>
            <h3>Hours with Proofwork</h3>
            <p>
              The same, with a few minutes to read each review instead of a screen, and fewer first-round interviews
              because you meet only the strongest.
            </p>
          </div>
          <div>
            <h3>Cost</h3>
            <p>
              Finished candidates a year on the cheapest plan for that volume: pay as you go, or Starter or Growth
              billed yearly, with extras at {rupees(EXTRA_REVIEW_INR)}. Candidates who don’t finish are free.
            </p>
          </div>
        </div>
        <p className="doc-small roi-note">
          An estimate from your numbers. It leaves out the cost of a wrong hire, which is usually far larger than any of
          this.
        </p>
      </section>
      <div className="doc-spacer" />
      <CtaBand
        title="Try it on your next role."
        line={`${TRIAL_REVIEWS} reviewed candidates free. No card, no sales call.`}
      />
    </SiteLayout>
  );
}
