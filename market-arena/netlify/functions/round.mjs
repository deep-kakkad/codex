import { round, prepareRound, roundStream } from "../../lib/handlers.js";

// Two shapes of the same endpoint. A client that asks for application/x-ndjson gets
// each buyer's decision as it lands, then the full result; anything else gets the
// one JSON result it always did. Validation errors are plain JSON either way.
export default async (req, context) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  const text = await req.text();
  if (text.length > 32000) return Response.json({ error: "Request too large." }, { status: 413 });
  const code = req.headers.get("x-arena-code");

  if ((req.headers.get("accept") || "").includes("application/x-ndjson")) {
    const prep = prepareRound(text, code, context?.ip);
    if (prep.error) return Response.json(prep.error[1], { status: prep.error[0] });
    return new Response(roundStream(prep), {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  }

  const [status, body] = await round(text, code, context?.ip);
  return Response.json(body, { status });
};
export const config = { path: "/api/round" };
