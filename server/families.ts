import { ROLE_FAMILIES, getRoleFamily } from '../shared/roleFamilies';
import { type FamilySpec, familyFromSpec } from '../shared/roleFamilies/custom';
import type { RoleFamily } from '../shared/types';
import { type AssessmentRow, type CustomFamilyRow, type DB, all, one } from './db';
import { HttpError, badRequest } from './http';

/** A finished spec never changes, so its parsed family can be kept for the container's lifetime. */
const generatedCache = new Map<string, RoleFamily>();

function fromRow(row: CustomFamilyRow): RoleFamily {
  let family = generatedCache.get(row.id);
  if (!family) {
    family = familyFromSpec(row.id, JSON.parse(row.spec_json!) as FamilySpec);
    generatedCache.set(row.id, family);
  }
  return family;
}

/** A practitioner-written family, or one generated for this organisation. */
export async function loadFamily(db: DB, orgId: string, id: string): Promise<RoleFamily | undefined> {
  const builtIn = getRoleFamily(id);
  if (builtIn) return builtIn;
  const row = await one<CustomFamilyRow>(
    db,
    "SELECT * FROM custom_families WHERE id = ? AND org_id = ? AND status = 'done'",
    id,
    orgId,
  );
  return row ? fromRow(row) : undefined;
}

/** Every family this organisation can hire with: built-in first, then its generated ones, newest first. */
export async function orgFamilies(db: DB, orgId: string): Promise<RoleFamily[]> {
  const rows = await all<CustomFamilyRow>(
    db,
    "SELECT * FROM custom_families WHERE org_id = ? AND status = 'done' ORDER BY created_at DESC",
    orgId,
  );
  return [...ROLE_FAMILIES, ...rows.map(fromRow)];
}

/**
 * Validates the activities a recruiter picked: unknown ids are refused, a
 * situation-change stage pulls in the decision it depends on, and at least
 * one scored activity is required. Returns ids in the scenario's order.
 */
export function resolveSelection(family: RoleFamily, requested: unknown): string[] {
  if (requested === undefined || requested === null) return family.stages.map((s) => s.id);
  if (!Array.isArray(requested) || requested.some((id) => typeof id !== 'string')) {
    throw badRequest('Activities must be a list of activity ids');
  }
  const chosen = new Set<string>(requested);
  for (const id of chosen) {
    if (!family.stages.some((s) => s.id === id)) throw badRequest(`Unknown activity: ${id}`);
  }
  for (const stage of family.stages) {
    if (chosen.has(stage.id) && stage.dependsOn) chosen.add(stage.dependsOn);
  }
  const ids = family.stages.filter((s) => chosen.has(s.id)).map((s) => s.id);
  if (!family.stages.some((s) => s.scored && chosen.has(s.id))) {
    throw badRequest('Pick at least one scored activity');
  }
  return ids;
}

/** The role family as this assessment uses it: only the chosen activities. */
export async function familyFor(db: DB, assessment: AssessmentRow): Promise<RoleFamily> {
  const family = await loadFamily(db, assessment.org_id, assessment.role_family_id);
  if (!family) throw new HttpError(500, `Role family ${assessment.role_family_id} is missing`);
  if (!assessment.stage_ids_json) return family;
  const ids = new Set(JSON.parse(assessment.stage_ids_json) as string[]);
  return { ...family, stages: family.stages.filter((s) => ids.has(s.id)) };
}
