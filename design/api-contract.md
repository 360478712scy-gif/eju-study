# 澄学 EJU 3.0 前端接口

本机同源 HTTP 服务，默认 http://127.0.0.1:18763 。新前端直接消费 JSON，无需复制排程或打分算法。日期为本地学习日 YYYY-MM-DD，凌晨四点换日，周一为一周起点。

| 入口 | 请求 | 返回 |
| --- | --- | --- |
| 启动 | GET /api/health、GET /api/state、GET /content/bank.json | 版本；{state}；规范化的 ContentBundle（items、taxonomy、notes、papers） |
| 今天 | GET /api/today?date=2026-11-19 | {plan,next}，next 含下一项操作 |
| 计划 | GET /api/plan?date=2026-11-19 | 路线图、阶段目标、当周七日和模拟卷安排 |
| 练习 | GET /api/practice?subject=physics&topic=phys.em.induction | {items}，另支持 q、school、session、format |
| 复习 | GET /api/review?date=2026-11-19 | {queue}，取 itemId 对接题库 |
| 模考 | GET /api/mocks | {papers,results}，以 kind + session 开考 |
| 笔记 | GET /api/notes | {notes}，按 topic 关联正文与个人笔记 |
| 数据 | GET /api/stats?date=2026-11-19 | {mastery,predictions,days,weekly} |
| 修改 | POST /api/action | JSON {baseRevision,action} → {revision,result}，冲突返回 409，请刷新 |
| 助教 | POST /api/coach/{ask,grade,variant,weekly} | 202 {job}。GET /api/coach/job?id=… 轮询 |

## 修改状态

每次从 GET /api/state 取得 state.revision。写示例为 `{"baseRevision":0,"action":{"type":"startPractice","itemIds":["2019_1-phy-01"]}}`。成功时 result 是下面的操作结果，前端刷新状态及当前视图。并发窗口使用同一 revision 只会成功一次。超时后先读回，避免重复计时。状态写入和评分均由服务执行。

| action.type | 其余字段 | result 与语义 |
| --- | --- | --- |
| profile | patch（Profile 的顶层字段） | 更新后的 profile。baseline、targets 一次传齐三科，milestones 为四个递增日期及各科目标。weekdays 使用 ISO 1–7，默认 [1,2,4,5,6]。onboarded=true 完成引导 |
| settings | patch | 更新后的 settings。theme、fontScale、musicEnabled、musicTrack、musicVolume、coachEnabled、coachModel、coachEffort |
| day / move / restWeek | day 用 date,value（study/off/default）；move 用 from,to；restWeek 用 date,paused | calendar。休息周可传当周任意一天，paused=false 恢复 |
| startBlock / skipBlock / completeBlock | date,blockId（取当前 today.plan） | 开始题目块返回 session，手动块返回 block。休息和回顾可 completeBlock，题目块用 finish。仅可操作当前学习日 |
| startPractice | itemIds，可选 kind（free/review/drill） | session，从 result.id 继续。按顺序取题，默认即时反馈 |
| startVariant | jobId（取已通过双解核对的任务 id） | 将变式纳入本地题库并返回 session |
| startMock | kind（math/science/school）,session（套卷键） | session，固定整卷题序。GET /api/mocks 取键、itemIds 与 timeLimitSec |
| draft / answer | sessionId,itemId,response,seconds，可选 confidence（sure/unsure/guess）、gaveUp | seconds 是本题累计用时。draft 存草稿，answer 在普通练习中返回 {correct,score,groups?}，考试中暂存返回 null |
| tick | seconds，可选 sessionId | 当日 DayLog。前台学习秒数是增量，答题耗时不额外加到日统计。休息不发 tick |
| finish / abandon | sessionId | finish 返回结束的 session，或 {pendingWritten:[题号]}。abandon 退出并保留已经入账的练习作答 |
| topicNote / itemNote / star | topicNote 用 topic,text；itemNote 用 itemId,text；star 用 itemId,value（布尔） | 个人考点笔记文本或更新后的题目进度 |

