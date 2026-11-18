# 委托书 D：AI 助教 — 引导式答疑 + 交互式回答（服务端）

你在 `~/Projects/eju-study`（分支 `main`）工作。直接开始干。先读 `shared/coach-ui.ts`（设计师刚写的前后端共用类型，是这次的接口，不要改它的形状；确有必要只能加可选字段）、`server/coach.ts`、`design/api-contract.md` 的「AI 助教」一节。

## 用户的要求（原话）

1. 「默认助教模型换成 6.2sol」——默认模型改为 `gpt-6.2-sol`，effort 仍默认 `medium`。`shared/migrate.ts` 的默认值、`server/coach.ts`、接口文档一起改；已有档案里如果还是旧默认 `gpt-6.2-astra`（说明用户没自己改过），迁移成新默认。
2. 「让助教解答问题的时候不要直接说出来答案，只给一个大概的思路方向，除非明确要求他说出答案。并且方向不要给得直接相当于告诉他怎么做，而是要让他学会思考。」
3. 「让对话可以支持 GPT 的那种 intelligent UI」——助教的回答不再是一段文字，而是一组可渲染的块（`CoachBlock[]`），像 GPT 的内联可视化那样：逐级提示、引导提问、自测小题、公式、表格、可调参数的函数图、沙箱里的交互小组件、后续操作按钮。前端渲染由设计师做，你负责让模型稳定地产出这些块。

## 要做的

1. **/api/coach/ask** 改为接收 `CoachAskBody`（`itemId` 变成可选：没有题号时按 `topic` / `page` 作答；带最近最多 8 轮 `history`；`reveal` 表示学生明确要答案），返回 `CoachReply`。`/api/coach/weekly` 也返回 `CoachReply`（mode=review，可以用 table / plot / callout / actions）。grade、variant 保持现有结果结构不变。
2. **系统设定（教学法）**——这是本次最重要的部分，请认真设计并写成中文：
   - 默认（mode=hint）：针对具体题目的求助，**不说出答案、不说出决定性的那一步或关键方程**。先弄清他卡在哪（可以反问），然后只指一个思考方向：该从哪个概念/守恒量/条件入手、该检查什么、可以先算什么中间量。方向要留出让他自己走的那一步，不能具体到“照着做就出来了”。用 `question` 块把思考推回给他，用 `hints` 块给 2–4 级由泛到具体的提示（最具体的一级也不能等于答案），可用 `choice` 做一个检验理解的小题（不是原题）。结尾的 `actions` 里放「我想看答案」（do=reveal）和一两个后续追问。
   - 学生明确要答案（`reveal: true`，或问句里清楚地说「直接告诉我答案 / 给我完整解法」）时（mode=reveal）：给完整解法 `steps` + 关键公式 + 易错点，最后一个 `question` 让他用自己的话复述关键一步。
   - 概念性提问（「什么是楞次定律」这类，不针对题目求解）（mode=concept）：可以讲清概念，但讲完要用 `choice` 或 `question` 检查他是否真的懂。
   - 题目的官方答案和已有解析会作为数据传给模型，模型在 hint 模式里**知道但不能透露**；如果学生的作答是错的，只提示他检查哪一类问题，不说正确选项。
   - 语气：像靠谱的学长，简短、具体、有温度；中文为主，考点名可以用日语。
   - `widget`：只在动态/可调参数真的能帮他“看见”时用（例如导体棒切割磁感线时电流方向与受力、单摆周期与摆长、数列递推的前几项）。写 HTML 片段，只用主题变量配色、不发请求、不超过 `WIDGET_MAX_HTML`，脚本要能独立运行。能用 `plot` 表达的函数图优先用 `plot`。
3. **输出约束**：给 codex 的 `--output-schema` 写一个覆盖 `CoachReply` 的 JSON Schema（严格模式下的写法你来定，例如每种块统一成一个带 type 的对象、可选字段用可空），服务端拿到后**校验并清洗**：块数上限 `COACH_MAX_BLOCKS`、字符串长度上限、`choice.answer` 越界、`plot` 表达式只允许白名单字符与函数名、`widget.html` 去掉 `<script src>` 以外的外链（只允许 cdnjs.cloudflare.com / cdn.jsdelivr.net / unpkg.com / esm.sh）、去掉 `fetch`/`XMLHttpRequest`/`WebSocket` 字样的调用、高度夹在 120–640。hint 模式下再加一道检查：如果回答里出现了官方答案的选项号/最终数值，就把这条回答作废并以「再想想」方式重问一次（或降级为只保留 question + hints 前两级）。清洗后不合格就返回 `invalid_output`。
4. **测试**：用替身 CLI（不真的调模型）测：新请求体的各种组合、无题号提问、history 截断、reveal 标志、清洗规则（越界、外链、超长、泄露答案的检测）、weekly 新格式、默认模型迁移。再用真实 CLI 各跑一次 hint / reveal / concept（用题库里的一道电磁感应题，sol medium），把三次的原始输出存到 `design/agents/coach-samples/`，确认 hint 模式没泄露答案。
5. **文档**：更新 `design/api-contract.md` 的「AI 助教」一节（新请求体、CoachReply、各 mode、清洗规则）。

## 约束

- 只改 `server/`、`shared/`（`coach-ui.ts` 只能加可选字段）、`tests-v3/`、`design/api-contract.md`、`design/agents/coach-samples/`。**不要改 `app/`**（设计师正在写渲染器和对话界面）、`desktop/`、`content/`。
- 保持现有安全做法：只读沙箱、隔离临时目录、无 shell/网页、单任务、schema 约束。
- `npm run typecheck`、`npm test` 通过；分几次提交（只提交你的路径）。最后回复：改了什么、三次真实调用各花了多久、样例里 hint 模式是怎么引导的（摘一小段）。
