// Shapes of the JSON the API returns. Shared so the client stays in sync.
import type { CandidatePhaseView } from './candidateApi';
import type { CatalogInfo } from './catalog';
import type { BillingCycle, PlanId } from './plans';
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
  /** Runs Proofwork itself: can open the admin console. */
  operator?: boolean;
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
  /** Written by AI for this organisation. */
  generated?: boolean;
  catalog?: CatalogInfo;
  /** Generated scenarios are written in one currency. */
  fixedCurrency?: Currency;
}

/** A recruiter's request for an AI-written scenario, and how it is going. */
export interface GenerationView {
  id: string;
  roleTitle: string;
  description: string;
  currency: Currency;
  status: 'pending' | 'running' | 'done' | 'failed';
  error: string | null;
  /** The family name once it is written. */
  name: string | null;
  /** 'jd' when it was built from a pasted job description. */
  source: 'description' | 'jd';
  createdAt: number;
  updatedAt: number;
  /** Assessments using it; a generation in use can't be deleted. */
  assessmentCount: number;
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
  /** On the viewer's watch list. */
  starred: boolean;
}

export interface FunnelStage {
  id: string;
  title: string;
  kind: StageKind;
  /** Candidates who opened this question. */
  reached: number;
  submitted: number;
  timedOut: number;
  /** In-progress candidates quiet for a day whose furthest question is this one. */
  stalledHere: number;
  timeLimitSec: number;
  medianTimeSec: number | null;
}

export interface AssessmentFunnel {
  invited: number;
  started: number;
  finished: number;
  stalledBeforeFirst: number;
  stalledAfterHours: number;
  stages: FunnelStage[];
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
  /** For a situation change: the decision question it follows. */
  dependsOn: string | null;
  response: StageResponseView | null;
}

/** "locked": finished, but beyond what the workspace's plan covers; it runs once the plan changes. */
export type AiReviewStatus = 'pending' | 'running' | 'done' | 'failed' | 'locked';

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
  /** The verdict in one short sentence. Missing on reviews made before it existed. */
  headline?: string;
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
    /** When the recordings were deleted at the end of the workspace's retention period. */
    recordingsDeletedAt: number | null;
    recordingDays: number;
  };
  assessment: { id: string; title: string; currency: Currency };
  family: { id: string; name: string; generated: boolean };
  brief: Block[];
  stages: ReportStage[];
  /** Null until the candidate has submitted. */
  aiReview: AiReviewView | null;
  /** Recruiters' disagreements with individual AI scores. */
  overrides: ScoreOverride[];
  /** Scores with overrides applied; null when there are none. */
  adjusted: {
    overall: number | null;
    byStage: Record<string, number | null>;
    recommendation: Recommendation | null;
  } | null;
  verification: { script: VerificationScript; record: VerificationRecord | null };
  /** On the viewer's watch list. */
  starred: boolean;
  notes: ReviewNote[];
  benchmark: Benchmark | null;
  siblings: CandidateSiblings;
  integrity: IntegrityReport;
  /** Made on request: follow-up interview questions built on this candidate's answers. */
  interviewKit: InterviewKit | null;
  /** The last drafted email about the decision, if one was drafted. */
  decisionEmail: DecisionEmailDraft | null;
}

export type IntegrityVerdict = 'clean' | 'question' | 'likely';

export interface IntegrityItem {
  stageId: string | null;
  stageTitle: string | null;
  /** "strong" only from the AI writing check, backed by a quote. */
  level: 'info' | 'notable' | 'strong';
  source: 'signals' | 'timing' | 'delivery' | 'writing' | 'consistency';
  text: string;
  quote?: string;
  /** A question for the live call. */
  ask?: string;
}

/** Everything that suggests someone or something else did the thinking, as hints, never proof. */
export interface IntegrityReport {
  verdict: IntegrityVerdict;
  headline: string;
  items: IntegrityItem[];
  /** Whether the AI writing check has run; it adds what the browser can't see. */
  aiChecked: boolean;
  checkedAt: number | null;
}

export interface InterviewKitQuestion {
  stageId: string | null;
  question: string;
  /** What it tests, and why for this candidate. */
  why: string;
  listenFor: string;
  redFlags: string;
}

export interface InterviewKit {
  questions: InterviewKitQuestion[];
  createdAt: number;
}

export interface DecisionEmailDraft {
  decision: Decision;
  subject: string;
  body: string;
  /** False when AI was unavailable and a template was used. */
  ai: boolean;
  createdAt: number;
}

