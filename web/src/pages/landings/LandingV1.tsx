import { Link } from 'react-router-dom';
import { TRIAL_REVIEWS } from '../../../../shared/plans';
import { Icon } from '../../components/Icon';
import { SiteFooter, StartFree, useLandingBody } from '../../components/Site';
import { ROLES } from '../../marketing/content';
import { FAQ, PreviewBar, PvNav, SAMPLE, Wave, waveform } from './shared';

const WAVE = waveform(48);

/** Version 1, "Evidence": the claim is the product. The hero shows a quote tied to its score. */
export function LandingV1() {
  useLandingBody();
  return (
    <div className="lp v1">
      <PvNav />
      <main>
        <section className="lp-wrap v1-hero">
          <div className="v1-hero-copy">
            <span className="v1-kicker">Hiring assessments for the AI era</span>
            <h1>
              See how they think. <em>Not what ChatGPT wrote.</em>
            </h1>
            <p className="v1-lead">
              Candidates work through a real situation from the job and think out loud. AI scores every answer against a
              rubric and quotes their own words, so your team decides on evidence.
            </p>
            <div className="v1-actions">
              <StartFree size="lg" />
              <Link to="/demo/recruiter" className="lp-textlink">
                Watch a 4-minute demo
              </Link>
            </div>
            <ul className="v1-proof">
              <li>{TRIAL_REVIEWS} reviewed candidates free</li>
              <li>No card, no sales call</li>
              <li>No camera for candidates</li>
            </ul>
          </div>

          <figure className="v1-card" aria-label="An example of a scored answer">
            <header className="v1-card-head">
              <span className="v1-avatar">AR</span>
              <div>
                <strong>{SAMPLE.name}</strong>
                <span>
                  {SAMPLE.role} · {SAMPLE.question}
                </span>
              </div>
              <span className="v1-score">
                {SAMPLE.overall}
                <small>/4</small>
              </span>
            </header>
            <div className="v1-audio">
              <span className="v1-play" aria-hidden="true">
                <Icon name="play" size={14} />
              </span>
              <Wave bars={WAVE} played={0.42} />
              <span className="v1-time">2:41</span>
            </div>
            <blockquote className="v1-quote">
              “Meta says 1,900 orders but Shopify only has 1,240, so <mark>it’s claiming more than exists</mark>. The
              real cost per order is closer to ₹610. <mark className="is-b">Wait, ₹610 is above our ₹540 margin.</mark>”
            </blockquote>
            <ul className="v1-rubric">
              {SAMPLE.rubric.map((r, i) => (
                <li key={r.label} className={i < 2 ? `is-${i === 0 ? 'a' : 'b'}` : ''}>
                  <span>{r.label}</span>
                  <span className="v1-dots" aria-label={`${r.score} of 4`}>
                    {[1, 2, 3, 4].map((d) => (
                      <i key={d} className={d <= r.score ? 'on' : ''} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <figcaption>Every score links to the words behind it.</figcaption>
          </figure>
        </section>

        <section className="lp-wrap v1-signals" aria-labelledby="v1-signals">
          <h2 id="v1-signals" className="v1-h2">
            Three signals a CV, a quiz or a take-home can’t give you.
          </h2>
          <div className="v1-cols">
            <article>
              <span className="v1-num">01</span>
              <h3>Reasoning, in their voice</h3>
              <p>
                Key questions record them thinking out loud: the sums, the doubts, the “wait, that’s wrong”. Live
                reasoning sounds nothing like a pasted answer.
              </p>
            </article>
            <article>
              <span className="v1-num">02</span>
              <h3>Judgement with real numbers</h3>
              <p>
                Each candidate gets their own figures, a decision that changes what happens next, and a plan with flaws
                only the data reveals.
              </p>
            </article>
            <article>
              <span className="v1-num">03</span>
              <h3>How they work with AI</h3>
              <p>
                One task allows any AI tool and asks for the conversation. You see what AI added, what they changed and
                what they caught.
              </p>
            </article>
          </div>
        </section>

        <section className="lp-wrap v1-flow" aria-labelledby="v1-flow">
          <h2 id="v1-flow" className="v1-h2">
            From job post to shortlist in a day.
          </h2>
          <ol className="v1-steps">
            <li>
              <strong>Pick a role</strong>
              <span>27 ready-made, or paste a job description.</span>
            </li>
            <li>
              <strong>Send one link</strong>
              <span>Invite people or post a public apply link.</span>
            </li>
            <li>
              <strong>They take 35 minutes</strong>
              <span>In the browser. No account, no camera.</span>
            </li>
            <li>
              <strong>Read the evidence</strong>
              <span>Scores, quotes, and questions for a short call.</span>
            </li>
          </ol>
        </section>

        <section className="lp-wrap v1-roles" aria-labelledby="v1-roles">
          <div className="v1-roles-head">
            <h2 id="v1-roles" className="v1-h2">
              Written by people who’ve done the job.
            </h2>
            <Link to="/roles" className="lp-textlink">
              All {ROLES.length} roles
            </Link>
          </div>
          <div className="v1-chips">
            {ROLES.map((r) => (
              <Link key={r.id} to={`/roles/${r.id}`}>
                {r.name}
              </Link>
            ))}
          </div>
        </section>

        <section className="lp-wrap v1-faq" aria-labelledby="v1-faq">
          <h2 id="v1-faq" className="v1-h2">
            Questions
          </h2>
          <div>
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Icon name="plus" size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="v1-cta">
          <div className="lp-wrap">
            <h2>Your next hire, on evidence.</h2>
            <div className="v1-actions">
              <StartFree size="lg" invert />
              <Link to="/demo/recruiter" className="lp-textlink lp-textlink-invert">
                Try the live demo
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <PreviewBar current={1} />
    </div>
  );
}
