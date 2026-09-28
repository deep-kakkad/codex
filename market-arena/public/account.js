// Sign-in, and the credit balance that goes with it.
//
// The browser does its own authentication against Netlify Identity, which means
// tokens and cookies are the library's problem rather than something hand-rolled
// here. The server never exposes a login endpoint, so there is no login-CSRF surface
// to protect. Server-side, every request re-verifies the session itself.
//
// Loaded from a CDN because this app has no build step and the package is not
// self-contained. If that ever becomes unacceptable, the alternative is bundling —
// not reimplementing the auth flow.
const ID = "https://cdn.jsdelivr.net/npm/@netlify/identity@2.0.0/+esm";
import { menuButton } from "./ui.js";

let lib = null, me = { signedIn: false }, listeners = [];
const load = async () => {
  if (lib) return lib;
  lib = await import(/* @vite-ignore */ ID);
  // Every sign-in, token renewal or confirmation rewrites the cookies; make each one last.
  try { lib.onAuthChange((event) => { if (event !== "logout") keepSignedIn(); }); } catch {}
  return lib;
};

/* ---- Staying signed in -----------------------------------------------------------
   The Identity library keeps the session in two places: the saved session in this
   browser's storage, and two cookies (nf_jwt, the access token; nf_refresh, to get a
   new one) that the server reads. It writes those cookies without an expiry, so the
   browser deletes them when it closes; on the next visit the library finds a saved
   session but no cookie and throws the session away. That, and nothing renewing the
   hour-long access token on later visits, is why people were signed out.
   So: the cookies are rewritten to last 30 days, restored from the saved session if
   the browser dropped them, and on every page load an expired token is renewed before
   the server is asked who you are. Sign-out still deletes all of it. */
