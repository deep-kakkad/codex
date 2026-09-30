import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Logo } from '../components/Logo';

const PRINCIPLES = [
  {
    title: 'Design beats detection',
    body: 'Specific scenarios, tight time boxes and questions that appear one at a time make outside help slow and clumsy, without watching anyone through a webcam.',
  },
  {
    title: 'Unique to every candidate',
    body: 'Company names, budgets and numbers change per candidate, so leaked answers and shared question banks stop working.',
  },
  {
    title: 'AI allowed where it is honest',
    body: 'One task invites any AI tool and asks for the transcript. You grade judgment: what they asked, what they kept and what they threw away.',
  },
  {
    title: 'People review, a call confirms',
    body: "Practitioner-written rubrics for human reviewers, then a 10–15 minute call scripted from the candidate's own answers. That call is the real security layer.",
  },
];

const SKIPPED = [
  ['Webcam proctoring', '"AI monitoring during the process" is one of the top reasons candidates walk away.'],
  ['Lockdown browsers', 'A second device beats them, and installs cost you candidates.'],
  ['AI-text detectors', 'Light rewording defeats them, and false positives accuse honest people.'],
  ['AI video interviewers', "Pre-recorded, AI-scored video is candidates' top reason for withdrawing."],
];

export function Landing() {
  const { user } = useAuth();
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand">
          <Logo /> Proofwork
        </Link>
        <nav>
          {user ? (
            <Link to="/app" className="btn btn-primary btn-sm">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">
                Log in
              </Link>
              <Link to="/signup" className="btn btn-primary btn-sm">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">Practical hiring assessments for non-tech roles</p>
        <h1>Hire for the job, not the prompt.</h1>
        <p className="lead">
          Proofwork gives hiring managers realistic, practitioner-built scenarios that AI can't answer on a candidate's
          behalf, reviewed by people and confirmed on a short call. No proctoring, no AI interviewer.
        </p>
        <div className="hero-actions">
          <Link to={user ? '/app' : '/signup'} className="btn btn-primary btn-lg">
            {user ? 'Open dashboard' : 'Create a free workspace'}
          </Link>
          <a href="#how" className="btn btn-secondary btn-lg">
            How it works
          </a>
        </div>
      </section>

      <section className="principles">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="card principle">
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </div>
        ))}
      </section>

      <section id="how" className="how">
        <h2>How it works</h2>
        <ol className="steps">
          <li>
            <strong>Pick a role family.</strong> Start with performance marketing or customer support leadership,
            written by people who have done the job.
          </li>
          <li>
            <strong>Invite candidates.</strong> Each gets a unique version of the scenario: 35–40 minutes, one question
            at a time, voice notes or text.
          </li>
          <li>
            <strong>Review with rubrics.</strong> Behavioural anchors and an answer key for each question. Reviews stay
            blind until you submit your own.
          </li>
          <li>
            <strong>Verify live.</strong> A 10–15 minute call script built from the candidate's own answers, with ID
            check and targeted follow-ups.
          </li>
        </ol>
      </section>

      <section className="skipped">
        <h2>What we deliberately don't do</h2>
        <div className="skipped-grid">
          {SKIPPED.map(([title, reason]) => (
            <div key={title} className="skipped-item">
              <h4>{title}</h4>
              <p className="muted">{reason}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer muted small">
        <Logo size={14} /> Proofwork: practical skills, verified by people.
      </footer>
    </div>
  );
}
