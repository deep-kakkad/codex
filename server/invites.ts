import { randomUUID } from 'node:crypto';
import type { RoleFamily } from '../shared/types';
import { generateVariant, randomSeed } from '../shared/variants';
import { randomToken } from './auth';
import { type AssessmentRow, type DB, run } from './db';

/**
 * Adds a candidate to an assessment with their own numbers and private link,
 * whether the team invited them or they applied through the public link.
 */
export async function createCandidate(
  db: DB,
  assessment: AssessmentRow,
  family: RoleFamily,
  person: { name: string; email: string; multiplier: number; source?: 'invited' | 'applied' },
  now: number,
) {
  const seed = randomSeed();
  const variant = generateVariant(family, seed, assessment.currency);
  const id = randomUUID();
  const token = randomToken();
  await run(
    db,
    `INSERT INTO candidates (id, org_id, assessment_id, name, email, token, seed, variant_json, time_multiplier, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    assessment.org_id,
    assessment.id,
    person.name,
    person.email,
    token,
    seed,
    JSON.stringify(variant),
    person.multiplier,
    person.source ?? 'invited',
    now,
  );
  return { id, token };
}
