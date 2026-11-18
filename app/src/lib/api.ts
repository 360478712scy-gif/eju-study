import type { Action } from '@shared/actions.ts';
import type { AppState, ContentBundle, Item, WrittenResponse } from '@shared/types.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly state?: AppState;

  constructor(status: number, body: { error?: string; state?: AppState }) {
    super(body.error ?? String(status));
    this.status = status;
    this.state = body.state;
  }
}

export async function request<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    cache: 'no-store',
    signal,
    ...(body && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const json = await response.json();
  if (!response.ok) throw new ApiError(response.status, json);
  return json as T;
}

export const fetchState = async () => (await request<{ state: AppState }>('/api/state')).state;
export const fetchBank = () => request<ContentBundle>('/content/bank.json');
export const saveAction = (baseRevision: number, action: Action) =>
  request<{ revision: number; result: unknown }>('/api/action', { baseRevision, action });

export interface CoachResults {
  ask: { answer: string; steps: string[]; keyPoint: string; pitfall: string };
  grade: { response: WrittenResponse; earned: number; possible: number; rows: { partId: string; points: number; feedback: string }[]; summary: string };
  variant: { item: Item };
  weekly: { summary: string; nextSteps: string[] };
}

export interface CoachJob<K extends keyof CoachResults = keyof CoachResults> {
  id: string;
  kind: K;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  result?: CoachResults[K];
  error?: string;
}

export async function pollCoach<K extends keyof CoachResults>(job: CoachJob<K>, signal: AbortSignal) {
  const path = '/api/coach/job?' + new URLSearchParams({ id: job.id });
  while (job.status === 'running') {
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', cancel);
        resolve();
      }, 1000);
      if (signal.aborted) cancel();
      else signal.addEventListener('abort', cancel, { once: true });
    });
    job = (await request<{ job: CoachJob<K> }>(path, undefined, signal)).job;
  }
  return job;
}
