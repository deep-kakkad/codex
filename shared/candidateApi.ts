import type { Block, CandidateStageView, CandidateStatus, ScratchSnapshot, StageKind } from './types';

export interface CandidateDraft {
  text?: string;
  choiceId?: string;
  aiTranscript?: string;
  reflection?: string;
  /** Think-aloud scratchpad history. */
  scratch?: ScratchSnapshot[];
}

export type CandidatePhaseView =
  | { phase: 'intro' }
  | { phase: 'ready'; next: { index: number; kind: StageKind; timeLimitSec: number; thinkAloud: boolean } }
  | {
      phase: 'stage';
      stage: CandidateStageView;
      deadlineAt: number;
      draft: CandidateDraft | null;
      /** Audio the server already has: a voice note, or think-aloud parts recorded so far. */
      audio: { sec: number | null; parts: number } | null;
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
    outline: { kind: StageKind; minutes: number; thinkAloud: boolean }[];
  };
  /** Only sent once the candidate has started. */
  brief: Block[] | null;
  state: CandidatePhaseView;
}

export interface CandidateAccount {
  id: string;
  name: string;
  email: string;
}

export interface CandidateAssessmentItem {
  token: string;
  title: string;
  orgName: string;
  status: 'invited' | 'in_progress' | 'submitted';
  invitedAt: number;
  submittedAt: number | null;
}

/** What the invite page shows before the candidate signs in. */
export interface InvitePreview {
  orgName: string;
  title: string;
  candidateName: string;
  /** The invited address, so the candidate signs in with the right account. */
  email: string;
}