const KEEP_S = 30 * 24 * 3600;
const readCookie = (name) => {
  const m = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie);
  if (!m || !m[1]) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
};
const writeCookie = (name, value) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; secure; samesite=lax; max-age=${KEEP_S}`;
};
function savedSession() {
  try { return JSON.parse(localStorage.getItem("gotrue.user") || "null")?.token || null; } catch { return null; }
}
function keepSignedIn() {
  const saved = savedSession();
  if (!saved?.access_token && !readCookie("nf_jwt")) return;   // signed out: nothing to keep
  const jwt = readCookie("nf_jwt") || saved?.access_token;
  const refresh = readCookie("nf_refresh") || saved?.refresh_token;
  if (jwt) writeCookie("nf_jwt", jwt);
  if (refresh) writeCookie("nf_refresh", refresh);
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const account = () => me;

// "Run this after sign-in". Someone who presses Run while signed out is sent to sign
// in, and signing in can leave the page: Google redirects away and back, and a new
// account confirms from a link in an email, often in another tab. Their project is
// already saved in this browser; this note says a round was waiting, so the app can
// take them back to it and run it without them setting anything up again. It expires,
// so an abandoned sign-in doesn't fire a round days later.
const PENDING = "market-arena-pending";
const PENDING_TTL = 60 * 60 * 1000;
export function rememberPending(what) {
  try { localStorage.setItem(PENDING, JSON.stringify({ ...what, at: Date.now() })); } catch {}
}
export function pendingAction() {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING) || "null");
    if (p && Date.now() - p.at < PENDING_TTL) return p;
    localStorage.removeItem(PENDING);
  } catch {}
  return null;
}
export function clearPending() { try { localStorage.removeItem(PENDING); } catch {} }
export const onAccountChange = (fn) => { listeners.push(fn); fn(me); };
const announce = () => listeners.forEach((f) => f(me));

// The server is the authority on both identity and balance. The browser knowing it
// is signed in proves nothing, so this is what the UI actually renders from.
export async function refresh() {
  try {
    const r = await fetch("/api/me", { headers: { Accept: "application/json" } });
    me = r.ok ? await r.json() : { signedIn: false };
  } catch { me = { signedIn: false }; }
  announce();
  return me;
}

function panel() {
  let el = document.getElementById("authPanel");
  if (el) return el;
  el = document.createElement("div");
  el.id = "authPanel";
  el.className = "authwrap hidden";
  el.innerHTML = `
    <div class="authscrim" data-close></div>
    <div class="authbox" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button class="authx" data-close aria-label="Close">×</button>
      <h2 id="authTitle">Sign in</h2>
      <p class="authsub" id="authSub">Your projects, rounds and credits are kept to your account.</p>
      <button class="authgoogle" id="authGoogle">Continue with Google</button>
      <p class="author"><span>or</span></p>
      <form id="authForm" novalidate>
        <label for="authEmail">Email</label>
        <input id="authEmail" type="email" autocomplete="email" required>
        <label for="authPass">Password</label>
        <input id="authPass" type="password" autocomplete="current-password" minlength="8" required>
        <p class="authmsg" id="authMsg" role="status"></p>
        <button class="btn-primary authgo" id="authGo" type="submit">Sign in</button>
      </form>
      <p class="authswap">
        <span id="authSwapText">New here?</span>
        <button class="linkish" id="authSwap" type="button">Create an account</button>
      </p>
    </div>`;
  document.body.appendChild(el);

  let mode = "login";
  const $ = (s) => el.querySelector(s);
  const msg = (t, bad) => { const m = $("#authMsg"); m.textContent = t || ""; m.className = "authmsg" + (bad ? " bad" : ""); };

  const setMode = (m) => {
    mode = m;
    $("#authTitle").textContent = m === "login" ? "Sign in" : "Create an account";
    $("#authGo").textContent = m === "login" ? "Sign in" : "Create account";
    $("#authSub").textContent = el._sub || (m === "login"
      ? "Welcome back. Your credits are right where you left them."
      : "100 free credits to start, no card. Rounds are free; a question or a research run costs 10.");
    $("#authPass").autocomplete = m === "login" ? "current-password" : "new-password";
    $("#authSwapText").textContent = m === "login" ? "New here?" : "Already have an account?";
    $("#authSwap").textContent = m === "login" ? "Create an account" : "Sign in";
    msg("");
  };
  $("#authSwap").addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));
  el.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.classList.contains("hidden")) close(); });

  $("#authGoogle").addEventListener("click", async () => {
    leaving = true;
    msg("Redirecting to Google…");
    (await load()).oauthLogin("google");
  });

  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#authEmail").value.trim(), pass = $("#authPass").value;
    if (!email || !pass) return msg("Pop in an email and a password.", true);
    if (mode === "signup" && pass.length < 8) return msg("Make the password at least 8 characters.", true);
    $("#authGo").disabled = true;
    msg(mode === "login" ? "Signing in…" : "Creating your account…");
    try {
      const { login, signup } = await load();
      if (mode === "login") { await login(email, pass); keepSignedIn(); signedInHere = true; close(); await refresh(); }
      else {
        await signup(email, pass);
        // Email confirmation is required on this project, so there is no session yet.
        // A waiting round stays waiting: the link brings them back to it.
        awaitingConfirm = true;
        msg(pendingAction()
          ? "Check your email and click the link. It signs you in and brings you straight back here to run your round."
          : "Check your email to confirm the address, then sign in.");
      }
    } catch (err) {
      msg(friendly(err), true);
    } finally { $("#authGo").disabled = false; }
  });

  el._setMode = setMode;
  el._setSub = (t) => { el._sub = t; setMode(mode); };
  return el;
}
// Closing the box without signing in drops a waiting round, unless the person is on
// their way to sign in elsewhere (Google, or the confirmation email).
let signedInHere = false, awaitingConfirm = false, leaving = false;

// The library's messages are accurate but not written for the person reading them.
function friendly(err) {
  const m = String(err?.message || err || "");
  if (/already.*registered|already exists/i.test(m)) return "That email already has an account. Try signing in.";
  if (/confirm/i.test(m)) return "Confirm your email first. The link is in your inbox.";
  if (/invalid.*grant|invalid login|bad credentials|401/i.test(m)) return "That email and password don't match. Try again?";
  if (/password/i.test(m) && /short|least/i.test(m)) return "Make the password at least 8 characters.";
  if (/network|fetch/i.test(m)) return "Couldn't reach the sign-in service. Check your connection.";
  return m.slice(0, 160) || "That didn't work. Try again.";
}

/* sub: a line saying why they're being asked, e.g. that the round they pressed Run on
   will run as soon as they're in. */
export function open(mode = "login", { sub = "" } = {}) {
  const el = panel();
  signedInHere = awaitingConfirm = leaving = false;
  el._setMode(mode);
  el._setSub(sub || "");
  el.classList.remove("hidden");
  el.querySelector("#authEmail").focus();
}
function close() {
  const el = document.getElementById("authPanel");
  if (!el || el.classList.contains("hidden")) return;
  el.classList.add("hidden");
  if (!signedInHere && !awaitingConfirm && !leaving) clearPending();
}

// "3 min ago", "2 h ago", "4 Sep": short enough for a menu line.
function ago(t) {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export async function signOut() {
  try { await (await load()).logout(); } catch {}
  // Belt and braces: the long-lived cookies and the saved session go too.
  for (const n of ["nf_jwt", "nf_refresh"]) document.cookie = `${n}=; path=/; secure; samesite=lax; max-age=0`;
  try { localStorage.removeItem("gotrue.user"); } catch {}
  await refresh();
}

// The account control in the top bar: credits and an avatar in one button, with
// the address and sign-out in its menu. Signed out, it is a quiet "Sign in".
export function mountAccountBar(host) {
  if (!host) return;
  onAccountChange((m) => {
    host.innerHTML = m.signedIn
      ? `<button class="acct-btn" type="button" aria-label="Account: ${esc(m.email)}, ${m.balance} credits">
           <span class="acct-credits">${m.balance} credits</span>
           <span class="avatar" aria-hidden="true">${esc((m.email || "?").trim().charAt(0))}</span>
         </button>`
      : `<button class="btn-quiet" type="button" data-signin>Sign in</button>`;
    const btn = host.querySelector(".acct-btn");
    // The order every SaaS account menu uses: who you are, your account, billing, sign out.
    if (btn) menuButton(btn, () => [
      { heading: m.email },
      { note: `${m.balance} credits left` },
      { separator: true },
      { label: "Account", onSelect: () => { location.href = "account.html#account"; } },
      { label: "Usage and billing", onSelect: () => { location.href = "account.html#usage"; } },
      { separator: true },
      { label: "Sign out", onSelect: signOut },
    ], { align: "end", label: "Account" });
  });
  host.addEventListener("click", (e) => {
    if (e.target.closest("[data-signin]")) open("login");
  });
}

// OAuth comes back to whatever page it left from, with the result in the URL.
export async function initAccount() {
  try {
    const id = await load();
    if (/access_token|error_description|confirmation_token|recovery_token/.test(location.hash + location.search)) {
      await id.handleAuthCallback();
      history.replaceState(null, "", location.pathname);
    }
    // Put back cookies the browser dropped, renew an expired token, then start the
    // timer that renews it again a minute before it runs out.
    keepSignedIn();
    try { await id.refreshSession(); } catch {}
    try { await id.getUser(); } catch {}
    keepSignedIn();
  } catch {}
  const m = await refresh();
  // Signed in from a link or a redirect that landed somewhere else (the confirmation
  // email opens the home page): a round was waiting, so go back to it.
  const p = pendingAction();
  if (m.signedIn && p?.page && !location.pathname.endsWith(p.page)) location.replace(p.page);
  return m;
}
