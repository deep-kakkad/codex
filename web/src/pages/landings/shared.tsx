import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { StartFree } from '../../components/Site';
import { useDemo } from '../../demo/mode';

/** Five landing-page directions to choose from. None of them is the live landing page. */
export const VERSIONS = [
  { n: 1, name: 'Evidence' },
  { n: 2, name: 'Before / after' },
  { n: 3, name: 'Product tour' },
  { n: 4, name: 'Time back' },
  { n: 5, name: 'Fair to both sides' },
] as const;

/** A floating switcher so the versions can be compared side by side. */
export function PreviewBar({ current }: { current: number }) {
  return (
    <nav className="pv-bar" aria-label="Landing page versions">
      <span className="pv-bar-label">Preview</span>
      {VERSIONS.map((v) => (
        <Link key={v.n} to={`/preview/landing/${v.n}`} className={v.n === current ? 'is-on' : ''} title={v.name}>
          {v.n}
          <span className="pv-bar-name">{v.name}</span>
        </Link>
      ))}
      <Link to="/" className="pv-bar-live">
        Live
      </Link>
    </nav>
  );
}

export function NavActions({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const demo = useDemo();
  const signedIn = Boolean(user) && !demo;
  return (
    <div className={`pv-nav-actions ${className}`}>
      {signedIn ? (
        <Link to="/app" className="lp-btn lp-btn-sm">
          Open dashboard
        </Link>
      ) : (
        <>
          <Link to="/login" className="pv-navlink">
            Log in
          </Link>
          <StartFree size="sm" />
        </>
      )}
    </div>
  );
}

export function PvNav({ className = '', links }: { className?: string; links?: ReactNode }) {
  return (
    <header className={`lp-wrap pv-nav ${className}`}>
      <Link to="/" className="pv-wordmark">
        Proofwork
      </Link>
      <nav className="pv-links" aria-label="Site">
        {links ?? (
          <>
            <Link to="/roles">Roles</Link>
            <Link to="/roi">ROI</Link>
            <Link to="/compare/take-home">Compare</Link>
            <Link to="/trust">Trust</Link>
          </>
        )}
      </nav>
      <NavActions />
    </header>
  );
}

/** A speech-like waveform: deterministic, so every render is the same. */
export function waveform(bars: number, seed = 1) {
  return Array.from({ length: bars }, (_, i) => {
    const envelope = 0.55 + 0.45 * Math.sin((i / (bars - 1)) * Math.PI);
    const texture = Math.abs(Math.sin(i * 1.93 * seed) * Math.cos(i * 0.71));
    return Math.round((0.16 + 0.84 * texture * envelope) * 100);
  });
}

export function Wave({ bars, played = 0, className = '' }: { bars: number[]; played?: number; className?: string }) {
  return (
    <span className={`pv-wave ${className}`} aria-hidden="true">
      {bars.map((h, i) => (
        <span key={i} className={i / bars.length < played ? 'is-played' : ''} style={{ height: `${h}%` }} />
      ))}
    </span>
  );
}

/** The sample candidate used across the versions: one think-aloud answer, scored with quotes. */
export const SAMPLE = {
  name: 'Asha Rao',
  role: 'Performance Marketing Manager',
  question: 'The budget cut',
  transcript: [
    {
      t: '0:42',
      text: 'Meta says 1,900 orders but Shopify only has 1,240 for the whole month, so it’s claiming more than exists.',
    },
    { t: '1:15', text: 'So the real cost per order is closer to ₹610, not ₹380. Wait, ₹610 is above our ₹540 margin.' },
    {
      t: '2:03',
      text: 'I’d cut prospecting on Meta first and keep branded search, because that’s where the orders actually come from.',
    },
  ],
  rubric: [
    { label: 'Spots the over-attribution', score: 4, quote: 'it’s claiming more than exists' },
    { label: 'Does the unit economics', score: 4, quote: '₹610 is above our ₹540 margin' },
    { label: 'Commits to a cut', score: 3, quote: 'I’d cut prospecting on Meta first' },
  ],
  overall: '3.7',
};

export const FAQ: [string, string][] = [
  [
    'Can’t candidates just use ChatGPT?',
    'On the AI-allowed task they’re meant to, and you see the conversation. Elsewhere, each candidate has their own numbers, critiques hide flaws only the data reveals, and think-aloud audio makes pasted answers stand out.',
  ],
  [
    'Does AI make the hiring decision?',
    'No. It transcribes, scores against a rubric with quoted evidence and recommends. Your team can change any score, and you decide.',
  ],
  [
    'What do candidates need?',
    'A browser and about 35 minutes. No account, no camera, no download. They can withdraw and delete their answers at any time.',
  ],
  [
    'Which roles are covered?',
    '27 practitioner-written roles across marketing, sales, support, product, data, operations, finance and HR. For anything else, paste a job description and AI writes one in the same format.',
  ],
];
