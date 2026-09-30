import type { Block, CandidateStageView, CandidateStatus, StageKind } from './types';

export interface CandidateDraft {
  text?: string;
  choiceId?: string;
  aiTranscript?: string;
  reflection?: string;
}

export type CandidatePhaseView =
  | { phase: 'intro' }
  | { phase: 'ready'; next: { index: number; kind: StageKind; title: string; timeLimitSec: number } }
  | {
      phase: 'stage';
      stage: CandidateStageView;
      deadlineAt: number;
      draft: CandidateDraft | null;
      audio: { sec: number | null } | null;
    }
  | { phase: 'done' };

export interface CandidateSession {
  serverNow: number;
  candidate: { name: string; status: CandidateStatus; timeMultiplier: number };
  assessment: {
    title: string;
    orgName: string;
    roleFamilyName: string;
    totalMinutes: number;
    outline: { kind: StageKind; minutes: number }[];
  };
  /** Only sent once the candidate has started. */
  brief: Block[] | null;
  state: CandidatePhaseView;
}
