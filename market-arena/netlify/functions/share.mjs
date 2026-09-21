import { share } from "../../lib/handlers.js";
export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  const text = await req.text();
  if (text.length > 40000) return Response.json({ error: "Request too large." }, { status: 413 });
  const [code, body] = await share(text);
  return Response.json(body, { status: code });
};
export const config = { path: "/api/share" };
