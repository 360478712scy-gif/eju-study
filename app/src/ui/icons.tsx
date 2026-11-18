// 澄学 3.0 line icons — drawn on a 24 grid, 1.6 stroke, round caps and joins.
// Filled glyphs (transport controls, dots) set fill and no stroke themselves.
import type { CSSProperties, ReactNode } from 'react';

const F = { fill: 'currentColor', stroke: 'none' } as const;

const P: Record<string, ReactNode> = {
  // ── navigation
  today: (
    <>
      <path d="M3.5 17.5h17" />
      <path d="M7.5 17.5a4.5 4.5 0 0 1 9 0" />
      <path d="M12 7v2.2M6.4 10.4l1.5 1.5M17.6 10.4l-1.5 1.5M3.8 14.6h1.9M18.3 14.6h1.9" />
      <path d="M8.5 20.5h7" />
    </>
  ),
  plan: (
    <>
      <path d="M9 4.5 3.8 6.4v13.1L9 17.6l6 1.9 5.2-1.9V4.5L15 6.4z" />
      <path d="M9 4.5v13.1M15 6.4v13.1" />
    </>
  ),
  practice: (
    <>
      <path d="M14 3.5H7.2a2.2 2.2 0 0 0-2.2 2.2v12.6a2.2 2.2 0 0 0 2.2 2.2H11" />
      <path d="M8.5 8.2h6.2M8.5 11.8h4" />
      <path d="M18.3 12.4l2.1 2.1-5.7 5.7h-2.1v-2.1z" />
    </>
  ),
  review: (
    <>
      <path d="M19.6 13a7.8 7.8 0 0 1-13.9 3.9" />
      <path d="M4.4 11a7.8 7.8 0 0 1 13.9-3.9" />
      <path d="M18.6 3.6v3.6H15M5.4 20.4v-3.6H9" />
    </>
  ),
  mock: (
    <>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 13.5V9.8M10 3h4M12 3v3.5M18.3 7.2l1.3-1.3" />
    </>
  ),
  notes: (
    <>
      <path d="M12 6.6C10 5.1 7.6 4.6 4 4.6v13.2c3.6 0 6 .5 8 2 2-1.5 4.4-2 8-2V4.6c-3.6 0-6 .5-8 2z" />
      <path d="M12 6.6v13.2" />
    </>
  ),
  insights: (
    <>
      <path d="M4 20.2h16" />
      <path d="M7 16.6v-3.8M12 16.6V8.4M17 16.6v-6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7.2h9M17.4 7.2H20M4 16.8h2.6M11 16.8h9" />
      <circle cx="15.2" cy="7.2" r="2.2" />
      <circle cx="8.8" cy="16.8" r="2.2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.3 13.4c.07-.46.1-.93.1-1.4s-.03-.94-.1-1.4l1.9-1.5-1.9-3.3-2.25.9a7.5 7.5 0 0 0-2.43-1.4L14.3 3h-3.8l-.33 2.3a7.5 7.5 0 0 0-2.43 1.4l-2.25-.9-1.9 3.3 1.9 1.5c-.07.46-.1.93-.1 1.4s.03.94.1 1.4l-1.9 1.5 1.9 3.3 2.25-.9a7.5 7.5 0 0 0 2.43 1.4l.33 2.3h3.8l.33-2.3a7.5 7.5 0 0 0 2.43-1.4l2.25.9 1.9-3.3z" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3.2" />
      <path d="M9.4 4.5v15" />
    </>
  ),

  // ── transport (filled)
  play: <path {...F} d="M8 5.6v12.8c0 .7.8 1.1 1.4.7l10-6.4a.85.85 0 0 0 0-1.4l-10-6.4C8.8 4.5 8 4.9 8 5.6z" />,
  pause: (
    <>
      <rect {...F} x="6.5" y="5" width="4" height="14" rx="1.4" />
      <rect {...F} x="13.5" y="5" width="4" height="14" rx="1.4" />
    </>
  ),
  prev: (
    <>
      <path {...F} d="M18 6.3v11.4c0 .7-.8 1.1-1.4.7L8.4 13a1.2 1.2 0 0 1 0-2l8.2-5.4c.6-.4 1.4 0 1.4.7z" />
      <rect {...F} x="5.2" y="5.4" width="2.4" height="13.2" rx="1.2" />
    </>
  ),
  next: (
    <>
      <path {...F} d="M6 6.3v11.4c0 .7.8 1.1 1.4.7l8.2-5.4a1.2 1.2 0 0 0 0-2L7.4 5.6C6.8 5.2 6 5.6 6 6.3z" />
      <rect {...F} x="16.4" y="5.4" width="2.4" height="13.2" rx="1.2" />
    </>
  ),
  stop: <rect {...F} x="6.5" y="6.5" width="11" height="11" rx="2.4" />,
  dots: (
    <>
      <circle {...F} cx="6" cy="12" r="1.6" />
      <circle {...F} cx="12" cy="12" r="1.6" />
      <circle {...F} cx="18" cy="12" r="1.6" />
    </>
  ),

  // ── assistant, media
  coach: (
    <>
      <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20.2l1.1-4.1A8 8 0 1 1 20 12z" />
      <path d="M12 8.2c.3 1.8 1.3 2.8 3.1 3.1-1.8.3-2.8 1.3-3.1 3.1-.3-1.8-1.3-2.8-3.1-3.1 1.8-.3 2.8-1.3 3.1-3.1z" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11 4c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z" />
      <path d="M18 15.5c.25 1.4.85 2 2.25 2.25-1.4.25-2 .85-2.25 2.25-.25-1.4-.85-2-2.25-2.25 1.4-.25 2-.85 2.25-2.25z" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6.2l10-2.1v11.6" />
      <circle cx="6.6" cy="18" r="2.4" />
      <circle cx="16.6" cy="15.8" r="2.4" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.8 11.5a6.2 6.2 0 0 0 12.4 0M12 17.8v2.7" />
    </>
  ),
  send: (
    <>
      <path d="M20.4 3.6 10.2 13.8" />
      <path d="M20.4 3.6 14.1 20.4l-3.9-6.6-6.6-3.9z" />
    </>
  ),
  volume: (
    <>
      <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a7.8 7.8 0 0 1 0 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M20.5 15.5 16 11l-8 8" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.6a2 2 0 0 1 2-2h1.8l1.4-2h5.6l1.4 2H18a2 2 0 0 1 2 2v8.9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.8" r="3.4" />
    </>
  ),

  // ── general
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="M20 20l-4.6-4.6" />
    </>
  ),
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.6l4.3 4.3L19 7.2" />,
  'chev-left': <path d="M14.5 5.5 8 12l6.5 6.5" />,
  'chev-right': <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  'chev-down': <path d="M5.5 9.5 12 16l6.5-6.5" />,
  'chev-up': <path d="M5.5 14.5 12 8l6.5 6.5" />,
  'arrow-right': <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  'arrow-left': <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />,
  'arrow-up-right': <path d="M7 17 17 7M8.5 7H17v8.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  flag: (
    <>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.6h11.3l-2.2 3.9 2.2 3.9H5.5" />
    </>
  ),
  bookmark: <path d="M7 4h10a.5.5 0 0 1 .5.5V20l-5.5-3.8L6.5 20V4.5A.5.5 0 0 1 7 4z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.6V12l3 2" />
    </>
  ),
  history: (
    <>
      <path d="M4.2 12a7.8 7.8 0 1 0 2.3-5.5" />
      <path d="M4 3.8v3.6h3.6M12 8v4l2.8 1.8" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.2" width="16" height="15" rx="3.2" />
      <path d="M4 10h16M8.5 3.2v4M15.5 3.2v4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 11v5" />
      <circle {...F} cx="12" cy="7.9" r="1.1" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M9.6 9.6a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6" />
      <circle {...F} cx="12" cy="16.9" r="1.05" />
    </>
  ),
  alert: (
    <>
      <path d="M10.4 4.6 3.3 17.4a1.8 1.8 0 0 0 1.6 2.7h14.2a1.8 1.8 0 0 0 1.6-2.7L13.6 4.6a1.8 1.8 0 0 0-3.2 0z" />
      <path d="M12 9.6v4.2" />
      <circle {...F} cx="12" cy="16.8" r="1.05" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M9.9 6.1A9 9 0 0 1 12 5.8c6 0 9.2 6.2 9.2 6.2a15.6 15.6 0 0 1-2.4 3.2M6.4 7.6C4 9.3 2.8 12 2.8 12S6 18.2 12 18.2c1.6 0 3-.4 4.2-1" />
      <path d="M4 4l16 16M10 10.1a2.8 2.8 0 0 0 3.9 3.9" />
    </>
  ),
  bolt: <path d="M13.2 3 5.4 13.4h5.9L10.4 21l7.8-10.4h-5.9z" />,
  flame: <path d="M12 21c3.9 0 6.5-2.6 6.5-6.2 0-4.3-3.6-6.3-4.6-10.3-2.3 1.6-3.6 3.9-3.4 6.4-1.1-.6-1.9-1.7-2.1-3-1.6 1.6-2.9 4-2.9 6.9C5.5 18.4 8.1 21 12 21z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.6" />
      <circle {...F} cx="12" cy="12" r="1.4" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5.2a2.8 2.8 0 0 0 2.9 3.6M16 6h2.8a2.8 2.8 0 0 1-2.9 3.6M12 13v3.6M8.5 20h7M9.5 20l.6-3.4h3.8l.6 3.4" />
    </>
  ),
  star: <path d="M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.6l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />,
  layers: (
    <>
      <path d="M12 4.2 3.6 8.6 12 13l8.4-4.4z" />
      <path d="M3.6 12.6 12 17l8.4-4.4" />
      <path d="M3.6 16.4 12 20.8l8.4-4.4" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.6" height="6.6" rx="1.8" />
      <rect x="13.4" y="4" width="6.6" height="6.6" rx="1.8" />
      <rect x="4" y="13.4" width="6.6" height="6.6" rx="1.8" />
      <rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.8" />
    </>
  ),
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle {...F} cx="4.9" cy="6.5" r="1.2" />
      <circle {...F} cx="4.9" cy="12" r="1.2" />
      <circle {...F} cx="4.9" cy="17.5" r="1.2" />
    </>
  ),
  sheet: (
    <>
      <circle cx="7" cy="7" r="2" />
      <circle cx="12" cy="7" r="2" />
      <circle {...F} cx="17" cy="7" r="2" />
      <circle {...F} cx="7" cy="12.5" r="2" />
      <circle cx="12" cy="12.5" r="2" />
      <circle cx="17" cy="12.5" r="2" />
      <circle cx="7" cy="18" r="2" />
      <circle {...F} cx="12" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.2 7.2v5.6l-3.6 1.9v-7.5z" />,
  refresh: (
    <>
      <path d="M19.4 12.6A7.6 7.6 0 1 1 17 6.6" />
      <path d="M19.2 3.6v4h-4" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8z" />
      <path d="M13.2 6.6l4.2 4.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.8h15M9.5 6.8V4.6h5v2.2M6.4 6.8l.9 12.2a1.8 1.8 0 0 0 1.8 1.6h5.8a1.8 1.8 0 0 0 1.8-1.6l.9-12.2" />
      <path d="M10.2 10.6v6M13.8 10.6v6" />
    </>
  ),
  download: <path d="M12 4v11M7.5 10.6 12 15l4.5-4.4M5 19.8h14" />,
  upload: <path d="M12 15.5v-11M7.5 9 12 4.5 16.5 9M5 19.8h14" />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 0 0-5.7-5.7l-1.1 1.1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3.1 3.1a4 4 0 0 0 5.7 5.7l1.1-1.1" />
    </>
  ),
  school: (
    <>
      <path d="M3.2 9.6 12 4.8l8.8 4.8" />
      <path d="M5.4 10.4v7.6M9.8 10.4v7.6M14.2 10.4v7.6M18.6 10.4v7.6M3.6 20.4h16.8" />
    </>
  ),
  cards: (
    <>
      <rect x="3.5" y="6.6" width="13" height="14" rx="2.6" />
      <path d="M7.6 3.6h9.8a3.1 3.1 0 0 1 3.1 3.1v9.9" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.2 18h5.6M10.2 21h3.6" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
    </>
  ),
  keyboard: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M7 10h.01M10.3 10h.01M13.7 10h.01M17 10h.01M8 14h8" />
    </>
  ),
  coffee: (
    <>
      <path d="M5 9.5h11v4.8a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
      <path d="M16 11h1.4a2.6 2.6 0 0 1 0 5.2H16M8.5 3.5c-.6.9.6 1.6 0 2.6M12 3.5c-.6.9.6 1.6 0 2.6" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
    </>
  ),
  expand: <path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5l-6 6M4.5 19.5l6-6" />,
  shrink: <path d="M19.5 9.5h-5v-5M4.5 14.5h5v5M14.5 9.5l6-6M9.5 14.5l-6 6" />,
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.6" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </>
  ),

  // ── scene
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3" />
    </>
  ),
  moon: <path d="M19.6 14.6A7.6 7.6 0 0 1 9.4 4.4a7.8 7.8 0 1 0 10.2 10.2z" />,
  snow: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.6 4.6 12 6.4l2.4-1.8M9.6 19.4 12 17.6l2.4 1.8" />,
  petal: <path d="M12 20.5c-4.2-2.2-6.6-5.5-6.6-9.4C5.4 7 8.3 4 12 3.6c.9 1.1 2.1 1.6 3.6 1.4 1.8 1.6 3 3.6 3 6.1 0 3.9-2.4 7.2-6.6 9.4z" />,
  drop: <path d="M12 3.6S5.8 10.4 5.8 14.4a6.2 6.2 0 0 0 12.4 0C18.2 10.4 12 3.6 12 3.6z" />,
  particles: (
    <>
      <circle {...F} cx="6" cy="7" r="1.3" />
      <circle {...F} cx="15" cy="5" r="1" />
      <circle {...F} cx="18.5" cy="12" r="1.5" />
      <circle {...F} cx="9" cy="14" r="1" />
      <circle {...F} cx="5" cy="19" r="1.2" />
      <circle {...F} cx="14" cy="19" r="1" />
    </>
  ),

  // ── subjects
  math: (
    <>
      <path d="M13.6 4.4c-1.5-.9-3.3 0-3.5 1.9l-1.1 11.8c-.2 1.9-2 2.8-3.5 1.9" />
      <path d="M14.2 15.8c1.1-2.8 2.6-4.2 4.6-4.2" />
      <path d="M14.4 11.6c.6 2.8 1.9 4.2 4.2 4.2" />
    </>
  ),
  physics: (
    <>
      <ellipse cx="12" cy="12" rx="8.6" ry="3.4" />
      <ellipse cx="12" cy="12" rx="8.6" ry="3.4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="8.6" ry="3.4" transform="rotate(120 12 12)" />
      <circle {...F} cx="12" cy="12" r="1.5" />
    </>
  ),
  chemistry: (
    <>
      <path d="M9.4 3.6h5.2M10.4 3.6v5.3l-5.1 8.8a2 2 0 0 0 1.7 3h10a2 2 0 0 0 1.7-3l-5.1-8.8V3.6" />
      <path d="M7.4 14.2h9.2" />
      <circle {...F} cx="10.6" cy="17.2" r="0.9" />
      <circle {...F} cx="13.8" cy="16.4" r="0.7" />
    </>
  ),
  mixed: (
    <>
      <circle cx="8" cy="8" r="3.6" />
      <rect x="12.6" y="12.6" width="7" height="7" rx="1.8" />
      <path d="M16.1 4.4l3.4 5.9h-6.8z" />
      <path d="M4.6 15.4l5 5M9.6 15.4l-5 5" />
    </>
  ),
};

export type IconName = keyof typeof P;
export const ICON_NAMES = Object.keys(P) as IconName[];

export function Icon({
  name,
  size = 18,
  stroke = 1.6,
  className,
  style,
  label,
}: {
  name: IconName | string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
  label?: string;
}) {
  const body = P[name] ?? P.help;
  return (
    <svg
      className={className ? `ic ${className}` : 'ic'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {body}
    </svg>
  );
}
