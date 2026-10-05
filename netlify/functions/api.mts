import type { Config } from '@netlify/functions';
import serverless from 'serverless-http';
import { backgroundGenerationQueue } from '../../server/ai/generateFamily';
import { backgroundFunctionQueue } from '../../server/ai/queue';
import { createApp } from '../../server/app';
import { netlifyBackupStore } from '../../server/backup';
import { DEMO_ORG_ID } from '../../server/demo';
import { one } from '../../server/db';
import { GENERATE_PATH, REVIEW_PATH, runtime, siteUrl } from '../lib/runtime';

// The Express API as a Netlify function on /api/*. serverless-http speaks the
// Lambda event format, so the web Request is translated to that and back.
type LambdaHandler = (
  event: object,
  context: object,
) => Promise<{
  statusCode: number;
  headers?: Record<string, string | number | boolean>;
  multiValueHeaders?: Record<string, (string | number | boolean)[]>;
  body?: string;
  isBase64Encoded?: boolean;
}>;

let handler: Promise<LambdaHandler> | null = null;

async function init(): Promise<LambdaHandler> {
  const { db, files, ai } = runtime();
  const { app } = createApp({
    db,
    files,
    backups: netlifyBackupStore(),
    ai,
    secureCookies: true,
    trustProxy: true,
    queue: (deps) => backgroundFunctionQueue(deps, `${siteUrl()}${REVIEW_PATH}`),
    generationQueue: (deps) => backgroundGenerationQueue(deps, `${siteUrl()}${GENERATE_PATH}`),
  });
  // DEMO_SEED=1: if the demo workspace doesn't exist yet, a background function creates it.
  if (process.env.DEMO_SEED === '1' && !(await one(db, 'SELECT id FROM orgs WHERE id = ?', DEMO_ORG_ID))) {
    await fetch(`${siteUrl()}/internal/seed-demo`, { method: 'POST', signal: AbortSignal.timeout(3000) }).catch(
      () => undefined,
    );
  }
  // Every response body comes back base64 so binary audio survives the round trip.
  return serverless(app, { binary: () => true }) as unknown as LambdaHandler;
}

export default async (req: Request) => {
  handler ??= init();
  const url = new URL(req.url);
  const body = req.method === 'GET' || req.method === 'HEAD' ? '' : Buffer.from(await req.arrayBuffer());
  const query: Record<string, string[]> = {};
  url.searchParams.forEach((value, key) => (query[key] ??= []).push(value));
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => (headers[key] = value));

  const result = await (
    await handler
  )(
    {
      httpMethod: req.method,
      path: url.pathname,
      headers,
      multiValueQueryStringParameters: query,
      body: body ? body.toString('base64') : '',
      isBase64Encoded: Boolean(body),
    },
    {},
  );

  const out = new Headers();
  for (const [key, value] of Object.entries(result.headers ?? {})) out.set(key, String(value));
  for (const [key, values] of Object.entries(result.multiValueHeaders ?? {})) {
    out.delete(key);
    for (const value of values) out.append(key, String(value));
  }
  const payload = result.body ? Buffer.from(result.body, result.isBase64Encoded ? 'base64' : 'utf8') : null;
  return new Response(payload, { status: result.statusCode, headers: out });
};

export const config: Config = { path: '/api/*' };
