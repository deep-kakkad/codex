import type { RoleFamily } from '../types';
import { accountExecutive } from './accountExecutive';
import { contentBrand } from './contentBrand';
import { customerSupport } from './customerSupport';
import { performanceMarketing } from './performanceMarketing';
import { productAnalyst } from './productAnalyst';
import { productManager } from './productManager';
import { sdr } from './sdr';
import { seo } from './seo';
import { socialMedia } from './socialMedia';
import { supportExecutive } from './supportExecutive';
import { uxDesigner } from './uxDesigner';

export const ROLE_FAMILIES: RoleFamily[] = [
  performanceMarketing,
  contentBrand,
  seo,
  socialMedia,
  customerSupport,
  sdr,
  accountExecutive,
  supportExecutive,
  productManager,
  productAnalyst,
  uxDesigner,
];

export function getRoleFamily(id: string): RoleFamily | undefined {
  return ROLE_FAMILIES.find((family) => family.id === id);
}

export function totalTimeSec(family: RoleFamily): number {
  return family.stages.reduce((sum, stage) => sum + stage.timeLimitSec, 0);
}
