// Shapes of the JSON the API returns. Shared so the client stays in sync.
import type { CandidatePhaseView } from './candidateApi';
import type { SignalNote } from './signals';
import type {
  Block,
  CandidateStageView,
  CandidateStatus,
  Criterion,
  Currency,
  Decision,
  Delivery,
  Recommendation,
  ScratchSnapshot,
  StageKind,
  StageSignals,
} from './types';
import type { VerificationScript } from './verification';

export type { CandidatePhaseView };

export interface Me {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'reviewer';
  orgName: string;
}

export interface StageOutline {
  id: string;
  kind: StageKind;
  title: string;
  summary: string;
  timeLimitSec: number;
  scored: boolean;
  thinkAloud: boolean;
  /** A situation-change activity needs the decision it follows. */
  dependsOn: string | null;
}

export interface RoleFamilySummary {
  id: string;
  name: string;
  roles: string[];
  summary: string;
  totalMinutes: number;
  stages: StageOutline[];
}

export interface PreviewStage {
  id: string;
  kind: StageKind;
  title: string;
  timeLimitSec: number;
  scored: boolean;
  choices?: { id: string; label: string }[];
  /** One entry for normal stages; one per earlier choice for branch stages. */
  variants: { label: string | null; prompt: Block[]; reviewerGuide: Block[] }[];
  material: Block[];
  rubric: Criterion[];
}

export interface RoleFamilyPreview {
  family: RoleFamilySummary;
  seed: number;
  currency: Currency;
  brief: Block[];
  stages: PreviewStage[];
}

export type StatusCounts = Record<CandidateStatus, number>;

export interface AssessmentSummary {
  id: string;
  title: string;
  roleFamilyId: string;
  roleFamilyName: string;
  currency: Currency;
  createdAt: number;
  candidateCount: number;
  counts: StatusCounts;
}

export interface CandidateListItem {
  id: string;
  name: string;
  email: string;
  token: string;
  status: CandidateStatus;
  timeMultiplier: number;
  createdAt: number;
  startedAt: number | null;
  submittedAt: number | null;
  /** AI review: overall score (1–4) once done. */
  aiScore: number | null;
  aiStatus: AiReviewStatus | null;
  aiRecommendation: Recommendation | null;
  /** The score after recruiter overrides; null when nobody disagreed with the AI. */
  adjustedScore: number | null;
  notableSignals: number;
  verification: { identity: string | null; consistency: string | null } | null;
  decision: Decision | null;
}

export interface AssessmentDetail {
  assessment: AssessmentSummary;
  family: RoleFamilySummary;
  candidates: CandidateListItem[];
}

export interface StageResponseView {
  revealedAt: number;
  deadlineAt: number;
  submittedAt: number | null;
  closedReason: 'submitted' | 'timeout' | null;
  timeUsedSec: number | null;
  overtimeSec: number;
  text: string | null;
  choiceId: string | null;
  choiceLabel: string | null;
  aiTranscript: string | null;
  reflection: string | null;
  /** One entry for a voice note; one per part for a think-aloud recording. */
  audio: { url: string; startMs: number | null; sec: number | null }[];
  /** Think-aloud scratchpad history. */
  scratch: ScratchSnapshot[];
  signals: StageSignals | null;
  signalNotes: SignalNote[];
}

export interface ReportStage {
  id: string;
  index: number;
  kind: StageKind;
  title: string;
  scored: boolean;
  thinkAloud: boolean;
  timeLimitSec: number;
  shown: CandidateStageView | null;
  reviewerGuide: Block[];
  rubric: Criterion[];
  response: StageResponseView | null;
}

export type AiReviewStatus = 'pending' | 'running' | 'done' | 'failed';

export interface AiCriterionScore {
  score: number;
  /** Short verbatim quote from the candidate's answer. */
  evidence: string;
  rationale: string;
}

export interface AiStageReview {
  stageId: string;
  /** Empty for unscored stages (the warm-up). */
  criteria: Record<string, AiCriterionScore>;
  summary: string;
  /** Transcript of any spoken answer; think-aloud parts are joined in order. */
  transcript: string | null;
  /** How the audio sounded: live reasoning or reading. Null without audio. */
  delivery: { label: Delivery; reasons: string } | null;
}

export interface AiReviewResult {
  stages: AiStageReview[];
  overall: number | null;
  byStage: Record<string, number | null>;
  recommendation: Recommendation | null;
  summary: string;
  strengths: string[];
  concerns: string[];
  /** How their thinking changed when AI was allowed, versus on their own. */
  withAndWithoutAi: string;
  /** Questions for the verification call, built on their answers. */
  probes: string[];
  models: { review: string; audio: string };
}

export interface ScoreOverride {
  stageId: string;
  criterionId: string;
  aiScore: number;
  score: number;
  note: string;
  userName: string;
  updatedAt: number;
}

export interface AiReviewView {
  status: AiReviewStatus;
  attempts: number;
  error: string | null;
  updatedAt: number;
  result: AiReviewResult | null;
}

export interface VerificationRecord {
  identity: 'verified' | 'not_verified' | 'not_checked' | null;
  consistency: 'consistent' | 'partly' | 'inconsistent' | null;
  notes: string;
  interviewerName: string;
  updatedAt: number;
}

export interface CandidateReport {
  candidate: {
    id: string;
    name: string;
    email: string;
    token: string;
    idName: string | null;
    status: CandidateStatus;
    timeMultiplier: number;
    createdAt: number;
    startedAt: number | null;
    submittedAt: number | null;
    decision: Decision | null;
  };
  assessment: { id: string; title: string; currency: Currency };
  family: { id: string; name: string };
  brief: Block[];
  stages: ReportStage[];
  /** Null until the candidate has submitted. */
  aiReview: AiReviewView | null;
  /** Recruiters' disagreements with individual AI scores. */
  overrides: ScoreOverride[];
  /** Scores with overrides applied; null when there are none. */
  adjusted: { overall: number | null; byStage: Record<string, number | null>; recommendation: Recommendation | null } | null;
  verification: { script: VerificationScript; record: VerificationRecord | null };
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'reviewer';
  createdAt: number;
}
