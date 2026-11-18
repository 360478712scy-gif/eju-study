# 澄学 EJU — design rules (every page follows these)

Calm, premium, focused: Linear / Things craft with the warmth of a study app. One learner, ~6 h a day for 19 days, often after midnight, in a native macOS window (default 1280×820, minimum 920×650). Read `FRONTEND.md` for the stack. This file covers how things look. The tokens are in `src/styles/tokens.css`, the primitives in `src/components/ui.css` / `ui.tsx`. **Never hard-code a color, font size, weight, radius or shadow in a page; if a token is missing, add it to the system instead.**

## 1. Type

| Token | px | Use |
|---|---|---|
| `--fs-xs` | 12 | meta, chips, badges, axis labels. **Floor: no Chinese text below 12px** (Latin-only axis ticks may be 11px). |
| `--fs-sm` | 13 | secondary lines, card subtitles, segmented labels |
| `--fs-ui` | 14 | dense UI: nav, buttons, table cells, list meta |
| `--fs-base` | 15 | body text, page descriptions, list titles |
| `--fs-md` | 16 | card titles, reading text (`.rt`) |
| `--fs-lg` | 18 | section titles, modal titles |
| `--fs-xl` | 22 | stat values (`StatTile`) |
| `--fs-2xl` | 28 | page H1, hero stat values |
| `--fs-3xl` / `--fs-hero` / `--fs-display` | 36 / 48 / 56 | display numerals only (`.num`) |

