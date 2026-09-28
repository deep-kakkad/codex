// Writes the static pages that are made from data rather than by hand:
//   public/use/*.html   one page per use case, for people searching for that job
//   public/changelog.html
//   public/sitemap.xml, public/robots.txt
// Run after changing anything below:  node scripts/build-pages.mjs
// The output is committed, so the site still deploys with no build step.
import { writeFile, mkdir } from "node:fs/promises";
import { TEMPLATES } from "../lib/templates.js";
import { adMock } from "../public/ad-formats.js";

const SITE = "https://market-arena-dk.netlify.app";
const OUT = new URL("../public/", import.meta.url);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLORS = ["var(--b1)", "var(--b2)", "var(--b3)", "var(--b4)"];
const FAVICON = `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><circle cx='7.0' cy='33.0' r='5.6' fill='%23121212'/><circle cx='12.0' cy='21.0' r='5.6' fill='%23121212'/><circle cx='24.0' cy='16.0' r='5.6' fill='%23121212'/><circle cx='36.0' cy='21.0' r='5.6' fill='%23FF5A36'/><circle cx='41.0' cy='33.0' r='5.6' fill='%23121212'/><rect x='4' y='41.5' width='40' height='3.4' rx='1.7' fill='%23121212' opacity='.4'/></svg>">`;

/* ---- Use cases -----------------------------------------------------------------
   Each page answers one search ("test my SaaS headline") with the product doing
   exactly that: a real ready-made case, its real ads in the format that job uses,
   and a button that opens that case. No invented numbers or customers; the voice
   rules in docs/voice.md apply. */
