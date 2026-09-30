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
  Recommendation,
  ReviewScores,
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
  timeLimitSec: number;
  scored: boolean;
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
  myScore: number | null;
  teamScore: number | null;
  reviewCount: number;
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
  audioUrl: string | null;
  audioSec: number | null;
  signals: StageSignals | null;
  signalNotes: SignalNote[];
}

export interface ReportStage {
  id: string;
  index: number;
  kind: StageKind;
  title: string;
  scored: boolean;
  timeLimitSec: number;
  shown: CandidateStageView | null;
  reviewerGuide: Block[];
  rubric: Criterion[];
  response: StageResponseView | null;
}

export interface ReviewView {
  reviewerId: string;
  reviewerName: string;
  scores: ReviewScores;
  notes: string;
  recommendation: Recommendation | null;
  submittedAt: number | null;
  overall: number | null;
  byStage: Record<string, number | null>;
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
  myReview: ReviewView | null;
  otherReviews: ReviewView[];
  /** Submitted reviews by others that stay hidden until you submit your own. */
  hiddenReviews: number;
  teamScore: number | null;
  suggestedRecommendation: Recommendation | null;
  verification: { script: VerificationScript; record: VerificationRecord | null };
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'reviewer';
  createdAt: number;
}