export interface PlanView {
  plan: PlanId;
  name: string;
  /** Reviews the trial or monthly plan includes; null when unlimited or prepaid. */
  included: number | null;
  /** Reviews used in the trial, or this calendar month. */
  used: number;
  period: 'trial' | 'month';
  /** Prepaid reviews left, on pay as you go. */
  credits: number | null;
  /** Finished candidates whose review waits for an upgrade. */
  locked: number;
  upgradeRequest: { plan: string; billing: BillingCycle; createdAt: number } | null;
  billing: BillingCycle;
  /** When the current paid period ends, if set. */
  paidUntil: number | null;
  /** Free reviews from referrals, used once the plan's own run out. */
  bonusReviews: number;
  /** Reviews this month beyond the plan, billed at the extra-review price. */
  extras: number;
}

/** A workspace's referral link and how it is doing. */
export interface ReferralView {
  code: string;
  joined: number;
  rewarded: number;
  rewardEach: number;
  cap: number;
}

export interface BulkInviteResult {
  created: CandidateListItem[];
  skipped: { name: string; email: string; reason: string }[];
}

/** A teammate's short take on a candidate, with an optional lean. */
export interface ReviewNote {
  id: string;
  userName: string;
  body: string;
  lean: Decision | null;
  createdAt: number;
  /** Written by the person viewing, who can delete it. */
  mine: boolean;
}

/** This candidate against everyone reviewed on the same assessment. */
export interface Benchmark {
  /** 1 is the highest overall score; ties share a rank. */
  rank: number;
  of: number;
  overallAverage: number | null;
  /** Pool average per scored question. */
  byStage: Record<string, number | null>;
}

/** Neighbouring reviewable candidates, in the assessment page's order. */
export interface CandidateSiblings {
  index: number | null;
  total: number;
  prev: { id: string; name: string } | null;
  next: { id: string; name: string } | null;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'reviewer';
  createdAt: number;
}

/** What signing in returns: a session, or a request for the authenticator code first. */
export interface LoginResult {
  ok: true;
  twoFactor?: boolean;
  /** Sent back with the code to finish signing in. */
  challenge?: string;
}

export interface AccountSecurity {
  twoFactor: boolean;
  recoveryCodesLeft: number;
}

/** One line of a workspace's activity log. */
export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: number;
}

/** A workspace's privacy settings and what has been deleted. */
export interface PrivacySettings {
  /** Candidates' recordings are deleted this many days after they finish. */
  recordingDays: number;
  /** Candidates whose data was deleted in the last year, by the team or at their request. */
  deletionsLastYear: number;
  /** Of those, candidates who withdrew and deleted it themselves. */
  withdrawnLastYear: number;
  /** Candidates whose recordings were deleted at the end of the retention period. */
  recordingsDeleted: number;
}

// Admin console (people who run Proofwork) ------------------------------------------

export interface AdminOverview {
  workspaces: number;
  newLast7: number;
  newLast30: number;
  activeLast30: number;
  candidatesInvitedThisMonth: number;
  candidatesFinishedThisMonth: number;
  /** Reviews started this month, by what paid for them. */
  reviewsThisMonth: Record<'plan' | 'bonus' | 'credit' | 'extra', number>;
  aiCostThisMonthUsd: number;
  /** From plans set in the console (payments aren't connected): subscriptions plus this month's extras. */
  estimatedMrrInr: number;
  leadsLast30: number;
  openRequests: number;
  errorsLast7: number;
  /** Signups per day for the last 30 days, oldest first. */
  signupsByDay: { day: string; count: number }[];
}

export interface AdminWorkspace {
  id: string;
  name: string;
  createdAt: number;
  owner: string | null;
  plan: PlanId;
  billing: BillingCycle;
  paidUntil: number | null;
  credits: number;
  bonusReviews: number;
  referredBy: string | null;
  seats: number;
  assessments: number;
  candidates: number;
  reviewsThisMonth: number;
  extrasThisMonth: number;
  locked: number;
  aiCostThisMonthUsd: number;
  lastActivity: number | null;
  askedFor: { plan: string; billing: BillingCycle; createdAt: number } | null;
}

export interface AdminRequest {
  id: string;
  workspace: string;
  orgId: string;
  email: string;
  plan: string;
  billing: BillingCycle;
  note: string;
  createdAt: number;
  handledAt: number | null;
}

export interface AdminLead {
  email: string;
  source: string;
  createdAt: number;
}

export interface AdminError {
  message: string;
  source: string;
  count: number;
  lastSeen: number;
  path: string | null;
  detail: string | null;
}

export interface AdminActivity {
  id: string;
  workspace: string | null;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: number;
}
