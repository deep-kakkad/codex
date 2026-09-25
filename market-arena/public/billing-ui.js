// Shared by the pricing and account pages: how a pack is shown and bought.
import { toast } from "./ui.js";
import { account, open as openSignIn } from "./account.js";

export const money = (cents, currency = "usd") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// A pack card. What a person can do with the credits is said in actions, not in
// credits, because "200 credits" means nothing until you know what one buys.
export function packCard(p, { featured = false, ask = 10 } = {}) {
  const m = account();
  const enabled = m.billing?.enabled;
  const actions = Math.floor(p.credits / ask);
  const button = !enabled
    ? `<button class="btn" type="button" disabled>Coming soon</button>`
    : m.signedIn
      ? `<button class="${featured ? "btn-primary" : "btn"}" type="button" data-buy="${esc(p.id)}">Buy ${esc(p.label)}</button>`
      : `<button class="btn" type="button" data-buy-signin>Sign in to buy</button>`;
  return `<div class="pack${featured ? " featured" : ""}">
    ${featured ? `<span class="pack-tag">Most teams start here</span>` : ""}
    <span class="pack-price">${money(p.cents, p.currency)}</span>
    <span class="pack-credits">${esc(p.label)}</span>
    <span class="pack-use">About ${actions.toLocaleString()} questions or research runs, ${money(Math.round(p.cents / actions), p.currency)} each</span>
    ${button}
  </div>`;
}

document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-buy-signin]")) return openSignIn("login");
  const b = e.target.closest("[data-buy]");
  if (!b) return;
  b.disabled = true;
  const label = b.textContent; b.textContent = "Opening checkout…";
  try {
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack: b.dataset.buy }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.url) throw new Error(d.error || "Couldn't start the payment.");
    location.href = d.url;
  } catch (err) {
    toast(err.message, { tone: "error" });
    b.disabled = false; b.textContent = label;
  }
});
