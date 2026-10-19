# 澄学 EJU v2 — question authoring spec

Every gradable unit is one JSON `Item` (type in `shared/types.ts`). Items live in
`content/bank/<subject>/<file>.json` as `{"title": "...", "items": [ ... ]}`.
Run the validator on every file you write or edit and fix everything it reports:

```
node tools/v2/validate.mjs content/bank/physics/2019_1-a.json
```

The bank is for this learner's private, local study only (official JASSO papers are
copyrighted). Never upload or publish anything.

## 1. Fields

| field | rule |
|---|---|
| `id` | Physics `2019_1-phy-13` (answer row, 2 digits). Chemistry `2019_1-chem-07`. Math `2019_1-math-I1`, `-I2`, `-II1`, `-II2`, `-III`, `-IV` (use the paper's actual split, e.g. `-IV1`/`-IV2` if 大問IV has 問1/問2). Japanese `2017_2-ja-r02` (読解 row), `-lr05` (聴読解), `-l13` (聴解). Originals: `orig-<topic>-<n>`. |
| `subject` | `math` `physics` `chemistry` `japanese` |
| `section` | Japanese only: `reading` `listening-reading` `listening` |
| `group` | Items sharing one context/passage: `2019_1-phy-IV-D`, `2017_2-ja-p10`. Omit when not shared. |
| `order` | Position in the paper: answer row number (physics/chemistry/Japanese), or 1–6 for math parts in paper order. |
| `topic` | One taxonomy topic id from `content/taxonomy.json` (e.g. `phys.em.capacitor`). Pick the topic the question mainly tests. |
| `tags` | Optional extra taxonomy ids when a question genuinely combines topics. |
| `difficulty` | 1 = routine for EJU, 2 = standard, 3 = hard / long chain. |
| `targetSec` | EJU pace: physics 110, chemistry 100; math part 600–720 for Ⅰ/Ⅱ 問, 1100–1300 for Ⅲ/Ⅳ; 読解 60–75 (short Ⅰ–Ⅹ) or 90–120 per question (long); listening = audio seconds + 10. |
| `source` | `{"kind":"official","session":"2019_1","label":"2019年第1回 物理 問13（解答番号13）","pdf":"/assets/expanded/2019_1-science.pdf","page":16}` |
| `stem` | The original Japanese problem text, transcribed exactly (see §2). Include the shared context paragraph(s) the question needs. Do not translate. |
| `stemZh` | Physics/chemistry/math only: a faithful, concise Chinese translation of the stem (same formulas, same box labels). |
| `figures` | `[{"src":"/assets/v2/fig/2019_1-phy-13-1.png","caption":"…"}]` cropped with `tools/v2/crop.py` (§4). |
| `audio` | Listening only: `{"src":"/assets/v2/audio/2017_2-ja-l13.m4a"}` (already converted; path given in your task). |
| `format` | `choice` or `blanks` (math mark-sheet). |
| `options` | `choice`: the option texts exactly as printed (LaTeX allowed). Graph/figure options: `["①","②",…]` with the option figure cropped into `figures`. 聴解: the four options **as spoken** in the script (they stay hidden until the learner answers). |
| `optionLabels` | Printed labels, e.g. `["①","②","③","④","⑤","⑥"]`. Japanese: `["1","2","3","4"]`. Must have the same length as `options`. |
| `answer` | `choice`: **0-based** index of the official answer (official ⑤ → `4`). |
| `blanks` | `blanks`: one entry per letter, value is one character `"0"`–`"9"` or `"-"`: `{"A":"3","B":"-","C":"1"}`. Copy from the official answer key (key row `PQR → 427` means `P=4,Q=2,R=7`). |
| `explanation` | §3. |
| `transcript` | Listening: the full script of this question in Japanese, speaker-labelled lines `男：…` / `女：…`, including the question sentence and (聴解) the four spoken options. |
| `verified` | Transcriber: `{"status":"unverified","method":"官方正解表"}`. Verifier sets `verified` or `disputed` (§6). |

## 2. Text format (Markdown-lite + KaTeX)

- Paragraphs are separated by a blank line (`\n\n`); a single `\n` is a line break.
- `**bold**`, `__underline__` (use for 下線部 in Japanese reading), lists with `- ` or `1. `.
- Simple tables: GitHub pipe tables (`| a | b |` + `|---|---|`). Use them for option tables (e.g. combinations of 正/誤 for a, b, c) when the options are a grid — then put the whole table in the stem and set `options` to the row labels like `["①","②",…]`.
- Math: inline `$…$`, display `$$…$$`. KaTeX syntax only. Chemistry: use mhchem `$\ce{H2SO4}$`, `$\ce{Cu^{2+}}$`, `$\ce{N2 + 3H2 <=> 2NH3}$`, units `$\pu{1.0e5 Pa}$` or plain `$1.0\times10^{5}\,\mathrm{Pa}$`.
- Keep the paper's notation: vectors `$\vec{a}$` or `$\overrightarrow{AB}$`, `$\log_{2}3$`, `$\leqq$` style relations (`\leqq`, `\geqq`), italic variables, upright units `\mathrm{m/s}`.
- A literal dollar sign is `\$`. Circled numbers ①…⑨ may be written as plain characters.
- **Math answer boxes**: `\bx{A}`, `\bx{BC}` — exactly the box grouping printed in the problem (it must match the key's rows: key row `BC` ⇒ one box `\bx{BC}`). Works inside formulas: `$\ell=\dfrac{\bx{A}}{\bx{B}}$`, `$t^{\bx{D}}$`, `$\sqrt{\bx{I}}$`, and in text: `よって \bx{K} である。` When the paper reprints an earlier box greyed out, write the same `\bx{C}` again. Every letter in `blanks` must appear in a box and vice versa.
- Selection lists printed in a math problem ("⓪〜⑨の中から選びなさい") go into the stem as a list or table; the box still holds a digit.
- Japanese text: copy exactly (kanji/kana, full-width punctuation 「」、。), omit furigana, keep 下線 with `__…__`, keep line/paragraph structure. Use `$…$` only for real math.

## 3. Explanation (Chinese, the learner's main teacher)

`explanation` = `{ "zh": "...", "keyPoints": [...], "traps": [...], "terms": [...], "shortcut": "..." }`

- `zh`: complete, correct, step-by-step Chinese solution with formulas. Structure: **思路** (what to notice) → **解答** (numbered steps with equations) → **结论** (the answer, e.g. 答案 ⑤ / A=3, BC=12…). Math: cover every box group in order and say which letters each step fills. Choice questions: show why the answer is right and, briefly, why tempting wrong options fail. Japanese reading: quote the decisive sentence(s) 「…」 from the passage, explain them in Chinese, and say why each other option is wrong. Listening: quote the key line(s) from the script.
- `keyPoints`: 1–3 short 考点 lines (e.g. "并联电容器电压相同，电荷按电容分配").
- `traps`: 1–3 易错点.
- `terms`: 2–6 Japanese key terms from the stem a Chinese student may not know: `{"ja":"静電気力","kana":"せいでんきりょく","zh":"静电力（库仑力）"}`. The `zh` must explain, not just repeat the same kanji.
- `shortcut` (optional): a faster exam-time method (估算、极限检验、量纲、消元…).
- 2026 syllabus: chemistry thermochemistry is now written with enthalpy (ΔH, exothermic ΔH<0); if an old question uses 熱化学方程式 / 反応熱 Q, add a short "2026 新写法" paragraph converting it to ΔH form. Do not change the original stem.
- No unverifiable claims. If you are unsure, solve again; the official answer is authoritative.

## 4. Figures

Rendered pages are in `content/work/<session>/<subject>/pNN.png` (math/science 170 dpi, Japanese 150 dpi). To crop a figure from the original PDF at 300 dpi:

```
python3 tools/v2/crop.py <session> <math|science|ja-question> <pdfPage> <x0> <y0> <x1> <y1> <file-name.png>
```

`x0 y0 x1 y1` are **fractions of the page width/height** (0–1, origin top-left) measured on the rendered PNG: fraction = pixel ÷ image width (or height). Check the PNG's real size first (e.g. `python3 -c "from PIL import Image;print(Image.open('content/work/2019_1/physics/p16.png').size)"`). Then **Read the cropped file** to confirm the whole figure (all labels, axes, arrows) is inside with a small margin and nothing from the question text is included; adjust and re-crop if needed (re-using the same file name overwrites it). Name files `<itemId>-<n>.png`. Include every figure the question needs, including figures shared from the context and graph options. Do not crop text you have transcribed.

## 5. Per-subject notes

- **Physics**: one item per answer row (19 per paper). Ⅰ力学 rows 1–6, Ⅱ熱 7–9, Ⅲ波 10–12, Ⅳ電磁気 13–18, Ⅴ原子 19. Include the A/B/C context paragraph and its figure in every question that uses it (same `group`). Options: count them on the page (①〜⑥ etc.) — never guess the count.
- **Chemistry**: one item per 問 (20 per paper). Some pages hold two questions — keep them separate. If a question needs atomic masses or constants, add a line at the end of the stem: `（必要なら：H = 1.0, C = 12, O = 16）` with the values printed on the paper's constants page (p25).
- **Math コース2**: one item per 問 (Ⅰ問1, Ⅰ問2, Ⅱ問1, Ⅱ問2, Ⅲ, Ⅳ — follow the paper). Letters restart at A for each 大問 and continue from 問1 to 問2. Long problems: keep (1)(2)(3) structure with `\n\n` and display math. The answer key is authoritative.
- **Japanese 読解**: one item per answer row; stem = passage (or the needed part) + question; group items sharing a passage. **聴読解**: stem = the printed question/instruction + the figure (crop it); options printed (usually 1–4 text or labels on the figure). **聴解**: stem = a short instruction line such as 「会話を聞いて、質問に答えてください。」 (the question itself is in the audio); options = the spoken options from the script.

## 6. Verification (second agent)

Re-read the original page images and the official key, then for each item:
1. Transcription: numbers, signs, units, exponents, subscripts, option texts, option count, box letters/grouping and figure crops match the page exactly.
2. Answer: `answer` / `blanks` equal the official key.
3. Independent solve: solve from the transcribed stem without looking at the explanation; your result must equal the key. If it does not, find the transcription error and fix it. If the stem is faithful and the key still disagrees, keep the key, set `verified.status` = `disputed`, and explain in `verified.notes`.
4. Explanation: correct, complete, consistent with the key; fix errors; improve clarity.
5. Topic/difficulty/targetSec sensible; `terms` useful.
6. Validator passes.
Then set `"verified": {"status":"verified","method":"官方正解表 + 独立求解一致"}`.
