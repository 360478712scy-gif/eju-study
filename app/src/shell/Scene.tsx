// The living backdrop: seasonal illustration (cross-faded), veil, vignette, weather particles, pointer parallax.
// Season follows the calendar of the plan (winter → spring → early summer toward the June exam);
// day/night follows the clock. Both can be fixed in 设置 → 外观.
import { useEffect, useRef, useState } from 'react';

export type Season = 'winter' | 'spring' | 'summer';
export type DayPart = 'day' | 'night';
export type SceneMode = 'auto' | `${Season}-${DayPart}`;
export type Weather = 'auto' | 'off';

export function seasonOf(d = new Date()): Season {
  const m = d.getMonth() + 1;
  if (m >= 11 || m <= 2) return 'winter';
  if (m <= 4) return 'spring';
  return 'summer';
}
export function dayPartOf(d = new Date()): DayPart {
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= 6.5 && h < 17.5 ? 'day' : 'night';
}
export function resolveScene(mode: SceneMode, d = new Date()): { season: Season; part: DayPart; key: string } {
  if (mode !== 'auto') {
    const [season, part] = mode.split('-') as [Season, DayPart];
    return { season, part, key: mode };
  }
  const season = seasonOf(d);
  const part = dayPartOf(d);
  return { season, part, key: `${season}-${part}` };
}

/** Re-evaluates every minute so the scene turns to night by itself. */
export function useScene(mode: SceneMode, tone: 'system' | 'light' | 'dark' = 'system') {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const s = resolveScene(mode, now);
  useEffect(() => {
    document.documentElement.setAttribute('data-tone', tone === 'system' ? (s.part === 'day' ? 'light' : 'dark') : tone);
    document.documentElement.setAttribute('data-season', s.season);
  }, [s.part, s.season, tone]);
  return s;
}

export function Scene({ mode = 'auto', weather = 'auto', calm = false, parallax = true, tone = 'system' }: { mode?: SceneMode; weather?: Weather; calm?: boolean; parallax?: boolean; tone?: 'system' | 'light' | 'dark' }) {
  const s = useScene(mode, tone);
  const [layers, setLayers] = useState<{ key: string; ready: boolean }[]>([{ key: s.key, ready: false }]);
  const bgRef = useRef<HTMLDivElement>(null);

  // cross-fade when the scene changes
  useEffect(() => {
    setLayers((ls) => (ls[ls.length - 1]?.key === s.key ? ls : [...ls.slice(-1), { key: s.key, ready: false }]));
  }, [s.key]);
  const onLoad = (key: string) => {
    setLayers((ls) => ls.map((l) => (l.key === key ? { ...l, ready: true } : l)));
    setTimeout(() => setLayers((ls) => (ls.length > 1 && ls[ls.length - 1].key === key ? ls.slice(-1) : ls)), 1400);
  };

  // pointer parallax (background moves against the pointer; panels read --px/--py from the stage)
  useEffect(() => {
    if (calm || !parallax || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.style.setProperty('--px', '0');
      document.documentElement.style.setProperty('--py', '0');
      return;
    }
    let tx = 0,
      ty = 0,
      x = 0,
      y = 0,
      raf = 0;
    const move = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      const root = document.documentElement.style;
      root.setProperty('--px', x.toFixed(4));
      root.setProperty('--py', y.toFixed(4));
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, [calm, parallax]);

  return (
    <div className="scene" aria-hidden>
      <div className="scene-bg" ref={bgRef}>
        {layers.map((l) => (
          <div key={l.key} className={`scene-img${l.ready ? ' is-ready' : ''}`} style={{ backgroundImage: `url(/scenes/${l.key}.thumb.jpg)` }}>
            <img src={`/scenes/${l.key}.jpg`} alt="" onLoad={() => onLoad(l.key)} draggable={false} />
          </div>
        ))}
      </div>
      <div className="scene-veil" />
      {weather !== 'off' && <Particles season={s.season} part={s.part} paused={calm} />}
      <div className="scene-vignette" />
    </div>
  );
}

/* ───────── weather particles (canvas) ───────── */

type P = { x: number; y: number; r: number; vx: number; vy: number; a: number; ph: number; rot: number; vr: number };

function Particles({ season, part, paused }: { season: Season; part: DayPart; paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let w = 0,
      h = 0,
      dpr = 1,
      raf = 0,
      last = performance.now();
    const kind = season === 'winter' ? 'snow' : season === 'spring' ? 'petal' : part === 'night' ? 'firefly' : 'mote';
    const density = { snow: 1 / 16000, petal: 1 / 52000, firefly: 1 / 60000, mote: 1 / 70000 }[kind];
    let ps: P[] = [];
    const spawn = (anywhere: boolean): P => {
      const depth = Math.random();
      const r = kind === 'snow' ? 0.6 + depth * 2.4 : kind === 'petal' ? 3 + depth * 4 : 0.8 + depth * 1.8;
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : -10,
        r,
        vx: kind === 'snow' ? (Math.random() - 0.5) * 8 : kind === 'petal' ? 14 + Math.random() * 18 : (Math.random() - 0.5) * 6,
        vy: kind === 'snow' ? 10 + depth * 28 : kind === 'petal' ? 16 + depth * 20 : (Math.random() - 0.5) * 6,
        a: kind === 'snow' ? 0.25 + depth * 0.6 : kind === 'petal' ? 0.55 + depth * 0.35 : 0.3 + Math.random() * 0.5,
        ph: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 1.2,
      };
    };
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(w * h * density);
      ps = Array.from({ length: n }, () => spawn(true));
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.ph += dt * (kind === 'firefly' ? 1.6 : 0.9);
        p.x += (p.vx + Math.sin(p.ph) * (kind === 'petal' ? 14 : 6)) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (kind === 'firefly' || kind === 'mote') {
          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;
        } else if (p.y > h + 12 || p.x > w + 20) Object.assign(p, spawn(false), { x: Math.random() * (w + 200) - 200 });
        if (kind === 'snow') {
          ctx.globalAlpha = p.a;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind === 'petal') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, 0.55 + Math.sin(p.ph * 1.7) * 0.35);
          ctx.globalAlpha = p.a;
          ctx.fillStyle = part === 'night' ? '#ffc6dc' : '#ffd3e2';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.62, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          const glow = 0.5 + Math.sin(p.ph) * 0.5;
          ctx.globalAlpha = p.a * (kind === 'firefly' ? glow : 0.6);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
          g.addColorStop(0, kind === 'firefly' ? 'rgba(255,236,160,1)' : 'rgba(255,255,255,0.9)');
          g.addColorStop(1, 'rgba(255,236,160,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    if (!paused) raf = requestAnimationFrame(draw);
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !paused) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [season, part, paused]);
  return <canvas ref={ref} className={`scene-particles${paused ? ' is-paused' : ''}`} />;
}
