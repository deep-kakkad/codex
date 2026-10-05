import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PLAN_OFFERS, TRIAL_REVIEWS } from '../../../../shared/plans';
import { Icon, type IconName } from '../../components/Icon';
import { SiteFooter, StartFree, useLandingBody } from '../../components/Site';
import { ROLES } from '../../marketing/content';
import { PreviewBar, PvNav, SAMPLE, Wave, waveform } from './shared';

const WAVE = waveform(40, 1.3);

const STEPS = [
  { id: 'take', label: 'They take it', icon: 'mic' as IconName },
  { id: 'review', label: 'AI reviews it', icon: 'sparkle' as IconName },
  { id: 'decide', label: 'You decide', icon: 'check' as IconName },
] as const;
type Step = (typeof STEPS)[number]['id'];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'library', title: '27 ready roles', body: 'Practitioner-written scenarios, or paste a job description.' },
  { icon: 'mic', title: 'Think-aloud audio', body: 'Hear the reasoning, sums and corrections as they happen.' },
  { icon: 'sparkle', title: 'AI-allowed task', body: 'See the conversation, and what they kept or fixed.' },
  { icon: 'quote', title: 'Quoted evidence', body: 'Every score shows the words behind it.' },
  { icon: 'compare', title: 'Side-by-side', body: 'Compare finalists question by question.' },
  { icon: 'shield', title: 'Integrity hints', body: 'Paste and tab signals turn into questions for a call.' },
];

/** Version 3, "Product tour": the hero is the product, stepping through what happens. */
export function LandingV3() {
  useLandingBody();
  const [step, setStep] = useState<Step>('take');
  const [paused, setPaused] = useState(false);

  // Moves through the three steps until someone clicks one.
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setStep((s) => STEPS[(STEPS.findIndex((x) => x.id === s) + 1) % STEPS.length].id);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <div className="lp v3">
      <PvNav />
      <main>
        <section className="lp-wrap v3-hero">
          <span className="v3-pill">
            <Icon name="sparkle" size={14} /> AI reviews. Your team decides.
          </span>
          <h1>Hire on evidence, not polish.</h1>
          <p className="v3-lead">
            A 35-minute practical assessment built around a real situation from the job. You get their reasoning, scored
            and quoted, before you book a single interview.
          </p>
          <div className="v3-actions">
            <StartFree size="lg" />
            <Link to="/demo/recruiter" className="v3-ghost">
              <Icon name="play" size={16} /> Take the tour
            </Link>
          </div>

          <div className="v3-window">
            <div className="v3-tabs" role="tablist">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={step === s.id}
                  className={step === s.id ? 'is-on' : ''}
                  onClick={() => {
                    setStep(s.id);
                    setPaused(true);
                  }}
                >
                  <span className="v3-tab-num">{i + 1}</span>
                  <Icon name={s.icon} size={16} /> {s.label}
                  {step === s.id && !paused && <span className="v3-tab-timer" />}
                </button>
              ))}
            </div>
            <div className="v3-screen">
              {step === 'take' && (
                <div className="v3-take">
                  <div className="v3-brief">
                    <span className="v3-eyebrow">Question 3 of 7 · {SAMPLE.question}</span>
                    <h3>The founder wants ₹4 lakh cut from next month’s ads. Where does it come from?</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Channel</th>
                          <th>Spend</th>
                          <th>Orders (platform)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Meta prospecting</td>
                          <td>₹7.2L</td>
                          <td>1,900</td>
                        </tr>
                        <tr>
                          <td>Google brand</td>
                          <td>₹1.1L</td>
                          <td>640</td>
                        </tr>
                        <tr>
                          <td>Shopify, all orders</td>
                          <td>—</td>
                          <td>1,240</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="v3-rec">
                    <span className="v3-rec-dot" /> Recording · 2:03
                    <Wave bars={WAVE} played={0.7} />
                    <p>“…so it’s claiming more orders than exist. The real cost per order is closer to ₹610.”</p>
                  </div>
                </div>
              )}
              {step === 'review' && (
                <div className="v3-review">
                  <div className="v3-overall">
                    <span>Overall</span>
                    <strong>{SAMPLE.overall}</strong>
                    <em>Strong yes</em>
                  </div>
                  <ul>
                    {SAMPLE.rubric.map((r) => (
                      <li key={r.label}>
                        <div>
                          <strong>{r.label}</strong>
                          <q>{r.quote}</q>
                        </div>
                        <span className="v3-score">{r.score}/4</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {step === 'decide' && (
                <div className="v3-decide">
                  <div className="v3-ranked">
                    {[
                      ['Asha Rao', '3.7', 'is-top'],
                      ['Vikram Shah', '3.1', ''],
                      ['Neha Kulkarni', '2.4', ''],
                    ].map(([name, score, cls]) => (
                      <div key={name} className={`v3-person ${cls}`}>
                        <span className="v3-avatar">
                          {name
                            .split(' ')
                            .map((p) => p[0])
                            .join('')}
                        </span>
                        <strong>{name}</strong>
                        <span className="v3-score">{score}</span>
                      </div>
                    ))}
                  </div>
                  <div className="v3-choice">
                    <span className="is-yes">
                      <Icon name="check" size={14} /> Advance
                    </span>
                    <span>Hold</span>
                    <span>Reject</span>
                  </div>
                  <p>Then a 15-minute call with questions built from their own answers.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="lp-wrap v3-stats" aria-label="At a glance">
          <div>
            <strong>{ROLES.length}</strong>
            <span>practitioner-written roles</span>
          </div>
          <div>
            <strong>35 min</strong>
            <span>for candidates</span>
          </div>
          <div>
            <strong>{TRIAL_REVIEWS}</strong>
            <span>reviewed candidates free</span>
          </div>
          <div>
            <strong>0</strong>
            <span>cameras or bots</span>
          </div>
        </section>

        <section className="lp-wrap v3-features" aria-labelledby="v3-features">
          <h2 id="v3-features">Everything you need to decide, nothing to install.</h2>
          <div className="v3-grid">
            {FEATURES.map((f) => (
              <article key={f.title}>
                <Icon name={f.icon} size={20} />
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-wrap v3-pricing" aria-labelledby="v3-pricing">
          <h2 id="v3-pricing">Pay for reviewed candidates, not seats.</h2>
          <p className="v3-lead">Invites and drop-outs are free. Start with {TRIAL_REVIEWS} reviews on us.</p>
          <div className="v3-plans">
            {PLAN_OFFERS.map((p) => (
              <article key={p.id} className={p.id === 'starter' ? 'is-featured' : ''}>
                <h3>{p.name}</h3>
                <p className="v3-price">
                  {p.price} <span>{p.per}</span>
                </p>
                <ul>
                  {p.features.slice(0, 3).map((f) => (
                    <li key={f}>
                      <Icon name="check" size={14} /> {f}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-wrap v3-cta">
          <h2>See it on your next role.</h2>
          <div className="v3-actions">
            <StartFree size="lg" />
            <Link to="/demo/recruiter" className="v3-ghost">
              Try the live demo
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <PreviewBar current={3} />
    </div>
  );
}
