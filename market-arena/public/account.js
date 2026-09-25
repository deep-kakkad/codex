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
const load = async () => (lib ||= await import(/* @vite-ignore */ ID));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const account = () => me;
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
    $("#authSub").textContent = m === "login"
      ? "Your projects, rounds and credits are kept to your account."
      : "You get 100 credits to start. Asking a question or running research costs 10.";
    $("#authPass").autocomplete = m === "login" ? "current-password" : "new-password";
    $("#authSwapText").textContent = m === "login" ? "New here?" : "Already have an account?";
    $("#authSwap").textContent = m === "login" ? "Create an account" : "Sign in";
    msg("");
  };
  $("#authSwap").addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));
  el.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.classList.contains("hidden")) close(); });

  $("#authGoogle").addEventListener("click", async () => {
    msg("Redirecting to Google…");
    (await load()).oauthLogin("google");
  });

  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#authEmail").value.trim(), pass = $("#authPass").value;
    if (!email || !pass) return msg("Enter an email and a password.", true);
    if (mode === "signup" && pass.length < 8) return msg("Use at least 8 characters.", true);
    $("#authGo").disabled = true;
    msg(mode === "login" ? "Signing in…" : "Creating your account…");
    try {
      const { login, signup } = await load();
      if (mode === "login") { await login(email, pass); await refresh(); close(); }
      else {
        await signup(email, pass);
        // Email confirmation is required on this project, so there is no session yet.
        msg("Check your email to confirm the address, then sign in.");
      }
    } catch (err) {
      msg(friendly(err), true);
    } finally { $("#authGo").disabled = false; }
  });

  el._setMode = setMode;
  return el;
}

// The library's messages are accurate but not written for the person reading them.
function friendly(err) {
  const m = String(err?.message || err || "");
  if (/already.*registered|already exists/i.test(m)) return "That email already has an account. Try signing in.";
  if (/confirm/i.test(m)) return "Confirm your email address first — check your inbox.";
  if (/invalid.*grant|invalid login|bad credentials|401/i.test(m)) return "That email and password don't match.";
  if (/password/i.test(m) && /short|least/i.test(m)) return "Use at least 8 characters.";
  if (/network|fetch/i.test(m)) return "Couldn't reach the sign-in service. Check your connection.";
  return m.slice(0, 160) || "That didn't work. Try again.";
}

export function open(mode = "login") {
  const el = panel();
  el._setMode(mode);
  el.classList.remove("hidden");
  el.querySelector("#authEmail").focus();
}
function close() { document.getElementById("authPanel")?.classList.add("hidden"); }

export async function signOut() {
  try { (await load()).logout(); } catch {}
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
    if (btn) menuButton(btn, () => [
      { heading: m.email },
      { note: `${m.balance} credits left. Asking a question or running research costs ${m.costs?.ask ?? 10}.` },
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
    const { handleAuthCallback } = await load();
    if (/access_token|error_description|confirmation_token|recovery_token/.test(location.hash + location.search)) {
      await handleAuthCallback();
      history.replaceState(null, "", location.pathname);
    }
  } catch {}
  return refresh();
}
