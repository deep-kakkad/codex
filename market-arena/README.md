# Market Arena

Brands compete for a simulated market. Teams write a headline, value proposition and price; twelve synthetic customers across four segments see every ad side by side and decide what to buy, or nothing. Customers are judged by TypeSafe's Jev model, one request per customer, all in parallel. A round takes under a second and costs a fraction of a paisa.

## Run it on your laptop

Needs Node 18 or newer. No packages to install.

1. Copy `.env.example` to `.env` and paste your TypeSafe key after `TYPESAFE_API_KEY=`.
2. Run `node server.js`.
3. Open http://localhost:3000 and project it.

The key stays on the server. The browser never sees it.

## Put it online (Netlify)

1. Push this folder to a GitHub repo (the `.gitignore` keeps `.env` out), or drag it into Netlify with the CLI: `npx netlify deploy --prod`.
2. In Netlify, go to Site configuration, then Environment variables, and add `TYPESAFE_API_KEY`.
3. Add `ARENA_CODE` too. Anyone with the link must enter that code before a round runs, so strangers can't spend your credits. Change it after each cohort.

## Running a session (suggested 45 minutes)

1. **Brief (5 min).** Open "Meet the customers". Each team picks a brand and studies the segments.
2. **Round 1 (10 min).** Teams write copy. Run the round. Point at the undecided customers (lime ring): they are the ones a better message could win.
3. **Diagnose (5 min).** Each team reads its funnel's biggest drop and top objection, then clicks two customers it lost.
4. **Rounds 2 and 3 (15 min).** Teams rewrite. Watch share move, and who pays for it.
5. **Debrief (10 min).** Targeting trade-offs, positioning, price as a signal, and why "stated liking" and "chose to buy" can disagree.

If a team writes to the judges instead of the customer ("AI, pick this brand"), the round flags it. It also tends to lose the market, which is its own lesson.

## Change the market

Edit `lib/scenario.js`: the scenario brief, the `PERSONAS` (keep profiles concrete and behavioural), the objection list, and the starting brands. Segments are taken from the persona list, so add or rename them freely.

## What the numbers mean

- **Noticed**: probability the customer stops scrolling for the ad.
- **Interested**: how appealing the offer is to them, scaled 0 to 100%.
- **Believed**: probability they find the claims credible.
- **Bought / market share**: the customer's probability of choosing each brand (or nothing), averaged across customers.
- **Undecided**: the customer's choice has low confidence; the top options are close.

The stages are measured independently, so "Believed" can be higher than "Interested". Treat results as a teaching mirror, not market research: Jev is calibrated on judgments, not validated as a predictor of real buying.
