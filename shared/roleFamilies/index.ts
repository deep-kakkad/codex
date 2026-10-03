import type { RoleFamily } from '../types';
import { accountExecutive } from './accountExecutive';
import { businessAnalyst } from './businessAnalyst';
import { contentBrand } from './contentBrand';
import { customerSupport } from './customerSupport';
import { dataAnalyst } from './dataAnalyst';
import { foundersOffice } from './foundersOffice';
import { itSupport } from './itSupport';
import { operationsManager } from './operationsManager';
import { performanceMarketing } from './performanceMarketing';
import { productAnalyst } from './productAnalyst';
import { productManager } from './productManager';
import { projectManager } from './projectManager';
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
  dataAnalyst,
  businessAnalyst,
  itSupport,
  operationsManager,
  projectManager,
  foundersOffice,
];

export function getRoleFamily(id: string): RoleFamily | undefined {
  return ROLE_FAMILIES.find((family) => family.id === id);
}

export function totalTimeSec(family: RoleFamily): number {
  return family.stages.reduce((sum, stage) => sum + stage.timeLimitSec, 0);
}
