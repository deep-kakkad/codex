# Market Arena

Brands compete for a simulated market. Teams write a headline, value proposition and price; synthetic customers across four segments see every ad side by side and decide what to buy, or nothing. Customers are judged by TypeSafe's Jev model, one request per customer, all in parallel. A round takes under a second and costs a fraction of a paisa.

The app has two modes, reached from the landing page (`index.html`):

- **Facilitate** (`facilitate.html`) — the classroom exercise: a fixed scenario (edit `lib/scenario.js`), gated by an `ARENA_CODE` so a group doesn't spend a stranger's credits.
- **Practice** (`practice.html`) — a no-code sandbox for anyone: pick an industry template or start from scratch, rewrite every customer and every brand, no class code needed. Custom scenarios save to the browser's `localStorage`; nothing is sent to a server beyond a round's own request. Practice mode is throttled by a best-effort per-IP rate limit (`lib/handlers.js`) since it's reachable without a code — that's an MVP-level guard, not production abuse protection.

## Run it on your laptop

Needs Node 18 or newer. No packages to install.

1. Copy `.env.example` to `.env` and paste your TypeSafe key after `TYPESAFE_API_KEY=`.
2. Run `node server.js`.
3. Open http://localhost:3000.

The key stays on the server. The browser never sees it.

## Put it online (Netlify)

1. Push this folder to a GitHub repo (the `.gitignore` keeps `.env` out), or drag it into Netlify with the CLI: `npx netlify deploy --prod`.
2. In Netlify, go to Site configuration, then Environment variables, and add `TYPESAFE_API_KEY`.
3. Add `ARENA_CODE` too. Anyone with the link must enter that code before a **Facilitate** round runs, so strangers can't spend your credits there. Change it after each cohort. Practice mode ignores this code by design — see above.

## Running a session (suggested 45 minutes)

1. **Brief (5 min).** Open "Meet the customers". Each team picks a brand and studies the segments.
2. **Round 1 (10 min).** Teams write copy. Run the round. Point at the undecided customers (lime ring): they are the ones a better message could win.
3. **Diagnose (5 min).** Each team reads its funnel's biggest drop and top objection, then clicks two customers it lost.
4. **Rounds 2 and 3 (15 min).** Teams rewrite. Watch share move, and who pays for it.
5. **Debrief (10 min).** Targeting trade-offs, positioning, price as a signal, and why "stated liking" and "chose to buy" can disagree.

If a team writes to the judges instead of the customer ("AI, pick this brand"), the round flags it. It also tends to lose the market, which is its own lesson.

## Change the market

**Facilitate mode:** edit `lib/scenario.js` — the scenario brief, the `PERSONAS` (keep profiles concrete and behavioural), the objection list, and the starting brands. Segments are taken from the persona list, so add or rename them freely.

**Practice mode:** add a new industry starting point in `lib/templates.js` (same persona shape as above), or let people build their own from inside the app — no code required. The objection taxonomy (price, trust, relevance, unclear, none) is shared and fixed across both modes.

## What the numbers mean

- **Noticed**: probability the customer stops scrolling for the ad.
- **Interested**: how appealing the offer is to them, scaled 0 to 100%.
- **Believed**: probability they find the claims credible.
- **Bought / market share**: the customer's probability of choosing each brand (or nothing), averaged across customers.
- **Undecided**: the customer's choice has low confidence; the top options are close.

The stages are measured independently, so "Believed" can be higher than "Interested". Treat results as a teaching mirror, not market research: Jev is calibrated on judgments, not validated as a predictor of real buying.
