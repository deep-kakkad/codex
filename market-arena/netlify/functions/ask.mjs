import { askRound } from "../../lib/handlers.js";
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  const text = await req.text();
  if (text.length > 120000) return Response.json({ error: "Request too large." }, { status: 413 });
  const [code, body] = await askRound(text);
  return Response.json(body, { status: code });
};
export const config = { path: "/api/ask" };
