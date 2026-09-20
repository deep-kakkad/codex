import { round } from "../../lib/handlers.js";
export default async (req, context) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  const text = await req.text();
  if (text.length > 20000) return Response.json({ error: "Request too large." }, { status: 413 });
  const [code, body] = await round(text, req.headers.get("x-arena-code"), context?.ip);
  return Response.json(body, { status: code });
};
export const config = { path: "/api/round" };