没有活动会话时才能开始练习。刷新或隔天回来时读 state.activeSessionId、state.sessions[id].answers 恢复。选择题 response 为从 0 起的选项下标，数学填空为逐字符映射（例如 {"A":"-","B":"2"}）。普通记述题先在纸上写，再显示 written.parts 的 modelAnswer 与 rubric，提交例如 `{"method":"self","marks":{"1":[4,0]},"text":"V=BLv"}`。每行勾选获该行全分，未勾得 0；必须提交每小问的每一行。score 是实得分除以全题满分，满分才是 correct。空白放弃可传 response=null,gaveUp=true。

记述模考先交文本草稿 `{"text":"V=BLv"}`，纸上作答可填「见纸面」占位。调用 finish 封卷，收到 pendingWritten 后才展开标准解答。用 answer 为每道待评题补齐 marks（保留该题原 text），再次 finish 出成绩。封卷后无法更换客观题答案或改写原稿。

## 视图返回值

七个入口都是纯读取。日期默认取服务所在机器的当前学习日。计划页可用 `date` 选中要看的周，用 `asOf` 指定观察日。比如 `/api/plan?date=2027-03-08&asOf=2026-11-19` 预览三月。今天页的 `date` 同时作为观察日，回顾过往学习优先读已保存的日计划。

| 视图 | 接线时需要的字段 |
| --- | --- |
| today | plan 有 date、phase、budgetMinutes、blocks。next.code 为 resume_session（sessionId）、start_block / continue_block（blockId、why）、day_complete / rest（nextDate，考后为 null）。新装时先看 profile.onboarded |
| plan | roadmap 每天含 date、phase、minutes、plannedMinutes、missed。错过的日期保留原计划分钟并将待学分钟置 0。week 为选中周一到周日的七个日计划，附 missed、plannedMinutes。milestones 含日期与三科目标。mocks 每行含 anchor、date、kind、session、done，date=null 表示本周期没有足够长的学习日 |
| practice | items 为完整 Item；筛选可叠加。topic 支持单点或点分前缀，session 是 source.session 真题回次，school 取六校代码，q 查题干、题号、题源、标签或考点名称。校内套卷用 mocks 页返回的套卷键 |
| review | queue 每行有 itemId、topic、due、reasons、traps。默认列到期条目及新卡，scope=all 也列未来到期项。reasons 可同时含 mistake、guess、possible_guess、slow、spaced、card；易错点直接取 traps。按 itemId 去重、due 排序。历史错题若已从题库下架，其作答和进度可在 state 中查看 |
| mocks | papers 每行含 kind、session、label、itemIds、timeLimitSec。results 按交卷顺序，raw 为 0–1，answered 为实际作答数，total 包含空题。EJU 按科估算分数，校内卷按 rubric 满分加权，estimate=null |
| notes | notes 每行有 topic、body（题库笔记，可能为空）、text（学生自己的内容）。同一考点内的题目保留 explanation.terms 术语注释 |
| stats | mastery 每行含 topic、subject、value（0–1）、weight、priority、difficulty（1–3）、samples、speedRatio、lastDate?。speedRatio 表示作答时长对目标时长的平滑比值，无计时记录为 null。predictions 含 subject、scale、estimate、range、samples、topics、evidence。days 按日期索引学习时长和作答数 |

一个学习任务的形状如下。题号和解释数据随当日学习记录变化。

```json
{"id":"2026-11-19:1","kind":"learn","subject":"physics","minutes":45,"status":"todo","topic":"phys.em.induction","itemIds":["phys-example"],"why":{"code":"weak_focus","topic":"phys.em.induction","mastery":0.32,"weight":4,"difficulty":1}}
```

任务 kind 为 learn、interleave、review、quiz、school、mock、break、notes。why.code 为 weak_focus、topic_focus、mixed_retrieval、spaced、weekly_test、school_practice、monthly_paper、mock_correction、rest、consolidate 或 maintenance。仅有相应证据的任务才带 mastery、weight、difficulty 或 due。校内任务与校内套卷还含 school、schoolPurpose（exam_style 或 extension），优先采用有对应学科笔试的风格题。任务状态依次可为 todo、active、done，也可 skipped。复盘文案可从这些字段映射。

