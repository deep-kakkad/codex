import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/Logo';
import { useLeaveDemo } from '../demo/DemoBanner';
import { useDemo } from '../demo/mode';

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

const STEPS = [
  [
    'Pick a role',
    'Start from a practitioner-written scenario, or have AI write one for any role. Choose the activities.',
  ],
  [
    'Send the link',
    'Candidates open it and start. One question at a time, each with its own timer, about 30–40 minutes.',
  ],
  ['Read the verdict', 'Score, recommendation, strengths and concerns first, then every answer with quoted evidence.'],
  ['Compare and decide', 'Put your finalists side by side, question by question. Advance, hold or reject.'],
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

const FAQ = [
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
    'Practitioner-written scenarios for Performance Marketing, Content & Brand, SEO, Social Media and Customer Support leadership. For anything else, describe the role and AI writes a scenario in the same format for you to check.',
  ],
  [
    'How long does it take?',
    'About 30–40 minutes for candidates, with breaks between questions. Reviews are ready a couple of minutes after they submit.',
  ],
];

function Mark({ value }: { value: Cell }) {
  if (value === true) return <Icon name="check" className="yes" />;
  if (value === false) return <Icon name="x" className="no" />;
  return <span className="partial">{value}</span>;
}

/** Start free, or open the dashboard when signed in. In the demo, starting free leaves the demo first. */
function PrimaryAction({
  primary,
  demo,
  arrow,
}: {
  primary: { to: string; label: string };
  demo: boolean;
  arrow?: boolean;
}) {
  const leaveDemo = useLeaveDemo();
  const content = (
    <>
      {primary.label}
      {arrow && <Icon name="arrow" />}
    </>
  );
  if (demo) {
    return (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => void leaveDemo('/signup')}>
        {content}
      </button>
    );
  }
  return (
    <Link to={primary.to} className="btn btn-primary btn-lg">
      {content}
    </Link>
  );
}

