// Hi-fi reference for the focus-mode question player (mock content).
import { useState } from 'react';
import { Page } from '../shell/Shell.tsx';
import { Button, Chip, Icon, IconButton, SubjectGlyph } from '../ui/ui.tsx';

const OPTS = ['$\\dfrac{vBL}{R}$', '$\\dfrac{v^2B^2L^2}{R}$', '$\\dfrac{vB^2L^2}{R}$', '$\\dfrac{B^2L^2}{vR}$'];
const PLAIN = ['vBL / R', 'v²B²L² / R', 'vB²L² / R', 'B²L² / (vR)'];

export function SessionProto() {
  const [pick, setPick] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const answer = 1;
  return (
    <Page>
      <div className="ses-top">
        <IconButton icon="close" label="结束这一段" />
        <SubjectGlyph subject="physics" size="sm" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-ui)', fontWeight: 600 }}>電磁誘導 · 导体棒切割磁感线</div>
          <div className="t-3" style={{ fontSize: 'var(--fs-xs)' }}>第 3 / 8 题 · 目标 2 分钟</div>
        </div>
        <div className="ses-progress" style={{ marginLeft: 12 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={i < 1 ? 'is-done' : i === 1 ? 'is-bad' : i === 2 ? 'is-now' : ''} />
          ))}
        </div>
        <Chip icon="clock">
          <span className="num">1:24</span>
        </Chip>
      </div>

      <div className="glass-read stem selectable ja" lang="ja">
        <p>
          図のように、磁束密度 <i>B</i> の一様な磁場中に、間隔 <i>L</i> の平行なレールを水平に置き、左端を抵抗値 <i>R</i> の抵抗でつないだ。レールの上に導体棒を置き、一定の速さ <i>v</i> で右向きに動かし続けた。
        </p>
        <p>
          導体棒を一定の速さで動かし続けるために必要な外力の仕事率はいくらか。最も適当なものを、次の①～④の中から一つ選びなさい。
        </p>
      </div>

      <div className="opts" role="radiogroup">
        {PLAIN.map((o, i) => {
          const cls = done ? (i === answer ? 'is-right' : i === pick ? 'is-wrong' : '') : i === pick ? 'is-picked' : '';
          return (
            <button key={i} type="button" role="radio" aria-checked={pick === i} className={`opt ${cls}`} onClick={() => !done && setPick(i)}>
              <span className="opt-key num">{done && i === answer ? <Icon name="check" size={15} stroke={2.2} /> : i + 1}</span>
              <span className="opt-text num">{o}</span>
            </button>
          );
        })}
      </div>

      <div className="hstack" style={{ marginTop: 18, gap: 10 }}>
        <Button variant="ghost" icon="flag">
          没把握
        </Button>
        <Button variant="ghost" icon="coach">
          问助教
        </Button>
        <span className="spacer" />
        {!done ? (
          <Button variant="primary" size="lg" kbd="↵" disabled={pick == null} onClick={() => setDone(true)}>
            提交
          </Button>
        ) : (
          <Button variant="primary" size="lg" iconRight="arrow-right" kbd="↵" onClick={() => { setDone(false); setPick(null); }}>
            下一题
          </Button>
        )}
      </div>

      {done && (
        <div className="glass-read explain selectable">
          <h4>思路</h4>
          <p>匀速 ⇒ 外力 = 安培力。先求感应电动势，再求电流，最后功率 = 外力 × 速度（也等于电阻的焦耳热功率）。</p>
          <h4>步骤</h4>
          <p>V = vBL，I = vBL / R，F = IBL = vB²L² / R，P = Fv = v²B²L² / R。</p>
          <div className="callouts">
            <div className="callout" data-tone="primary">
              <div className="callout-head">
                <Icon name="target" size={14} /> 考点
              </div>
              能量守恒：外力做功全部变成焦耳热。
            </div>
            <div className="callout" data-tone="warn">
              <div className="callout-head">
                <Icon name="alert" size={14} /> 易错
              </div>
              ③ 是只算了外力 F，忘了乘 v 才是功率。
            </div>
          </div>
        </div>
      )}
      <div style={{ height: 8 }} />
      <span className="sr-only">{OPTS.join()}</span>
    </Page>
  );
}
