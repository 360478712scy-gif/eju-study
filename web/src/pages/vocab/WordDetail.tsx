// Word card: reading with audio, meaning, trap, example, and how each skill is going.
import { useMemo } from 'react';
import type { VocabAttempt, VocabSkill } from '@shared/types.ts';
import { VOCAB_MAX_BOX } from '@shared/srs.ts';
import { daysBetween } from '@shared/dates.ts';
import { useApp } from '../../lib/store.ts';
import { cx, fmtDateShort } from '../../lib/format.ts';
import { Icon } from '../../components/Icon.tsx';
import { Badge, Modal } from '../../components/ui.tsx';
import { AudioButton, Highlighted, Meter } from './parts.tsx';
import { CATEGORY_LABEL, SKILL_LABEL, vocabGroup } from './run.ts';

function dueText(due: string, today: string): string {
  const d = daysBetween(today, due);
  if (d <= 0) return '今天该复习';
  if (d === 1) return '明天复习';
  return `${fmtDateShort(due)} 复习`;
}

export function WordDetail({ vocabId, onClose }: { vocabId: string | null; onClose: () => void }) {
  const bank = useApp((s) => s.bank);
  const progress = useApp((s) => s.state?.vocab);
  const attempts = useApp((s) => s.state?.vocabAttempts);
  const today = useApp((s) => s.today);
  const v = vocabId && bank ? bank.vocabById.get(vocabId) : undefined;
  const p = vocabId ? progress?.[vocabId] : undefined;

  const recent = useMemo(() => {
    if (!vocabId || !attempts) return [] as VocabAttempt[];
    return attempts.filter((a) => a.vocabId === vocabId).slice(-6).reverse();
  }, [attempts, vocabId]);

  const group = v ? vocabGroup(v) : undefined;

  const responseText = (a: VocabAttempt): string => {
    if (!a.response) return '没有作答';
    if (a.skill === 'read') return a.response;
    const chosen = bank?.vocabById.get(a.response);
    if (chosen) return chosen.meaningZh;
    return /^\d+$/.test(a.response) ? `选项 ${a.response}` : a.response;
  };

  return (
    <Modal open={!!v} onClose={onClose} width={600}>
      {v && (
        <div className="vc-detail">
          <div className="vc-detail-top">
            <div className="vc-detail-tags">
              <Badge tone={v.category === 'science' ? 'physics' : 'neutral'}>{CATEGORY_LABEL[v.category]}</Badge>
              {group && <Badge>{group}</Badge>}
            </div>
            <button type="button" className="vc-detail-close" onClick={onClose} aria-label="关闭">
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="vc-detail-word" lang="ja">
            {v.word}
          </div>
          <div className="vc-detail-reading">
            <span lang="ja">{v.reading}</span>
            {v.altReadings && v.altReadings.length > 0 && (
              <span className="faint text-sm" lang="ja">
                也读 {v.altReadings.join('・')}
              </span>
            )}
            <AudioButton src={v.audio?.word} label="读音" size="sm" />
          </div>
          <p className="vc-detail-meaning">{v.meaningZh}</p>
          {v.trapZh && (
            <div className="vc-trap">
              <Icon name="alert" size={15} />
              <span>{v.trapZh}</span>
            </div>
          )}
          {v.example && (
            <div className="vc-example">
              <div className="vc-example-ja" lang="ja">
                <span className="vc-example-text">
                  <Highlighted text={v.example.ja} word={v.word} />
                </span>
                <AudioButton src={v.audio?.example} size="sm" label="例句" />
              </div>
              {v.example.zh && <p className="vc-example-zh">{v.example.zh}</p>}
            </div>
          )}

          <div className="vc-detail-skills">
            {(['read', 'meaning'] as VocabSkill[]).map((skill) => {
              const sp = p?.[skill];
              return (
                <div key={skill} className="vc-detail-skill">
                  <div className="row-between">
                    <span className="vc-detail-skill-name">{skill === 'read' ? '看字写读音' : '看词选意思'}</span>
                    <Meter p={sp} />
                  </div>
                  <div className="vc-detail-skill-sub">
                    {sp ? (
                      <>
                        第 {sp.box}/{VOCAB_MAX_BOX} 级 · 练 {sp.seen} 次对 {sp.correct} 次 ·{' '}
                        <span className={cx(sp.due <= today && 'vc-due-text')}>{dueText(sp.due, today)}</span>
                      </>
                    ) : (
                      '还没练过'
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {recent.length > 0 && (
            <div className="vc-detail-history">
              <div className="vc-detail-h">最近作答</div>
              <ul>
                {recent.map((a) => (
                  <li key={a.id} className={cx(a.correct ? 'is-right' : 'is-wrong')}>
                    <Icon name={a.correct ? 'check' : 'x'} size={14} />
                    <span className="vc-hist-skill">{SKILL_LABEL[a.skill]}</span>
                    <span className="vc-hist-resp" lang={a.skill === 'read' ? 'ja' : undefined}>
                      {responseText(a)}
                    </span>
                    {(a.legacy || a.heardAudio) && <span className="vc-hist-flag">听音作答</span>}
                    <span className="vc-hist-date faint">{fmtDateShort(a.date)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
