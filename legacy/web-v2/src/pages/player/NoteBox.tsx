// Personal note on an item (saved into the learner's progress, shown in the mistake book).
// The player shows a quiet "写一句笔记" button among the tools and the editor under them.
import { useEffect, useRef, useState } from 'react';
import { setItemNote } from '@shared/actions.ts';
import { update, useApp } from '../../lib/store.ts';
import { Icon } from '../../components/Icon.tsx';
import { cx } from '../../lib/format.ts';

const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

export function NoteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="pl-tool" onClick={onClick} onMouseDown={keepFocus}>
      <Icon name="pen" size={15} />
      写一句笔记
    </button>
  );
}

export function NoteEditor({ itemId }: { itemId: string }) {
  const saved = useApp((s) => s.state?.progress[itemId]?.note ?? '');
  const [text, setText] = useState(saved);
  const [state, setState] = useState<'idle' | 'dirty' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  latest.current = text;

  const save = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    update((d) => setItemNote(d, itemId, latest.current.trim()));
    setState('saved');
  };

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        update((d) => setItemNote(d, itemId, latest.current.trim()));
      }
    },
    [itemId],
  );

  return (
    <div className="pl-note">
      <div className="pl-note-head">
        <span>
          <Icon name="pen" size={13} /> 我的笔记
        </span>
        <span className={cx('pl-note-state', state === 'saved' && 'is-saved')}>{state === 'dirty' ? '编辑中…' : state === 'saved' ? '已保存' : '自动保存'}</span>
      </div>
      <textarea
        value={text}
        rows={2}
        autoFocus={!saved}
        placeholder="下次看到这题时想提醒自己的话，例如「先画受力图」"
        onChange={(e) => {
          setText(e.target.value);
          setState('dirty');
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(save, 900);
        }}
        onBlur={() => state === 'dirty' && save()}
      />
    </div>
  );
}
