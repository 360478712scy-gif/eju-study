// Shared data model for 澄学 EJU v2 (server, client, content tools and tests).
// Must stay erasable TypeScript (no enums/namespaces/parameter properties) so Node can strip it.

export type Subject = 'math' | 'physics' | 'chemistry' | 'japanese';
export const SUBJECTS: readonly Subject[] = ['math', 'physics', 'chemistry', 'japanese'];

/** Japanese section of the exam. */
export type JaSection = 'reading' | 'listening-reading' | 'listening';

// ───────────────────────────── Content ─────────────────────────────

export interface SourceRef {
  kind: 'official' | 'original';
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

export interface AudioRef {
  src: string;
  /** Optional clip window inside a longer file, in seconds. */
  start?: number;
  end?: number;
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
  section?: JaSection;
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
  audio?: AudioRef;
  format: 'choice' | 'blanks';
  options?: string[];
  /** Labels shown on option buttons; defaults to 1…n. */
  optionLabels?: string[];
  answer?: number;
  blanks?: Record<string, string>;
  explanation: Explanation;
  /** Listening script (Japanese), revealed after answering. */
  transcript?: string;
  verified: Verification;
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

export interface VocabEntry {
  id: string;
  word: string;
  reading: string;
  /** Chinese meaning written as an explanation, avoiding the same kanji as the word. */
  meaningZh: string;
  /** Note on 中日同形异义 traps, e.g. 圧力 is "压强" in physics. */
  trapZh?: string;
  category: 'science' | 'math' | 'general' | 'reading';
  subject?: Subject;
  example?: { ja: string; zh?: string };
  audio?: { word?: string; example?: string };
  /** Alternative accepted readings. */
  altReadings?: string[];
  /** Display group, e.g. "物理用语 · 波动". */
  group?: string;
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
  vocab: VocabEntry[];
  taxonomy: Taxonomy;
  papers: PaperInfo[];
  notes: TopicNote[];
}

// ───────────────────────────── Learner state ─────────────────────────────

export type ScoreMap = Record<Subject, number>;

export interface Profile {
  examDate: string;
  startDate: string;
  targetTotal: number;
  baseline: ScoreMap;
  targets: ScoreMap;
  /** Planned study minutes on a normal day. */
  dailyMinutes: number;
  /** Per-date overrides of the daily budget (0 = rest day). */
  dayMinutes: Record<string, number>;
  background: string;
  /** Taxonomy topic ids the learner considers weak (prior for the planner). */
  weakTopics: string[];
  mathCourse: 1 | 2;
  /** Has the learner confirmed the v2 setup screen? */
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
  response: number | Record<string, string> | null;
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
  starred?: boolean;
  note?: string;
}

export type VocabSkill = 'read' | 'meaning';

export interface VocabSkillProgress {
  box: number;
  due: string;
  seen: number;
  correct: number;
  lastAt: string;
  lastCorrect: boolean;
}

export type VocabProgress = Partial<Record<VocabSkill, VocabSkillProgress>>;

export interface VocabAttempt {
  id: string;
  vocabId: string;
  skill: VocabSkill;
  at: string;
  date: string;
  correct: boolean;
  response: string;
  seconds: number;
  /** Learner played the audio before answering. */
  heardAudio?: boolean;
  legacy?: boolean;
}

export type BlockKind = 'drill' | 'review' | 'vocab' | 'mock' | 'reading' | 'listening' | 'notes';
export type MockKind = 'math' | 'science' | 'ja-reading' | 'ja-listening';

export interface PlanBlock {
  id: string;
  kind: BlockKind;
  subject: Subject | 'mixed';
  title: string;
  /** Why this block is here (shown to the learner). */
  reason: string;
  minutes: number;
  topic?: string;
  itemIds: string[];
  vocabCount?: number;
  /** Timed set: exam mode (feedback at the end) with a limit of Σ targetSec. */
  timed?: boolean;
  /** Topics to review in a "notes" block. */
  noteTopics?: string[];
  mock?: { kind: MockKind; session: string };
  /** Correction block: its items are the wrong answers of this mock, resolved when started. */
  reviewOfMock?: { kind: MockKind; session: string };
  status: 'todo' | 'active' | 'done' | 'skipped';
  startedAt?: string;
  doneAt?: string;
  result?: { answered: number; correct: number; seconds: number };
  /** Added by the learner via "加练" rather than by the planner. */
  extra?: boolean;
}

export type Phase = 'foundation' | 'practice' | 'final' | 'exam';

export interface DayPlan {
  date: string;
  phase: Phase;
  budgetMinutes: number;
  generatedAt: string;
  plannerVersion: number;
  blocks: PlanBlock[];
}

export interface SessionAnswer {
  response: number | Record<string, string> | null;
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
  title: string;
  subject: Subject | 'mixed';
  blockId?: string;
  mock?: { kind: MockKind; session: string };
  itemIds: string[];
  index: number;
  answers: Record<string, SessionAnswer>;
  startedAt: string;
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
  estimate: number;
  bySubject?: Partial<Record<Subject, { correct: number; total: number; raw: number; estimate: number }>>;
}

export interface DayLog {
  /** Foreground study seconds recorded by sessions. */
  seconds: number;
  answered: number;
  correct: number;
  vocab: number;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  musicEnabled: boolean;
  musicTrack: string;
  musicVolume: number;
  /** Japanese multiple choice: advance automatically after choosing. */
  autoNextJapanese: boolean;
  /** Show the Chinese gloss of science/math stems by default. */
  showZhGloss: boolean;
  fontScale: number;
  pronunciationRate: number;
  coachEnabled: boolean;
}

export interface JournalEntry {
  id: string;
  date: string;
  at: string;
  text: string;
  kind: 'note' | 'review' | 'legacy';
}

export interface AppState {
  version: 2;
  revision: number;
  savedAt?: string;
  createdAt: string;
  profile: Profile;
  settings: Settings;
  attempts: Attempt[];
  progress: Record<string, ItemProgress>;
  vocabAttempts: VocabAttempt[];
  vocab: Record<string, VocabProgress>;
  plans: Record<string, DayPlan>;
  sessions: Record<string, PracticeSession>;
  activeSessionId?: string;
  mocks: MockResult[];
  days: Record<string, DayLog>;
  journal: JournalEntry[];
  /** Raw v1.4 record kept verbatim for reference. */
  legacy?: { importedAt: string; v1: unknown };
}
