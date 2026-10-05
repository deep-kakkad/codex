import { Link } from 'react-router-dom';
import { TRIAL_REVIEWS } from '../../../../shared/plans';
import { Icon, type IconName } from '../../components/Icon';
import { SiteFooter, StartFree, useLandingBody } from '../../components/Site';
import { FAQ, PreviewBar, PvNav, SAMPLE } from './shared';

const DEFENCES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'bars',
    title: 'Their own numbers',
    body: 'Every candidate gets a different version of the figures, so a shared answer doesn’t fit anyone else’s data.',
  },
  {
    icon: 'search',
    title: 'Flaws only the data shows',
    body: 'Critiques hide mistakes you only catch by doing the maths. A chatbot that doesn’t read the table misses them.',
  },
  {
    icon: 'mic',
    title: 'Thinking out loud',
    body: 'Key questions record audio from the moment they open. Reading an answer aloud sounds nothing like working it out.',
  },
  {
    icon: 'sparkle',
    title: 'AI, in the open',
    body: 'One task allows any AI tool and asks for the conversation. You see whether they steer it or just paste it.',
  },
];

const ROWS: [string, string, string][] = [
  ['What you read', 'A polished document', 'Their reasoning, with timestamps'],
  ['Who did the work', 'Hard to tell', 'Audio, own numbers, AI conversation'],
  ['Candidate time', 'Often a weekend', 'About 35 minutes'],
  ['Your team’s time', 'Read every submission', 'Read the shortlist'],
  ['Why the score', 'Gut feel', 'A quote behind every criterion'],
];

/** Version 2, "Before / after": the problem in one picture, then how Proofwork answers it. */
export function LandingV2() {
  useLandingBody();
  return (
    <div className="lp v2">
      <div className="v2-dark">
        <PvNav className="v2-nav" />
        <section className="lp-wrap v2-hero">
          <h1>
            A polished answer only proves
            <br /> they have ChatGPT.
          </h1>
          <p className="v2-lead">
            Proofwork shows you what a take-home can’t: how someone actually reasons through a real problem from the
            job, in their own voice.
          </p>
          <div className="v2-actions">
            <StartFree size="lg" invert />
            <Link to="/demo/recruiter" className="lp-textlink lp-textlink-invert">
              See a real review
            </Link>
          </div>

          <div className="v2-split" aria-label="A take-home answer next to a Proofwork review">
            <article className="v2-before">
              <header>
                <span className="v2-tag">Take-home task</span>
                <span className="v2-meta">Submitted after 3 days</span>
              </header>
              <h3>Q3 Paid Media Strategy</h3>
              <p>
                To optimise performance, we should adopt a holistic, data-driven approach that leverages full-funnel
                attribution, reallocates budget towards high-ROAS channels and continuously tests creative to drive
                sustainable, scalable growth…
              </p>
              <p className="v2-fade">
                Key pillars: 1. Audience segmentation 2. Creative iteration 3. Measurement framework 4. Stakeholder
                alignment…
              </p>
              <span className="v2-stamp">Could have been written in 40 seconds</span>
            </article>
            <article className="v2-after">
              <header>
                <span className="v2-tag is-on">Proofwork</span>
                <span className="v2-meta">Think-aloud · {SAMPLE.question}</span>
              </header>
              <ul className="v2-lines">
                {SAMPLE.transcript.map((line) => (
                  <li key={line.t}>
                    <time>{line.t}</time>
                    <span>{line.text}</span>
                  </li>
                ))}
              </ul>
              <div className="v2-scores">
                {SAMPLE.rubric.map((r) => (
                  <span key={r.label}>
                    <b>{r.score}/4</b> {r.label}
                  </span>
                ))}
              </div>
            </article>
          </div>
        </section>
      </div>

      <main>
        <section className="lp-wrap v2-section" aria-labelledby="v2-def">
          <h2 id="v2-def" className="v2-h2">
            Built so the work has to be theirs.
          </h2>
          <div className="v2-grid">
            {DEFENCES.map((d) => (
              <article key={d.title}>
                <span className="v2-icon">
                  <Icon name={d.icon} size={20} />
                </span>
                <h3>{d.title}</h3>
                <p>{d.body}</p>
              </article>
            ))}
          </div>
          <p className="v2-note">Weak signals become questions for an optional short call, never accusations.</p>
        </section>

        <section className="lp-wrap v2-section" aria-labelledby="v2-table">
          <h2 id="v2-table" className="v2-h2">
            Take-home vs Proofwork
          </h2>
          <div className="v2-table">
            <div className="v2-row v2-row-head">
              <span />
              <span>Take-home</span>
              <span>Proofwork</span>
            </div>
            {ROWS.map(([label, them, us]) => (
              <div key={label} className="v2-row">
                <span>{label}</span>
                <span className="v2-them">
                  <Icon name="x" size={14} /> {them}
                </span>
                <span className="v2-us">
                  <Icon name="check" size={14} /> {us}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-wrap v2-section v2-faq" aria-labelledby="v2-faq">
          <h2 id="v2-faq" className="v2-h2">
            Fair questions
          </h2>
          <dl>
            {FAQ.map(([q, a]) => (
              <div key={q}>
                <dt>{q}</dt>
                <dd>{a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="v2-cta">
          <div className="lp-wrap">
            <h2>Stop grading chatbots.</h2>
            <p>{TRIAL_REVIEWS} reviewed candidates free. Set up your first role in five minutes.</p>
            <StartFree size="lg" invert />
          </div>
        </section>
      </main>
      <SiteFooter />
      <PreviewBar current={2} />
    </div>
  );
}