export function Landing() {
  const { user, candidate } = useAuth();
  const demo = useDemo();
  const primary = user && !demo ? { to: '/app', label: 'Open dashboard' } : { to: '/signup', label: 'Start free' };
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand">
          <Logo /> Proofwork
        </Link>
        <nav className="landing-links">
          <a href="#how">How it works</a>
          <a href="#compare">Compare</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="row-gap">
          {user || candidate ? (
            <Link to={user ? '/app' : '/candidate'} className="btn btn-primary btn-sm">
              {user ? 'Open dashboard' : 'My assessments'}
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">
                Log in
              </Link>
              <Link to="/signup" className="btn btn-primary btn-sm">
                Start free
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="pill">
            <span className="pill-dot" /> Practical assessments for the AI era
          </span>
          <h1>
            Hire for <span className="marker">the task</span>, not the prompt.
          </h1>
          <p className="lead">
            A practical check that shows how a candidate thinks with and without AI, reviewed by AI, with their
            reasoning in their own voice. No bot interviewer, no webcam.
          </p>
          <div className="hero-actions">
            <PrimaryAction primary={primary} demo={demo} arrow />
            <Link to="/demo/recruiter" className="btn btn-secondary btn-lg">
              Try as a recruiter
            </Link>
            <Link to="/demo/candidate" className="btn btn-ghost btn-lg">
              Try as a candidate
            </Link>
          </div>
          <p className="tiny subtle">The demo runs in your browser with sample data. No sign-up, nothing is sent.</p>
        </div>
        <HeroReport />
      </section>

      <section className="band">
        <p className="band-label">The problem</p>
        <h2 className="band-title">Hiring signals broke when everyone got an AI assistant.</h2>
        <div className="problem-grid">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="problem">
              <h3>{p.title}</h3>
              <p className="muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="band">
        <p className="band-label">The product</p>
        <h2 className="band-title">See how they think, in their own words and voice.</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature">
              <span className="feature-icon">
                <Icon name={f.icon} size={18} />
              </span>
              <h3>{f.title}</h3>
              <p className="muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="band">
        <p className="band-label">How it works</p>
        <h2 className="band-title">From role to decision in an afternoon.</h2>
        <ol className="steps">
          {STEPS.map(([title, body]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="compare" className="band">
        <p className="band-label">Compare</p>
        <h2 className="band-title">What you get that other approaches don’t.</h2>
        <div className="table-scroll compare-landing">
          <table>
            <thead>
              <tr>
                <th />
                <th className="us">Proofwork</th>
                <th>Test libraries</th>
                <th>AI video interviews</th>
                <th>Take-home tasks</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label}>
                  <th>{row.label}</th>
                  {row.cells.map((cell, i) => (
                    <td key={i} className={i === 0 ? 'us' : ''}>
                      <Mark value={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="faq" className="band faq">
        <p className="band-label">FAQ</p>
        <h2 className="band-title">Questions hiring teams ask.</h2>
        <div className="faq-list">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p className="muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <h2>See what your next hire actually knows.</h2>
        <p className="muted">Set up an assessment in five minutes and send your first link today.</p>
        <div className="hero-actions center-actions">
          <PrimaryAction primary={primary} demo={demo} />
          <Link to="/demo/recruiter" className="btn btn-secondary btn-lg">
            Try the demo
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <span className="brand small">
          <Logo size={16} /> Proofwork
        </span>
        <span className="tiny subtle">Practical skills, verified by people. AI reviews; your team decides.</span>
      </footer>
    </div>
  );
}

/** A static picture of the recruiter's verdict, built from the real component styles. */
function HeroReport() {
  const chips: [string, string, string?][] = [
    ['Q2 First read', '3.5'],
    ['Q3 Budget cut', '3.0'],
    ['Q4 Two weeks later', '3.5'],
    ['Q5 Critique', '2.5', 'probe live'],
    ['Q6 AI-allowed', '3.0'],
    ['Q7 Real decision', '3.5'],
  ];
  return (
    <div className="hero-visual" aria-label="Example candidate report">
      <div className="mock-window">
        <div className="mock-bar">
          <span />
          <span />
          <span />
          <span className="mock-title">Asha Rao · Growth Marketing Manager</span>
        </div>
        <div className="mock-body">
          <div className="mock-verdict">
            <div>
              <div className="tiny muted">Overall</div>
              <div className="mock-score">
                <span className="score score-good">
                  3.3<span className="score-max">/4</span>
                </span>
              </div>
              <span className="badge badge-decision-advance">Advance</span>
            </div>
            <div className="mock-text">
              <p>
                Spotted that the dashboards over-count orders and rebuilt the budget from break-even. Changed course
                when the situation changed.
              </p>
              <ul className="icon-list good small">
                <li>
                  <Icon name="check" size={13} /> Works from the real numbers
                </li>
                <li>
                  <Icon name="check" size={13} /> Gave the AI the context, then fixed its sums
                </li>
              </ul>
              <ul className="icon-list warn small">
                <li>
                  <Icon name="x" size={13} /> Ranked a minor flaw first in the critique
                </li>
              </ul>
            </div>
          </div>
          <div className="mock-audio">
            <Icon name="mic" size={14} />
            <span className="tiny">Think-aloud · 4:12 · sounds like live reasoning</span>
            <span className="wave" aria-hidden="true">
              {Array.from({ length: 36 }, (_, i) => (
                <i key={i} style={{ height: `${20 + Math.abs(Math.sin(i * 1.7)) * 80}%` }} />
              ))}
            </span>
          </div>
          <div className="scorecard mock-scorecard">
            {chips.map(([title, score, flag]) => (
              <div key={title} className="score-chip">
                <span className="score-chip-q">{title.split(' ')[0]}</span>
                <span className="score-chip-value">
                  <span className={`score ${Number(score) >= 3 ? 'score-good' : 'score-mid'}`}>{score}</span>
                </span>
                <span className="score-chip-title">{title.split(' ').slice(1).join(' ')}</span>
                {flag && <span className="score-chip-flag">{flag}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
