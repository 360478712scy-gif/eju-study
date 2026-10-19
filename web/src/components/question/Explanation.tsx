// The worked explanation: solution, key points, traps, shortcut, Japanese terms, transcript.
import type { Item } from '@shared/types.ts';
import { RichText } from '../RichText.tsx';
import { Icon, type IconName } from '../Icon.tsx';
import type { ReactNode } from 'react';

function Box({ tone, icon, title, children }: { tone: string; icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className={`q-ex-box tone-${tone}`}>
      <div className="q-ex-box-title">
        <Icon name={icon} size={14} />
        {title}
      </div>
      {children}
    </div>
  );
}

export function Explanation({ item, showTranscript = true }: { item: Item; showTranscript?: boolean }) {
  const ex = item.explanation;
  return (
    <div className="q-ex">
      {(ex.keyPoints?.length || ex.traps?.length || ex.shortcut) && (
        <div className="q-ex-grid">
          {ex.keyPoints && ex.keyPoints.length > 0 && (
            <Box tone="primary" icon="target" title="考点">
              <ul>
                {ex.keyPoints.map((k, i) => (
                  <li key={i}>
                    <RichText text={k} lang="zh" inline />
                  </li>
                ))}
              </ul>
            </Box>
          )}
          {ex.traps && ex.traps.length > 0 && (
            <Box tone="warning" icon="alert" title="易错">
              <ul>
                {ex.traps.map((k, i) => (
                  <li key={i}>
                    <RichText text={k} lang="zh" inline />
                  </li>
                ))}
              </ul>
            </Box>
          )}
          {ex.shortcut && (
            <Box tone="success" icon="zap" title="考场速解">
              <RichText text={ex.shortcut} lang="zh" className="q-ex-box-text" />
            </Box>
          )}
        </div>
      )}
      <RichText text={ex.zh} lang="zh" className="q-ex-main" />
      {ex.terms && ex.terms.length > 0 && (
        <div className="q-terms-wrap">
          <div className="q-ex-sub">
            <Icon name="languages" size={14} />
            题中词汇
          </div>
          <div className="q-terms">
            {ex.terms.map((t) => (
              <span key={t.ja} className="q-term">
                <span className="q-term-ja" lang="ja">
                  <b>{t.ja}</b>
                  {t.kana && t.kana !== t.ja && <span className="q-term-kana">{t.kana}</span>}
                </span>
                <span className="q-term-zh" lang="zh-CN">
                  {t.zh}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
      {showTranscript && item.transcript && (
        <details className="q-transcript">
          <summary>
            <Icon name="file" size={14} /> 听力原文
            <Icon name="down" size={14} className="q-transcript-chev" />
          </summary>
          <RichText text={item.transcript} lang="ja" className="q-transcript-text" />
        </details>
      )}
    </div>
  );
}
