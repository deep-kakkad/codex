import { prepareRoast, roastStream } from "../../lib/roast.js";

// Roast my ad: free, no account, streamed as the buyers decide.
export default async (req, context) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  const text = await req.text();
  if (text.length > 4000) return Response.json({ error: "Request too large." }, { status: 413 });
  const prep = await prepareRoast(text, context?.ip);
  if (prep.error) return Response.json(prep.error[1], { status: prep.error[0] });
  return new Response(roastStream(prep), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
};
export const config = { path: "/api/roast" };
