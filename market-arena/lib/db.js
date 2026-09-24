// Neon over HTTP.
//
// Deliberately not the Postgres wire protocol. Netlify Functions are short-lived and
// open a connection per invocation, which exhausts a pooler quickly; Neon's HTTP
// endpoint is stateless and needs no pool. It is also the only route that works from
// environments that allow HTTPS and nothing else.
//
// Every value is passed as a parameter. No query in this codebase interpolates a
// value into SQL text.

const url = () => {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) throw new Error("DATABASE_URL is not set");
  return { host: new URL(dsn.replace(/^postgres(ql)?:/, "https:")).hostname, dsn };
};

export async function sql(query, params = []) {
  const { host, dsn } = url();
  const res = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: {
      "Neon-Connection-String": dsn,
      "Content-Type": "application/json",
      "Neon-Raw-Text-Output": "false",
    },
    body: JSON.stringify({ query, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`db: ${body.message || res.status}`);
  return body.rows || [];
}

export const one = async (q, p) => (await sql(q, p))[0] ?? null;
