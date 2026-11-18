export interface CoachResult {
  answer: string;
  steps: string[];
  keyPoint: string;
  pitfall: string;
}
export interface CoachJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  result?: CoachResult;
  error?: string;
}

export async function coachStatus(): Promise<{ available: boolean; model: string; busy: boolean }> {
  const r = await fetch('/api/coach/status');
  return r.json();
}

export async function askCoach(itemId: string, question: string, response: unknown): Promise<CoachJob> {
  const r = await fetch('/api/coach/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, question, response }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'AI 请求失败');
  return j.job;
}

export async function pollCoach(id: string): Promise<CoachJob> {
  const r = await fetch(`/api/coach/job?id=${encodeURIComponent(id)}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'AI 请求失败');
  return j.job;
}

export async function cancelCoach() {
  await fetch('/api/coach/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}
