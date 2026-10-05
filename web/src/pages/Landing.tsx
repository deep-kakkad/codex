import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon, type IconName } from '../components/Icon';
import { SiteFooter, StartFree, useLandingBody } from '../components/Site';
import { useDemo } from '../demo/mode';

// The example candidate shown in the hero and in step 3.
const RUBRIC: [string, number][] = [
  ['Strategic thinking', 4],
  ['Execution plan', 3],
  ['Analytical rigor', 4],
  ['Communication', 3],
];
const OVERALL = (RUBRIC.reduce((sum, [, score]) => sum + score, 0) / RUBRIC.length).toFixed(1);

const REASONING =
  'I started by defining a clear north star metric for activation, then explored a few channels where we could reach high-intent users. Here’s how I prioritized the options and designed the experiment…';
const EVIDENCE =
  'The core insight is that many new users aren’t reaching the aha moment. I propose a product-led experiment that tests an in-app nudge at the right moment, with a simple A/B test to measure activation lift.';

const ROLE_TASKS: { role: string; title: string; body: string }[] = [
  {
    role: 'Product Designer',
    title: 'Redesign the onboarding experience',
    body: 'Improve first-time activation for our product. Propose a solution and explain your reasoning.',
  },
  {
    role: 'Product Manager',
    title: 'Decide what to build next',
    body: 'Retention dropped after a release and the CEO wants a new feature. Find the cause and make the call.',
  },
  {
    role: 'Data Analyst',
    title: 'Answer the VP before the board',
    body: 'A VP needs one number in an hour. Find the data problems that flip the answer, then decide what to send.',
  },
];

const PROBLEMS: { title: string; body: string }[] = [
  {
    title: 'Take-homes are written by AI now',
    body: 'A polished answer tells you the candidate has a chatbot, not that they can do the job.',
  },
  {
    title: 'Bot interviewers drive good people away',
    body: 'Webcams, proctoring and an AI asking questions are among the top reasons candidates withdraw.',
  },
  {
    title: 'Scores without evidence don’t help you decide',
    body: 'A number from a test library says nothing about how someone reasons through your kind of problem.',
  },
];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'sparkle',
    title: 'With and without AI',
    body: 'Most questions are theirs alone. One task allows any AI tool and asks for the conversation, so you see what AI added and what they changed.',
  },
  {
    icon: 'mic',
    title: 'Their thinking, out loud',
    body: 'Key questions record audio from the moment they open: sums, doubts, corrections. Live reasoning sounds nothing like reading an answer.',
  },
  {
    icon: 'check',
    title: 'Scored with evidence',
    body: 'AI scores every answer against a practitioner-written rubric and quotes the candidate’s own words. You see why, not just a number.',
  },
  {
    icon: 'shield',
    title: 'Hard to fake, easy to take',
    body: 'Every candidate gets their own numbers, and planted flaws only show up if you use the data. No camera, no lockdown browser, no account to create.',
  },
];

type Cell = boolean | string;
const COMPARISON: { label: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  { label: 'A realistic problem from the job', cells: [true, false, 'Sometimes', true] },
  { label: 'Shows how they reason, not just the answer', cells: [true, false, 'Partly', false] },
  { label: 'Measures how they use AI', cells: [true, false, false, false] },
  { label: 'No camera, bot or proctoring', cells: [true, 'Often not', false, true] },
  { label: 'Evidence behind every score', cells: [true, false, 'Partly', false] },
  { label: 'Fair to candidates’ time', cells: ['30–40 min', 'Varies', 'Varies', 'Often hours'] },
];

