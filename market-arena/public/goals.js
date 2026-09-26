// The Experiment Brief.
//
// A test without a stated question is just a number you can rationalise afterwards.
// So the brief is captured before the first round, and it is not decoration: the goal
// chooses which figure the report leads with and gets answered in that figure's own
// terms. Change the goal and the hero says something different about the same round.
//
// Every answer is assembled from the round's own numbers. None of it is generated.

const pct = (v) => `${Math.round(v * 100)}%`;
const rank = (r) => [...r.brands].sort((a, b) => b.share - a.share);
const panel = (r) => r.panel ?? r.customers.length;
const picks = (r, id) => {
  const src = id === "none" ? r.noPurchase : r.brands.find((b) => b.id === id);
  return src?.picks ?? r.customers.filter((c) => c.purchase === id).length;
};
// How far apart the segments are on the same version: the real "who is this for" signal.
function spread(r, b) {
  const vals = r.segments.map((s) => b.bySegment[s] ?? 0);
  const hi = Math.max(...vals), lo = Math.min(...vals);
  return { hi, lo, gap: hi - lo, best: r.segments[vals.indexOf(hi)], worst: r.segments[vals.indexOf(lo)] };
}

export const GOALS = [
  {
    key: "positioning",
    q: "Which angle lands?",
    hint: "Same product, different ways to sell it. You want to know which one people buy.",
    metric: "who wins, and whether they win everywhere",
    answer(r) {
      const [win, second] = rank(r);
      const gap = Math.round((win.share - second.share) * 100);
      const sp = spread(r, win);
      if (gap < 5) return `Not yet. <b>${win.brand}</b> and <b>${second.brand}</b> are at ${pct(win.share)} and ${pct(second.share)}, close enough that a re-run could flip them. Your angles are too alike to separate. Push one further and run again.`;
      if (sp.gap >= .3) return `<b>${win.brand}</b> wins at ${pct(win.share)}, but mostly thanks to one group: ${pct(sp.hi)} with <b>${sp.best}</b>, ${pct(sp.lo)} with <b>${sp.worst}</b>. That's an angle for a slice of the market, not all of it.`;
      return `<b>${win.brand}</b>. It wins at ${pct(win.share)}, ${gap} points clear, and holds between ${pct(sp.lo)} and ${pct(sp.hi)} in every group. That's an angle that travels.`;
    },
  },
  {
    key: "price",
    q: "Is the price the problem?",
    hint: "You've set a price and suspect it's the thing losing you the sale.",
    metric: "how much of the 'no' is about price",
    answer(r) {
      const [win] = rank(r);
      const p = win.objections?.price ?? 0;
      const others = Object.entries(win.objections || {}).filter(([k]) => k !== "none" && k !== "price");
      const top = others.sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > p) return `No. Price is only ${pct(p)} of what's stopping people from picking <b>${win.brand}</b>. Something else is ${pct(top[1])}. Fix that first. A discount here would mostly give money away.`;
      return `Probably. Price is the biggest reason people pass on <b>${win.brand}</b>, at ${pct(p)} of the "no". Test it properly: change only the price and run again. If the numbers barely move, price was never the real problem.`;
    },
  },
  {
    key: "urgency",
    q: "Do people need this now?",
    hint: "People get what it is. You're not sure they feel they need it.",
    metric: "how many buyers walk away from all of them",
    answer(r) {
      const none = picks(r, "none"), n = panel(r);
      const share = r.noPurchase.share;
      if (none === 0 && share < .1) return `Yes. All ${n} buyers picked something, and the chance of walking away was just ${pct(share)}. Nobody treats this as optional. The question is which version, not whether.`;
      if (none / n >= .25) return `<b>${none} of ${n} buyers bought nothing at all.</b> That's not a copy problem, it's a need problem. No rewrite fixes it. Go and check with real people that the problem hurts enough to pay for.`;
      return `Somewhat. ${none} of ${n} buyers walked away, and the average chance of buying nothing was ${pct(share)}. Urgency is a soft spot, not a deal-breaker.`;
    },
  },
  {
    key: "attention",
    q: "Which one stops the scroll?",
    hint: "You're testing headlines and want the one people actually notice.",
    metric: "who gets noticed, before liking or believing",
    answer(r) {
      const byAttn = [...r.brands].sort((a, b) => b.funnel.attention - a.funnel.attention);
      const top = byAttn[0], [win] = rank(r);
      if (top.id !== win.id) return `<b>${top.brand}</b> gets noticed most, at ${pct(top.funnel.attention)}, but <b>${win.brand}</b> wins the round. So attention isn't the issue. ${top.brand} gets seen, then loses people further down.`;
      return `<b>${top.brand}</b>. ${pct(top.funnel.attention)} noticed it, against ${pct(byAttn[1].funnel.attention)} for ${byAttn[1].brand}. It gets seen and it gets picked. That headline is earning its keep.`;
    },
  },
  {
    key: "audience",
    q: "Who is this really for?",
    hint: "Forget the words for a second. You want to know which group to aim at.",
    metric: "how far one ad swings between groups",
    answer(r) {
      const rows = r.brands.map((b) => ({ b, sp: spread(r, b) })).sort((x, y) => y.sp.gap - x.sp.gap);
      const { b, sp } = rows[0];
      if (sp.gap < .15) return `Everyone, roughly. No group pulls away: the biggest swing is <b>${b.brand}</b>, and it only moves ${Math.round(sp.gap * 100)} points between ${sp.best} and ${sp.worst}. Treat this market as one audience.`;
      return `<b>${sp.best}</b>. <b>${b.brand}</b> gets ${pct(sp.hi)} there and ${pct(sp.lo)} with ${sp.worst}. Same words, a ${Math.round(sp.gap * 100)}-point swing. Who you aim at matters more here than anything you could rewrite.`;
    },
  },
  {
    key: "demand",
    q: "Does anyone want this?",
    hint: "Very early days. Before you build it, you want a gut check.",
    metric: "walkaways, and how strong the best version is",
    answer(r) {
      const [win] = rank(r);
      const none = picks(r, "none"), n = panel(r);
      if (none / n >= .3) return `Not on this panel. <b>${none} of ${n}</b> bought nothing, even with your best version in front of them. Before you write another word, find out from real people whether this problem is worth paying to fix.`;
      if (win.share < .35) return `A little. Your best version gets only ${pct(win.share)}, and ${none} of ${n} walked away. That's not a yes. It's a reason to go and talk to real buyers.`;
      return `Yes, on this panel. <b>${win.brand}</b> gets ${pct(win.share)}: ${picks(r, win.id)} of ${n} buyers made it their top pick and ${none === 0 ? "nobody" : `only ${none}`} walked away. Now put it in front of real people. That's the only test that settles this one.`;
    },
  },
];

export const GOAL_BY_KEY = Object.fromEntries(GOALS.map((g) => [g.key, g]));
