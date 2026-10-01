import { getRoleFamily } from '../shared/roleFamilies';
import type { RoleFamily } from '../shared/types';
import type { AssessmentRow } from './db';
import { HttpError, badRequest } from './http';

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
export function familyFor(assessment: AssessmentRow): RoleFamily {
  const family = getRoleFamily(assessment.role_family_id);
  if (!family) throw new HttpError(500, `Role family ${assessment.role_family_id} is missing`);
  if (!assessment.stage_ids_json) return family;
  const ids = new Set(JSON.parse(assessment.stage_ids_json) as string[]);
  return { ...family, stages: family.stages.filter((s) => ids.has(s.id)) };
}
