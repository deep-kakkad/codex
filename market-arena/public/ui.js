// Two small interface primitives the app pages share: a popover menu and toasts.
//
// Menus follow the WAI-ARIA menu button pattern: the button says it has a menu and
// whether it is open, arrow keys move through the items, Escape closes and hands
// focus back to the button, and a click anywhere else closes it. Only one menu is
// ever open at a time.

export const ICON = {
  chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  more: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  turn: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9"/><path d="M18.5 3.5v3.8h-3.8M5.5 20.5v-3.8h3.8"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

let open = null; // { el, button, align }

// Items hidden by CSS (desktop-only or phone-only entries) are skipped by the keys.
function items(el) {
  return [...el.querySelectorAll(".menu-item:not([aria-disabled='true'])")].filter((b) => b.getClientRects().length);
}

export function closeMenu(returnFocus = true) {
  if (!open) return;
  const { el, button } = open;
  open = null;
  el.remove();
  button.setAttribute("aria-expanded", "false");
  if (returnFocus) button.focus();
}

function place(el, button, align) {
  const r = button.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight, pad = 8;
  let left = align === "end" ? r.right - w : r.left;
  left = Math.max(pad, Math.min(left, innerWidth - w - pad));
  let top = r.bottom + 6;
  // Open upwards when there is no room below, rather than off the bottom of the screen.
  if (top + h > innerHeight - pad && r.top - 6 - h > pad) top = r.top - 6 - h;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function build(list, label) {
  const el = document.createElement("div");
  el.className = "menu";
  el.setAttribute("role", "menu");
  if (label) el.setAttribute("aria-label", label);
  list.filter(Boolean).forEach((it) => {
    if (it.separator) {
      const s = document.createElement("div");
      s.className = `menu-sep${it.className ? " " + it.className : ""}`; s.setAttribute("role", "separator");
      return el.append(s);
    }
    if (it.heading || it.note) {
      const n = document.createElement("div");
      n.className = `${it.heading ? "menu-head" : "menu-note"}${it.className ? " " + it.className : ""}`;
      n.textContent = it.heading || it.note;
      return el.append(n);
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = `menu-item${it.danger ? " danger" : ""}${it.className ? " " + it.className : ""}`;
    b.setAttribute("role", it.checked == null ? "menuitem" : "menuitemradio");
    b.tabIndex = -1;
    if (it.checked != null) b.setAttribute("aria-checked", String(Boolean(it.checked)));
    if (it.disabled) b.setAttribute("aria-disabled", "true");
    if (it.checked != null) b.insertAdjacentHTML("beforeend", `<span class="mi-check">${it.checked ? ICON.check : ""}</span>`);
    const lab = document.createElement("span");
    lab.className = "mi-label"; lab.textContent = it.label;
    b.append(lab);
    if (it.meta) {
      const m = document.createElement("span");
      m.className = "mi-meta"; m.textContent = it.meta;
      b.append(m);
    }
    b.addEventListener("click", () => {
      if (it.disabled) return;
      closeMenu(false);
      it.onSelect?.();
    });
    el.append(b);
  });
  return el;
}

function show(button, list, { align = "start", label } = {}) {
  closeMenu(false);
  const el = build(list, label);
  document.body.append(el);
  place(el, button, align);
  button.setAttribute("aria-expanded", "true");
  open = { el, button, align };
  el.addEventListener("keydown", (e) => {
    const all = items(el), i = all.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); all[(i + 1) % all.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); all[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); all[all.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if (e.key === "Tab") closeMenu(false);
  });
  return el;
}

// Wires a button to a menu. `getItems` runs on every open, so the menu always
// reflects the current state rather than whatever it was when the page loaded.
export function menuButton(button, getItems, opts = {}) {
  if (!button || button.dataset.menuBound) return;
  button.dataset.menuBound = "1";
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    if (open?.button === button) return closeMenu(false);
    const el = show(button, getItems(), opts);
    // A keyboard press lands on the first item; a mouse click leaves focus alone.
    if (e.detail === 0) items(el)[0]?.focus();
  });
  button.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const el = open?.button === button ? open.el : show(button, getItems(), opts);
    const all = items(el);
    (e.key === "ArrowDown" ? all[0] : all[all.length - 1])?.focus();
  });
}

document.addEventListener("pointerdown", (e) => {
  if (open && !open.el.contains(e.target) && !open.button.contains(e.target)) closeMenu(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && open) { e.stopPropagation(); closeMenu(true); }
}, true);
addEventListener("resize", () => closeMenu(false));
// The page scrolling under an open menu moves it with its button, and closes it only
// once the button itself has left the screen. Closing on any scroll made the menu
// vanish the moment focus nudged the page, which kept keyboard users out of it.
addEventListener("scroll", (e) => {
  if (!open || open.el.contains(e.target)) return;
  const r = open.button.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return closeMenu(false);
  place(open.el, open.button, open.align);
}, true);

/* ---- Toasts ------------------------------------------------------------------
   For confirmations and failures that don't belong to one field: a link copied, a
   project saved, a round that could not run. Field problems stay on the field. */
let host = null;

export function toast(message, { tone = "info", timeout, sticky = false } = {}) {
  if (!host || !host.isConnected) {
    host = document.createElement("div");
    host.className = "toasts";
    document.body.append(host);
  }
  const t = document.createElement("div");
  t.className = `toast${tone === "error" ? " error" : ""}`;
  t.setAttribute("role", tone === "error" ? "alert" : "status");
  const msg = document.createElement("span");
  msg.className = "toast-msg"; msg.textContent = message;
  const x = document.createElement("button");
  x.className = "toast-x"; x.type = "button"; x.setAttribute("aria-label", "Dismiss"); x.textContent = "×";
  t.append(msg, x);
  let gone = false;
  const dismiss = () => {
    if (gone) return; gone = true;
    t.classList.add("out");
    setTimeout(() => t.remove(), 160);
  };
  x.addEventListener("click", dismiss);
  host.append(t);
  while (host.children.length > 3) host.firstElementChild.remove();
  if (!sticky) setTimeout(dismiss, timeout ?? (tone === "error" ? 8000 : 3500));
  return dismiss;
}
