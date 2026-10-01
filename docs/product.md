# Proofwork: product decisions and where they come from

This MVP is built from the research workbook _Competitor map: practical-skills testing & anti-AI hiring_ (snapshot 30 Sep 2026: competitor map, anti-AI methods, market signals). Vendor numbers in that research are unverified, and most of the loudest data comes from companies that sell detection. Treat the figures below as directional.

## Positioning

**A practical check that shows how a candidate thinks with and without AI, reviewed by AI, plus audio answers that show the thinking is really theirs. There's no bot interviewer.**

This replaced the first positioning ("reviewed by people"). Human review was the main cost in the first version, and the think-aloud audio made it slower still. AI now does the reviewing against the same practitioner-written rubrics and answer keys; recruiters make the decision.

Where the gap is, according to the competitor map:

| Competitor group                            | What they own                          | Why we don't compete head-on                                                                                                   |
| ------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TestGorilla, Testlify, iMocha, Mercer Mettl | Big generic test libraries, proctoring | A price-and-library-size race; generic, not built by practitioners for one role family                                         |
| Vervoe, Canditech                           | Job simulations with AI grading        | Closest to us. We differentiate on think-aloud audio, with-and-without-AI tasks, and practitioner rubrics with quoted evidence |
| HackerRank, CodeSignal, Codility            | Developer hiring                       | Highest cheating rates and the strongest incumbents. Stay out at first                                                         |
| Fabric, Hyring, Alex, HireVue               | AI interviewers and cheating detection | Candidates walk away from AI-scored video; detection is an arms race against funded cheating tools (Cluely raised $15M)        |
| BarRaiser, InCruiter, Intervue              | Human interview-as-a-service           | Engineering-first; deep rubrics for non-tech roles like marketing are a possible gap                                           |
| Coderbyte AI-fluency                        | "Allow AI, grade the process"          | Proves the idea works for non-tech tasks, but it's a developer-tools company                                                   |

The first two role families are **performance marketing** (the gap the research names most often) and **customer support leadership** (non-tech, high volume, relevant to Indian hiring).

## Anti-AI methods: what we built and what we skipped

| Method (research verdict)                                    | In the MVP                                                                                                                                                                                                                                                                                  | Where                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Specific scenario + short time box (_core_)                  | Yes. A fictional company with concrete numbers; every question has its own server-enforced timer                                                                                                                                                                                            | `shared/roleFamilies/*`, `server/candidateFlow.ts`           |
| Sequential reveal / branching (_core_)                       | Yes. The server only sends a question once the previous one is closed, and the candidate asks for "next by position" so upcoming ids and titles never leak. Branch stages change the situation based on an earlier decision                                                                 | `revealNext`, `dependsOn` stages                             |
| Spoken answers with a text fallback (_core_)                 | Yes. Voice notes via MediaRecorder, with "Type instead" always available                                                                                                                                                                                                                    | `VoiceRecorder.tsx`                                          |
| Think-aloud while working (_added after launch_)             | Yes, on the first read, decision and critique questions. Recording runs from the moment the question opens, next to a timestamped scratchpad. Reviewers get a listening checklist and a delivery flag that feeds the call script, and a doubt is a question for the call, never a rejection | `ThinkAloud.tsx`, `ThinkAloudReview.tsx`, `appendAudioChunk` |
| "Critique this" tasks (_strongest cheap signal_)             | Yes. Plausible plans with flaws that only show up given the scenario, e.g. a target ROAS below the break-even point implied by the margin                                                                                                                                                   | `agency-plan`, `draft-reply` stages                          |
| Past-work deep dive (_use, but verify live_)                 | Yes. Always marked "probe first" on the call script                                                                                                                                                                                                                                         | `past_work` stages                                           |
| Allow AI + submit the transcript (_differentiator_)          | Yes. One stage per family: final answer, full AI conversation, and what was kept or rejected                                                                                                                                                                                                | `ai_allowed` stages                                          |
| 10–15 min live verification call (_the real security layer_) | Yes. The script is built from the candidate's own answers and puts answers with notable signals first                                                                                                                                                                                       | `shared/verification.ts`                                     |
| Identity check (_do it_)                                     | Partly. The candidate enters their name as it appears on their ID; the call script starts with an ID check and flags a name mismatch. The voice warm-up gives the interviewer a sample to compare                                                                                           | Intro form, call script                                      |
| Unique variants per candidate (_add once volume grows_)      | Yes, from day one. It's cheap: a seeded generator changes the company, numbers and details, and the answer key recomputes                                                                                                                                                                   | `shared/variants.ts`                                         |
| Tab-switch & copy-paste flags (_weak signal only_)           | Collected, disclosed to the candidate up front, and shown to reviewers as "what to probe", never as proof or a score                                                                                                                                                                        | `shared/signals.ts`                                          |
| Webcam proctoring, lockdown browser, AI-text detectors       | **Skipped**: easily beaten, costly to candidates, or unfair to honest people                                                                                                                                                                                                                | —                                                            |
| Paid work trial (_later upsell_)                             | Not yet                                                                                                                                                                                                                                                                                     | —                                                            |

## Candidate experience principles

From the Greenhouse data (38% withdrew from a process because of an AI interview; top walk-away triggers are AI-scored video with no human present, undisclosed AI use and AI monitoring):

- Tell candidates exactly what is recorded and what isn't, before they start.
- A human reviews every answer. There is no automatic rejection.
- Breaks are allowed between questions; only the open question's clock runs.
- Extra time (1.25×, 1.5×, 2×) is set per candidate as an adjustment.
- The "what reviewers look for" criteria are shown on each question.

## Review workflow

- **AI reviews, recruiters decide.** After submission, an audio model transcribes each recording and judges whether it sounds like live reasoning or reading (ignoring accent, fluency and nerves). A text model scores each answer against the rubric anchors and answer key, quoting the candidate's words, then summarises strengths, concerns and how they worked with versus without AI.
- The overall score is the weighted rubric average computed by the app; the recommendation follows it (≥3.0 advance, ≥2.3 hold). The decision is always the recruiter's.
- Candidates are told up front that AI reviews their answers and people decide. Research showed undisclosed AI use is a top walk-away trigger; disclosure is the mitigation.
- "Sounds read" never rejects anyone on its own: it moves that question to the top of the optional verification call.

## Accounts

- **Recruiters** belong to a company workspace and create assessments by choosing a role and its activities.
- **Candidates** have their own accounts. An invitation only opens for the account with the invited email, and candidates see all their invitations in one place.

## What to validate next

0. **AI review agreement with experts.** Have two practitioners score 20–30 real candidates blind and compare with the AI's scores per criterion before relying on the recommendation.

1. Do hiring managers finish a review in under 15 minutes per candidate?
2. Does the verification call change any decisions, and how often does it catch an inconsistency?
3. Candidate completion rate and drop-off by stage, especially at voice-first questions.
4. Demand for the AI-allowed stage as a standalone "AI fluency for non-tech roles" product (TestGorilla survey: the top cause of bad AI hires is not being able to define AI fluency for non-technical roles).
5. Whether expert reviewers-as-a-service, like BarRaiser but for marketing, is the business rather than the software.
