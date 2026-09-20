import { scenario } from "../../lib/handlers.js";
export default async () => { const [code, body] = scenario(); return Response.json(body, { status: code }); };
export const config = { path: "/api/scenario" };