const FAQ: [string, string][] = [
  [
    'Can’t candidates just use ChatGPT?',
    'On the AI-allowed task they’re meant to, and you see the conversation. Elsewhere, each candidate has their own numbers, the critiques hide flaws that only the data reveals, and think-aloud audio makes pasted answers stand out. Weak signals become questions for an optional short call, never accusations.',
  ],
  [
    'Does the AI decide who gets hired?',
    'No. It transcribes, scores against the rubric with quoted evidence, and recommends. Your team can disagree with any score, and you make the decision. Candidates are told this up front.',
  ],
  [
    'Do candidates need an account?',
    'No. They open the private link and start. They can create an account afterwards to see all their assessments in one place.',
  ],
  [
    'Which roles are covered?',
    '27 practitioner-written roles across marketing, sales, support, product, design, data, finance, operations and people teams. For anything else, paste your job description and AI builds an assessment in the same format for you to check.',
  ],
  [
    'How long does it take?',
    'About 30–40 minutes for candidates, with breaks between questions. Reviews are ready a couple of minutes after they submit.',
  ],
];

/** A speech-like waveform: deterministic, so the page renders the same every time. */
function waveform(bars: number) {
  return Array.from({ length: bars }, (_, i) => {
    const envelope = 0.55 + 0.45 * Math.sin((i / (bars - 1)) * Math.PI);
    const texture = Math.abs(Math.sin(i * 1.93) * Math.cos(i * 0.71));
    return Math.round((0.18 + 0.82 * texture * envelope) * 100);
  });
}
const WAVE_SHORT = waveform(26);
const WAVE_LONG = waveform(44);

