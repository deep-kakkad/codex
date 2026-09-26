// The versions, shown the way a marketer will actually ship them: as a social post,
// a search ad, a landing page, an email, or a plain card.
//
// A format is a way of looking at the same words. The buyers read the same fields
// whichever one is picked, so the switcher never changes a result; it only changes
// how the ads are shown to the person running the test. Every mock is generic:
// no platform's logo, name or colours, just the shape of the placement.

import { sentences } from "./ad-parts.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Each option carries a small outline of its placement, so the switcher reads as
// "pick how the ad looks" at a glance rather than as a row of words.
const svg = (d) => `<svg class="fmt-ic" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const FORMATS = [
  { key: "card", label: "Card", short: "Card", icon: svg('<rect x="2.5" y="3" width="11" height="10" rx="2"/><path d="M5 6.2h6M5 8.4h6M5 10.6h3.5"/>') },
  { key: "social", label: "Social post", short: "Social", icon: svg('<rect x="3" y="1.8" width="10" height="12.4" rx="2"/><circle cx="5.4" cy="4.3" r=".6" fill="currentColor" stroke="none"/><rect x="5" y="6.3" width="6" height="5" rx=".8"/>') },
  { key: "search", label: "Search ad", short: "Search", icon: svg('<circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3.3 3.3"/>') },
  { key: "landing", label: "Landing page", short: "Landing", icon: svg('<rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.8"/><path d="M1.8 5.6h12.4"/><circle cx="3.9" cy="4.2" r=".45" fill="currentColor" stroke="none"/><circle cx="5.4" cy="4.2" r=".45" fill="currentColor" stroke="none"/><rect x="4.2" y="7.6" width="7.6" height="3.2" rx=".8" fill="currentColor" stroke="none" opacity=".35"/>') },
  { key: "email", label: "Email", short: "Email", icon: svg('<rect x="2" y="3.5" width="12" height="9" rx="1.6"/><path d="m2.6 4.6 5.4 4.2 5.4-4.2"/>') },
];
export const FORMAT_KEYS = FORMATS.map((f) => f.key);
export const formatOf = (k) => (FORMAT_KEYS.includes(k) ? k : "card");

// A field the user hasn't written yet shows as a quiet placeholder in the builder,
// and is simply left out in the report.
const field = (v, empty, draft) => (v && String(v).trim() ? esc(v) : draft ? `<span class="ap-empty">${empty}</span>` : "");
const initial = (name) => esc((String(name || "?").trim()[0] || "?").toUpperCase());

const I = {
  heart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m21 3-9.5 9.5M21 3l-6.5 18-3-8.5L3 9.5 21 3Z"/></svg>',
  save: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/></svg>',
};

/* ad: { brand, headline, valueProp, price, extras: { subheadline, cta, offer, proof, audience, visual } }
   draft: true in the builder, where empty fields show what is still missing.
   marks: in the report, what did the work: { id, parts: { key: { pull: 1|2|0, push: bool, title } } }.
   A marked part is drawn with a highlighter (it convinced buyers) or a wavy underline
   (it put them off), and opens its evidence when selected. */
export function adMock(ad, format, { draft = false, marks = null } = {}) {
  const x = ad.extras || {};
  const mk = (key, html) => {
    const m = marks?.parts?.[key];
    if (!m || !html) return html;
    const cls = [m.pull === 1 ? "mk-pull1" : m.pull === 2 ? "mk-pull2" : "", m.push ? "mk-push" : ""].filter(Boolean).join(" ");
    return cls ? `<span class="mk ${cls}" data-investigate="part:${marks.id}:${key}" role="button" tabindex="0" title="${esc(m.title)}">${html}</span>` : html;
  };
  const brand = field(ad.brand, "Unnamed", draft) || "Brand";
  const headline = mk("headline", field(ad.headline, "No headline yet", draft));
  const body = marks ? sentences(ad.valueProp).map((t, i) => mk(`body${i + 1}`, esc(t))).join(" ") : field(ad.valueProp, "No value proposition yet", draft);
  const price = mk("price", field(ad.price, "No price", draft));
  const cta = x.cta ? mk("cta", esc(x.cta)) : "Learn more";
  const subTxt = x.subheadline ? mk("subheadline", esc(x.subheadline)) : "";
  const sub = subTxt ? `<p class="m-sub">${subTxt}</p>` : "";
  const offerTxt = x.offer ? mk("offer", esc(x.offer)) : "";
  const offer = offerTxt ? `<span class="m-offer">${offerTxt}</span>` : "";
  const proof = x.proof ? mk("proof", esc(x.proof)) : "";
  const audience = x.audience ? mk("audience", esc(x.audience)) : "";
  const visual = x.visual ? `<span class="m-visual">${mk("visual", esc(x.visual))}</span>` : "";

  switch (formatOf(format)) {
    case "social":
      return `<div class="mock m-social">
        <div class="ms-head"><span class="m-avatar">${initial(ad.brand)}</span><span class="ms-who"><b>${brand}</b><span>Sponsored</span></span><span class="ms-more">${I.more}</span></div>
        <p class="ms-caption">${body}</p>
        <div class="ms-media">${audience ? `<span class="m-eyebrow">${audience}</span>` : ""}<span class="ms-hl">${headline}</span>${sub}${visual}</div>
        <div class="ms-cta"><span class="ms-cta-l">${offer || `<span class="m-price">${price}</span>`}</span><span class="ms-btn">${cta}</span></div>
        ${proof ? `<p class="ms-proof">${proof}</p>` : ""}
        <div class="ms-actions">${I.heart}${I.chat}${I.send}<span class="ms-sp"></span>${I.save}</div>
      </div>`;
    case "search":
      return `<div class="mock m-search">
        <span class="mse-spon">Sponsored</span>
        <div class="mse-site"><span class="m-avatar sm">${initial(ad.brand)}</span><span><b>${brand}</b></span></div>
        <p class="mse-title">${headline}${subTxt ? ` <span class="mse-sep">|</span> ${subTxt}` : ""}</p>
        <p class="mse-desc">${body}${proof ? ` ${proof}` : ""}</p>
        <div class="mse-links"><span>${price}</span>${offerTxt ? `<span>${offerTxt}</span>` : ""}<span>${cta}</span></div>
      </div>`;
    case "landing":
      return `<div class="mock m-landing">
        <div class="ml-bar"><span class="ml-url">${brand}</span></div>
        <div class="ml-nav"><b>${brand}</b><i></i><i></i><i></i><span class="ml-nav-btn">${cta}</span></div>
        <div class="ml-hero">
          ${audience ? `<span class="m-eyebrow">${audience}</span>` : ""}
          <p class="ml-hl">${headline}</p>
          <p class="ml-body">${subTxt || body}</p>
          <div class="ml-ctas"><span class="ml-btn">${cta}</span><span class="m-price">${price}</span></div>
          ${offerTxt ? `<p class="ml-offer">${offerTxt}</p>` : ""}
          ${proof ? `<p class="ml-proof">${I.check}${proof}</p>` : ""}
        </div>
        <div class="ml-media">${visual || `<span class="ml-mono" aria-hidden="true">${initial(ad.brand)}</span>`}</div>
      </div>`;
    case "email":
      return `<div class="mock m-email">
        <div class="me-row me-dim"><i></i><i></i></div>
        <div class="me-row me-ad">
          <span class="m-avatar">${initial(ad.brand)}</span>
          <div class="me-main">
            <div class="me-top"><b>${brand}</b><span class="me-tag">Ad</span><span class="me-time">9:41</span></div>
            <p class="me-subj">${headline}</p>
            <p class="me-pre">${subTxt ? subTxt + " " : ""}${body}</p>
            <div class="me-chips"><span>${price}</span>${offerTxt ? `<span>${offerTxt}</span>` : ""}</div>
          </div>
          <span class="me-star">${I.star}</span>
        </div>
        <div class="me-row me-dim"><i></i><i></i></div>
      </div>`;
    default:
      return `<div class="mock m-card">
        <p class="mc-hl">${headline}</p>
        ${sub}
        <p class="mc-body">${body}</p>
        ${[["Call to action", "cta"], ["Offer", "offer"], ["Proof", "proof"], ["For", "audience"], ["Visual", "visual"]].filter(([, k]) => x[k]).map(([label, k]) => `<p class="pitch-x"><span class="xk">${label}</span>${mk(k, esc(x[k]))}</p>`).join("")}
        <p class="mc-price">${price}</p>
      </div>`;
  }
}

// The segmented control that picks a format. `name` keeps two switchers on one
// page (the builder and the report) from answering each other's clicks.
export function formatSwitch(current, name) {
  const cur = formatOf(current);
  return `<div class="seg-ctl fmt-switch" role="radiogroup" aria-label="Show the ads as">${FORMATS.map((f) =>
    `<button type="button" class="psize fmt-btn${f.key === cur ? " active" : ""}" role="radio" aria-checked="${f.key === cur}" data-fmt="${f.key}" data-fmt-for="${name}" aria-label="${f.label}">${f.icon}<span class="fl">${f.label}</span><span class="fs" aria-hidden="true">${f.short}</span></button>`).join("")}</div>`;
}
