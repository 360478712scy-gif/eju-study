设计师验收了真实页面，前端还有这些要改（只改 app/，不要改 shared/ server/ content/ desktop/，也不要改 app/src/copy/zh.ts；缺文案照旧写进 app/src/copy/zh.pending.ts，每条注释写清用在哪里）。设计师已经直接改过 onboarding/ProfileFields.tsx、session/Question.tsx 的答题卡、mock 页、learning.css、shell.css，这些视觉改动请保留。

1. **今天页台本的时间**：现在写成「00:00 / 19:00 / 1:04:00」，看起来像钟点。改成从开始算起的偏移，统一 H:MM（0:00、0:19、1:04、1:12）。
2. **休息日 / 学完以后的侧面板**：现在「今日队列 0 节安排 · 共 0 分钟」是空的。休息日显示下一个学习日的安排预览（标题写日期，列出那天的任务，不带开始按钮）；今天学完显示明天的预览。
3. **复习页列表**：一次渲染上百行。默认只列前 30 条，下面一个「查看全部 N 项」展开；导航角标与开始按钮的数量用引擎今天的口径（引擎刚把新背诵卡改成每天限量）。
4. **预测分**：引擎在 evidence=sparse 时给出基线 ± 满分 8% 的区间。今天页的预测卡与数据页的区间图，在 sparse 时显示一个「数据还少」的小标签（warn 或 neutral 色 Chip），区间文字照常。
5. **助教一句话（今天页的 coach-line）**：现在是固定的「一步一步来，把每道题的关键步骤想清楚」。改成按数据挑一句：优先级 ①昨天/最近一次学习里错得最多的考点（考点名 + 错几题）②今天第一个专项任务的 why（weak_focus：考点 + 掌握度%）③今天有校内考任务（学校名）④连续学习天数。每种情况一个文案函数（写进 pending）。
6. **校内任务显示学校**：引擎现在在 today/plan 的 school 块上返回 school 与 schoolPurpose，今天页台本、侧面板队列、计划页周视图里显示学校名（明治 / 青学…）和「真考形式 / 院校拔高」。
7. **首次引导第 3 步**：弱项折叠区的按钮现在用的是 t.common.expandBtn（「展开详细内容」），换成专门的 onboarding.moreTopicsBtn（pending，例如「添加其他考点」）。
8. 检查 `npm run typecheck`、`npm run build`、`npm test` 全通过，提交。最后回复改了什么、pending 新增了几条。
