# Proofwork

Practical, scenario-based hiring assessments for non-tech roles, **reviewed by people and verified on a short live call**. It doesn't use proctoring, webcams or an AI interviewer.

Candidates work through a realistic situation from the job: a fictional company whose numbers are unique to each candidate. Questions open one at a time, each with its own timer. Candidates answer by voice note or text, and one question explicitly allows AI and asks for the transcript. Reviewers score against practitioner-written rubrics, and the platform generates a 10–15 minute verification call script from the candidate's own answers.

The product decisions and the research behind them are in [docs/product.md](docs/product.md).

## Quick start

Requires Node.js 22.13 or later (it uses the built-in `node:sqlite`).

```bash
npm install
npm run seed      # demo workspace with candidates at different stages
npm run dev       # http://localhost:3000
```

Demo logins (password `demo-password`):

- `demo@proofwork.test`: hiring manager
- `reviewer@proofwork.test`: reviewer, who has already reviewed one candidate, so you can see blind review

Or skip the seed and create a workspace at `/signup`.

## What's in it

**For hiring managers and reviewers**

- **Role library.** Two role families to start with: _Performance Marketing_ and _Customer Support Leadership_. Each has 7 stages: a warm-up, a scenario question, a decision, a branch that changes the situation based on that decision, a critique of a flawed plan, an AI-allowed task and a past-work story. The preview shows every branch and its answer key.
- **Assessments and invites.** Create an assessment, invite a candidate and copy their private link. Extra time can be set per candidate.
- **Think-aloud review.** On think-aloud questions the reviewer gets the recording (with 1–2× speed), the candidate's scratchpad as a timeline (click a moment to hear what they were saying then), a "what to listen for" checklist, and a delivery flag (natural / not sure / sounded read). "Not sure" or "read" moves that question to the top of the verification call.
- **Review.** For each question the reviewer sees what the candidate saw, their answer (voice note, text, choice, AI transcript), time taken and weak integrity signals. Next to it are the reviewer guide and anchored 1–4 rubrics. Reviews stay blind until you submit yours. Managers record the decision.
- **Verification call.** A printable script with an ID check, then follow-ups built from the candidate's own answers (priority first), and an outcome form.
- **Team.** Add reviewers and other hiring managers.

**For candidates**

- A clear intro explaining what's recorded and what isn't, how AI may be used, and what happens next.
- An untimed scenario brief, then one question at a time. Timers are enforced by the server, drafts autosave, and there are breaks between questions.
- **Think-aloud questions** (three per role family: the first read, the decision and the critique). Audio records from the moment the question opens until it's submitted, next to a scratchpad, so reviewers hear the working rather than a prepared answer. It's audio only. Chunks upload every 4 seconds, so a crash or reload loses at most a few seconds, and the recording continues as a new part. Candidates without a microphone type their working instead.
- Voice notes (with a microphone check) or typed answers on the other questions.

## Scripts

| Command                     | What it does                                               |
| --------------------------- | ---------------------------------------------------------- |
| `npm run dev`               | API and Vite dev server on one port (`PORT`, default 3000) |
| `npm run build`             | Builds the web client to `dist/web`                        |
| `npm start`                 | Production server; serves the API and `dist/web`           |
| `npm run seed [-- --reset]` | Demo data (`--reset` wipes `./data` first)                 |
| `npm test`                  | Vitest: content invariants, scoring, API integration       |
| `npm run typecheck`         | `tsc --noEmit`                                             |
| `npm run lint`              | Prettier check and typecheck                               |

Environment variables: `PORT`, `DATA_DIR` (default `./data`, holding the SQLite database and voice notes), `TRUST_PROXY` (default `loopback`) and `INSECURE_COOKIES=1`. In production, session cookies are `Secure`, so they need HTTPS; set `INSECURE_COOKIES=1` to run production over plain HTTP locally.

## Layout

```
shared/                 domain code used by the server (and types used by the client)
  roleFamilies/         assessment content: scenario generators, prompts, rubrics, answer keys
  variants.ts           seeded per-candidate variants and number formatting
  scoring.ts            weighted rubric scoring
  signals.ts            integrity signals, described as weak evidence
  verification.ts       live call script builder
server/
  candidateFlow.ts      sequential reveal, server-side timers, drafts, voice uploads
  report.ts             reviewer report assembly (blind review, per-stage timing)
  routes/               auth, candidate (token) and manager (session) APIs
  db.ts                 node:sqlite schema and helpers
web/src/                React client (candidate flow, reviewer workspace, library)
tests/                  vitest suites
```

Role family content (answer keys included) is imported only by the server. A test enforces that the web client never imports it, because candidates load the same JavaScript bundle.

## Adding a role family

Create `shared/roleFamilies/<name>.ts` exporting a `RoleFamily`, then register it in `shared/roleFamilies/index.ts`:

- `generate(rng, currency)` returns the variant values. Keep derived numbers consistent (for example, orders derived from spend), because the answer key uses them.
- `brief(ctx)` is the scenario, as structured blocks.
- Each stage has `prompt`, optional `material`, `reviewerGuide`, `rubric` (four anchors per criterion) and `followUps` for the call. Branch stages set `dependsOn` to the id of an earlier decision stage and read `ctx.choices`.

`tests/content.test.ts` renders every branch for 60 seeds in both currencies and fails on missing values. Add an invariant there for any planted flaw that must hold for every variant (for example, that the agency's target ROAS is always below break-even).

## Known gaps (next steps)

- No email delivery: managers copy the candidate link and send it themselves. Candidate links don't expire yet.
- No password reset, SSO or login rate limiting.
- SQLite on one node, and voice notes on local disk. Move both to managed storage before running multiple instances.
- No data-retention or deletion tooling for candidate data yet.
- No speech-to-text yet: reviewers listen to think-aloud recordings rather than skimming a transcript. A timestamped transcript is the obvious next step.
- Integrity signals are client-reported and can be spoofed. By design they are only hints for the live call.
