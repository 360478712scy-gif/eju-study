// The worked explanation: solution, key points, traps, shortcut, Japanese terms, transcript.
import type { Item } from '@shared/types.ts';
import { RichText } from '../RichText.tsx';
import { Icon } from '../Icon.tsx';
import { Callout } from '../ui.tsx';

export function Explanation({ item, showTranscript = true }: { item: Item; showTranscript?: boolean }) {
  const ex = item.explanation;
  return (
    <div className="q-ex">
      {(ex.keyPoints?.length || ex.traps?.length || ex.shortcut) && (
        <div className="q-ex-grid">
          {ex.keyPoints && ex.keyPoints.length > 0 && (
            <Callout tone="primary" icon="target" title="考点" className="q-ex-box">
              <ul>
                {ex.keyPoints.map((k, i) => (
                  <li key={i}>
                    <RichText text={k} lang="zh" inline />
                  </li>
                ))}
              </ul>
            </Callout>
          )}
          {ex.traps && ex.traps.length > 0 && (
            <Callout tone="warning" icon="alert" title="易错" className="q-ex-box">
              <ul>
                {ex.traps.map((k, i) => (
                  <li key={i}>
                    <RichText text={k} lang="zh" inline />
                  </li>
                ))}
              </ul>
            </Callout>
          )}
          {ex.shortcut && (
            <Callout tone="success" icon="zap" title="考场速解" className="q-ex-box is-wide">
              <RichText text={ex.shortcut} lang="zh" className="q-ex-box-text" />
            </Callout>
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