weekly 的 start/end 是自然周边界，through 是实际统计截止日。plannedDays、plannedMinutes 覆盖整周，plannedFocusMinutes 扣除休息；activeDays、seconds、attempts、correct 仅累计到 through。timeCompletion 是整周专注时长完成比例（封顶 1，没有预算则 null）。blocksDone / blocksOpenedPlan 只统计已经打开并保存的日计划中的非休息块。gains 是本周有实答且估计值上升的最多三个考点，元素为 {topic,delta}，无证据返回空数组。focus 为 {topic,mastery,weight}，adjustments 元素为 {code:"focus_topic",topic} 或 {code:"review_due",count}。

### 排程与统计口径

- 默认按一、二、四、五、六排课。2026-11-19 至 2027-06-19 共 153 个学习日，首周三个，考前一周五天各 60 分钟，其他学习日各 120 分钟，包含休息。考试日没有任务。2027 年 6 月 20 日已核对。[JASSO 实施要项](https://www.jasso.go.jp/ryugaku/eju/about/eju_guide/2027.html)
- foundation 至 12 月底，reinforce 至 2 月底，integrate 至 4 月底，之后为 sprint，考前七天为 taper。以 120 分钟为例，四阶段的专项学习块依次为 45、37、30、23 分钟，其余时间逐步转给交错和限时练习。减量周安排提取练习、维持和整理。已开始的当天计划保存快照，后续日期使用最新作答重新计算。
- 规律学习日漏学后在当周空闲日补，挪到下周会一并转移周配额。休息周保留已发生的学习。可用日期不足时保留缺口。月考从 11 月到次年 6 月每月一回，数学及物理＋化学分两天各 80 分钟，未完成的分卷在该周期内顺延。普通练习预留未考卷，已做过的错题仍可到期复习。长题会扩充当日复习时段。卷后优先从本次错题中选订正题。
- 三月起校内练习从隔周增到每周，四月起每周最多两次。校内卷按 school 与 source.session 分组，其次用 group，同校无分组信息的题归入 practice 合集。timeLimitSec 取题目的目标时长之和。题库构建后自动纳入新内容，当前内容不足时空余时间用于数理化交错练习。
- 每个考点以最近基线和强弱标签为初值。作答后按难度预期与实际得分之差更新，重复作答权重较低。长期无复现证据时向保守起点衰减；近期错题、猜对或明显慢题优先。选择依据为考试权重 × 掌握缺口，再以画像和速度修正，同一输入的带权抽题结果固定。理科题干中的日语不影响学科归属。
- 明确标猜记 guess。极快答对的单选且未标有把握时，仅作 possible_guess 提醒；超过目标题时 1.8 倍且答对记 slow。作答不稳时次日重现，稳定复现按 3、7、14、30、60 天延长，过早重做不会提前升级。
- 预测使用近期、首次作答的正式 EJU 题，排除复做、复习、背诵卡及校内卷，按时间和信心折权并向基线收缩。有效证据同时受题目数和考点覆盖面约束。UI 应同时展示两端、样本数与 evidence（sparse / developing / broader）。这是备考区间估计，尚无个人实考数据校准其覆盖率。模考页的 raw 和折算分可用于复盘。

## 状态与内容

完整类型见 [shared/types.ts](../shared/types.ts)，动作定义见 [shared/actions.ts](../shared/actions.ts)，本地纯派生函数见 [shared/selectors.ts](../shared/selectors.ts)、[shared/planner.ts](../shared/planner.ts) 和 [shared/stats.ts](../shared/stats.ts)。

| AppState 字段 | 内容 |
| --- | --- |
| version、revision、createdAt、savedAt? | version=3，revision 是写入并发控制的整数；时间戳为 ISO 8601 |
| profile | startDate、examDate、mathCourse=2、onboarded、baseline、targets、四个 milestones、dailyMinutes、weekdays、schools、weakTopics、strongTopics、strongEarlyChemistry |
| settings | theme（system/light/dark）、fontScale、musicEnabled、musicTrack、musicVolume、coachEnabled、coachModel、coachEffort（low/medium/high） |
| calendar | overrides 是日期到 study/off 的映射，moves 存显式挪日对，restWeeks 存休息周的周一日期 |
| attempts、progress | 每次评分后的题号、科目、考点、时间、模式、答案、部分得分、用时与信心；progress 以题号索引尝试次数、上次表现、复习盒级、due、慢题、收藏和题注 |
| plans、sessions、activeSessionId? | 保存的日计划、按 id 索引的会话及唯一当前会话。answers 按题号，含 response、seconds、submitted、confidence?、score? 等。exam=true 时以 startedAt + timeLimitSec 判断截止，可在封卷后完成记述评分 |
| mocks、days、notes、variants | 完卷结果，按日期的 {seconds,answered,correct}，按考点的个人笔记，及已开始练习的验算变式题 |
| legacy? | {importedAt,v2}。含整份只读迁移源，包括其既有的 v1 档案。旧日语、术语训练、旧计划和未能按科目分摊的时长在这里查阅 |

三科基线默认 132 / 54 / 66。理科两项按旧强弱比例拆分总分约 120，均可修改。阶段目标按数学 / 物理 / 化学分别为 145/62/72、160/72/78、178/82/85、190/90/90。更改 targets 会同步末档目标。profile.patch 中的对象或数组整体替换，可单独调整弱项或学习日。

迁移仅在没有 state-v3.json 时自动执行。保留所有可归属的 STEM 作答和题目进度，保留过滤后的旧会话和数理化模考。旧会话带 imported=true，旧计划引用仅供历史识别。旧日时长按可归属数理化作答秒数重算。服务原子保存到 state-v3.json，滚动备份在 backups-v3/。旧档不覆盖。完整状态导出可用于离线归档。

做题器统一使用 itemId。source.kind 为 official、original 或 school，后者还携带 school（waseda、meiji、aoyama、rikkyo、chuo、hosei）。题干渲染支持现有 Markdown-lite、公式、figures。written.parts 包含 id、label、prompt?、points、modelAnswer、rubric[{text,points}]、final?；每小问的 rubric 满分之和等于 points。AI 的每行评分可在 0 到该行满分间取部分分。

## AI 助教

`GET /api/coach/status` 返回 `{available,enabled,model,effort,busy}`。默认模型为 `gpt-6.2-sol`，默认 effort 为 `medium`。首次加载旧 v3 档案时，将旧默认 `gpt-6.2-astra` 迁移为 Sol 并原子写回，保留自定义模型和 effort。迁移后主动选择的模型会跨重启保存。设置动作可改 `coachModel`、`coachEffort`。环境变量 `EJU_COACH_MODEL`、`EJU_COACH_EFFORT` 优先，`EJU_CODEX_PATH` 可指定 CLI。

四个 POST 均异步受理。成功返回 HTTP 202 和 `{job:{id,kind,itemId?,status:"running",createdAt}}`，通过 `GET /api/coach/job?id=…` 轮询。`done` 带 `result`，`failed` 带 `error`，`cancelled` 表示取消。忙时返回 409，关闭助教时返回 403。每次 CLI 调用使用本机已登录的 Codex、全新临时目录、只读沙箱、禁用 shell 和网页搜索、严格输出 schema。一次只跑一个任务，每次调用限时 150 秒。`POST /api/coach/cancel` 传 `{"id":"…"}` 取消当前任务（包括正在进行的重问或独立验算）。保留最近 50 条任务，服务重启清空。

| POST 路径 | 请求 | 完成后的 job.result |
| --- | --- | --- |
| `/api/coach/ask` | `CoachAskBody`，必填 `question` | `CoachReply`，模式为 hint、reveal 或 concept |
| `/api/coach/weekly` | `{"date":"2026-11-22"}`，可省略日期，默认当前学习日 | `CoachReply`，固定 review，只发送服务计算的当周汇总 |
| `/api/coach/grade` | `{"itemId":"school-example","text":"由法拉第定律得 V=BLv。"}` | `{response:{method:"ai",text,marks},earned,possible,rows:[{partId,points,feedback}],summary}`。将 response 提交给 answer 即可保存，也支持学生自评覆盖 |
| `/api/coach/variant` | `{"itemId":"2019_1-phy-01"}` | `{item,solution}`。生成日语单选变式，再用独立进程仅凭新题干和选项检查唯一性并求解。两次答案一致方可用 `{type:"startVariant",jobId}` 入库并创建练习 |

### 提问和历史

以 [shared/coach-ui.ts](../shared/coach-ui.ts) 的类型为准。按题号提问示例为 `{"itemId":"2015_2-phy-18","question":"我总把磁场方向当成电流方向，该先观察什么？","response":3}`。在笔记页可传 `{"topic":"phys.em.induction","page":"考点笔记","question":"什么是楞次定律？","history":[{"role":"student","text":"我在复习电磁感应。"}]}`。

| 字段 | 含义 |
| --- | --- |
| `question` | 必填非空字符串，至多 2,000 字符 |
| `itemId?` | 提供时必须是已知题号，未知题号返回 404。省略时可根据本轮问句、topic、page、history 回答 |
| `response?` | 学生当前的作答，可为选择项的零起算下标、填空或记述作答等 |
| `topic?`、`page?` | 当前考点和页面。二者及 itemId 各限 200 字符 |
| `history?` | 按从旧到新排列的 `{role:"student"\|"coach",text:string}[]`，仅取最后 8 条，每条文字至多 2,000 字符 |
| `reveal?` | 布尔值，学生点击「我想看答案」时传 true。本轮直接索要答案或完整解法也可进入 reveal。历史中的授权只对当时有效 |

请求体上限 64 KiB。字段类型错误、空问题、保留历史中的非法角色等返回 HTTP 400。

### 回答块和教学模式

`CoachReply = { mode, blocks: CoachBlock[], summary: string }`。summary 是可直接展示的一行摘要。blocks 按顺序渲染，每块通过 type 区分。支持 text、hints、question、choice、steps、formula、callout、table、plot、widget、actions。CLI 输出对每类块使用独立的严格对象，所有属性均声明，可选值可为 null，成功的 HTTP 结果会省略这些空字段。

| mode | 面向学生的内容 |
| --- | --- |
| hint | 具体题默认模式。围绕学生的卡点反问，给一个思考方向和 2–4 级逐渐具体的提示。错误作答只提示检查条件。可用另一情境自测。末尾 actions 有「我想看答案」和 1–2 个追问 |
| reveal | 给出完整 steps、适用的关键公式和易错点，末尾 question 邀请学生复述关键一步 |
| concept | 解释概念并举例，用 choice 或 question 检查理解。从题目页单独问定义时只需要考点背景 |
| review | 仅根据当周数据说明进展、样本局限和下周行动，可用 table、plot、callout、actions |

### 服务端校验

- 每条回答有 1–12 块（`COACH_MAX_BLOCKS`）。摘要最多 240 字符，正文每段 4,000，标签 120，公式 1,200，表达式 200。还会限制各块的列表长度。超限、空正文、额外字段和模式不符的块会产生 `invalid_output`。
- choice 有 2–8 个选项，answer 是合法的零起算整数，feedback 与 options 等长。table 的每行与表头等宽。steps 仅供 reveal。追问按钮必须有 prompt，考点练习和笔记按钮必须有 topic。
- plot 的轴范围严格递增，滑杆名称唯一、范围递增、步长为正、初值在范围内。表达式逐项检查，只允许数字、x、已声明参数、pi、e、四则运算、幂、圆括号和 sin、cos、tan、asin、acos、atan、exp、ln、log、sqrt、abs。
- widget.height 取整并夹在 120–640。HTML 片段最多 60,000 字符（`WIDGET_MAX_HTML`）。服务端按允许的标签和属性重建片段，移除外链属性、内联事件、外部 CSS 和含网络调用的脚本（包括 fetch、XMLHttpRequest、WebSocket）。仅 script 的 src 可引用四个 HTTPS CDN 主机，分别为 cdnjs.cloudflare.com、cdn.jsdelivr.net、unpkg.com、esm.sh。清洗后须保有可渲染内容。渲染方在 `sandbox="allow-scripts"` 的独立 iframe 中运行片段，并用 CSP 限制脚本来源及 `connect-src 'none'`。
- 带题目的 hint 会核对摘要、各级提示、自测反馈、可视化和按钮文案中是否出现官方选项标记或最终数值，包括组合填空和数值等价写法。命中后丢弃整稿，用原始问题在全新进程中重问一次。第二稿仍泄露则以 `failed / invalid_output` 结束，两稿均不交给前端。公式或文字是否提前完成决定性推导也受教学提示约束。
- 其他任务错误包括 `verification_failed`、`cli_missing`、`login_required`、`quota`、`timeout`、`cli_failed`。已评分并提交的作答、已通过 startVariant 保存的题目随学习档案持久化。

## 本机服务及错误处理

- GET /api/export 下载完整状态 JSON；GET /api/backups 返回 {backups:[{file,bytes}]}，按新到旧排列。
- GET、HEAD /content/bank.json 为当前规范化题库，GET、HEAD /assets/… 为本地媒体（支持 Range），/content/… 也可读取构建输出。其他页面路径回退至前端 index.html。EJU_WEB_DIST 优先，默认 app/dist，缺失时使用现有 web/dist。旧前端资源可作静态回落，v3 写入协议为 POST /api/action。
- npm start 启动服务。默认数据目录为 data，可用 EJU_DATA_DIR 隔离数据，PORT 更换端口；EJU_CONTENT_FILE 可选另一个已构建的 bank.json。新检出先 npm run build:content。引擎验证用 npm run typecheck 和 npm test。
- 服务只绑定 127.0.0.1，检查 Host；浏览器写请求仅接受本机服务的 Origin。开发代理需向本机后端转发正确的 Host 和 Origin。POST 使用 application/json。400 为非法日期、字段、超时作答或无效操作；403 为 Origin 被拒或助教关闭；404 为未知路径、题号或任务；409 为版本冲突或助教忙；415 为请求体类型错误；421 为 Host 被拒。错误体是 {error:string}，版本冲突另带 state。state 整包 PUT 已移除。
- 今日任务和跟学播放器共用一个 plan/block/session；错题、慢题、间隔复现和背诵卡共用题号及评分记录。统计、周复盘和助教共用同一派生数据。文案层可按 why.code、next.code 和 reasons 统一翻译。

## 最短接线示例

```ts
const state = (await (await fetch('/api/state')).json()).state;
const today = await (await fetch('/api/today')).json();
if (today.next.code === 'start_block') {
  const response = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseRevision: state.revision,
      action: { type: 'startBlock', date: today.plan.date, blockId: today.next.blockId },
    }),
  });
  const saved = await response.json();
  if (response.ok) {
    // saved.revision 可用于下一次写入。题目块返回会话，手动任务返回任务块。
    console.log(saved.revision, saved.result);
  } else if (response.status === 409) {
    // saved.state 为服务器的最新状态；先刷新 today，再按最新任务操作。
    console.log(saved.state.revision);
  }
}
```

若在前端本地计算等价视图，先对 ContentBundle 调用 indexBank，一次构建索引后复用。todayView(state,bank,date)、planView(state,bank,date,asOf)、practiceView(bank,filter)、reviewQueue(state,bank,date,scope)、statsView(state,bank,date)、weeklyReview(state,bank,date) 对应上述读取接口。提交动作时服务仍负责校验、评分、并发控制与持久化。
