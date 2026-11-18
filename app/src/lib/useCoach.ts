import { useEffect, useRef, useState } from 'react';
import { ApiError, pollCoach, request, type CoachJob, type CoachResults } from './api.ts';
import { t } from '../copy/index.ts';

function errorText(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'timeout') return t.coach.errorTimeout;
  if (code === 'verification_failed') return t.coach.errorVariantUnverified;
  if (error instanceof ApiError && error.status === 409) return t.coach.busy;
  if (['cli_missing', 'login_required', 'quota', 'coach disabled'].includes(code) || error instanceof TypeError)
    return t.coach.errorServiceUnavailable;
  return t.coach.errorGeneral;
}

export function useCoachJob<K extends keyof CoachResults>() {
  const [pending, setPending] = useState<K | null>(null);
  const [error, setError] = useState('');
  const running = useRef<{ controller: AbortController; id?: string } | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  async function run<J extends K>(kind: J, body: object) {
    if (running.current) return;
    const controller = new AbortController();
    const task: { controller: AbortController; id?: string } = { controller };
    running.current = task;
    setPending(kind);
    setError('');
    try {
      const { job } = await request<{ job: CoachJob<J> }>('/api/coach/' + kind, body, controller.signal);
      task.id = job.id;
      const result = await pollCoach(job, controller.signal);
      if (result.status === 'cancelled') {
        if (live.current) setError(t.coach.cancelled);
      } else if (result.status !== 'done') throw new Error(result.error ?? '');
      return result.status === 'done' ? result : undefined;
    } catch (error) {
      if (!controller.signal.aborted && live.current) setError(errorText(error));
    } finally {
      if (running.current === task) {
        running.current = null;
        if (live.current) setPending(null);
      }
    }
  }

  const cancel = async () => {
    const task = running.current;
    if (!task?.id) return;
    try { await request('/api/coach/cancel', { id: task.id }); }
    catch (error) { setError(errorText(error)); }
  };
  return { run, pending, error, cancel };
}
