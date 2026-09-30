import type { RoleFamily } from '../types';
import { customerSupport } from './customerSupport';
import { performanceMarketing } from './performanceMarketing';

export const ROLE_FAMILIES: RoleFamily[] = [performanceMarketing, customerSupport];

export function getRoleFamily(id: string): RoleFamily | undefined {
  return ROLE_FAMILIES.find((family) => family.id === id);
}

export function totalTimeSec(family: RoleFamily): number {
  return family.stages.reduce((sum, stage) => sum + stage.timeLimitSec, 0);
}
