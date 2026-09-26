// Switching an ad between formats (card, social post, search ad, landing page, email)
// moves the same words to new places. Instead of the page swapping one layout for
// another, each part glides from where it was to where it now sits: the headline,
// the body, the price, the button, the picture, the brand. Parts are matched by the
// `data-mp` marker each format puts on them; anything only one format has fades in.
//
// A FLIP animation: measure first, render the new layout, then play each part from
// its old place to its new one using transforms only, so nothing reflows while it
// moves. Positions are taken relative to each ad's own box, and the box itself moves
// and resizes separately, so the two never add up twice. Reduced motion: no glide.

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const DUR = 460;
const EASE = "cubic-bezier(.3,.7,.2,1)";

function snapshot(container) {
  return [...container.children].map((fig) => {
    const box = fig.getBoundingClientRect();
    const parts = new Map();
    fig.querySelectorAll("[data-mp]").forEach((el) => {
      const r = el.getBoundingClientRect();
      parts.set(el.dataset.mp, { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, fs: parseFloat(getComputedStyle(el).fontSize) || 16 });
    });
    return { box, parts };
  });
}

export function morphFormat(container, render) {
  if (!container || reduced() || !container.offsetParent || !container.animate) return render();
  const before = snapshot(container);
  render();
  const figs = [...container.children];
  figs.forEach((fig, i) => {
    const was = before[i];
    if (!was) return;
    const box = fig.getBoundingClientRect();
    // The ad's box: from its old place and size to its new one.
    fig.style.overflow = "hidden";
    fig.animate([
      { transform: `translate(${was.box.left - box.left}px, ${was.box.top - box.top}px)`, height: `${was.box.height}px` },
      { transform: "none", height: `${box.height}px` },
    ], { duration: DUR, easing: EASE }).finished.finally(() => { fig.style.overflow = ""; });
    const moved = new Set();
    fig.querySelectorAll("[data-mp]").forEach((el) => {
      const a = was.parts.get(el.dataset.mp);
      if (!a) return;
      moved.add(el);
      const r = el.getBoundingClientRect();
      const x = r.left - box.left, y = r.top - box.top;
      // Text scales with its type size so its shape holds; a picture scales to its box.
      const pic = el.dataset.mp === "i";
      const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
      const sx = pic ? a.w / Math.max(1, r.width) : a.fs / fs;
      const sy = pic ? a.h / Math.max(1, r.height) : a.fs / fs;
      el.animate([
        { transform: `translate(${a.x - x}px, ${a.y - y}px) scale(${sx}, ${sy})`, transformOrigin: "0 0" },
        { transform: "none", transformOrigin: "0 0" },
      ], { duration: DUR, easing: EASE });
    });
    // What only the new format has (its chrome, a proof line, the action icons) fades in
    // once the moving parts are mostly home.
    fig.querySelectorAll(".mock *").forEach((el) => {
      if (moved.has(el) || el.closest("[data-mp]") || el.querySelector("[data-mp]")) return;
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: DUR * 0.45, easing: "ease-out", fill: "backwards" });
    });
  });
}
