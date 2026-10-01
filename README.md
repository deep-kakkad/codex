# Proofwork

A practical check that shows how a candidate thinks **with and without AI**, **reviewed by AI**, plus **audio answers** that show the thinking is really theirs. There's no bot interviewer.

Recruiters pick the role they're hiring for and choose activities from a practitioner-written scenario. Candidates sign in with their own account and work through a fictional company whose numbers are unique to them, one question at a time, each with its own timer. Key questions record them thinking aloud; one question allows any AI tool and asks for the conversation. When they submit, AI transcribes the audio, judges whether it sounds like live reasoning or reading, scores every answer against the rubric with quoted evidence, and summarises. The recruiter makes the decision.

The product decisions and the research behind them are in [docs/product.md](docs/product.md).

## Quick start

Requires Node.js 22.13 or later. Locally the database is PGlite (in-process Postgres), so there's nothing else to install.

```bash
npm install
echo 'OPENROUTER_API_KEY=sk-or-...' > .env   # gitignored; needed for AI review
npm run seed      # demo workspace with candidates at different stages
npm run dev       # http://localhost:3000
```

Demo logins (password `demo-password`):

- Recruiter: `demo@proofwork.test`
- Candidates: `asha.rao@example.com`, `vikram.shah@example.com`, `neha.k@example.com`, `arjun.nair@example.com`, `farah.s@example.com`

The seed leaves two candidates submitted; with the key set, the server reviews them with AI when it starts. Or skip the seed and sign up at `/signup` as a recruiter or a candidate.

## What's in it

**Recruiters**

- **Role and activities.** Pick the role you're hiring for (Performance Marketing, Content & Brand, SEO, Social Media or Customer Support Leadership for now), then choose activities from its scenario: a warm-up, think-aloud questions, a decision, a situation change that follows it, a critique with planted flaws, an AI-allowed task and a real story from their career. A preview shows every branch and the answer key.
- **Invites.** Add a candidate by name and email and send them the private link. Extra time can be set per candidate.
- **AI review.** For every answer: what the candidate saw, their recording (with speed control and a scratchpad timeline that seeks the audio), the transcript, the AI's read of the delivery, and each rubric criterion with the anchor it chose, a verbatim quote and its reasoning. Plus an overall score, recommendation, strengths, concerns and how they worked with versus without AI. Failed reviews show why and can be re-run.
- **Decision.** Advance, hold or reject. The AI recommends; the recruiter decides.
- **Verification call (optional).** A printable 10–15 minute script with an ID check and follow-ups built from the candidate's own answers. Questions whose audio sounded read go first, and the AI adds its own suggested questions.
- **Team.** Add other recruiters.

**Candidates**

- Their own account and a dashboard of every assessment they've been invited to. An invite link only works for the account with the invited email.
- A clear intro: what's recorded, that AI reviews the answers and people decide, how AI may be used.
- An untimed scenario brief, then one question at a time. Timers are enforced by the server, drafts autosave, and there are breaks between questions.
- **Think-aloud questions**: audio records from the moment the question opens until it's submitted, next to a scratchpad. Chunks upload every 4 seconds, so a crash or reload loses at most a few seconds. Candidates without a microphone type their working instead.
- Voice notes or typed answers on the other questions.

## AI review