export function Landing() {
  const { user, candidate } = useAuth();
  const demo = useDemo();
  const signedIn = Boolean(user) && !demo;

  useLandingBody();

  return (
    <div className="lp">
      <header className="lp-wrap lp-nav">
        <Link to="/" className="lp-wordmark">
          Proofwork
        </Link>
        <nav className="lp-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <Link to="/roles">Roles</Link>
          <a href="#compare">Compare</a>
          <Link to="/roi">ROI</Link>
          <a href="#faq">FAQ</a>
        </nav>
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
      </header>

      <main>
        <section className="lp-wrap lp-hero">
          <div className="lp-hero-copy">
            <h1 className="lp-display">
              <span>Make hiring</span> <span>decisions you</span> <span>can explain.</span>
            </h1>
            <p className="lp-lead">
              <span>Real tasks. Reasoning in their own voice.</span> <span>Clear evidence for your next hire.</span>
            </p>
            <div className="lp-actions">
              {signedIn ? (
                <Link to="/app" className="lp-btn lp-btn-lg">
                  Open dashboard
                  <Icon name="arrow" size={22} />
                </Link>
              ) : (
                <StartFree size="lg" />
              )}
              <Link to="/demo/recruiter" className="lp-textlink">
                Try the live demo
              </Link>
            </div>
            <p className="lp-note">No webcam. No bot interviewer. Your team decides.</p>
          </div>
          <ExampleReport />
        </section>

        <section id="how" className="lp-wrap lp-section lp-steps-section" aria-labelledby="how-title">
          <h2 id="how-title" className="lp-h2">
            From task to decision, in three steps.
          </h2>
          <ol className="lp-steps">
            <li className="lp-step">
              <StepHead num="01" title="Set a real task">
                Give candidates a role-specific problem based on actual work.
              </StepHead>
              <TaskCard />
            </li>
            <li className="lp-step">
              <StepHead num="02" title="Capture the thinking">
                Hear how candidates work through the task, with and without AI.
              </StepHead>
              <NotesCard />
            </li>
            <li className="lp-step">
              <StepHead num="03" title="Review the evidence">
                See the work, reasoning and rubric together. Your team makes the call.
              </StepHead>
              <MiniReport />
            </li>
          </ol>
          <p className="lp-steps-foot">
            Curious what candidates go through?{' '}
            <Link to="/demo/candidate" className="lp-inline-link">
              Walk through the candidate side
            </Link>
          </p>
        </section>

        <section className="lp-wrap lp-section" aria-labelledby="problem-title">
          <div className="lp-section-head">
            <h2 id="problem-title" className="lp-h2">
              Hiring signals broke when everyone got an AI assistant.
            </h2>
          </div>
          <div className="lp-columns">
            {PROBLEMS.map((p, i) => (
              <div key={p.title} className="lp-column">
                <span className="lp-column-num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-wrap lp-section" aria-labelledby="product-title">
          <div className="lp-section-head">
            <h2 id="product-title" className="lp-h2">
              See how they think, in their own words and voice.
            </h2>
          </div>
          <div className="lp-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-feature">
                <span className="lp-feature-icon" aria-hidden="true">
                  <Icon name={f.icon} size={18} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="compare" className="lp-wrap lp-section" aria-labelledby="compare-title">
          <div className="lp-section-head">
            <h2 id="compare-title" className="lp-h2">
              What you get that other approaches don’t.
            </h2>
          </div>
          <div className="lp-table-scroll">
            <table className="lp-table">
              <thead>
                <tr>
                  <th>
                    <span className="lp-sr">What you need</span>
                  </th>
                  <th className="is-us">Proofwork</th>
                  <th>Test libraries</th>
                  <th>AI video interviews</th>
                  <th>Take-home tasks</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.cells.map((cell, i) => (
                      <td key={i} className={i === 0 ? 'is-us' : ''}>
                        <Mark value={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" className="lp-wrap lp-section lp-faq" aria-labelledby="faq-title">
          <div className="lp-section-head">
            <h2 id="faq-title" className="lp-h2">
              Questions hiring teams ask.
            </h2>
          </div>
          <div className="lp-faq-list">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span className="lp-faq-sign" aria-hidden="true" />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-cta" aria-labelledby="cta-title">
          <div className="lp-wrap lp-cta-inner">
            <div>
              <h2 id="cta-title">AI reviews. Your team decides.</h2>
              <p>Real tasks. Reasoning in their own voice. Clear evidence for your next hire.</p>
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
      </main>

      <SiteFooter />
    </div>
  );
}

function StepHead({ num, title, children }: { num: string; title: string; children: ReactNode }) {
  return (
    <div className="lp-step-head">
      <span className="lp-step-num" aria-hidden="true">
        {num}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}

function Mark({ value }: { value: Cell }) {
  if (value === true)
    return (
      <span className="lp-yes">
        <Icon name="check" size={18} />
        <span className="lp-sr">Yes</span>
      </span>
    );
  if (value === false)
    return (
      <span className="lp-no">
        <Icon name="x" size={16} />
        <span className="lp-sr">No</span>
      </span>
    );
  return <span className="lp-partial">{value}</span>;
}

// Pieces of the example report ---------------------------------------------------

function Avatar({ size }: { size: 'md' | 'sm' }) {
  return (
    <span className={`lp-avatar lp-avatar-${size}`} aria-hidden="true">
      AR
    </span>
  );
}

function MatchBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`lp-match ${compact ? 'is-compact' : ''}`}>
      <span className="lp-match-icon" aria-hidden="true">
        <Icon name="check" size={compact ? 11 : 14} />
      </span>
      <span>
        <span className="lp-match-label">Strong match</span>
        {!compact && <span className="lp-match-sub">Based on evidence</span>}
      </span>
    </span>
  );
}

function Waveform({ played, bars }: { played: number; bars: number[] }) {
  return (
    <span className="lp-wave" aria-hidden="true">
      {bars.map((h, i) => (
        <i key={i} className={i / bars.length < played ? 'is-played' : ''} style={{ height: `${h}%` }} />
      ))}
    </span>
  );
}

function Player({ time, played, size = 'md' }: { time: string; played: number; size?: 'md' | 'lg' }) {
  return (
    <div className={`lp-player lp-player-${size}`} aria-label={`Think-aloud recording, ${time}`} role="img">
      <span className="lp-play" aria-hidden="true">
        <Icon name="play" size={size === 'lg' ? 18 : 13} filled />
      </span>
      <Waveform played={played} bars={size === 'lg' ? WAVE_LONG : WAVE_SHORT} />
      <span className="lp-player-time">{time}</span>
    </div>
  );
}

function RubricBox({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`lp-rubric ${compact ? 'is-compact' : ''}`}>
      <div className="lp-rubric-head">
        <span>Role-specific rubric</span>
        <span className="lp-num">{OVERALL} / 4</span>
      </div>
      <ul>
        {RUBRIC.map(([label, score]) => (
          <li key={label}>
            <span className="lp-rubric-label">{label}</span>
            <span className="lp-bar" aria-hidden="true">
              <span style={{ width: `${(score / 4) * 100}%` }} />
            </span>
            <span className="lp-num lp-rubric-score">
              {score} / 4<span className="lp-sr"> for {label}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const REPORT_TABS = ['Overview', 'Task', 'Reasoning', 'Rubric'] as const;
type ReportTab = (typeof REPORT_TABS)[number];

/** The hero's example report. Its tabs work, so visitors can look around before trying the demo. */
function ExampleReport() {
  const [tab, setTab] = useState<ReportTab>('Reasoning');
  const select = (next: ReportTab) => setTab(next);
  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = REPORT_TABS.indexOf(tab);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = REPORT_TABS[(index + step + REPORT_TABS.length) % REPORT_TABS.length];
    select(next);
    document.getElementById(`lp-tab-${next}`)?.focus();
  };
  return (
    <figure className="lp-report" aria-label="Example candidate report">
      <div className="lp-report-top">
        <span className="lp-wordmark lp-wordmark-xs">Proofwork</span>
        <span>Example report</span>
      </div>
      <div className="lp-candidate">
        <Avatar size="md" />
        <div className="lp-candidate-text">
          <strong>Asha Rao</strong>
          <span>Growth Marketing Manager</span>
          <span className="lp-faint">Finished 2 days ago · 34 min</span>
        </div>
        <MatchBadge />
      </div>
      <div className="lp-tabs" role="tablist" aria-label="Report sections" onKeyDown={onKeyDown}>
        {REPORT_TABS.map((name) => (
          <button
            key={name}
            id={`lp-tab-${name}`}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls={`lp-panel-${name}`}
            tabIndex={tab === name ? 0 : -1}
            className={tab === name ? 'is-active' : ''}
            onClick={() => select(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="lp-task-row">
        <span className="lp-task-icon" aria-hidden="true">
          <Icon name="file" size={14} />
        </span>
        <strong>Plan a growth experiment</strong>
        <span className="lp-faint">30–40 min · Timed, think-aloud</span>
      </div>
      <div className="lp-panels">
        <Panel name="Overview" active={tab}>
          <div className="lp-box lp-pad">
            <p className="lp-box-label">AI summary</p>
            <p className="lp-verdict">
              Picks the metric that matters, sizes the test before launching and explains the trade-offs. Light on who
              owns what.
            </p>
            <ul className="lp-points">
              <li className="is-good">
                <Icon name="check" size={14} /> Ties the experiment to activation, not sign-ups
              </li>
              <li className="is-good">
                <Icon name="check" size={14} /> Sizes the test before it runs
              </li>
              <li className="is-warn">
                <Icon name="alert" size={14} /> Owner and timeline left vague
              </li>
            </ul>
          </div>
        </Panel>
        <Panel name="Task" active={tab}>
          <div className="lp-box lp-pad">
            <p className="lp-box-label">What she was asked</p>
            <p className="lp-verdict">
              New users sign up, but most never reach their first project. Plan one experiment to lift activation in 30
              days: the metric, the change, how you’ll measure it and when you’d stop.
            </p>
            <div className="lp-chips">
              <span>Think aloud</span>
              <span>Her own numbers</span>
              <span>AI allowed on one question</span>
            </div>
          </div>
        </Panel>
        <Panel name="Reasoning" active={tab}>
          <div className="lp-box lp-split">
            <div className="lp-pad">
              <p className="lp-box-label">Candidate reasoning</p>
              <blockquote className="lp-quote">{REASONING}</blockquote>
              <Player time="1:24 / 3:12" played={0.44} />
            </div>
            <div className="lp-pad">
              <p className="lp-box-label">Quoted evidence</p>
              <blockquote className="lp-quote lp-quote-fill">{EVIDENCE}</blockquote>
              <p className="lp-supports">Supports Strategic thinking · 4 / 4</p>
            </div>
          </div>
        </Panel>
        <Panel name="Rubric" active={tab}>
          <div className="lp-box lp-pad">
            <p className="lp-box-label">Why each score</p>
            <ul className="lp-reasons">
              <li>
                <span>Strategic thinking</span> Chose activation over sign-ups, and said why.
              </li>
              <li>
                <span>Execution plan</span> Clear steps, but no owner or launch date.
              </li>
              <li>
                <span>Analytical rigor</span> Sized the sample before launch: two weeks at current traffic.
              </li>
              <li>
                <span>Communication</span> Clear, though the recommendation comes last.
              </li>
            </ul>
          </div>
        </Panel>
      </div>
      <RubricBox />
    </figure>
  );
}

function Panel({ name, active, children }: { name: ReportTab; active: ReportTab; children: ReactNode }) {
  const shown = name === active;
  return (
    <div
      id={`lp-panel-${name}`}
      role="tabpanel"
      aria-labelledby={`lp-tab-${name}`}
      className={`lp-panel ${shown ? 'is-shown' : ''}`}
    >
      {children}
    </div>
  );
}

/** Step 1: a task card for a few of the roles in the library. */
function TaskCard() {
  const [index, setIndex] = useState(0);
  const task = ROLE_TASKS[index];
  return (
    <div className="lp-card lp-taskcard">
      <div className="lp-folder-tabs" role="tablist" aria-label="Example roles">
        {ROLE_TASKS.map((t, i) => (
          <button
            key={t.role}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={i === index ? 'is-active' : ''}
            onClick={() => setIndex(i)}
          >
            {t.role}
          </button>
        ))}
      </div>
      <div className="lp-taskframe">
        <div className="lp-inner" role="tabpanel" aria-label={task.role}>
          <h4>{task.title}</h4>
          <p>{task.body}</p>
          <ul className="lp-meta">
            <li>
              <Icon name="clock" size={19} /> 30–40 minutes
            </li>
            <li>
              <Icon name="list" size={19} /> Share your process
            </li>
            <li>
              <Icon name="file" size={19} /> AI allowed on one question
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Step 2: the candidate's notes beside their think-aloud recording. */
function NotesCard() {
  const items: [string, boolean][] = [
    ['Define goal and metric', true],
    ['Explore options', true],
    ['Evaluate trade-offs', false],
    ['Design experiment', false],
    ['Write recommendation', false],
  ];
  return (
    <div className="lp-card lp-notes" aria-label="A candidate's notes and think-aloud recording" role="img">
      <p className="lp-notes-title">My notes</p>
      <div className="lp-notes-body">
        <ul className="lp-checks">
          {items.map(([label, done]) => (
            <li key={label} className={done ? 'is-done' : ''}>
              <span className="lp-checkbox">{done && <Icon name="check" size={11} />}</span>
              {label}
            </li>
          ))}
        </ul>
        <div className="lp-scratch">
          <span className="lp-line" style={{ width: '92%' }} />
          <span className="lp-line" style={{ width: '78%' }} />
          <span className="lp-line" style={{ width: '64%' }} />
          <div className="lp-scratch-box">
            <span className="lp-line" style={{ width: '86%' }} />
            <span className="lp-line" style={{ width: '70%' }} />
            <span className="lp-line-row">
              <span className="lp-line" style={{ width: '46%' }} />
              <span className="lp-caret" />
            </span>
          </div>
        </div>
      </div>
      <Player time="1:24 / 3:12" played={0.44} size="lg" />
    </div>
  );
}

/** Step 3: the same report, small. */
function MiniReport() {
  return (
    <div className="lp-card lp-mini" aria-label="The example report, condensed" role="img">
      <div className="lp-candidate is-compact">
        <Avatar size="sm" />
        <div className="lp-candidate-text">
          <strong>Asha Rao</strong>
          <span>Growth Marketing Manager</span>
        </div>
        <MatchBadge compact />
      </div>
      <div className="lp-tabs is-compact" aria-hidden="true">
        {REPORT_TABS.map((name) => (
          <span key={name} className={name === 'Reasoning' ? 'is-active' : ''}>
            {name}
          </span>
        ))}
      </div>
      <blockquote className="lp-quote lp-quote-boxed">{EVIDENCE}</blockquote>
      <RubricBox compact />
    </div>
  );
}
