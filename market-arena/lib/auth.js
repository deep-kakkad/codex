// Who is making this request.
//
// getUser() from @netlify/identity verifies the session cookie server-side. The v1
// `context.clientContext.user` pattern that most tutorials show does NOT work in v2
// functions — the context arrives empty, the check silently yields undefined, and the
// usual workaround is decoding the JWT without verifying it, which is a complete auth
// bypass. Never do that; this is the only way a user is identified in this codebase.

export async function currentUser() {
  // Local development has no Identity endpoint. This shim is the only way to be
  // someone locally, and it refuses to work anywhere that looks like production.
  if (process.env.DEV_USER_EMAIL) {
    const onNetlify = process.env.NETLIFY === "true" || process.env.AWS_LAMBDA_FUNCTION_NAME;
    if (onNetlify) throw new Error("DEV_USER_EMAIL must never be set in a deployed environment");
    return { id: "dev_" + process.env.DEV_USER_EMAIL, email: process.env.DEV_USER_EMAIL };
  }
  const { getUser } = await import("@netlify/identity");
  const user = await getUser();
  if (!user?.id || !user?.email) return null;
  return { id: user.id, email: user.email };
}
