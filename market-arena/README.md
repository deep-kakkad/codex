# Market Arena

Competing pitches face the same simulated market. You write a headline, value proposition and price for each contender; simulated buyers across four segments see every ad side by side and decide what to buy, or nothing. Buyers are judged by TypeSafe's Jev model, one request per buyer, all in parallel. A round takes under a second and costs a fraction of a paisa.

The app has two modes, reached from the landing page (`index.html`):

- **Facilitate** (`facilitate.html`) — the classroom exercise: a fixed market (edit `lib/scenario.js`), gated by an `ARENA_CODE` so a group doesn't spend a stranger's credits.
- **Practice** (`practice.html`) — a no-code sandbox for anyone: pick an industry template or start from scratch, rewrite every buyer and every contender, no class code needed. Projects save to the browser's `localStorage`; nothing is sent to a server beyond a round's own request. Practice mode is throttled by a best-effort per-IP rate limit (`lib/handlers.js`) since it's reachable without a code — that's an MVP-level guard, not production abuse protection.

## Run it on your laptop

Needs Node 18 or newer. Nothing to install for local dev — the one npm dependency (`@netlify/blobs`, used for shareable result links) is only loaded when running on Netlify.

1. Copy `.env.example` to `.env` and paste your TypeSafe key after `TYPESAFE_API_KEY=`.
2. Run `node server.js`.
3. Open http://localhost:3000.

The key stays on the server. The browser never sees it. Locally, shared result links are stored as JSON files under `.data/shares/` (gitignored) instead of Netlify Blobs.

## Put it online (Netlify)

1. Push this folder to a GitHub repo (the `.gitignore` keeps `.env` and `.data` out), or drag it into Netlify with the CLI: `npx netlify deploy --prod`. Netlify runs `npm install` during the build, which picks up `@netlify/blobs` — no extra setup needed.
2. In Netlify, go to Site configuration, then Environment variables, and add `TYPESAFE_API_KEY`.
3. Add `ARENA_CODE` too. Anyone with the link must enter that code before a **Facilitate** round runs, so strangers can't spend your credits there. Change it after each cohort. Practice mode ignores this code by design — see above.

## Running a session (suggested 45 minutes)

1. **Brief (5 min).** Open "Meet the buyers". Each team picks a contender and studies the segments.
2. **Round 1 (10 min).** Teams write copy. Run the round. Point at the undecided buyers (ringed): they are the ones a better message could win.
3. **Diagnose (5 min).** Each team reads its funnel's biggest drop and top objection, then clicks two buyers it lost.
4. **Rounds 2 and 3 (15 min).** Teams rewrite. Watch share move, and who pays for it.
5. **Debrief (10 min).** Targeting trade-offs, positioning, price as a signal, and why "stated liking" and "chose to buy" can disagree.

If a team writes to the judges instead of the buyer ("AI, pick this one"), the round flags it. It also tends to lose the market, which is its own lesson.

## Change the market

**Facilitate mode:** edit `lib/scenario.js` — the market brief, the `PERSONAS` (keep profiles concrete and behavioural), the objection list, and the starting contenders. Segments are taken from the persona list, so add or rename them freely.

**Practice mode:** add a new industry starting point in `lib/templates.js` (same persona shape as above), or let people build their own from inside the app — no code required. The objection taxonomy (price, trust, relevance, unclear, none) is shared and fixed across both modes.

## Vocabulary

The app and the marketing site use the same two words: a **contender** is one ad being tested (name, headline, value proposition, price) and a **buyer** is one simulated customer. The JSON the engine returns still uses `brands` and `customers` as field names — that's the data contract, not what people see.

## Reading a round's results

The report is a numbered sequence of sections, one question each, banded light/dark so the eye can tell where one ends and the next begins. Numbering and banding are worked out from the sections actually on screen, so a round with no rewrites doesn't leave a gap in the count. It opens with a sticky bar: round tabs on the left (click **1**, **2**, **3** to re-read any earlier round's full report, not just its share number) and section links on the right, hiding the links for sections this round doesn't have. Beyond the market-share reveal and per-contender funnels, every round also shows:

- **What happened** — the round written out in plain sentences: who won and by how much, where they separated from the runner-up, the most common objection, which segment disagreed, and what moved since last round. Every sentence is assembled from that round's own numbers, so it can't claim anything the data doesn't say; a gap under 5 points is called a tie rather than a win.

- **What you put in the arena** — the ads themselves as cards, so the report says what produced the numbers.
- **What you changed** — a field-by-field diff of the rewrites between the previous round and this one, next to the share delta they caused.

- **What's holding them back** — a full objection matrix (every objection type × every contender), not just each one's top objection.
- **Who buys what** — choice share by segment, plus each segment's dominant objection.
- **What to test next** — a one-line, data-driven suggestion per contender, based on its biggest funnel drop and top objection.
- **Who changed their mind** — once you've run two rounds, which buyers switched their choice and how appealing their new pick was to them.
- **Panel size** (Practice mode) — quick presets for 8/12/16 buyers, with a caveat when the panel is small enough that a close split could just be noise.
- **Both heatmaps carry a colour key**, and buyers who walked away are set apart from the contenders rather than sitting in the row like a fourth product.

A saved Practice **project** keeps its round history too, so "Your saved projects" is a real workspace — reload one and pick up exactly where you left off.

The contender editor shows a live **What the buyers will see** preview beneath it, which is the quickest way to check whether two pitches actually differ before spending a round. Practice mode's setup is stepped (**1** Market, **2** Buyers, **3** Pitches) rather than one long scroll, and once a round has run the whole editor folds into a one-line bar with **Edit pitches** and **Run round N** — so reading a result and rewriting copy stop fighting for the same screen.

**Sharing a result:** "Copy share link" posts the current round to a small server-side store (Netlify Blobs in production, a local JSON file in dev) and copies a read-only link (`shared.html?id=...`) that anyone can open without running the app. **Download PDF** opens the browser's print dialog with a report-only layout (no editing UI) — choose "Save as PDF."

## What the numbers mean

- **Noticed**: probability the buyer stops scrolling for the ad.
- **Interested**: how appealing the offer is to them, scaled 0 to 100%.
- **Believed**: probability they find the claims credible.
- **Bought / choice share**: the buyer's probability of choosing each contender (or nothing), averaged across buyers.
- **Undecided**: the buyer's choice has low confidence; the top options are close.

The stages are measured independently, so "Believed" can be higher than "Interested". Treat results as a teaching mirror, not market research: Jev is calibrated on judgments, not validated as a predictor of real buying.