const USES = [
  {
    slug: "saas-headline", case: "saas-projectflow", fmt: "landing",
    kicker: "For SaaS and B2B teams", nav: "SaaS headlines",
    title: "Test your SaaS headline before you ship it",
    sub: "Put two to four headlines in front of simulated buyers: operators, IT buyers, freelancers and team leads. See which one they pick, who walked away, and the exact line that put them off.",
    fight: "Two project tools, one crowded market",
    fightSub: "FlowStack sells everything in one place. TaskNest sells simplicity. Same buyers, same moment, side by side.",
    learn: [
      "Which headline each group of buyers picks, and by how much.",
      "The line in each ad that did the work, and the line that cost it.",
      "Why the rest said no: price, doubt, the wrong fit, or a confusing offer.",
      "What to change for round 2, so the next test tells you something new.",
    ],
    faq: [
      ["Can I test my real homepage copy?", "Yes. Paste a page link and the version fills itself from what the page says, or type the copy in. Test it against a rewrite, or against a competitor's page."],
      ["Who are the buyers?", "Simulated people with written profiles, in groups you can edit. The ready-made case has operators, IT buyers, freelancers and team leads. You can add your own, or draft them from your reviews and interview notes."],
      ["Does it replace an A/B test?", "No. It tells you which versions deserve a real test and which to drop before you spend on traffic."],
    ],
  },
  {
    slug: "pricing-message", case: "fintech-app", fmt: "card",
    kicker: "For pricing and packaging", nav: "Pricing messages",
    title: "Test how you say your price",
    sub: "\"Free, then $3 a month\" and \"$6.99 a month\" land differently on different people. See who picks which, and how many walk away because of the price itself.",
    fight: "Two money apps, two ways to charge",
    fightSub: "Sprout starts free and charges later. Ledgerly charges a flat monthly fee. Buyers from four groups see both.",
    learn: [
      "How often \"the price feels too high\" is the reason people pass, for each version.",
      "Which groups the price scares off, and which it doesn't.",
      "Whether a cheaper-looking price wins, or a clearer one.",
      "How many buyers walk away from every option.",
    ],
    faq: [
      ["Can I test only the price line?", "Yes. Keep everything else identical and change just the price. Then the difference in the result is what the price was worth."],
      ["Can I add an offer or a free trial?", "Yes. Switch on the offer field before round 1 and every version gets one, so the comparison stays fair."],
      ["Is this real willingness to pay?", "No. The buyers are simulated. Use it to narrow down which price framings to test for real."],
    ],
  },
  {
    slug: "product-ad", case: "retail-dtc", fmt: "social",
    kicker: "For DTC and e-commerce brands", nav: "Product ads",
    title: "Test your product ad before you pay for clicks",
    sub: "See which ad buyers would stop scrolling for, which one they believe, and which one they'd actually buy from. Then spend on the one that earned it.",
    fight: "Two clothing labels in the same feed",
    fightSub: "Wearhouse sells movement and free returns. Fieldnote sells fewer, better clothes. Shown as social posts, the way they'd really appear.",
    learn: [
      "Who stops scrolling for each ad, and who scrolls past.",
      "Whether buyers believe the claim, not just like it.",
      "Which group each ad wins: parents, repeat shoppers, gift buyers, Gen Z.",
      "The single line that put buyers off, marked on the ad itself.",
    ],
    faq: [
      ["Can I test the image too?", "Yes. Upload each version's image. The buyers read what's on it (the words, what it shows, the layout), so they judge the whole ad. They can't judge how good it looks."],
      ["Which formats can I preview?", "Card, social post, search ad, landing page and email. The buyers read the same words in every format; the format only changes how it looks to you."],
      ["How many ads can I test at once?", "Two to four versions per round, in front of 4 to 16 buyers."],
    ],
  },
  {
    slug: "new-category-launch", case: "cpg-coffee", fmt: "card",
    kicker: "For launches and new categories", nav: "Launches",
    title: "Launching something people have never tried?",
    sub: "When buyers don't know the category yet, the first message decides everything. Test energy, purity and fun against each other and see who each one wins.",
    fight: "Cold brew comes to India",
    fightSub: "Three brands, three stories: BrewRush sells energy, PureBean sells purity, ChillSip sells fun. Most of these buyers have never had cold brew.",
    learn: [
      "Which story wins with people who have never tried the category.",
      "Where each ad loses people: noticed, interested, believed, bought.",
      "How many buyers walk away from all of them, the real size of the challenge.",
      "Which group to launch to first.",
    ],
    faq: [
      ["Can the buyers know about my market?", "Yes. Research the market before round 1 and every buyer reads the strongest findings from research, news and social chatter first. It costs 10 credits and locks in for the project."],
      ["Can I use my own customer research?", "Yes. Paste reviews, interview notes or survey answers and draft buyers from them. You approve every buyer before they join."],
      ["What does it cost?", "New accounts get 100 free credits. Rounds are free during the beta; research, image reading and questions cost credits."],
    ],
  },
  {
    slug: "landing-page-copy", case: "saas-projectflow", fmt: "landing",
    kicker: "For landing pages", nav: "Landing pages",
    title: "Test your landing page copy against a competitor's",
    sub: "Paste your page and a competitor's. Each becomes a version, filled from what the page actually says. Then see who buyers pick, and why.",
    fight: "Your page against theirs",
    fightSub: "Shown here with the ready-made project-tool case. Put your own pages in with one link each.",
    learn: [
      "Whether your page wins the buyers you're after, or theirs does.",
      "Which of your lines is doing the work, marked on the page.",
      "The group you're losing, and the reason they give.",
      "One change to try next, and a round that measures it.",
    ],
    faq: [
      ["How does it read a page?", "It fetches the page once, pulls out the name, headline, value proposition and price, and marks every field as the page's exact words or condensed. It costs 1 credit and the page isn't stored."],
      ["Can I compare more than two pages?", "Up to four versions per round."],
      ["Can I share the result?", "Yes. Every round has a share link that opens the report read-only."],
    ],
  },
  {
    slug: "email-copy", case: "fintech-app", fmt: "email",
    kicker: "For email and lifecycle", nav: "Email copy",
    title: "Test your email copy before the send",
    sub: "Two versions of the same email, one panel of simulated readers. See which one they'd act on, and which line lost the rest.",
    fight: "Two money apps, one inbox",
    fightSub: "The same ads shown as emails. The buyers read the same words; the format is how you see it.",
    learn: [
      "Which email the most readers would act on.",
      "The line that convinced them, and the one that put them off.",
      "Which groups each email loses.",
      "What to rewrite before the real send.",
    ],
    faq: [
      ["Does it test subject lines?", "It tests the message: headline, body, price and any fields you switch on. Put the subject line in the headline to test it on its own."],
      ["Can I add a call to action?", "Yes. Switch on the call to action field before round 1 and every version gets one."],
      ["Is it a send-time or deliverability test?", "No. It's about what the message says and who it persuades."],
    ],
  },
];

