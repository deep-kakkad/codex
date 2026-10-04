import { type CSSProperties, type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { type LeadSource } from '../../../shared/demo';
import { api, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { setUi, useUi } from '../ui';
import { useLeaveDemo } from './DemoBanner';
import { enterDemo, useDemo } from './mode';
import { type TourId, endTour, goToStep, startTour, useTour } from './tour';
import { REVIEW_STEP, TOURS, type TourStep, type TourUi } from './tourSteps';

// Room around the spotlighted element, and between it and the card.
const PAD = 8;
const GAP = 14;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const currentPath = () => window.location.pathname + window.location.search;

function find(selector: string, text?: string): HTMLElement | null {
  const wanted = text?.toLowerCase();
  return (
    [...document.querySelectorAll<HTMLElement>(selector)].find(
      (el) => el.getClientRects().length > 0 && (!wanted || (el.textContent ?? '').toLowerCase().includes(wanted)),
    ) ?? null
  );
}

/** Resolves once `el` has stopped moving (the page finished scrolling), or after a second and a half. */
function settled(el: HTMLElement, signal: { cancelled: boolean }) {
  return new Promise<void>((resolve) => {
    const started = Date.now();
    let last = Number.NaN;
    let still = 0;
    const tick = () => {
      const top = el.getBoundingClientRect().top;
      still = top === last ? still + 1 : 0;
      last = top;
      if (signal.cancelled || still >= 4 || Date.now() - started > 1500) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Page helpers for one step; they give up when the visitor moves on. */
function pageUi(signal: { cancelled: boolean }): TourUi {
  const waitFor = (selector: string, text?: string) =>
    new Promise<HTMLElement>((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (signal.cancelled) return reject(new Error('Moved on'));
        const el = find(selector, text);
        if (el) return resolve(el);
        if (Date.now() - started > 8000) return reject(new Error(`Not on the page: ${selector}`));
        window.setTimeout(tick, 60);
      };
      tick();
    });
  return {
    waitFor,
    click: async (selector, text) => (await waitFor(selector, text)).click(),
  };
}

/** The guided tour, drawn over the real demo pages. */
export function TourOverlay() {
  const tour = useTour();
  const demo = useDemo();
  // A tour only makes sense inside the demo.
  useEffect(() => {
    if (tour && !demo) endTour();
  }, [tour, demo]);
  if (!tour || !demo) return null;
  return createPortal(<Tour id={tour.id} index={tour.step} />, document.body);
}

function Tour({ id, index }: { id: TourId; index: number }) {
  const steps = TOURS[id];
  const last = steps.length - 1;
  const at = Math.min(Math.max(index, 0), last);
  const step = steps[at];
  const navigate = useNavigate();
  // The element to spotlight, with the step it was found for: a step change must never show the last one's.
  const [target, setTarget] = useState<{ el: HTMLElement; step: string } | null>(null);
  const stepKey = `${id}-${at}`;
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const savedUi = useRef(useUi());

  // The tour points at the current interface; a visitor's saved choice comes back afterwards.
  useEffect(() => {
    if (savedUi.current !== 'v1') return;
    setUi('v2', false);
    return () => setUi('v1', false);
  }, []);

  // Open the step's page, set it up, then find what to spotlight.
  useEffect(() => {
    const signal = { cancelled: false };
    setTarget(null);
    setBox(null);
    setMissing(false);
    void (async () => {
      await step.prepare?.();
      if (signal.cancelled) return;
      if (currentPath() !== step.path) navigate(step.path);
      const page = pageUi(signal);
      await step.act?.(page);
      if (!step.target) return;
      const el = await page.waitFor(step.target);
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.55;
      el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      await settled(el, signal);
      if (!signal.cancelled) setTarget({ el, step: `${id}-${at}` });
    })().catch(() => {
      if (!signal.cancelled) setMissing(true);
    });
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      signal.cancelled = true;
    };
  }, [id, at]);

  // Follow the target as the page scrolls or re-renders.
  useEffect(() => {
    if (!target || target.step !== stepKey || !step.target) {
      setBox(null);
      return;
    }
    const selector = step.target;
    let el = target.el;
    let frame = 0;
    const update = () => {
      if (!el.isConnected) el = find(selector) ?? el;
      const r = el.getBoundingClientRect();
      setBox((prev) =>
        prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [target, stepKey, step.target]);

  // Put the card beside the spotlight: below, above, right, left, else in the corner.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !box || step.end || window.innerWidth < 640) {
      if (step.end || window.innerWidth < 640) setPlace(null);
      return;
    }
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s = {
      top: box.top - PAD,
      left: box.left - PAD,
      bottom: box.top + box.height + PAD,
      right: box.left + box.width + PAD,
    };
    const x = (left: number) => Math.min(Math.max(12, left), vw - w - 12);
    const y = (top: number) => Math.min(Math.max(12, top), vh - h - 12);
    let next: { top: number; left: number };
    if (s.bottom + GAP + h <= vh - 12) next = { top: s.bottom + GAP, left: x(s.left) };
    else if (s.top - GAP - h >= 12) next = { top: s.top - GAP - h, left: x(s.left) };
    else if (s.right + GAP + w <= vw - 12) next = { top: y(s.top), left: s.right + GAP };
    else if (s.left - GAP - w >= 12) next = { top: y(s.top), left: s.left - GAP - w };
    else next = { top: vh - h - 20, left: vw - w - 20 };
    setPlace((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
  }, [box, step]);

  // Arrow keys move through the tour; Escape leaves it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement | null)?.closest('input, textarea, select');
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') endTour();
      else if (event.key === 'ArrowRight' && at < last) goToStep(at + 1);
      else if (event.key === 'ArrowLeft' && at > 0) goToStep(at - 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, last]);

  const spot = box && {
    top: box.top - PAD,
    left: box.left - PAD,
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
  };

  return (
    <div className="tour" data-tour-id={id}>
      <div className="tour-blocker" aria-hidden="true" />
      {spot && !step.end ? (
        <div key={stepKey} className="tour-spot" data-step={at} style={spot} aria-hidden="true" />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={cardRef}
        className={`tour-card ${step.end ? 'is-end' : ''} ${place ? 'is-placed' : ''}`}
        style={place ?? undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
      >
        <button type="button" className="tour-close" aria-label="Close the tour" onClick={endTour}>
          <Icon name="x" size={16} />
        </button>
        {step.end ? (
          <TourEnd id={id} step={step} />
        ) : (
          <>
            <p className="tour-count">
              {id === 'candidate' ? 'Candidate side' : 'Recruiter tour'} · {at + 1} of {last}
            </p>
            <h2 id="tour-title">{step.title}</h2>
            <p id="tour-body" aria-live="polite">
              {step.body}
            </p>
            {missing && <p className="tour-note">This part didn’t load. Carry on with Next.</p>}
            <div className="tour-foot">
              <span className="tour-progress" aria-hidden="true">
                <span style={{ width: `${((at + 1) / last) * 100}%` }} />
              </span>
              {at > 0 && (
                <button type="button" className="tour-back" onClick={() => goToStep(at - 1)}>
                  Back
                </button>
              )}
              <button type="button" className="tour-next" onClick={() => goToStep(at + 1)}>
                {at === last - 1 ? 'Finish' : 'Next'}
                <Icon name="arrow" size={15} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The last card: start free, talk to us, or keep looking around. */
function TourEnd({ id, step }: { id: TourId; step: TourStep }) {
  const leaveDemo = useLeaveDemo();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source: LeadSource = id === 'recruiter' ? 'recruiter-tour' : 'candidate-tour';

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/leads', { email, source });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const explore = () => {
    endTour();
    navigate('/app');
  };
  const replay = () => {
    // A fresh copy of the sample workspace, so the tour reads as it did the first time.
    if (id === 'recruiter') enterDemo();
    startTour(id);
  };

  return (
    <>
      <p className="tour-count">{id === 'candidate' ? 'Candidate side' : 'Recruiter tour'} · Done</p>
      <h2 id="tour-title" className="tour-end-title">
        {step.title}
      </h2>
      <p id="tour-body">{step.body}</p>
      <div className="tour-end-actions">
        <button
          type="button"
          className="tour-next tour-wide"
          onClick={() => {
            endTour();
            void leaveDemo('/signup');
          }}
        >
          Start free
          <Icon name="arrow" size={15} />
        </button>
        {id === 'candidate' ? (
          <button
            type="button"
            className="tour-secondary tour-wide"
            onClick={() => startTour('recruiter', REVIEW_STEP)}
          >
            See what the hiring team gets
          </button>
        ) : (
          <button type="button" className="tour-secondary tour-wide" onClick={explore}>
            Explore the demo on your own
          </button>
        )}
      </div>
      <form className="tour-lead" onSubmit={send}>
        {sent ? (
          <p className="tour-sent" role="status">
            <Icon name="check" size={15} /> Thanks. We’ll be in touch at {email}.
          </p>
        ) : (
          <>
            <label htmlFor="tour-email">Rather talk it through? Leave your work email.</label>
            <div className="tour-lead-row">
              <input
                id="tour-email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit" className="tour-secondary" disabled={busy}>
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
            {error && <p className="tour-error">{error}</p>}
          </>
        )}
      </form>
      <div className="tour-links">
        {id === 'recruiter' ? (
          <button type="button" onClick={() => startTour('candidate')}>
            Walk through the candidate side
          </button>
        ) : (
          <button type="button" onClick={explore}>
            Explore the demo on your own
          </button>
        )}
        <button type="button" onClick={replay}>
          Replay the tour
        </button>
      </div>
    </>
  );
}
