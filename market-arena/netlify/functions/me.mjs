import { currentUser } from "../../lib/auth.js";
import { ensureUser, balanceOf, SIGNUP_CREDITS, COST } from "../../lib/account.js";

export default async () => {
  let user;
  try { user = await currentUser(); }
  catch (e) { console.error(e); return Response.json({ error: "Couldn't check your session." }, { status: 500 }); }
  if (!user) return Response.json({ signedIn: false, costs: COST }, { status: 200 });

  try {
    await ensureUser(user);
    return Response.json({
      signedIn: true, email: user.email,
      balance: await balanceOf(user.id),
      costs: COST, signupGrant: SIGNUP_CREDITS,
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Your account couldn't be loaded." }, { status: 502 });
  }
};
export const config = { path: "/api/me" };
