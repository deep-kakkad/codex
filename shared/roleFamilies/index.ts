import type { RoleFamily } from '../types';
import { contentBrand } from './contentBrand';
import { customerSupport } from './customerSupport';
import { performanceMarketing } from './performanceMarketing';
import { seo } from './seo';
import { socialMedia } from './socialMedia';

export const ROLE_FAMILIES: RoleFamily[] = [performanceMarketing, contentBrand, seo, socialMedia, customerSupport];

export function getRoleFamily(id: string): RoleFamily | undefined {
  return ROLE_FAMILIES.find((family) => family.id === id);
}

export function totalTimeSec(family: RoleFamily): number {
  return family.stages.reduce((sum, stage) => sum + stage.timeLimitSec, 0);
}
