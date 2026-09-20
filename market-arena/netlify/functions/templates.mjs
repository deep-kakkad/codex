import { templates } from "../../lib/handlers.js";
export default async () => { const [code, body] = templates(); return Response.json(body, { status: code }); };
export const config = { path: "/api/templates" };
