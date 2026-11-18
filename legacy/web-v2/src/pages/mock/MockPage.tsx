// 模考: #/mock lists papers, schedule and history; #/mock/<resultId> shows one result.
import { useApp } from '../../lib/store.ts';
import { MockList } from './MockList.tsx';
import { MockNotFound, MockResultView } from './MockResult.tsx';
import './mock.css';

export function MockPage({ resultId }: { resultId?: string }) {
  const result = useApp((s) => (resultId ? s.state?.mocks.find((m) => m.id === resultId) : undefined));
  if (!resultId) return <MockList />;
  if (!result) return <MockNotFound />;
  return <MockResultView key={result.id} result={result} />;
}
