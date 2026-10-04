/** Shapes shared by the static demo's data generator (server/demoData.ts) and the browser demo. */
import type { Block, CandidateStageView } from './types';

/** What a candidate sees in the short candidate demo, written in advance. */
export interface DemoCandidateData {
  familyName: string;
  timeMultiplier: number;
  brief: Block[];
  stages: {
    id: string;
    kind: CandidateStageView['kind'];
    thinkAloud: boolean;
    timeLimitSec: number;
    /** The candidate's view of this stage, by the choices made in earlier decisions (see choiceKey). */
    views: Record<string, CandidateStageView>;
  }[];
}

/** Identifies the earlier decisions a candidate made, e.g. "budget-cut=cut-search". */
export function choiceKey(choices: Record<string, string | null | undefined>) {
  return Object.entries(choices)
    .filter(([, choiceId]) => choiceId)
    .map(([stageId, choiceId]) => `${stageId}=${choiceId}`)
    .sort()
    .join('&');
}
