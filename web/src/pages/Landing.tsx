import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Logo } from '../components/Logo';

const PRINCIPLES = [
  {
    title: 'With and without AI',
    body: 'Candidates work a realistic scenario on their own, then on one task with any AI tool they like. You see how they think in both, and what AI actually added.',
  },
  {
    title: 'Their thinking, out loud',
    body: "Key questions record audio from the moment they open: sums, doubts and corrections. Live reasoning sounds nothing like reading an AI's answer.",
  },
  {
    title: 'Reviewed by AI',
    body: "Every answer is transcribed and scored against a practitioner-written rubric, with the candidate's own words quoted as evidence. You decide.",
  },
  {
    title: 'No bot interviewer',
    body: 'No camera, no proctoring, no AI asking questions. When you want more, a 10–15 minute call script is built from their own answers.',
  },
];

const SKIPPED = [
  ['Webcam proctoring', '"AI monitoring during the process" is one of the top reasons candidates walk away.'],
  ['Lockdown browsers', 'A second device beats them, and installs cost you candidates.'],
  ['AI-text detectors', 'Light rewording defeats them, and false positives accuse honest people.'],
  ['Bot interviewers', "Pre-recorded video with an AI asking questions is candidates' top reason for withdrawing."],
];

export function Landing() {
  const { user, candidate } = useAuth();
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
          ) : candidate ? (
            <Link to="/candidate" className="btn btn-primary btn-sm">
              My assessments
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
        <p className="eyebrow">Practical hiring assessments</p>
        <h1>Hire for the job, not the prompt.</h1>
        <p className="lead">
          A practical check that shows how a candidate thinks with and without AI, reviewed by AI, plus audio answers
          that show the thinking is really theirs. There's no bot interviewer.
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
            <strong>Pick the role and the activities.</strong> Choose the role you're hiring for, then the scenario
            activities you want: decisions, critiques, think-aloud questions, an AI-allowed task.
          </li>
          <li>
            <strong>Invite candidates.</strong> They sign in with their own account and get a unique version of the
            scenario, one question at a time.
          </li>
          <li>
            <strong>AI reviews every answer.</strong> Audio is transcribed, each answer is scored against the rubric
            with quoted evidence, and you get a summary and a recommendation.
          </li>
          <li>
            <strong>You decide.</strong> Advance, hold or reject. If you want to go further, use the call script built
            from their own answers.
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
