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
