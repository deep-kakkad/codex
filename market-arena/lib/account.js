// Accounts and the credit ledger.
//
// The identity comes from Netlify, verified server-side. Everything here keys off
// that verified id and never off anything the browser sent.

import { sql, one } from "./db.js";

export const SIGNUP_CREDITS = 100;
export const COST = { round: 1, ask: 10 };

// Called on every authenticated request. Creates the row on first sight and grants
// the free allowance once — the grant is guarded by a unique index rather than by
// this code remembering, so a race or a retry cannot mint a second one.
export async function ensureUser(user) {
  await sql(
    `INSERT INTO users (id, email) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET last_seen_at = now(), email = EXCLUDED.email`,
    [user.id, user.email],
  );
  try {
    await sql(
      `INSERT INTO credit_entries (user_id, delta, reason, note)
       VALUES ($1, $2, 'signup', 'Free allowance on first sign-in')`,
      [user.id, SIGNUP_CREDITS],
    );
  } catch (e) {
    // The partial unique index rejects a second grant. That is the desired outcome,
    // not an error worth surfacing; anything else is.
    if (!/credit_entries_one_signup|duplicate key/.test(e.message)) throw e;
  }
  return user.id;
}

export async function balanceOf(userId) {
  const row = await one(`SELECT balance FROM credit_balances WHERE user_id = $1`, [userId]);
  return row?.balance ?? 0;
}

// Charge atomically. The debit is inserted only if the balance still covers it, in
// one statement, so two requests arriving together cannot both pass a check-then-act
// and overdraw the account. Returns the new balance, or null when there is not enough.
export async function spend(userId, reason, ref = null) {
  const cost = COST[reason];
  if (!cost) throw new Error(`unknown cost: ${reason}`);
  const rows = await sql(
    `INSERT INTO credit_entries (user_id, delta, reason, ref)
     SELECT $1, $2, $3, $4
     WHERE (SELECT COALESCE(SUM(delta), 0) FROM credit_entries WHERE user_id = $1) >= $5
     RETURNING id`,
    [userId, -cost, reason, ref, cost],
  );
  if (!rows.length) return null;
  return balanceOf(userId);
}

// Give it back when the work we charged for did not happen.
export async function refund(userId, reason, ref, note) {
  await sql(
    `INSERT INTO credit_entries (user_id, delta, reason, ref, note)
     VALUES ($1, $2, 'refund', $3, $4)`,
    [userId, COST[reason] ?? 0, ref, note || `Refund for a failed ${reason}`],
  );
  return balanceOf(userId);
}

export async function logAsk(userId, roundId, question, out, error) {
  await sql(
    `INSERT INTO ask_log (user_id, round_id, question, answer, model, input_tokens, cached_tokens, output_tokens, ms, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [userId, roundId, question, out?.answer ?? null, out?.model ?? "unknown",
     out?.inputTokens ?? null, out?.cachedTokens ?? null, out?.outputTokens ?? null,
     out?.ms ?? null, error ?? null],
  );
}

// Credits bought through Stripe. The session id is the reference, and the entry is
// only written if that reference has never been credited, so a webhook Stripe
// retries cannot pay out twice.
export async function creditTopup(userId, credits, ref, note) {
  const rows = await sql(
    `INSERT INTO credit_entries (user_id, delta, reason, ref, note)
     SELECT $1, $2, 'topup', $3, $4
     WHERE NOT EXISTS (SELECT 1 FROM credit_entries WHERE reason = 'topup' AND ref = $3)
     RETURNING id`,
    [userId, credits, ref, note],
  );
  return rows.length > 0;
}

// The ledger, in words a person reads.
function describe(e) {
  if (e.reason === "signup") return "Welcome credits";
  if (e.reason === "topup") return e.note || "Bought credits";
  if (e.reason === "refund") return "Refund for a failed request";
  if (e.reason === "adjust") return e.note || "Adjustment";
  if (e.reason === "round") return e.ref?.startsWith("page:") ? `Version from a page: ${e.ref.slice(5)}` : "Round";
  if (e.reason === "ask") return e.ref?.startsWith("research:") ? `Research: ${e.ref.slice(9)}`
    : e.ref?.startsWith("buyers:") ? `Buyers from your data: ${e.ref.slice(7)}` : "Question about a round";
  return e.reason;
}

export async function usageOf(userId, limit = 50) {
  const rows = await sql(
    `SELECT delta, reason, ref, note, created_at FROM credit_entries
     WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((e) => ({ at: e.created_at, delta: Number(e.delta), what: describe(e), reason: e.reason }));
}
