import { currentUser } from "../../lib/auth.js";
import { ensureUser, balanceOf, usageOf, SIGNUP_CREDITS, COST } from "../../lib/account.js";
import { billingEnabled, publicPacks } from "../../lib/billing.js";

export default async () => {
  let user;
  try { user = await currentUser(); }
  catch (e) { console.error(e); return Response.json({ error: "Couldn't check your session." }, { status: 500 }); }
  if (!user) return Response.json({ signedIn: false, costs: COST, billing: { enabled: billingEnabled(), packs: publicPacks() } }, { status: 200 });

  try {
    await ensureUser(user);
    const [balance, recent] = await Promise.all([balanceOf(user.id), usageOf(user.id, 3)]);
    return Response.json({
      signedIn: true, email: user.email, balance, recent,
      costs: COST, signupGrant: SIGNUP_CREDITS, billing: { enabled: billingEnabled(), packs: publicPacks() },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Your account couldn't be loaded." }, { status: 502 });
  }
};
export const config = { path: "/api/me" };