Runs in the background after a candidate submits (one review at a time; interrupted reviews resume on restart), through [OpenRouter](https://openrouter.ai):

1. **Audio** (`AI_AUDIO_MODEL`, default `google/gemini-3.8-flash`): verbatim transcript with pauses, plus a delivery judgement (live reasoning / unclear / read) that ignores accent, fluency and nerves. Transcripts are cached, so a re-run doesn't transcribe twice.
2. **Scoring** (`AI_REVIEW_MODEL`, default `anthropic/claude-sonnet-5.5`): one call per scored question with the brief, the question as shown, the answer and transcript, the answer key and the rubric anchors. Scores outside 1–4 are rejected.
3. **Summary**: strengths, concerns, with-versus-without-AI comparison and questions for the call.

The overall score is the weighted rubric average computed by the app, not by the model; the recommendation follows it (≥3.0 advance, ≥2.3 hold).

## Deploying to Netlify

The app is built for Netlify:

| Piece      | Netlify feature                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| Web client | Static site (`dist/web`)                                                                                             |
| API        | Function on `/api/*` (`netlify/functions/api.mts`, Express via serverless-http)                                      |
| Database   | Netlify Database (Postgres), migrations in `netlify/database/migrations/` applied on every deploy                    |
| Recordings | Netlify Blobs (`recordings` store)                                                                                   |
| AI reviews | Background function (`/internal/review`, up to 15 minutes) plus a sweep every 10 minutes for stuck or missed reviews |
| Demo data  | Background function (`/internal/seed-demo`), run once when `DEMO_SEED=1`                                             |

Steps:

1. Create a site from this repository (or `netlify deploy --build --prod` from a linked folder). Netlify Database needs a credit-based plan (Free included).
2. Set environment variables: `OPENROUTER_API_KEY`, and `DEMO_SEED=1` if you want the demo accounts. Optionally `AI_REVIEW_MODEL` and `AI_AUDIO_MODEL`.
3. Deploy. The database is provisioned and migrated during the deploy. With `DEMO_SEED=1`, the first API request creates the demo workspace and its two submitted candidates are reviewed by AI within a minute or two.

Recordings are capped at 32 kbps so a 9-minute think-aloud stays around 2 MB, well inside Netlify's 6 MB function payload limit.

## Scripts

| Command                     | What it does                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run dev`               | API and Vite dev server on one port (`PORT`, default 3000)                                                 |
| `npm run build`             | Builds the web client to `dist/web`                                                                        |
| `npm start`                 | Production server; serves the API and `dist/web`                                                           |
| `npm run seed [-- --reset]` | Demo data (`--reset` wipes `./data` first)                                                                 |
| `npm test`                  | Vitest: content, scoring, API and AI review (fake AI, PGlite; set `TEST_DATABASE_URL` for a real Postgres) |
| `npm run typecheck`         | `tsc --noEmit`                                                                                             |
| `npm run lint`              | Prettier check and typecheck                                                                               |

Local environment variables (read from `.env` if present): `OPENROUTER_API_KEY`, `AI_REVIEW_MODEL`, `AI_AUDIO_MODEL`, `PORT`, `DATA_DIR` (default `./data`: a PGlite database and recordings), `DATABASE_URL` (use a real Postgres instead of PGlite), `DEMO_SEED=1` (create the demo workspace on start), `TRUST_PROXY` (default `loopback`) and `INSECURE_COOKIES=1`. Session cookies are `Secure` in production, so they need HTTPS; set `INSECURE_COOKIES=1` to run production over plain HTTP locally. Behind an outbound HTTP proxy, also set `NODE_USE_ENV_PROXY=1` so Node's `fetch` uses `HTTPS_PROXY`.

## Layout

```
shared/                 domain code used by the server (and types used by the client)
  roleFamilies/         scenario content: generators, prompts, rubrics, answer keys
  variants.ts           seeded per-candidate variants and number formatting
  scoring.ts            weighted rubric scoring
  verification.ts       live call script builder
server/
  ai/                   OpenRouter client, review pipeline and queues (in-process or background function)
  candidateFlow.ts      sequential reveal, server-side timers, drafts, audio uploads
  families.ts           activity selection per assessment
  report.ts             recruiter report assembly
  routes/               recruiter auth, candidate accounts, candidate flow, recruiter APIs
  db.ts                 async Postgres helpers (Netlify Database in production, PGlite locally)
  files.ts              recordings storage (Netlify Blobs or a local folder)
  demo.ts               the demo workspace
netlify/                functions, shared runtime and database migrations
web/src/                React client (candidate flow and dashboard, recruiter workspace)
tests/                  vitest suites
```

Scenario content (answer keys included) is imported only by the server. A test enforces that the web client never imports it, because candidates load the same JavaScript bundle.

## Adding a role family

Create `shared/roleFamilies/<name>.ts` exporting a `RoleFamily`, then register it in `shared/roleFamilies/index.ts`:

- `generate(rng, currency)` returns the variant values. Keep derived numbers consistent (for example, orders derived from spend), because the answer key uses them.
- `brief(ctx)` is the scenario, as structured blocks.
- Each stage has a `summary` for recruiters choosing activities, `prompt`, optional `material`, `reviewerGuide` (the answer key the AI scores against), `rubric` (four anchors per criterion) and `followUps` for the call. Branch stages set `dependsOn` to an earlier decision stage and read `ctx.choices`. Set `thinkAloud: true` to record the working.

`tests/content.test.ts` renders every branch for 60 seeds in both currencies and fails on missing values. Add an invariant there for any planted flaw that must hold for every variant. `roleFamilies/common.ts` has the shared warm-up and past-work stages.

## Known gaps (next steps)

- No email delivery: recruiters send the candidate link themselves. Links don't expire yet.
- No password reset, SSO or login rate limiting.
- The local server runs AI reviews in-process; on Netlify they run in background functions. There is no dead-letter alerting yet: failed reviews show in the recruiter's view with a re-run button.
- No data-retention or deletion tooling for candidate data and recordings yet.
- AI review quality should be checked against expert human scores on a sample of real candidates before relying on it, and AI-assisted hiring is regulated in some places (for example NYC Local Law 144 and the EU AI Act). Candidates are told that AI reviews their answers and people decide.
- Integrity signals are client-reported and can be spoofed. By design they are only hints for the call.
