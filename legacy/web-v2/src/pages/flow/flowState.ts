// 跟学模式 state: whether the day is being walked through in order, and how far the warm-up got.
// Kept per device in localStorage (a convenience, not study data); the plan itself lives in AppState.
import type { AppState, Item, PlanBlock } from '@shared/types.ts';
import type { BankIndex } from '@shared/bank.ts';
import { topicStats } from '@shared/stats.ts';

const KEY = 'eju-flow';

interface FlowMemo {
  date: string;
  warmupDone: boolean;
  /** Warm-up position, so leaving and coming back resumes at the same note. */
  warmupIndex: number;
}

function read(): FlowMemo | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FlowMemo) : null;
  } catch {
    return null;
  }
}

function write(m: FlowMemo | null) {
  try {
    if (m) localStorage.setItem(KEY, JSON.stringify(m));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode etc.: flow still works for this page view */
  }
  window.dispatchEvent(new Event('eju-flow-change'));
}

export function flowMemo(today: string): FlowMemo | null {
  const m = read();
  return m && m.date === today ? m : null;
}

export function flowActive(today: string): boolean {
  return !!flowMemo(today);
}

export function startFlow(today: string) {
  const m = flowMemo(today);
  write(m ?? { date: today, warmupDone: false, warmupIndex: 0 });
}

export function stopFlow() {
  write(null);
}

export function setWarmup(today: string, index: number, done: boolean) {
  write({ date: today, warmupIndex: index, warmupDone: done });
}

export function onFlowChange(fn: () => void) {
  window.addEventListener('eju-flow-change', fn);
  return () => window.removeEventListener('eju-flow-change', fn);
}

// ─── Order ───
// Retrieval warm-up first (quick recall, then due mistakes), mocks in exam order each followed by
// its correction, then the planner's interleaved subject blocks (hardest work while fresh),
// grammar, the trap sheet, and vocabulary last before sleep.
function rank(b: PlanBlock): number {
  if (b.title.includes('考点速测')) return 0;
  if (b.kind === 'review' && !b.reviewOfMock) return 1;
  if (b.kind === 'notes') return 1.5;
  if (b.kind === 'mock' || b.reviewOfMock) return 2;
  if (b.title.includes('文型')) return 4;
  if (b.kind === 'traps') return 5;
  if (b.kind === 'vocab') return 6;
  return 3;
}

export function flowOrder(blocks: PlanBlock[]): PlanBlock[] {
  const indexed = blocks.map((b, i) => ({ b, i }));
  const mocks = indexed.filter(({ b }) => b.kind === 'mock');
  const mockKey = (b: PlanBlock) => (b.mock ? `${b.mock.kind}:${b.mock.session}` : b.reviewOfMock ? `${b.reviewOfMock.kind}:${b.reviewOfMock.session}` : '');
  // A mock's correction comes right after that mock.
  const sub = (x: { b: PlanBlock; i: number }) => {
    if (rank(x.b) !== 2) return x.i;
    const m = mocks.findIndex(({ b }) => mockKey(b) === mockKey(x.b));
    return m * 2 + (x.b.reviewOfMock ? 1 : 0);
  };
  return [...indexed].sort((a, b) => rank(a.b) - rank(b.b) || sub(a) - sub(b) || a.i - b.i).map((x) => x.b);
}

/** Up to `n` topics to review before starting: the weakest topics today's blocks will practice. */
export function warmupTopics(state: AppState, bank: BankIndex, blocks: PlanBlock[], n = 4): string[] {
  const notesBlock = blocks.find((b) => b.kind === 'notes' && b.status !== 'skipped');
  // Today's 考点速记 already done: those notes were just reviewed, so no warm-up.
  if (notesBlock?.status === 'done') return [];
  if (notesBlock?.noteTopics?.length) return notesBlock.noteTopics.filter((t) => bank.notesByTopic.has(t)).slice(0, 6);
  const count = new Map<string, number>();
  const add = (t: string | undefined, w = 1) => {
    if (t && bank.notesByTopic.has(t)) count.set(t, (count.get(t) ?? 0) + w);
  };
  for (const b of blocks) {
    if (b.status === 'skipped' || b.status === 'done') continue;
    add(b.topic, 3);
    for (const id of b.itemIds) {
      const it: Item | undefined = bank.byId.get(id);
      if (it && !it.id.startsWith('recall-') && !it.topic.startsWith('ja.')) add(it.topic);
    }
  }
  const stats = topicStats(state, bank);
  return [...count.entries()]
    .map(([t, c]) => ({ t, score: c * (1.1 - (stats.get(t)?.mastery ?? 0.6)) * ((bank.topics.get(t)?.weight ?? 3) / 5) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.t);
}
