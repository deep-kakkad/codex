import type { RoleFamily } from '../types';
import { accountExecutive } from './accountExecutive';
import { accountant } from './accountant';
import { businessAnalyst } from './businessAnalyst';
import { communityInfluencer } from './communityInfluencer';
import { contentBrand } from './contentBrand';
import { copywriter } from './copywriter';
import { customerSupport } from './customerSupport';
import { dataAnalyst } from './dataAnalyst';
import { equityResearch } from './equityResearch';
import { foundersOffice } from './foundersOffice';
import { fpaAnalyst } from './fpaAnalyst';
import { hrbp } from './hrbp';
import { itSupport } from './itSupport';
import { learningDevelopment } from './learningDevelopment';
import { operationsManager } from './operationsManager';
import { performanceMarketing } from './performanceMarketing';
import { productAnalyst } from './productAnalyst';
import { productManager } from './productManager';
import { productMarketing } from './productMarketing';
import { projectManager } from './projectManager';
import { recruiter } from './recruiter';
import { sdr } from './sdr';
import { seo } from './seo';
import { socialMedia } from './socialMedia';
import { socialMediaExecutive } from './socialMediaExecutive';
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
  fpaAnalyst,
  accountant,
  equityResearch,
  hrbp,
  recruiter,
  learningDevelopment,
  productMarketing,
  communityInfluencer,
  copywriter,
  socialMediaExecutive,
];

export function getRoleFamily(id: string): RoleFamily | undefined {
  return ROLE_FAMILIES.find((family) => family.id === id);
}

export function totalTimeSec(family: RoleFamily): number {
  return family.stages.reduce((sum, stage) => sum + stage.timeLimitSec, 0);
}
