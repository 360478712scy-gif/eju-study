# 澄学 EJU v2 — frontend spec (for every page)

## Who this is for
One Chinese student, 19 days before EJU (2026-11-08), target 630 (日本語325 / 数学155 / 物理72 / 化学78) from 539. Studies ~6 h/day, often late at night (dark mode matters). Strong 高考 background; problems: forgotten knowledge, EJU fill-in format, speed, listening, reading kanji aloud. Previous app failed because it was ugly, slow and bureaucratic (forced writing, self-grading against whole answer tables, 7 tasks/day with paperwork). **Every screen must give one obvious next step, instant objective feedback, and zero paperwork.** Chinese UI copy: short, warm, direct, no developer jargon, no disclaimers walls.

## Stack & files
- React 19 + TypeScript, Vite, no UI library. Entry `web/src/main.tsx`, shell `web/src/App.tsx` (routes), sidebar `web/src/components/Sidebar.tsx`.
- Domain logic is in `shared/` (read it, do not change it): `types.ts` (AppState, Item, PlanBlock…), `actions.ts` (all state transitions), `planner.ts`, `stats.ts`, `srs.ts`, `grading.ts`, `bank.ts` (BankIndex: byId/bySubject/byTopic/bySession/topics/vocabById/notesByTopic, mockItems, mockTimeLimit, MOCK_LABEL, sessionLabel), `dates.ts`, `markup.ts`.
- Client libs in `web/src/lib/` (do not change): `store.ts` — `useApp(selector)` (selector must return an existing reference or primitive, never a new object/array — compute derived data with `useMemo`), `useReady()`, `update(fn)` (mutate a cloned draft via shared/actions; autosaves), `flush()`; `router.ts` — `useRoute()`, `navigate(path)`, `href(path)`, `addNavGuard`; `native.ts` — `saveTextFile`, `copyText`, `onWindowVisibility`, `onShellCommand`; `audio.ts` — `playSpeech(src)`, `stopSpeech()`, `onSpeechChange`, `speechElement()`; `format.ts` — `SUBJECT_NAME`, `fmtClock`, `fmtMinutes`, `pct`, `fmtDateShort`, `cx`; `api.ts` — AI coach (`coachStatus`, `askCoach`, `pollCoach`, `cancelCoach`).
- Components in `web/src/components/` (use them; do not edit unless your task says so): `ui.tsx` (Button, IconButton, Card, Badge, SubjectTag, SubjectDot, Progress, Ring, Segmented, Spinner, Kbd, Empty, Stat, Modal, toast, useConfirm, Section, PageHeader), `Icon.tsx` (see names in the file; SUBJECT_ICON), `RichText.tsx` (bank markup with KaTeX; pass `lang="ja"` for Japanese text, `lang="zh"` for Chinese), `question/*` (QuestionStem, Figures, OptionList/BlanksAnswer/optionLabel, Explanation).
- Styles: tokens in `web/src/styles/tokens.css` (colors, radii, shadows, font sizes — always use the variables, never hard-coded colors), primitives in `components/ui.css` (`.page`, `.grid-2/3/4`, `.row`, `.stack`, `.tone-*` sets `--tone/--tone-soft/--tone-text`). Each page gets its own CSS file next to it with a unique class prefix (e.g. `.td-` for today) imported by the page.

## Visual language
Calm, bright, generous whitespace, 1 accent (indigo `--primary`) + subject colors (数学 blue, 物理 violet, 化学 green, 日语 rose). Cards: white on `--bg`, 16px radius, hairline border, tiny shadow. Big friendly numbers (`.num` class) for countdown/scores. Layout must look great at 1280×820 and work down to 920×650 (native window minimum) and in both light and dark themes. No emoji as icons; use `Icon`. Motion: subtle (≤200ms). Never use `alert/confirm/prompt`, file inputs, `window.open`, full-page navigation to another path, or `location.reload()` (the native shell blocks them) — use Modal/useConfirm, `navigate()`.

## Behaviour rules
- All learner data lives in `AppState` (shared/types.ts) and is changed only through `update(d => …)` calling functions from `shared/actions.ts` (or plain field edits for settings/profile). Today's date: `useApp(s => s.today)` (study day starts 04:00).
- Starting practice: `const s = update((d, bank) => startBlock(d, bank, block))` or `startSession(d, {...})`, then `navigate('/session/' + s.id)`. The player page handles the rest.
- Keyboard: never hijack keys while an input/textarea is focused or while `e.isComposing` (Japanese IME!). ⌘1–4 navigation and Esc-to-close-modal already exist globally.
- Empty states must teach what to do next (use `Empty`).
- Numbers: estimated scores come from `shared/stats.ts` (`estimateAll`, `totalEstimate`, `topicStats`, `paceStats`, `streak`). Present them as 预测/估计, not guarantees, without long disclaimers.

## Checking your work
```
cd ~/Projects/eju-study
npx tsc --noEmit -p tsconfig.json          # must have no errors in your files
npx vite build --config web/vite.config.ts --outDir <your-tmp>/dist --emptyOutDir
mkdir -p <your-tmp>/data && cp content/fixtures/seeded/state-v2.json <your-tmp>/data/
EJU_DATA_DIR=<your-tmp>/data EJU_WEB_DIST=<your-tmp>/dist PORT=<your-port> node server.mjs &   # your own port
node tools/v2/shot.mjs "http://127.0.0.1:<your-port>/#/<route>" <your-tmp>/x.png [--dark] [--width=920 --height=650] [--full] [--click=<css>]
```
Then Read the PNG and iterate until it genuinely looks polished (alignment, spacing, hierarchy, contrast, no overflow, dark mode). Kill your server when done (`pkill -f "PORT=<your-port>"` won't work; use `lsof -ti tcp:<port> | xargs kill`). Re-copy the seeded state whenever you want a fresh learner. Never touch `data/` (the learner's real record) and never run anything on port 18763.
