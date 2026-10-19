// 题库练习: browse the whole bank by topic, by paper, or as a searchable list.
import { useMemo, useState } from 'react';
import { SUBJECTS, type Subject } from '@shared/types.ts';
import { topicStats } from '@shared/stats.ts';
import { useReady } from '../../lib/store.ts';
import { navigate, useRoute } from '../../lib/router.ts';
import { cx, SUBJECT_NAME } from '../../lib/format.ts';
import { PageHeader, Segmented } from '../../components/ui.tsx';
import { Icon, SUBJECT_ICON } from '../../components/Icon.tsx';
import { ItemPreview } from './ItemPreview.tsx';
import { isWrong, reservedMap } from './practiceData.ts';
import { TopicView } from './TopicView.tsx';
import { PaperView } from './PaperView.tsx';
import { ItemsView } from './ItemsView.tsx';
import './practice.css';

type View = 'topics' | 'papers' | 'items';
const VIEWS: View[] = ['topics', 'papers', 'items'];
const MEMO_KEY = 'eju-practice';

function remembered(): { view?: View; s?: Subject } {
  try {
    const raw = localStorage.getItem(MEMO_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as { view?: string; s?: string };
    return {
      view: VIEWS.find((x) => x === v.view),
      s: SUBJECTS.find((x) => x === v.s),
    };
  } catch {
    return {};
  }
}

function remember(view: View, s: Subject) {
  try {
    localStorage.setItem(MEMO_KEY, JSON.stringify({ view, s }));
  } catch {
    /* per-viewer convenience only */
  }
}

export interface SubjectSummary {
  total: number;
  done: number;
  wrong: number;
  starred: number;
  accuracy: number | null;
}

export function PracticePage(_props: {}) {
  const { state, bank, today } = useReady();
  const route = useRoute();
  const [memo] = useState(remembered);
  const view: View = VIEWS.find((v) => v === route.query.get('view')) || memo.view || 'topics';
  const subject: Subject = SUBJECTS.find((s) => s === route.query.get('s')) || memo.s || 'math';
  const topic = route.query.get('topic');
  const [preview, setPreview] = useState<string | null>(null);

  const go = (patch: { view?: View; s?: Subject; topic?: string | null }) => {
    const v = patch.view ?? view;
    const s = patch.s ?? subject;
    const t = patch.topic === undefined ? (patch.s && patch.s !== subject ? null : topic) : patch.topic;
    remember(v, s);
    const q = new URLSearchParams({ view: v, s });
    if (t) q.set('topic', t);
    navigate('/practice?' + q.toString(), { replace: true });
  };

  const stats = useMemo(() => topicStats(state, bank), [state, bank]);
  const reserved = useMemo(() => reservedMap(state, bank), [state, bank]);

  const summaries = useMemo(() => {
    const out = {} as Record<Subject, SubjectSummary>;
    for (const s of SUBJECTS) {
      let done = 0;
      let wrong = 0;
      let starred = 0;
      let tries = 0;
      let right = 0;
      for (const it of bank.bySubject[s]) {
        const p = state.progress[it.id];
        if (!p) continue;
        if (p.attempts > 0) done++;
        if (isWrong(p)) wrong++;
        if (p.starred) starred++;
        tries += p.attempts;
        right += p.correct;
      }
      out[s] = { total: bank.bySubject[s].length, done, wrong, starred, accuracy: tries ? right / tries : null };
    }
    return out;
  }, [state.progress, bank]);

  const total = bank.bundle.items.length;

  return (
    <div className="page pr-page">
      <PageHeader
        title="题库练习"
        desc={`${total} 道 EJU 真题，按考点专项练、按套卷整节练，或直接搜题。`}
        actions={
          <Segmented<View>
            value={view}
            onChange={(v) => go({ view: v })}
            options={[
              { value: 'topics', label: '按考点', icon: 'layers' },
              { value: 'papers', label: '按真题卷', icon: 'file' },
              { value: 'items', label: '题目', icon: 'search' },
            ]}
          />
        }
      />

      {view !== 'papers' && (
        <div className="pr-subjects" role="tablist" aria-label="科目">
          {SUBJECTS.map((s) => {
            const sum = summaries[s];
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === subject}
                className={cx('pr-subject', `tone-${s}`, s === subject && 'is-active')}
                onClick={() => go({ s })}
              >
                <span className="pr-subject-icon">
                  <Icon name={SUBJECT_ICON[s]} size={18} />
                </span>
                <span className="pr-subject-text">
                  <span className="pr-subject-name">{SUBJECT_NAME[s]}</span>
                  <span className="pr-subject-meta num">
                    已做 {sum.done}/{sum.total}
                    {sum.wrong > 0 && <span className="pr-subject-wrong"> · 错 {sum.wrong}</span>}
                  </span>
                </span>
                <span className="pr-subject-bar">
                  <i style={{ width: `${(sum.done / Math.max(1, sum.total)) * 100}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {view === 'topics' && (
        <TopicView
          key={subject}
          subject={subject}
          summary={summaries[subject]}
          stats={stats}
          reserved={reserved}
          today={today}
          onOpenTopic={(t) => go({ view: 'items', topic: t })}
        />
      )}
      {view === 'papers' && <PaperView reserved={reserved} onPreview={setPreview} />}
      {view === 'items' && <ItemsView subject={subject} topic={topic} reserved={reserved} onTopic={(t) => go({ topic: t })} onSubject={(s) => go({ s })} onPreview={setPreview} />}

      <ItemPreview itemId={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
