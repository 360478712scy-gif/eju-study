// Dialog for a day's study budget (profile.dayMinutes). Used by Today and Plan.
import { useEffect, useMemo, useState } from 'react';
import { useReady, update } from '../../lib/store.ts';
import { Button, Modal, toast } from '../../components/ui.tsx';
import { Icon } from '../../components/Icon.tsx';
import { budgetFor, daysLeftOn } from '@shared/planner.ts';
import { weekdayZh } from '@shared/dates.ts';
import { cx, fmtDateShort, fmtMinutes } from '../../lib/format.ts';
import { regenerateDay } from './blocks.ts';
import './duration.css';

const PRESETS = [3, 4, 5, 6, 7, 8];

export function DurationDialog({ open, date, onClose, allowRest = false }: { open: boolean; date: string; onClose: () => void; allowRest?: boolean }) {
  const { state, today } = useReady();
  const profile = state.profile;
  const override = profile.dayMinutes[date];
  const current = typeof override === 'number' ? override : profile.dailyMinutes;
  const [minutes, setMinutes] = useState(current);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (!open) return;
    setMinutes(current);
    setCustom(PRESETS.includes(current / 60) || current === 0 ? '' : String(Math.round((current / 60) * 10) / 10));
  }, [open, current]);

  const isPreset = minutes === 0 || PRESETS.includes(minutes / 60);
  const effective = useMemo(() => budgetFor({ ...state, profile: { ...profile, dayMinutes: { ...profile.dayMinutes, [date]: minutes } } }, date), [state, profile, date, minutes]);
  const left = daysLeftOn(state, date);
  const isToday = date === today;
  const plan = state.plans[date];
  const keptMinutes = isToday && plan ? plan.blocks.filter((b) => b.status === 'done' || b.status === 'active').reduce((s, b) => s + b.minutes, 0) : 0;

  const onCustom = (v: string) => {
    setCustom(v);
    const h = Number(v);
    if (Number.isFinite(h) && h > 0 && h <= 14) setMinutes(Math.round(h * 60));
  };

  const save = (value: number | null) => {
    update((d, bank, t) => {
      if (value === null) delete d.profile.dayMinutes[date];
      else d.profile.dayMinutes[date] = value;
      if (date === t) regenerateDay(d, bank, t);
    });
    onClose();
    const label = value === 0 ? '休息日' : ` ${fmtMinutes(value ?? profile.dailyMinutes)}`;
    toast(isToday ? `今天改为${label}，计划已更新` : `${fmtDateShort(date)} 改为${label}`, 'success');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={500}
      title={isToday ? '调整今天的学习时长' : `${fmtDateShort(date)} ${weekdayZh(date)} 的学习时长`}
      footer={
        <>
          {typeof override === 'number' && (
            <Button variant="ghost" className="du-reset" icon="undo" onClick={() => save(null)}>
              恢复默认 {fmtMinutes(profile.dailyMinutes)}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => save(minutes)} disabled={minutes === current}>
            {isToday ? '保存并更新计划' : '保存'}
          </Button>
        </>
      }
    >
      <div className="du">
        <div className="du-grid">
          {allowRest && (
            <button
              type="button"
              className={cx('du-opt', minutes === 0 && 'is-on')}
              onClick={() => {
                setMinutes(0);
                setCustom('');
              }}
            >
              <Icon name="coffee" size={16} />
              <span>休息</span>
            </button>
          )}
          {PRESETS.map((h) => (
            <button
              key={h}
              type="button"
              className={cx('du-opt', minutes === h * 60 && 'is-on')}
              onClick={() => {
                setMinutes(h * 60);
                setCustom('');
              }}
            >
              <span className="num du-h">{h}</span>
              <span>小时</span>
            </button>
          ))}
        </div>
        <label className={cx('du-custom', !isPreset && 'is-on')}>
          <span>自定义</span>
          <input type="number" min={0.5} max={14} step={0.5} placeholder="例如 5.5" value={custom} onChange={(e) => onCustom(e.target.value)} />
          <span className="faint">小时</span>
        </label>
        <div className="du-note">
          <Icon name="info" size={15} />
          <div>
            {minutes === 0 ? (
              <>这一天不安排学习，计划会把时间留给其他天的复习。</>
            ) : (
              <>
                实际安排 <b>{fmtMinutes(effective)}</b>
                {effective < minutes && (left === 1 ? '（考前最后一天自动减量）' : '（考前几天自动减量 15%）')}
                {isToday && keptMinutes > 0 && <>，已完成和进行中的块保留</>}。
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
