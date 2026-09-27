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

/* ---- Dialogs -----------------------------------------------------------------
   Our own confirm and prompt, in place of the browser's. A card that rises out of
   a dimmed page (a sheet from the bottom on a phone), with a small icon saying what
   kind of decision it is, plain words, and buttons named after what they do, never
   "OK". The safe choice is on the left; the one the dialog is about is on the right.

   ask({ title, body, icon, art, tone, input, actions }) resolves to the chosen
   action's value, the typed text for an input's main action, or null when dismissed
   (Escape, the ×, or a click outside). A destructive dialog opens with focus on the
   safe choice, so a stray Enter never deletes anything. */
const DLG_IC = {
  loop: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7"/><path d="M20 4v4.7h-4.7"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3"/><path d="M4 20v-4.7h4.7"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  save: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M16 7l2.5 2.5M14 9l1.5 1.5"/>',
};
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function ask({ title, body = "", icon = null, art = "", tone = "default", input = null, actions = [{ label: "Cancel", value: null }, { label: "OK", value: true, kind: "primary" }] }) {
  return new Promise((resolve) => {
    const before = document.activeElement;
    const id = `dlg${Date.now().toString(36)}`;
    const wrap = document.createElement("div");
    wrap.className = `dlg-wrap${tone === "danger" ? " danger" : ""}`;
    wrap.innerHTML = `
      <div class="dlg-scrim" data-dlg-close></div>
      <div class="dlg" role="${input ? "dialog" : "alertdialog"}" aria-modal="true" aria-labelledby="${id}-t"${body ? ` aria-describedby="${id}-b"` : ""}>
        <button type="button" class="dlg-x" data-dlg-close aria-label="Close">×</button>
        ${icon && DLG_IC[icon] ? `<span class="dlg-ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${DLG_IC[icon]}</svg></span>` : ""}
        <h2 class="dlg-t" id="${id}-t">${escHtml(title)}</h2>
        ${body ? `<p class="dlg-b" id="${id}-b">${escHtml(body)}</p>` : ""}
        ${art ? `<div class="dlg-art" aria-hidden="true">${art}</div>` : ""}
        ${input ? `<form class="dlg-form" novalidate><label for="${id}-i">${escHtml(input.label || "")}</label>
          <input id="${id}-i" autocomplete="off" maxlength="${input.max || 120}" value="${escHtml(input.value || "")}" placeholder="${escHtml(input.placeholder || "")}"></form>` : ""}
        <div class="dlg-acts">${actions.map((a, i) => `<button type="button" class="${a.kind === "primary" ? (tone === "danger" ? "btn-danger" : "btn-primary") : "btn"}" data-dlg-act="${i}">${escHtml(a.label)}</button>`).join("")}</div>
      </div>`;
    document.body.append(wrap);
    const dlg = wrap.querySelector(".dlg"), field = wrap.querySelector("input");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => wrap.classList.add("in"));
    const primary = actions.findIndex((a) => a.kind === "primary");
    let done = false;
    const finish = (value) => {
      if (done) return; done = true;
      document.removeEventListener("keydown", onKey, true);
      wrap.classList.remove("in"); wrap.classList.add("out");
      setTimeout(() => wrap.remove(), reduce ? 0 : 180);
      if (before?.isConnected) before.focus?.({ preventScroll: true });
      resolve(value);
    };
    const choose = (i) => {
      const a = actions[i];
      if (input && i === primary) {
        const v = field.value.trim();
        if (!v) { field.focus(); field.classList.add("dlg-shake"); setTimeout(() => field.classList.remove("dlg-shake"), 400); return; }
        return finish(v);
      }
      finish(a.value === undefined ? true : a.value);
    };
    wrap.addEventListener("click", (e) => {
      if (e.target.closest("[data-dlg-close]")) return finish(null);
      const b = e.target.closest("[data-dlg-act]");
      if (b) choose(+b.dataset.dlgAct);
    });
    wrap.querySelector(".dlg-form")?.addEventListener("submit", (e) => { e.preventDefault(); choose(primary); });
    // Keyboard: Escape dismisses, Tab stays inside the dialog.
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return finish(null); }
      if (e.key !== "Tab") return;
      const f = [...dlg.querySelectorAll("button, input")];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
    document.addEventListener("keydown", onKey, true);
    const safe = actions.findIndex((a) => a.kind !== "primary");
    const first = field || wrap.querySelector(`[data-dlg-act="${tone === "danger" && safe >= 0 ? safe : Math.max(primary, 0)}"]`);
    first?.focus({ preventScroll: true });
    if (field) field.select();
  });
}
// The two everyday shapes.
export const confirmBox = ({ ok = "Continue", cancel = "Cancel", ...rest }) =>
  ask({ ...rest, actions: [{ label: cancel, value: false }, { label: ok, value: true, kind: "primary" }] }).then((v) => v === true);
export const promptBox = ({ label = "", value = "", placeholder = "", max, ok = "Save", cancel = "Cancel", ...rest }) =>
  ask({ ...rest, input: { label, value, placeholder, max }, actions: [{ label: cancel, value: null }, { label: ok, kind: "primary" }] });
