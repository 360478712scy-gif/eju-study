// Shared data model for 澄学 EJU v3 (server, client, content tools and tests).
// Must stay erasable TypeScript (no enums/namespaces/parameter properties) so Node can strip it.

export type Subject = 'math' | 'physics' | 'chemistry';
export const SUBJECTS: readonly Subject[] = ['math', 'physics', 'chemistry'];

export const SCHOOLS = ['waseda', 'meiji', 'aoyama', 'rikkyo', 'chuo', 'hosei'] as const;
export type School = (typeof SCHOOLS)[number];
export const MAX_SCORE: Record<Subject, number> = { math: 200, physics: 100, chemistry: 100 };
export function isSubject(value: unknown): value is Subject {
  return SUBJECTS.includes(value as Subject);
}

// ───────────────────────────── Content ─────────────────────────────

export interface SourceRef {
  kind: 'official' | 'original' | 'school';
  school?: School;
  /** Exam session key, e.g. "2019_1" (official items). */
  session?: string;
  /** Human label, e.g. "2019年第1回 物理 問7". */
  label: string;
  /** Local asset path of the original PDF, for "查看原卷". */
  pdf?: string;
  page?: number;
  url?: string;
}

export interface Figure {
  /** Asset URL served under /assets/… */
  src: string;
  caption?: string;
  /** Display width hint in CSS px at 100% zoom. */
  width?: number;
}

export interface KeyTerm {
  ja: string;
  kana?: string;
  zh: string;
}

export interface Explanation {
  /** Full worked explanation in Chinese (Markdown-lite + LaTeX). */
  zh: string;
  /** 考点 — what this item tests. */
  keyPoints?: string[];
  /** 易错点 / traps. */
  traps?: string[];
  /** Japanese key terms that appear in the stem. */
  terms?: KeyTerm[];
  /** Faster exam-time approach, if different from the full solution. */
  shortcut?: string;
}

export interface Verification {
  status: 'verified' | 'disputed' | 'unverified';
  /** How the answer was established, e.g. "官方正解表 + 独立求解一致". */
  method?: string;
  notes?: string;
}

/**
 * One gradable unit.
 * - format "choice": options[] + answer (0-based index).
 * - format "blanks": EJU math mark-sheet style. The stem marks answer boxes with the
 *   LaTeX macro \bx{A} / \bx{BC} (usable inside $…$ or in plain text); `blanks` maps
 *   every single letter to one character ('0'–'9' or '-'). A box group is correct
 *   only if all its letters are.
 */
export interface Item {
  id: string;
  subject: Subject;
  /** Items sharing a passage / 大問 share a group id (shown together, done in order). */
  group?: string;
  /** Position within its source paper (for mock ordering). */
  order?: number;
  /** Primary taxonomy topic id, e.g. "phys.wave.interference". */
  topic: string;
  tags?: string[];
  difficulty: 1 | 2 | 3;
  /** Target seconds at EJU pace. */
  targetSec: number;
  source: SourceRef;
  /** Original-language stem (Markdown-lite + $LaTeX$). */
  stem: string;
  /** Optional Chinese gloss of the stem (science/math), hidden by default. */
  stemZh?: string;
  figures?: Figure[];
  format: 'choice' | 'blanks' | 'written';
  written?: { parts: WrittenPart[] };
  options?: string[];
  /** Labels shown on option buttons; defaults to 1…n. */
  optionLabels?: string[];
  answer?: number;
  blanks?: Record<string, string>;
  explanation: Explanation;
  verified?: Verification;
}

export interface BankFile {
  /** e.g. "official 2019_1 physics" */
  title: string;
  items: Item[];
}

export interface TaxonomyTopic {
  id: string;
  name: string;
  /** Japanese name as used in the syllabus. */
  ja?: string;
  /** Relative exam frequency weight 1–5. */
  weight: number;
}

export interface TaxonomyUnit {
  id: string;
  name: string;
  topics: TaxonomyTopic[];
}

export interface Taxonomy {
  subjects: Record<Subject, { name: string; units: TaxonomyUnit[] }>;
}

export interface PaperInfo {
  session: string;
  label: string;
  /** Which mock kinds this session can provide. */
  mocks: MockKind[];
}

export interface TopicNote {
  topic: string;
  /** Markdown-lite: key formulas, concepts, EJU patterns. */
  body: string;
  terms?: KeyTerm[];
}

export interface ContentBundle {
  version: string;
  builtAt: string;
  items: Item[];
  taxonomy: Taxonomy;
  papers: PaperInfo[];
  notes: TopicNote[];
}

// ───────────────────────────── Learner state ─────────────────────────────

export type ScoreMap = Record<Subject, number>;

export interface WrittenPart {
  id: string;
  label: string;
  prompt?: string;
  points: number;
  modelAnswer: string;
  rubric: { text: string; points: number }[];
  final?: string;
}

export interface WrittenResponse {
  method: 'self' | 'ai';
  text?: string;
  // Points awarded for each criterion, in the order printed in the question.
  marks: Record<string, number[]>;
}

export type Response = number | Record<string, string> | WrittenResponse | null;
export interface Milestone {
  date: string;
  targets: ScoreMap;
}
export interface Profile {
  examDate: string;
  startDate: string;
  baseline: ScoreMap;
  targets: ScoreMap;
  milestones: Milestone[];
  schools: School[];
  dailyMinutes: number;
  weekdays: number[]; // ISO 1=Mon ... 7=Sun
  weakTopics: string[];
  strongTopics: string[];
  strongEarlyChemistry: boolean;
  mathCourse: 2;
  onboarded: boolean;
}