const head = (title, desc, path, extra = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${FAVICON}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wdth,wght@0,75..100,400..700;1,75..100,400..700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${path.includes("/") ? "../" : ""}styles.css">
<title>${esc(title)} | Market Arena</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<link rel="canonical" href="${SITE}/${path}">
${extra}</head>`;

const topbar = (up, here) => `<header class="topbar">
  <div class="wrap tb-inner">
    <a class="tb-brand" href="${up}" aria-label="Market Arena home"><span id="logoSlot"></span><span class="tb-name">Market Arena</span></a>
    <span class="tb-sep brand-sep" aria-hidden="true">/</span>
    ${here}
    <div class="tb-spacer"></div>
    <div class="tb-actions"><div class="acct" id="acctBar"></div><a class="btn-primary" href="${up}practice.html">Start a project</a></div>
  </div>
</header>`;

const footer = (up) => `<footer class="h-foot">
  <div class="wrap h-foot-grid">
    <div class="hf-brand"><a class="tb-brand" href="${up}"><span id="footMark"></span><span>Market Arena</span></a>
      <p>Test your ads on simulated buyers before you spend on real ones.</p></div>
    <nav class="hf-col" aria-label="Product"><h4>Product</h4><a href="${up}practice.html">Start a project</a><a href="${up}roast.html">Roast my ad</a><a href="${up}pricing.html">Pricing</a><a href="${up}changelog.html">What's new</a></nav>
    <nav class="hf-col" aria-label="Use cases"><h4>Use cases</h4>${USES.map((u) => `<a href="${up}use/${u.slug}.html">${esc(u.nav)}</a>`).join("")}</nav>
  </div>
  <div class="wrap h-foot-base"><span>Buyers are simulated by TypeSafe's Jev model. Use the results to pick what deserves a real test. They are not market research.</span></div>
</footer>
<script type="module">
import { LOGO_MARK } from "${up}icons.js";
import { initAccount, mountAccountBar } from "${up}account.js";
document.getElementById("logoSlot").innerHTML = LOGO_MARK(22);
document.getElementById("footMark").innerHTML = LOGO_MARK(20);
mountAccountBar(document.getElementById("acctBar"));
initAccount();
</script>
</body>
</html>
`;

function usePage(u) {
  const t = TEMPLATES.find((x) => x.id === u.case);
  const segs = [...new Set(t.personas.map((p) => p.segment))];
  const ads = t.defaultTeams.map((b, i) => `<figure class="adf" style="--c:${COLORS[i]}">${adMock({ ...b, extras: {} }, u.fmt)}
      <figcaption class="adf-meta"><span class="sw" style="background:var(--c)"></span><b>${esc(b.brand)}</b></figcaption></figure>`).join("");
  const ld = { "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: u.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  const others = USES.filter((x) => x.slug !== u.slug);
  return `${head(u.title, u.sub, `use/${u.slug}.html`, `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n`)}
<body class="uc-page">
${topbar("../", `<a class="tb-here" href="./">Use cases</a>`)}

<main class="wrap page uc">
  <div class="uc-head">
    <span class="rst-kicker">${esc(u.kicker)}</span>
    <h1>${esc(u.title)}</h1>
    <p class="sub">${esc(u.sub)}</p>
    <div class="uc-cta"><a class="btn-primary" href="../practice.html?case=${u.case}">Open this case</a><a class="btn" href="../roast.html">Roast one ad free</a></div>
  </div>

  <section class="uc-fight" aria-labelledby="fightH">
    <h2 id="fightH">${esc(u.fight)}</h2>
    <p>${esc(u.fightSub)}</p>
    <div class="pitches ads fmt-${u.fmt}">${ads}</div>
    <p class="uc-cap">From the ready-made case “${esc(t.scenario.title)}”, with buyers from ${segs.length} groups: ${segs.map(esc).join(", ").replace(/, ([^,]*)$/, " and $1")}. Open it to run it as it is, or put your own ads in.</p>
  </section>

  <section class="uc-sec" aria-labelledby="howH">
    <h2 id="howH">How it works</h2>
    <ol class="uc-steps">
      <li><b>Write two to four versions.</b><span>Type them, paste a page link, or upload each version's image.</span></li>
      <li><b>Pick your buyers.</b><span>Use the case's panel, edit it, or draft buyers from your own reviews and notes.</span></li>
      <li><b>Run the round.</b><span>Every buyer reads every version and picks one, or walks away. You watch them decide.</span></li>
    </ol>
  </section>

  <section class="uc-sec" aria-labelledby="learnH">
    <h2 id="learnH">What you find out</h2>
    <ul class="uc-learn">${u.learn.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
  </section>

  <section class="uc-sec" aria-labelledby="faqH">
    <h2 id="faqH">Questions</h2>
    <div class="uc-faq">${u.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>
  </section>

  <section class="uc-honest">
    <b>The honest part.</b> The buyers are simulated. A round tells you which versions deserve a real test and which to drop, not how many you'll sell.
  </section>

  <section class="uc-sec" aria-labelledby="moreH">
    <h2 id="moreH">Other ways people use it</h2>
    <div class="uc-more">${others.map((x) => `<a href="${x.slug}.html"><b>${esc(x.title)}</b><span>${esc(x.kicker)}</span></a>`).join("")}</div>
  </section>

  <div class="uc-end"><a class="btn-primary" href="../practice.html?case=${u.case}">Open this case</a><span>100 free credits when you sign up. No card.</span></div>
</main>

${footer("../")}`;
}

function useIndex() {
  const desc = "Headlines, prices, product ads, launches, landing pages and emails: test any of them on simulated buyers before you spend on the real thing.";
  return `${head("What people test with Market Arena", desc, "use/")}
<body class="uc-page">
${topbar("../", `<span class="tb-here">Use cases</span>`)}
<main class="wrap page uc">
  <div class="uc-head">
    <span class="rst-kicker">Use cases</span>
    <h1>What do you want to test?</h1>
    <p class="sub">${esc(desc)}</p>
  </div>
  <div class="uc-more uc-index">${USES.map((x) => `<a href="${x.slug}.html"><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></a>`).join("")}</div>
  <div class="uc-end"><a class="btn" href="../roast.html">Roast one ad free</a><span>No sign-up. Eight buyers, one verdict.</span></div>
</main>
${footer("../")}`;
}

/* ---- Changelog -----------------------------------------------------------------
   What changed, in the product's own words. Newest first. The entry marked `next`
   is on the draft and not live yet; give it its date the day it ships. */
const CHANGES = [
  { date: null, next: true, title: "The next release", items: [
    ["Roast my ad", "Paste one ad, free and without signing up. Eight buyers decide whether they'd buy it, and you see what worked, what put them off and why the rest passed."],
    ["Round 2 is the obvious next step", "Under each result, one card per version shows its weakest spot. It opens the editor on exactly that field. A bar at the bottom counts your changes and warns when one version has two. Round 2 then opens with what you changed and what it moved."],
    ["Test the real image ad", "Upload each version's image. The buyers read what's on it and judge the whole ad. Each image is read once and never stored."],
    ["Start a version from a web page", "Paste a link and the version fills itself from what the page says, each field marked as the page's exact words or condensed."],
    ["See what did the work", "Every ad is marked up: the line that convinced buyers, and the line that put them off."],
    ["Buyers from your own data", "Paste reviews, interview notes or survey answers and draft buyers from them. You approve every one."],
    ["Buyer groups", "Add a buyer to a specific group, start a new group, move people between groups and rename groups in place."],
    ["A moment for the result", "When the last buyer sits down, the verdict arrives on its own before the report. If a version you rewrote wins clearly, it says so."],
    ["Before and after", "From round 2, each rewritten version shows last round's ad next to this round's, with what changed marked on both."],
    ["Save a round as an image", "One picture of the room, the verdict and the bars, for a slide or a post. It says the buyers are simulated."],
    ["Writing tips as you type", "A quiet line under a field when something may trip buyers up: a price with no amount, a claim with nothing behind it. Free, and easy to dismiss."],
    ["Projects save themselves", "No Save button. Once you change anything, the project is in Your projects, kept up to date as you work, with “Saved” next to its name."],
    ["Undo instead of “are you sure?”", "Removing a buyer or a version happens at once, with Undo to put it back where it was."],
    ["One place to share and export", "Share shows the picture people will see, the link and exactly who can see what. Export puts image, PDF and CSV in one box."],
    ["Staying signed in", "You now stay signed in between visits and after closing the browser."],
    ["Rounds need a free account", "Rounds are still free. If you press Run while signed out, your project waits and the round runs the moment you're in."],
    ["Smaller things", "Case cards show each case's real ads. Paid extras are edged in gold. Our own dialogs replace the browser's. Buyers you can turn over to read their profile. A 3D room on the homepage. Use-case pages, and this changelog."],
  ] },
  { date: "2026-09-26", title: "Real ad formats", items: [
    ["See your ads the way they'd run", "Preview every version as a card, a social post, a search ad, a landing page or an email. Buyers read the same words in every format."],
  ] },
  { date: "2026-09-25", title: "Watch the room decide", items: [
    ["Buyers decide live", "Each buyer takes a seat as they decide, then the room sorts itself by the version they picked."],
    ["Evidence behind every number", "Click any number in the report to see who is behind it and what they said no to."],
    ["Brief your buyers on the real market", "Before round 1, research the market. Every buyer reads the strongest findings first. 10 credits."],
    ["Pricing and usage", "A pricing page, and a page showing where your credits went."],
  ] },
  { date: "2026-09-24", title: "Accounts, credits and fairer rounds", items: [
    ["Accounts", "Sign in with email or Google. New accounts get 100 free credits, no card."],
    ["Ask what you want to find out", "Pick the question a round should settle, and the report answers it first."],
    ["Test more than the words", "Switch on a subheadline, call to action, offer, proof point or audience line before round 1."],
    ["Fairer rounds", "Each buyer sees the versions in a different order, so no ad wins just by being first. The buyer model is pinned, so an old round's numbers never move."],
  ] },
  { date: "2026-09-21", title: "Round after round", items: [
    ["Compare rounds", "Switch between rounds, see what you changed and which buyers changed their mind."],
    ["Share and export", "Share a read-only link to any round, or download it as a PDF or CSV."],
    ["Why they said no, at a glance", "A heatmap of every version against every reason people passed."],
  ] },
  { date: "2026-09-20", title: "Market Arena, first version", items: [
    ["Simulated buyers pick between your ads", "Write two to four versions, and a panel of simulated buyers reads them side by side and picks one, or walks away."],
  ] },
];
const fmtDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function changelog() {
  const desc = "What's new in Market Arena: every change to the product, newest first.";
  return `${head("What's new", desc, "changelog.html")}
<body class="cl-page">
${topbar("./", `<span class="tb-here">What's new</span>`)}
<main class="wrap page page-narrow cl">
  <div class="uc-head">
    <span class="rst-kicker">Changelog</span>
    <h1>What's new</h1>
    <p class="sub">Every change to Market Arena, newest first, in plain words.</p>
  </div>
  <ol class="cl-list">
    ${CHANGES.map((c) => `
    <li class="cl-rel${c.next ? " next" : ""}">
      <div class="cl-when">${c.next ? `<span class="cl-soon">Coming next</span>` : `<time datetime="${c.date}">${fmtDate(c.date)}</time>`}</div>
      <div class="cl-body">
        <h2>${esc(c.title)}</h2>
        ${c.items.map(([h, p]) => `<div class="cl-item"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}
      </div>
    </li>`).join("")}
  </ol>
</main>
${footer("./")}`;
}

/* ---- Sitemap and robots ----------------------------------------------------- */
const today = new Date().toISOString().slice(0, 10);
const URLS = ["", "practice.html", "roast.html", "pricing.html", "changelog.html", "use/", ...USES.map((u) => `use/${u.slug}.html`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${URLS.map((u) => `  <url><loc>${SITE}/${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
const robots = `User-agent: *
Disallow: /api/
Disallow: /account.html
Disallow: /shared.html
Sitemap: ${SITE}/sitemap.xml
`;

await mkdir(new URL("use/", OUT), { recursive: true });
for (const u of USES) await writeFile(new URL(`use/${u.slug}.html`, OUT), usePage(u));
await writeFile(new URL("use/index.html", OUT), useIndex());
await writeFile(new URL("changelog.html", OUT), changelog());
await writeFile(new URL("sitemap.xml", OUT), sitemap);
await writeFile(new URL("robots.txt", OUT), robots);
console.log(`wrote ${USES.length} use-case pages, the index, changelog.html, sitemap.xml, robots.txt`);
