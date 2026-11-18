// Coach "intelligent UI": the assistant answers with a list of blocks the app renders as glass cards,
// in the spirit of GPT's inline visualizations. Shared by server (schema + validation) and front end (renderer).
//
// Teaching rule (user, 2026-11-19): when helping with a problem the coach does NOT give the answer or the decisive
// step. It points a direction and asks guiding questions so the student learns to think — unless the student
// explicitly asks for the answer (typed request, or `reveal: true` from the 「我想看答案」 button).

/** Markdown text; inline math `$…$`, display math `$$…$$` (KaTeX). */
export type Md = string;

export type CoachBlock =
  /** Plain explanation text. */
  | { type: 'text'; md: Md }
  /** Progressive hints: the app shows one at a time ("再给一点提示"). General → more specific; none may state the answer or the decisive equation. */
  | { type: 'hints'; intro?: Md; hints: { label: string; md: Md }[] }
  /** A guiding question back to the student; the app offers a reply box under it. */
  | { type: 'question'; md: Md }
  /** A small self-check (not the original problem's answer): pick an option, get per-option feedback. */
  | { type: 'choice'; md: Md; options: Md[]; answer: number; feedback: Md[] }
  /** Worked steps — only in reveal/explain mode (student asked for the solution). */
  | { type: 'steps'; title?: string; steps: { title: string; md: Md }[] }
  /** One display formula with an optional note. */
  | { type: 'formula'; tex: string; note?: Md }
  /** Highlighted note: key idea, common trap, or tip. */
  | { type: 'callout'; tone: 'key' | 'trap' | 'tip'; md: Md }
  /** Small table. */
  | { type: 'table'; head: string[]; rows: string[][]; caption?: string }
  /** Function plot with optional sliders. expr uses x, the param names, + - * / ^ ( ), sin cos tan asin acos atan exp ln log sqrt abs, pi, e. */
  | {
      type: 'plot';
      title?: string;
      x: [number, number];
      y?: [number, number];
      xLabel?: string;
      yLabel?: string;
      fns: { label: string; expr: string }[];
      params?: { name: string; label?: string; min: number; max: number; step: number; value: number }[];
    }
  /** Interactive visualization: an HTML fragment (no <html>/<head>/<body>) run in a sandboxed iframe with no network
   *  except the CDN allowlist. Theme variables: --background --foreground --card --card-foreground --muted
   *  --muted-foreground --primary --primary-foreground --border --blue --green --red --purple --orange --yellow. */
  | { type: 'widget'; title: string; height: number; html: string }
  /** Follow-up buttons. ask: send `prompt` as the student's next message; reveal: ask for the full solution;
   *  practice: start a drill on `topic`; note: open the topic note; variant: make a similar problem. */
  | { type: 'actions'; items: { label: string; do: 'ask' | 'reveal' | 'practice' | 'note' | 'variant'; prompt?: string; topic?: string }[] };

export type CoachMode = 'hint' | 'concept' | 'reveal' | 'review';

/** job.result of /api/coach/ask (and /weekly). */
export interface CoachReply {
  mode: CoachMode;
  blocks: CoachBlock[];
  /** One-line plain-text summary, for history and notifications. */
  summary: string;
}

/** One past turn sent back with the next question (most recent last, at most 8). */
export interface CoachTurn {
  role: 'student' | 'coach';
  text: string;
}

/** Body of POST /api/coach/ask. All context fields are optional; with no itemId the coach answers in topic/page context. */
export interface CoachAskBody {
  question: string;
  itemId?: string;
  response?: unknown;
  topic?: string;
  page?: string;
  history?: CoachTurn[];
  /** true when the student explicitly asked for the answer (the 「我想看答案」 button). */
  reveal?: boolean;
}

export const WIDGET_MAX_HTML = 60_000;
export const COACH_MAX_BLOCKS = 12;
