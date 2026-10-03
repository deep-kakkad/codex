import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Minimal async database interface. Production uses Netlify Database
 * (Postgres via its pool); local development and tests use PGlite, an
 * in-process Postgres, so the SQL is the same everywhere.
 */
export interface DB {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

/** Anything with pg's `query(text, values)` shape (pg.Pool, Neon Pool). */
export function fromPgPool(pool: {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;
}): DB {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
  };
}

/**
 * Neon's HTTP client (what Netlify Database uses in production). It refreshes
 * its credentials itself, so it is safe to keep for a container's lifetime.
 */
export function fromNeonHttp(client: {
  query: (
    text: string,
    values: unknown[],
    options: { fullResults: true },
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
}): DB {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await client.query(sql, params, { fullResults: true });
      return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
    },
  };
}

/** Resolved lazily: bundled serverless functions never read migrations (Netlify applies them). */
function migrationsDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'netlify', 'database', 'migrations');
}

/** The migration files Netlify applies on deploy, in order. */
export function migrationFiles(dir = migrationsDir()): { name: string; sql: string }[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), 'utf8') }));
}

/** `?` placeholders (easier to read) become Postgres `$n`. */
function toPg(sql: string) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

export async function one<T>(db: DB, sql: string, ...params: unknown[]): Promise<T | undefined> {
  return (await db.query<T>(toPg(sql), params)).rows[0];
}

export async function all<T>(db: DB, sql: string, ...params: unknown[]): Promise<T[]> {
  return (await db.query<T>(toPg(sql), params)).rows;
}

export async function run(db: DB, sql: string, ...params: unknown[]): Promise<{ changes: number }> {
  return { changes: (await db.query(toPg(sql), params)).rowCount };
}

// Row types --------------------------------------------------------------

export interface UserRow {
  id: string;
  org_id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'manager' | 'reviewer';
  created_at: number;
}

export interface AssessmentRow {
  id: string;
  org_id: string;
  role_family_id: string;
  role_family_version: number;
  title: string;
  currency: 'INR' | 'USD';
  created_by: string;
  created_at: number;
  archived: number;
  /** Activities the recruiter chose; null means all. */
  stage_ids_json: string | null;
}

export interface CandidateRow {
  id: string;
  org_id: string;
  assessment_id: string;
  name: string;
  email: string;
  token: string;
  seed: number;
  variant_json: string;
  time_multiplier: number;
  status: string;
  id_name: string | null;
  decision: string | null;
  created_at: number;
  started_at: number | null;
  submitted_at: number | null;
  account_id: string | null;
}

export interface ResponseRow {
  id: string;
  candidate_id: string;
  stage_id: string;
  stage_index: number;
  prompt_json: string;
  revealed_at: number;
  deadline_at: number;
  submitted_at: number | null;
  closed_reason: 'submitted' | 'timeout' | null;
  text: string | null;
  choice_id: string | null;
  ai_transcript: string | null;
  reflection: string | null;
  audio_path: string | null;
  audio_mime: string | null;
  audio_sec: number | null;
  draft_json: string | null;
  signals_json: string | null;
  scratch_json: string | null;
}

export interface AudioPartRow {
  response_id: string;
  part: number;
  path: string;
  mime: string;
  bytes: number;
  chunks: number;
  start_ms: number;
  sec: number | null;
}

export interface CandidateAccountRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: number;
}

export interface AiReviewRow {
  candidate_id: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'locked';
  attempts: number;
  models: string | null;
  result_json: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface TranscriptRow {
  response_id: string;
  part: number;
  transcript: string;
  delivery: string | null;
  delivery_reasons: string | null;
  model: string;
  created_at: number;
}

export interface CustomFamilyRow {
  id: string;
  org_id: string;
  created_by: string;
  role_title: string;
  description: string;
  currency: 'INR' | 'USD';
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  spec_json: string | null;
  error: string | null;
  model: string | null;
  /** 'jd' when built from a pasted job description. */
  source: 'description' | 'jd';
  created_at: number;
  updated_at: number;
}

export interface VerificationRow {
  candidate_id: string;
  interviewer_id: string;
  identity: string | null;
  consistency: string | null;
  notes: string;
  updated_at: number;
}
