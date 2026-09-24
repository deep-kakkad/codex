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
    q: "Which positioning resonates?",
    hint: "You have more than one way to frame the same product and want to know which one lands.",
    metric: "Choice share, and whether the winner holds across segments",
    answer(r) {
      const [win, second] = rank(r);
      const gap = Math.round((win.share - second.share) * 100);
      const sp = spread(r, win);
      if (gap < 5) return `No. <b>${win.brand}</b> and <b>${second.brand}</b> are ${pct(win.share)} against ${pct(second.share)} — inside the noise of a re-run. This round does not separate your framings; change one of them more sharply and run again.`;
      if (sp.gap >= .3) return `<b>${win.brand}</b> leads overall at ${pct(win.share)}, but it is doing that on one segment: ${pct(sp.hi)} with <b>${sp.best}</b> against ${pct(sp.lo)} with <b>${sp.worst}</b>. That is a positioning that works for a slice, not a market.`;
      return `<b>${win.brand}</b>, at ${pct(win.share)} and ${gap} points clear, holding between ${pct(sp.lo)} and ${pct(sp.hi)} across every segment. It is the framing that travels.`;
    },
  },
  {
    key: "price",
    q: "Is the price credible?",
    hint: "The number is set and you want to know whether it is what is costing you the sale.",
    metric: "Price objection weight, and what it costs the leader",
    answer(r) {
      const [win] = rank(r);
      const p = win.objections?.price ?? 0;
      const others = Object.entries(win.objections || {}).filter(([k]) => k !== "none" && k !== "price");
      const top = others.sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > p) return `Price is not your problem here. It carries ${pct(p)} of the objection weight against <b>${win.brand}</b>, behind ${pct(top[1])} on something else. Fix that first — a discount would buy you very little.`;
      return `Price is the leading objection against <b>${win.brand}</b> at ${pct(p)} of its objection weight. That is worth one controlled test: change the price, hold everything else, and see whether share actually moves. If it barely does, the price was never the binding constraint.`;
    },
  },
  {
    key: "urgency",
    q: "Does this solve an urgent problem?",
    hint: "You suspect people understand the product and simply do not feel they need it.",
    metric: "How many buyers walk away rather than choose anything",
    answer(r) {
      const none = picks(r, "none"), n = panel(r);
      const share = r.noPurchase.share;
      if (none === 0 && share < .1) return `Every one of the ${n} buyers chose something, and the panel carried only ${pct(share)} probability of walking away. Nobody is treating this as optional — the question is which version, not whether.`;
      if (none / n >= .25) return `<b>${none} of ${n} buyers bought nothing at all.</b> That is a category problem, not a copy problem. No rewrite of these versions fixes it; the thing to test with real people is whether the problem is felt at all.`;
      return `${none} of ${n} buyers walked away, with ${pct(share)} average probability of buying nothing. Real but not dominant: urgency is a weak point here rather than the blocker.`;
    },
  },
  {
    key: "attention",
    q: "Which version earns attention?",
    hint: "You are testing headlines and want to know which one stops the scroll.",
    metric: "The Noticed stage, before appeal or belief get involved",
    answer(r) {
      const byAttn = [...r.brands].sort((a, b) => b.funnel.attention - a.funnel.attention);
      const top = byAttn[0], [win] = rank(r);
      if (top.id !== win.id) return `<b>${top.brand}</b> gets noticed most at ${pct(top.funnel.attention)}, but <b>${win.brand}</b> wins the round. Attention is not your constraint — ${top.brand} is being seen and then losing people later.`;
      return `<b>${top.brand}</b>, at ${pct(top.funnel.attention)} noticed against ${pct(byAttn[1].funnel.attention)} for ${byAttn[1].brand}. It both gets seen and converts, so the headline is doing its job.`;
    },
  },
  {
    key: "audience",
    q: "Who is this actually for?",
    hint: "You want to know which segment to aim at, not which words to use.",
    metric: "How far the same version swings between segments",
    answer(r) {
      const rows = r.brands.map((b) => ({ b, sp: spread(r, b) })).sort((x, y) => y.sp.gap - x.sp.gap);
      const { b, sp } = rows[0];
      if (sp.gap < .15) return `No segment is pulling away. Your widest swing is <b>${b.brand}</b>, and even that only moves ${Math.round(sp.gap * 100)} points between ${sp.best} and ${sp.worst}. On this panel the market is not segmenting — treat it as one audience.`;
      return `<b>${sp.best}</b>. <b>${b.brand}</b> takes ${pct(sp.hi)} there against ${pct(sp.lo)} with ${sp.worst}, a ${Math.round(sp.gap * 100)}-point swing on identical copy. That gap is the audience decision, and it is larger than any wording change in this round.`;
    },
  },
  {
    key: "demand",
    q: "Should we build this at all?",
    hint: "Earliest possible stage. You want a read on whether anyone wants it.",
    metric: "Walkaways and the strength of the best result available",
    answer(r) {
      const [win] = rank(r);
      const none = picks(r, "none"), n = panel(r);
      if (none / n >= .3) return `On this panel, no. <b>${none} of ${n}</b> bought nothing even from the best version on offer. Before writing another word of copy, go and find out from real people whether this problem is worth paying to solve.`;
      if (win.share < .35) return `Weakly. Your best version takes only ${pct(win.share)} and ${none} of ${n} walked away. Nothing here is a clear yes — treat it as a prompt to talk to real buyers, not as a green light.`;
      return `On this panel the interest is real: <b>${win.brand}</b> takes ${pct(win.share)} with ${picks(r, win.id)} of ${n} buyers picking it outright and ${none === 0 ? "nobody" : `only ${none}`} walking away. Worth putting in front of real people — which is the only test that answers this properly.`;
    },
  },
];

export const GOAL_BY_KEY = Object.fromEntries(GOALS.map((g) => [g.key, g]));
