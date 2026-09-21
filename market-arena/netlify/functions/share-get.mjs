import { getShare } from "../../lib/handlers.js";
export default async (req) => {
  if (req.method !== "GET") return Response.json({ error: "Use GET." }, { status: 405 });
  const id = new URL(req.url).pathname.split("/").pop();
  const [code, body] = await getShare(id);
  return Response.json(body, { status: code });
};
export const config = { path: "/api/share/:id" };