export type Confidence = 'sure' | 'unsure' | 'guess';
export type AttemptMode = 'block' | 'drill' | 'review' | 'mock' | 'free';

export interface Attempt {
  id: string;
  itemId: string;
  subject: Subject;
  topic: string;
  at: string;
  /** Local study date (YYYY-MM-DD, day starts at 04:00). */
  date: string;
  mode: AttemptMode;
  sessionId?: string;
  blockId?: string;
  correct: boolean;
  /** 0..1, partial credit for blanks. */
  score: number;
  response: Response;
  seconds: number;
  confidence?: Confidence;
  /** First ever attempt on this item. */
  firstTry: boolean;
  /** Learner gave up / revealed without answering. */
  gaveUp?: boolean;
}

export interface ItemProgress {
  attempts: number;
  correct: number;
  lastAt: string;
  lastCorrect: boolean;
  lastScore: number;
  /** Mistake-book Leitner box: 0 = new mistake, rises with spaced correct re-tests. */
  box: number;
  /** Date the item is next due for re-test (mistake book). */
  due?: string;
  inMistakes: boolean;
  /** Last correct answer took > 1.8 × targetSec: re-practice under time pressure. */
  slow?: boolean;
  possibleGuess?: boolean;
  starred?: boolean;
  note?: string;
}

export type BlockKind = 'learn' | 'interleave' | 'review' | 'quiz' | 'school' | 'mock' | 'break' | 'notes';
export type MockKind = 'math' | 'science' | 'school';
export type Phase = 'foundation' | 'reinforce' | 'integrate' | 'sprint' | 'taper' | 'off';
export interface Why {
  code:
    | 'weak_focus'
    | 'topic_focus'
    | 'mixed_retrieval'
    | 'spaced'
    | 'weekly_test'
    | 'school_practice'
    | 'mock_correction'
    | 'monthly_paper'
    | 'rest'
    | 'consolidate'
    | 'maintenance';
  topic?: string;
  school?: School;
  schoolPurpose?: 'exam_style' | 'extension';
  mastery?: number;
  weight?: number;
  difficulty?: number;
  due?: string;
}
export interface PlanBlock {
  id: string;
  kind: BlockKind;
  subject: Subject | 'mixed';
  minutes: number;
  itemIds: string[];
  topic?: string;
  why: Why;
  school?: School;
  schoolPurpose?: 'exam_style' | 'extension';
  mock?: { kind: MockKind; session: string };
  status: 'todo' | 'active' | 'done' | 'skipped';
  startedAt?: string;
  doneAt?: string;
}
export interface DayPlan {
  date: string;
  phase: Phase;
  budgetMinutes: number;
  blocks: PlanBlock[];
}
export interface Calendar {
  overrides: Record<string, 'study' | 'off'>;
  moves: { from: string; to: string }[];
  restWeeks: string[]; // Monday of each paused week
}

export interface SessionAnswer {
  response: Response;
  seconds: number;
  submitted: boolean;
  correct?: boolean;
  score?: number;
  confidence?: Confidence;
  gaveUp?: boolean;
}

export interface PracticeSession {
  id: string;
  kind: 'block' | 'drill' | 'review' | 'mock' | 'free';
  imported?: true; // historical v2 session
  title: string;
  subject: Subject | 'mixed';
  blockId?: string;
  mock?: { kind: MockKind; session: string };
  itemIds: string[];
  index: number;
  answers: Record<string, SessionAnswer>;
  startedAt: string;
  sealedAt?: string; // timed responses frozen; written scripts await rubric marks
  finishedAt?: string;
  /** Exam mode: no feedback until the end, hard time limit. */
  exam: boolean;
  timeLimitSec?: number;
  /** Accumulated foreground seconds. */
  elapsedSec: number;
}

export interface MockResult {
  id: string;
  kind: MockKind;
  session: string;
  date: string;
  startedAt: string;
  finishedAt: string;
  seconds: number;
  itemIds: string[];
  answered: number;
  correct: number;
  total: number;
  /** 0..1 weighted raw score. */
  raw: number;
  /** Estimated scaled score on the EJU scale for this section. */
  estimate: number | null; // null for school papers
  bySubject?: Partial<Record<Subject, { correct: number; total: number; raw: number; estimate: number }>>;
}

export interface DayLog {
  /** Foreground study seconds recorded by sessions. */
  seconds: number;
  answered: number;
  correct: number;
}

export const DEFAULT_NEW_CARDS_PER_DAY = 20;

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  musicEnabled: boolean;
  musicTrack: string;
  musicVolume: number;
  fontScale: number;
  coachEnabled: boolean;
  coachModel: string;
  coachEffort: 'low' | 'medium' | 'high';
  newCardsPerDay: number;
}

export interface AppState {
  version: 3;
  revision: number;
  savedAt?: string;
  createdAt: string;
  profile: Profile;
  settings: Settings;
  attempts: Attempt[];
  progress: Record<string, ItemProgress>;
  calendar: Calendar;
  plans: Record<string, DayPlan>;
  sessions: Record<string, PracticeSession>;
  activeSessionId?: string;
  mocks: MockResult[];
  days: Record<string, DayLog>;
  variants: Record<string, Item>; // accepted, independently checked coach output
  notes: Record<string, string>; // topic -> learner note
  /** Raw v2 record kept verbatim for reference. */
  legacy?: { importedAt: string; v2: unknown };
}