- **Weights: `--fw-regular` 400 body, `--fw-medium` 500 labels / buttons / nav / segmented, `--fw-semibold` 600 titles and emphasis, `--fw-bold` 700 only on `.num` numerals ≥ 22px.** PingFang / Hiragino stop at Semibold, so any 620–800 on mixed text draws Chinese at 600 and digits heavier beside it ("已做 13/138" looks uneven). `<b>` / `<strong>` are 600 globally.
- Line height: `--lh-ui` 1.6 for UI, `--lh-read-zh` 1.8 for Chinese reading, `--lh-read-ja` 1.95 for Japanese (`.rt:lang(ja)` already does this), `--lh-head` 1.3 for headings.
- Numbers: every count, score, time and percent uses `.num` (SF digits, tabular). Display numerals: `.num.num-lg` (28), `.num.num-xl` (40), `.num.num-2xl` (56), unit after it in `.num-unit` (0.5em, text-2). "%" always sticks to its number.
- KaTeX is set to 1.1em globally (katex.css's 1.21em is tuned for Latin serif). In Chinese prose write inline fractions as `a/b` or put them on a display line.

## 2. Layout

- Shell: sidebar + `.main`. `--sidebar-w` is 236 (>1100px), 212 (1025–1100), and a **64px icon rail at ≤1024px**, so at 920×650 the page gets ~856px. The rail shows tooltips, a countdown tile and dot badges automatically.
- Page: `<div className="page xx-page">` = max 1160px, padding `--page-pad-top` / `--page-pad-x` (28/36, 24/28 at ≤1100).
- Spacing is 4-based: `--sp-1…--sp-12` (4, 8, 12, 16, 20, 24, 32, 40, 48). Between cards 16; between sections 32 (`.section`); inside cards 20/22.
- Grids: `.grid .grid-2/3/4` (gap 16; 3–4 columns become 2 at ≤1100). A right rail that holds a time-critical card (bedtime, resume) must stay **above** the plan list when the layout stacks.
- Design for 920×650 first: nothing may overflow horizontally, headers must not wrap into three lines, wide display math scrolls inside `.rt-math-display`. When a page's primary action sits below the content (vocab next, player footer), make that footer sticky under 720px height.

## 3. Page header (one pattern)

```tsx
<PageHeader title="错题本" desc="到期的错题先做，间隔答对两次就移出。" info="规则的完整说明放这里（tooltip）" actions={<Segmented …/>} />
```
- H1 28/600, **actions on the H1 row** (right-aligned), one-line description in text-2 (≤ ~32 Chinese characters). Rule explanations go into `info` (an (i) tooltip), never a paragraph under the title.
- No eyebrow on list pages (do not repeat the nav label: no "冲刺计划" above "冲刺日历"). Eyebrows only for: Today's date line, the 考前一页纸 page type, and detail-page context (`SubjectTag size="sm"` + meta).
- Detail pages: `back={{ label: '模考', href: href('/mock') }}` renders the `.back-link` (13px, text-2, ← 14px) above the header.

## 4. Sections and titles

- `<Section title desc actions info>`: title 18/600, desc 13 text-3, margin-top 32.
- Card title (`.card-title`, `Card title=`): 16/600; subtitle 13 text-3.
- Inside content (explanations, notes): h3 15–16/600, margin 20 above / 6 below.
- Small labels above values: `.t-eyebrow` (12/500 text-3). Meta lines: `<Meta>` / `.meta` — children joined by "·" in text-3 13px.

## 5. Surfaces and cards

- Surface ramp: `--bg` (page) → `--bg-elev` (cards) → `--bg-elev-2` (popovers, toasts). Modals remap the tokens inside them (`--modal-*`), so a card style keeps working inside a modal.
- `--bg-sunken` is a quiet fill inside a card (wells, tiles, segmented tracks). In dark it is **lighter** than the card, never a black hole. Bars and ring tracks use `--track`.
- **`.card` for every surface**: bg-elev, 1px `--border`, radius 16, `--shadow-xs`, padding 20/22. Do not re-declare bg/border/radius/shadow in page CSS.
- **`.card-hero`** (or `<Card variant="hero">`): radius 20, padding 24/28, `--shadow-sm`. At most one per page. No tinted gradient washes, watermark icons, glows or pulse dots.
- `.card-sunken` / `variant="sunken"`: a well inside a card (radius 12, no border). Never put a bordered card inside a card.
- Radius: card 16 · inner block 12 (`--radius`) · control 8 (`--radius-sm`), 10 for 34px fields · chip/badge 6 (`--radius-xs`). Inner radius = outer − padding.
- **No colored stripes**: no `border-left`/`border-top` accents on rounded containers. Mark a group's tone with `<Dot tone=…/>` (8px) before its title, or an `IconTile`. "Next/current" = `.list-row.is-current` (soft primary fill + hairline). "Wrong" = the existing 1px border turns `--danger`.

## 6. Lists and rows

```tsx
<Card padding={false} title="今日计划"><List>
  <ListRow lead={<IconTile icon="sigma" tone="math" />} title="数学 · 微分" meta={<Meta><span>45 分钟</span><span>12 题</span></Meta>}
           trail={<Button variant="primary" size="sm">开始</Button>} current onClick={start} />
  <ListRow … hoverAction={<Button variant="ghost" size="sm">开始</Button>} chevron onClick={…} />
</List></Card>
```
- The **whole row is the click target** (`onClick` or `href`); hover = `--bg-hover`, radius 10. Rows are flat: no own border or card; separators are inset 1px `--divider` hairlines drawn by the row (`.list-row + .list-row::before`).
- **Only the "next" row gets a filled button.** Others show a ghost action on hover (`hoverAction`) or a chevron. No per-row blue links ("笔记" on 70 rows): the row opens the thing.
- The trailing column is fixed-width and right-aligned; counts use tabular figures.
- Item status in every list: `<StatusIcon status="todo|right|wrong|due|partial|skipped" />` (20px). Numbered circles only in the exam answer sheet and the finish list.
- Show the next 3 items; collapse finished and secondary content into a summary row with an expander.

## 7. Buttons and controls

- **One filled primary per viewport** (the hero CTA, or the player's footer). `secondary` for real alternatives, `ghost` for quiet actions, `soft` for a tinted secondary inside a hero. `danger` only for destructive confirms, `success` only for "完成/看完了".
- Sizes: `sm` 30, `md` 36, `lg` 44. Labels name the target: "下一项：日语听解 · 40 分钟", "重做今天到期的 17 题". Disabled is a flat `--bg-active` fill with text-3 (never a half-transparent primary).
- Icon-only: `<IconButton icon label />` (label = aria + tooltip). Never a native `title` tooltip; use `<Tooltip label kbd side>` (400ms delay, 120ms fade).
- Search: `<SearchField value onChange kbd="/" />`; select: `<Select value onChange options icon />` — both 34px, bg-elev, 1px `--border-strong`, radius 10, 15px icon in text-3.
- Filters: `<Segmented size="sm" options={[{ value, label, count }]} />` (count in `.seg-count`, text-3, no units). Page-level view switches: `<Tabs>` (underline). Sort: a ghost `sm` button with a chevron.
- Keyboard hints: `<Kbd>`. Focus: rings appear on keyboard focus only (`:focus-visible`, 3px `--focus-ring` box-shadow, following the element's radius). Do not set `border-radius` in a focus rule. If your element has its own `box-shadow`, compose it: `.x:focus-visible { box-shadow: var(--focus-ring), <your shadow> }` — otherwise the ring disappears. A page CTA with `autoFocus` (Enter starts it) shows no ring until focus leaves it once; inside modals the ring stays.

## 8. Tones and color semantics

- **Indigo `--primary` = action and selection only** (CTA, active nav, selected option, links).
- **Subject colors = identity only** (`SubjectTag`, `SubjectDot`, `IconTile`, chart series): 数学 blue, 物理 violet, 化学 green, 日语 rose; 综合 `mixed`. Kind labels in lists stay text-3; only the icon tile carries the color.
- **Green `success` = correct, done, at/above target.** Correct answers are green everywhere, including result banners.
- **Red `danger` = a single wrong answer at the moment it happens.** Never for progress, gaps or shortfalls.
- **Amber `warning` = due / unsure / partial credit / review.** Not for neutral numbers.
- Gaps are neutral: `<Chip>还差 17</Chip>` (`--gap-bg` / `--gap-text`), "还需提速" as a `warning` badge, never a red "-17".
- Mastery uses one scale everywhere (bars, rings, tiles): < 50% `danger` text, 50%–target neutral text-2, ≥ target `success`.
- Apply tones with `.tone-<name>` (sets `--tone`, `--tone-soft`, `--tone-text`). Soft tone fills are for icon tiles, badges and the selected state, not for large areas: in dark they turn muddy. Large tinted areas → `.card` or `--bg-sunken` plus a tone dot / icon.
- Callouts (考点 / 易错 / 速解 / tips): `<Callout tone icon title>` — a quiet surface (`--tint-amount` of the tone's soft fill: 70% light, 34% dark), tone in the icon and label. Never a colored left rule.

## 9. Data display

- One stat pattern: `<StatTile label value unit sub icon tone size boxed />` — label (12/500 text-3) on top, value `.num` 22/700 (28 with `size="lg"`), unit 13 text-2, sub 12 text-3. Grouped tiles: `boxed` (sunken, radius 12, no border) in `.stat-row` or a grid.
- Scores are always "x / max", and the denominator is always the maximum ("271 / 400", "133 / 200"). A target is never a denominator: label it "目标 630" or draw it as a tick on a ScoreBar.
- Legends: `<Legend items={[{ label, tone, shape: 'dot' | 'bar' | 'square', value }]} />` — categorical = 8px dot, line/target = 12×2 bar, area = 10px square.
- Below a sample threshold (e.g. < 30 first attempts) show "数据还少" and a range, not a precise number. Never draw a predicted score below the baseline as a red regression.
- `<KeyValue items={[[label, value]]} />` for fact lists.

## 10. Copy and formats

- Short, warm, direct Chinese. State-driven headings and CTAs ("继续错题重做 · 还剩 11 题", "01:30 收工 · 还有 50 分钟"). No jargon (块 → 任务, 重新生成 → 换一套安排), no disclaimer paragraphs.
- Glossary: 目标用时 (per question), 估分 (/200 mock score), 得分率 (partial credit), 正确率 (multiple choice; "首次" only in a sub-label), "还有 N 天" for every countdown.
- Durations: `fmtMinutes(min)` → "45 分钟" / "1 小时 8 分". Decimals ("10.8 小时") only for plan-level totals. Clocks (`fmtClock`, m:ss) only for timers. Never "7分" for minutes next to a score.
- Toasts only for actions with consequences (plan regenerated, item removed, export) — autosave is silent. `toast(text, 'success' | 'warning' | 'danger' | 'neutral')`.

## 11. Empty, loading, modal

- `<Empty icon title desc action size>`: says what happened and what to do next, with one action. Quiet icon (sunken tile), no illustration.
- `<Modal title footer width>`: radius 20, clips its children, sticky footer keeps its corners. On open it focuses an `autoFocus` control, an element marked `data-autofocus` (put it on the selected option of a picker, e.g. the current hour), or a checked `role="radio"`; otherwise the dialog itself — never the ×. Never auto-focus a toggle (收藏) where an extra Enter would undo something. Confirms: `useConfirm()`; destructive ones default focus to cancel.
- Spinner only inside the control that is waiting.

## 12. Motion

- 120–200ms with `--ease` (`--dur-fast` 120, `--dur` 160, `--dur-slow` 200). Hover/active color changes only; no layout jumps.
- No infinite animations on screens the learner stares at (no pulsing dots, no breathing glows). A timer turning critical changes color once. Loops, if any, live inside `@media (prefers-reduced-motion: no-preference)` and stop after 3 iterations.
- Allowed micro-moments: correct-answer check scale-in (0.92→1, 160ms) and a +1 tick on a count.

## 13. Dark mode (late night is the main use)

- Always check both themes. Dark text is softened (`--text` #d5dae4), the primary CTA is #5468ec with white text, wells are lighter than cards, toasts and tooltips are elevated dark pills.
- No pure white or saturated full-tone areas in dark; no colored glows or drop shadows tinted with the tone. Large tinted areas mix with `--tint-amount` (34% in dark) so they stay neutral surfaces with a hint of tone.
- Figures: keep the inversion for line drawings; blend so the plate rectangle disappears (`mix-blend-mode: lighten` on the inverted image over a dark surface).
- Tables in stems: header row uses `--bg-sunken` (already lighter than the card in dark).

## 14. Engine

The native window is a macOS **WKWebView (WebKit/Safari)**; screenshots are taken in Chrome. Use only features both support (`:has`, `color-mix`, `:focus-visible`, `backdrop-filter` with the `-webkit-` prefix are fine). Chrome-only extras such as `word-break: auto-phrase` are progressive enhancements, never load-bearing.

## 15. Checklist before you finish a page

1. 1280×820 and 920×650, light and dark: no horizontal overflow, no wrapped headers, nothing hidden under a sticky footer.
2. One filled primary in view; every list row clickable; no per-row repeated buttons.
3. Only tokens; weights 400/500/600 (700 only on `.num` ≥ 22px); nothing under 12px.
4. Red only for a wrong answer; gaps neutral; subject colors only for identity.
5. Keyboard: visible focus, Esc closes, no keys hijacked inside inputs or while `isComposing`.

## 16. Page debt (found by the review; fix when you touch the page)

The global layer already fixed tokens, dark surfaces, the 920px rail, focus, modals, toasts, tooltips and buttons. These remain in page CSS/TSX:

- **Today**: the hero stacks a 4px tone bar, a radial wash, a 210px watermark icon, a glowing tile and a pulsing dot → `card-hero` with the icon tile only. Plan rows: one filled 开始 (next row), others `hoverAction`. Copy: 块 → 任务, 重新生成 → 换一套安排. Bedtime/resume cards stay above the plan when the grid stacks.
- **Mistakes**: topic groups use `border-left` + nested bordered rows → `<Dot>` before the title + `List`/`ListRow`. Progress bar is 70% red → "攻克进度": success (已攻克) / warning (对 1 次) / `--border-strong` (new). Three filter rows → one row; collapse the rest (target 1–2 viewports).
- **Practice / Notes**: per-row 笔记 links and 练 N 题 buttons → row click + hover action; red "错 6" / "14 个薄弱" → text-2; mastery bars use the one mastery scale, not amber.
- **Mock**: ~20 outline 开始 buttons → row hover; red "-17" → `<Chip>还差 17</Chip>`; result grid wrong cells → danger-soft fill + 1px danger border; `■` legends → `<Legend>`. Detail header → `PageHeader back=`.
- **Plan**: drop the 冲刺计划 eyebrow; phase cards lose the left bar, outline and tint (neutral surface + `<Dot>`); dark phase cells must not be brown/green/maroon blocks.
- **Stats**: the header paragraph → `info`; 做不完 (red) → warning badge 还需提速; mastery chips lose `border-left`; tiles → `StatTile`.
- **Vocab**: drop the 每日词汇 eyebrow; the wrong card's red top bar → `border-color: var(--danger)`; search/select → `SearchField` / `Select`; summary ring markup.
- **Player**: one-line top bar with a 3px segmented progress; short items (recall, grammar, listening) in one centered column; 交卷 in the top bar is `secondary` while 下一题 is the filled one; the countdown danger pulse and audio "breathe" loop → static states.
- **Settings**: no toast on autosave; section headers use bare 16px icons; the equalizer loop stops after 3 iterations.
- **App shell (App.tsx)**: group the ⌘/ sheet into 导航 / 答题 / 数学答题卡 / 听力与词汇 / 应用, each with a `.t-eyebrow` label (the two-column layout and scroll fade already exist).
- **Onboarding**: the blue hero panel needs a dark variant (no full-saturation slab at night).
- **All page CSS**: literal sizes 10.5/11/11.5/12.5/14.5px and weights 620–800 → tokens (`--fs-*`, `--fw-*`; 700 only on `.num` ≥ 22px). No `border-left` stripes on rounded containers.
