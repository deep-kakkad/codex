import { currentUser } from "../../lib/auth.js";
import { ensureUser, balanceOf, usageOf, COST } from "../../lib/account.js";
import { billingEnabled, publicPacks } from "../../lib/billing.js";

// The signed-in user's balance and ledger, newest first.
export default async () => {
  const user = await currentUser().catch(() => null);
  if (!user) return Response.json({ error: "Sign in to see your usage." }, { status: 401 });
  try {
    await ensureUser(user);
    const [balance, entries] = await Promise.all([balanceOf(user.id), usageOf(user.id, 100)]);
    return Response.json({ balance, entries, costs: COST, billing: { enabled: billingEnabled(), packs: publicPacks() } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't load your usage." }, { status: 502 });
  }
};
export const config = { path: "/api/usage" };
