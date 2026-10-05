import { Link } from 'react-router-dom';
import { TRIAL_REVIEWS } from '../../../../shared/plans';
import { Icon, type IconName } from '../../components/Icon';
import { SiteFooter, StartFree, useLandingBody } from '../../components/Site';
import { PreviewBar, PvNav, SAMPLE } from './shared';

const PROMISES: { icon: IconName; text: string }[] = [
  { icon: 'clock', text: 'About 35 minutes, with breaks between questions' },
  { icon: 'shield', text: 'No camera, no screen recording, no AI interviewer' },
  { icon: 'mic', text: 'Accent, fluency and nerves are never scored' },
  { icon: 'lock', text: 'Withdraw and delete their answers at any time' },
];

/** Version 5, "Fair to both sides": warmer and more human, for teams who care how hiring feels. */
export function LandingV5() {
  useLandingBody();
  return (
    <div className="lp v5">
      <PvNav />
      <main>
        <section className="lp-wrap v5-hero">
          <h1>
            Hiring that’s fair
            <br />
            to <em>both sides</em> of the table.
          </h1>
          <p className="v5-lead">
            Give every candidate the same real problem from the job and the same rubric. Hear how they think. Then let
            people, not a score, make the call.
          </p>
          <div className="v5-actions">
            <StartFree size="lg" />
            <Link to="/demo/candidate" className="lp-textlink">
              Try it as a candidate
            </Link>
          </div>
        </section>

        <section className="lp-wrap v5-sides" aria-label="What each side gets">
          <article className="v5-side">
            <span className="v5-label">For your team</span>
            <h2>Evidence you can explain.</h2>
            <div className="v5-review">
              <div className="v5-review-head">
                <strong>{SAMPLE.name}</strong>
                <span>{SAMPLE.overall} / 4</span>
              </div>
              {SAMPLE.rubric.map((r) => (
                <p key={r.label}>
                  <b>{r.label}</b>
                  <q>{r.quote}</q>
                </p>
              ))}
            </div>
            <ul>
              <li>Every score quotes the candidate’s own words.</li>
              <li>Disagree with the AI? Change any score, with a reason.</li>
              <li>A short call script built from their answers.</li>
            </ul>
          </article>
          <article className="v5-side is-candidate">
            <span className="v5-label">For your candidates</span>
            <h2>A test that feels like the job.</h2>
            <ul className="v5-promises">
              {PROMISES.map((p) => (
                <li key={p.text}>
                  <span>
                    <Icon name={p.icon} size={18} />
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>
            <blockquote>
              “Every candidate gets their own numbers and a realistic situation, and one task where any AI tool is
              allowed, because that’s how the job works now.”
            </blockquote>
          </article>
        </section>

        <section className="lp-wrap v5-how" aria-labelledby="v5-how">
          <h2 id="v5-how">How a decision gets made</h2>
          <div className="v5-flow">
            <div>
              <span className="v5-step">1</span>
              <h3>The candidate works it through</h3>
              <p>Read the situation, make a call, react when it changes, critique a plan, use AI once.</p>
            </div>
            <Icon name="arrow" size={22} />
            <div>
              <span className="v5-step">2</span>
              <h3>AI reads every answer</h3>
              <p>It transcribes, scores against a practitioner’s rubric and quotes the evidence.</p>
            </div>
            <Icon name="arrow" size={22} />
            <div className="is-people">
              <span className="v5-step">3</span>
              <h3>Your team decides</h3>
              <p>You read the reasoning, talk to the best few, and make every decision yourselves.</p>
            </div>
          </div>
        </section>

        <section className="lp-wrap v5-trust" aria-labelledby="v5-trust">
          <div>
            <h2 id="v5-trust">Careful with people’s data.</h2>
            <p>
              Candidates agree to a plain-language notice before they start. Recordings are deleted after 180 days, or
              sooner if you choose. Two-factor sign-in, an activity log and a data processing agreement for your team.
            </p>
          </div>
          <Link to="/trust" className="v5-trust-link">
            How we protect it <Icon name="arrow" size={16} />
          </Link>
        </section>

        <section className="lp-wrap v5-cta">
          <h2>Make your next hire one you can explain.</h2>
          <p>{TRIAL_REVIEWS} reviewed candidates free. No card needed.</p>
          <div className="v5-actions">
            <StartFree size="lg" />
            <Link to="/demo/recruiter" className="lp-textlink">
              See the recruiter side
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <PreviewBar current={5} />
    </div>
  );
}
