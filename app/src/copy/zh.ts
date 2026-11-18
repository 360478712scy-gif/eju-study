// 澄学 EJU 3.0 全量中文界面文案（按 ux-spec 第 9 节的 16 个区分组组织）
export const zh = {
  // 导航面板、窗口顶栏倒计时、底部悬浮胶囊与全局快捷键面板
  nav: {
    // 程序标题和网页标题。
    appTitle: '澄学 EJU 3.0',
    // 左侧导航面板顶部品牌主标题
    brand: '澄学',
    // 左侧导航面板品牌旁科目定位小字
    brandSub: 'EJU 数理化',
    // 左侧导航面板顶部距考天数胶囊
    examCountdown: (days: number) => `距考 ${days} 天`,
    // 倒计时数字右侧。
    countdownUnit: '天后开考',
    // 开始学习前的等待文案。
    upcoming: (date: string) => `计划从 ${date} 正式开跑，这会儿先安心歇着养足精神。`,
    // 考试当天导航面板顶部的状态提示
    examToday: '今天上考场，稳住就赢',
    // 考试日期过后导航面板顶部的状态提示
    examPassed: '这一程圆满收官',
    // 悬停导航面板顶部倒计时时显示的考期说明
    examDateHint: '2027 年 6 月 20 日 · 第 1 回 EJU',
    // 导航面板第一分组小标题
    groupStudy: '学习',
    // 导航面板第二分组小标题
    groupBank: '题库',
    // 导航面板第三分组小标题
    groupMaterials: '资料',
    // 导航条目：今天（#/）
    today: '今天',
    // 导航条目：计划（#/plan）
    plan: '计划',
    // 导航条目：练习（#/practice）
    practice: '练习',
    // 导航条目：复习（#/review）
    review: '复习',
    // 导航条目：模考（#/mock）
    mock: '模考',
    // 导航条目：笔记（#/notes）
    notes: '笔记',
    // 导航条目：数据（#/insights）
    insights: '数据',
    // 导航面板底部设置入口（#/settings）
    settings: '设置',
    // 导航条目「复习」右侧计数角标的悬停说明
    reviewDueBadge: (count: number) => `${count} 项到期`,
    // 导航条目「今天」右侧剩余分钟角标的悬停说明
    todayLeftBadge: (minutes: number) => `剩 ${minutes} 分钟`,
    // 导航面板底部头像位默认显示的目标院校
    targetSchoolLabel: '早稻田 · MARCH 理工',
    // 导航面板底部头像位副行显示的选考科目组合
    targetSubjectsLabel: '数学コース2 · 物理 · 化学',
    // 窄屏或手动折叠导航面板按钮的悬停提示
    collapseSidebar: '收起导航栏',
    // 图标栏状态下展开导航面板按钮的悬停提示
    expandSidebar: '展开导航栏',
    // 底部悬浮胶囊空闲状态（学习日未开始）的快捷主入口按钮
    dockStartToday: '开始今天的 2 小时',
    // 底部悬浮胶囊空闲状态（已学完今日部分但未结束）的继续按钮
    dockResumeToday: (leftMin: number) => `继续今天的学习 · 剩 ${leftMin} 分钟`,
    // 底部悬浮胶囊在今日任务全部完成后的状态文案
    dockTodayDone: '今天这 2 小时已拿下，歇会儿吧',
    // 底部悬浮胶囊在休息日空闲时的快捷入口文案
    dockRestDay: '今天休息 · 去翻几张卡热身',
    // 底部悬浮胶囊进行中：切换到上一节任务按钮提示
    dockPrevTask: '切回上一节',
    // 底部悬浮胶囊进行中：暂停计时按钮提示
    dockPause: '暂停学习计时',
    // 底部悬浮胶囊进行中：继续计时按钮提示
    dockResume: '继续学习计时',
    // 底部悬浮胶囊进行中：切到下一节任务按钮提示
    dockNextTask: '进入下一节',
    // 底部悬浮胶囊中间显示的当前任务与进度摘要
    dockActiveSummary: (taskTitle: string, leftMin: number) => `${taskTitle} · 剩 ${leftMin} 分钟`,
    // 底部悬浮胶囊右侧第一个图标按钮提示：打开 AI 助教
    dockCoach: '呼出 AI 助教',
    // 底部悬浮胶囊右侧第二个图标按钮提示：打开速查笔记抽屉
    dockQuickNotes: '速查考点笔记',
    // 底部悬浮胶囊右侧第三个图标按钮提示：轻钢琴背景音乐抽屉
    dockMusic: '切换背景音乐',
    // 悬浮胶囊与设置页背景音乐：关闭状态选项
    dockMusicOff: '关闭音乐',
    // 顶栏或快捷键触发的全局搜索框入口按钮
    globalSearchBtn: '搜索题目与笔记',
    // ⌘K 全局搜索弹窗输入框占位提示
    globalSearchPlaceholder: '搜考点、公式或关键词，如 電磁誘導、置換積分、ΔH…',
    // ⌘K 全局搜索结果分组标题：题目
    searchGroupItems: '相关题目',
    // ⌘K 全局搜索结果分组标题：笔记
    searchGroupNotes: '考点笔记',
    // 快捷键说明弹窗标题
    shortcutsTitle: '键盘快捷键',
    // 快捷键弹窗条目：⌘1–7
    shortcutNavSections: '在「今天」到「数据」七个区之间切换',
    // 快捷键弹窗条目：Space（主页与胶囊）
    shortcutSpaceStudy: '开始或暂停今天的学习',
    // 快捷键弹窗条目：⌘K
    shortcutGlobalSearch: '随时搜索题目与考点笔记',
    // 快捷键弹窗条目：做题器 1–9
    shortcutPickOption: '选择对应选项，或在数学答题卡填入数字',
    // 快捷键弹窗条目：做题器 Enter
    shortcutSubmitOrNext: '提交当前作答，或进入下一题',
    // 快捷键弹窗条目：做题器 ← / →
    shortcutPrevNextItem: '切换到上一题或下一题',
    // 快捷键弹窗条目：做题器 F
    shortcutFlagUnsure: '标记「没把握」，纳入后续抽查',
    // 快捷键弹窗条目：做题器 E
    shortcutToggleExplain: '展开或收起本题解析',
    // 快捷键弹窗条目：做题器 /
    shortcutAskCoach: '带着当前题目直接追问助教',
    // 快捷键弹窗条目：背诵卡 Space 与 1/2/3
    shortcutFlashcard: '空格翻开背诵卡背面，按 1 / 2 / 3 自评熟练度',
  },

  // 「今天」页面（#/）：进度光球、今日台本、助教点评、侧边今日队列、休息日与漏学重排
  today: {
    // 「今天」页面主面板大标题
    title: '今天',
    // 学习日尚未开始时页面标题下方的一行说明
    subtitleReady: '今天的 2 小时给你排好了，点一下开始，按顺序往下走就行。',
    // 自定义时长的今日未开始说明。
    ready: (duration: string) => `今天的 ${duration}给你排好了，点一下开始，按顺序往下走就行。`,
    // 学习进行中页面标题下方的一行说明
    subtitleInProgress: (leftMin: number) => `正在节奏里，今天还剩大约 ${leftMin} 分钟。`,
    // 今日 120 分钟全部完成后页面标题下方的一行说明
    subtitleCompleted: '今天这 2 小时稳稳拿下了，合上电脑去放松吧。',
    // 自定义时长的今日完成状态。
    completed: '今天的份量稳稳拿下，去歇会儿吧',
    // 非学习日（休息日）页面标题下方的一行说明
    subtitleRest: '今天是休息日，不排硬任务，让脑子消化一下前几天的东西。',
    // 有连续学习记录时的标题区提示。
    streak: (n: number) => `已连学 ${n} 天`,
    // 今日统计卡上的本周标题。
    week: '本周进度',
    // 页面标题区右侧次要操作：把今天临时改成休息日
    switchTodayToRestBtn: '把今天改成休息日',
    // 窄屏时页面标题区右侧打开今日队列抽屉的按钮
    openQueueDrawerBtn: '查看今日队列',
    // 台本前几项以外的任务统一入口。
    showTasks: '展开今日全部安排',
    // 中央磨砂光球空闲时球心上方的距考小标签
    orbCountdownLabel: '距离 6/20 考场',
    // 中央磨砂光球空闲或通用槽位的距考天数文字
    leftDays: (n: number) => (n > 0 ? `还有 ${n} 天` : n === 0 ? '今天开考' : `考后 ${Math.abs(n)} 天`),
    // 中央磨砂光球进行中球心上方的当前节剩余时间标签
    orbRemainingLabel: '本节剩余',
    // 中央磨砂光球外圈 120 格放射刻度的悬停进度说明
    orbTicksTooltip: (doneMin: number, totalMin: number) => `今日已完成 ${doneMin} / ${totalMin} 分钟`,
    // 中央磨砂光球在今日全部完成时球心显示的短句
    orbAllDoneLabel: '今日达成',
    // 中央磨砂光球在休息日球心显示的短句
    orbRestDayLabel: '好好休息',
    // 「今天」页面未开始时的主操作按钮
    startTodayBtn: '开始今天的 2 小时',
    // 时长自定义后的开始按钮。
    startFor: (duration: string) => `开始今天这 ${duration}`,
    // 「今天」页面学习暂停或中途返回时的主操作按钮
    resumeTodayBtn: '接着刚才的进度学',
    // 「今天」页面单节刚结束、准备进下一节时的主操作按钮
    startNextTaskBtn: (taskTitle: string) => `开始下一节：${taskTitle}`,
    // 休息块结束后的主按钮。
    finishBreak: '结束休息，进入下一节',
    // 手动整理任务的完成按钮。
    finishManual: '记完重点，进入下一节',
    // 「今天」页面全部完成后供回看的主按钮
    reviewTodayWorkBtn: '回看今天做过的题',
    // 回看今天记录时的标题。
    todayWorkHeading: '今日作答回看',
    // 主面板右半「今天的三件事」台本区小标题
    scriptHeading: '今日台本',
    // 今日任务台本和时长。
    scriptDuration: (duration: string) => `今日台本 · 共 ${duration}`,
    // 台本行左侧的节次编号标签
    scriptStepIndex: (index: number, total: number) =>
      `${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
    // 台本与队列任务类型名：到期错题与速算热身
    taskWarmupReview: '到期错题与热身巩固',
    // 台本与队列任务类型名：薄弱考点专项推进
    taskWeakFocus: (topicName: string) => `主攻弱项 · ${topicName}`,
    // 今日专项、笔记任务、模考和订正标题。
    focus: (name: string) => `专题精练 · ${name}`,
    // 今日笔记整理任务标题。
    consolidate: '回顾考点笔记与错因小结',
    // 今日模考任务名称。
    timedPaper: (name: string) => `${name} · 整卷掐表模考`,
    // 今日模考订正任务名称。
    correctPaper: '复盘订正刚考完的整卷错题',
    // 台本与队列任务类型名：跨科交错练习
    taskInterleave: '数理化交错实战练',
    // 台本与队列任务类型名：无机与有机背诵卡
    taskFlashcards: '無機・有機 必背速记卡',
    // 台本与队列任务类型名：每周限时小测
    taskWeeklyQuiz: '限时提速小测',
    // 台本与队列任务类型名：校内考记述题尝鲜与演练
    taskSchoolWritten: (schoolName: string) => `${schoolName} · 记述推导练`,
    // 台本与队列任务类型名：中场小憩
    taskShortBreak: '起身喝口水 · 歇 5 分钟',
    // 休息任务超出默认时长时的实际分钟数。
    breakFor: (n: number) => `离开屏幕 · 歇 ${n} 分钟`,
    // 任务安排理由（why）：高权重薄弱考点优先投入
    whyWeakHighWeight: (topicName: string) => `${topicName} 在 EJU 分值重、近期丢分多，今天集中啃透一类题型。`,
    // 任务安排理由（why）：间隔复习恰好到达遗忘临界点
    whySpacedDue: (count: number) => `有 ${count} 项刚到遗忘临界点，现在花十几分钟捞回来最省力。`,
    // 任务安排理由（why）：做对但严重超时的考点提速
    whySlowTopic: (topicName: string) => `${topicName} 你能做对但耗时偏长，今天卡表练手速。`,
    // 任务安排理由（why）：优势考点低频保温
    whyStrongMaintain: (topicName: string) => `${topicName} 底子稳，抽几道题保住考场手感就够。`,
    // 任务安排理由（why）：校内考记述能力铺垫
    whySchoolTaste: '提前练纸上完整推导，既备校内考也能吃下 EJU 压轴题。',
    // 任务安排理由（why）：中场休息科学间隔
    whyBreak: '刚高强度算完一轮，离开屏幕歇 5 分钟，下一节脑子更清楚。',
    // 休息任务时长变化时的理由。
    breakReason: '连着算了一阵，站起来活动下肩颈，换换脑子再进下一节。',
    // 主面板下方 AI 助教一句话点评前缀标签
    coachNoteLabel: '助教叮嘱',
    // 首次打开尚未做题时助教一句话点评的默认文案
    coachNoteFirstDay: '第一天不用追求刷得多快，先把 電磁誘導 和数列的每一步算踏实。',
    // 今天页助教一句话：最近一个有作答的学习日里失分最多的考点。
    coachRecentMistakes: (date: string, topic: string, count: number) =>
      `${date}在「${topic}」错了 ${count} 道，今天动笔多盯一眼符号和边界条件。`,
    // 今天页助教一句话：首个专项是弱项时显示该考点的掌握度。
    coachWeakFocus: (topic: string, mastery: number) =>
      `今天先啃「${topic}」（当前掌握度 ${mastery}%），别图快，把列式最容易卡的那一步写顺。`,
    // 今天页助教一句话：有校内考任务时提示计划内的学校。
    coachSchoolPractice: (school: string) =>
      `今天排了${school}水准的题，草稿纸上把设元和关键推导写清楚，练稳步骤分。`,
    // 今天页助教一句话：无更优先线索时提示连续学习天数。
    coachStudyStreak: (days: number) =>
      days === 1 ? '已经开好头了，稳住每天这 2 小时的手感比什么都强。' : `已经连着推进 ${days} 天了，不用猛冲，稳住这个节奏往下走就赢了。`,
    // 未练到题时的助教句。
    coachFocus: (topic: string) => `待会儿先拿「${topic}」开刀，别图快，把列式和符号一步步写稳。`,
    // 有数据但尚无本日作答时的助教句。
    coachReady: '今天先热身找手感，遇到卡壳超过 3 分钟的题先做记号，别硬耗。',
    // 完成今日学习后助教一句话点评的反馈文案
    coachNoteFinished: (accuracyPct: number) => `今天整体正确率 ${accuracyPct}%，卡壳的题我已经排进后几天的复习里了。`,
    // 右侧倾斜侧面板「今日队列」标题
    queueTitle: '今日队列',
    // 今天页侧面板及窄屏抽屉的未来任务预览标题。
    queuePreviewTitle: (date: string) => `${date} · 排课预告`,
    // 今天已学完但明天休息时，预览列表中的空状态。
    queuePreviewNoTasks: '这天轮休不排课，安心放松就行',
    // 休息日之后没有学习日时，今天页侧面板的标题。
    queueNoUpcoming: '后续日程已全部走完',
    // 右侧侧面板「今日队列」副标题统计
    queueMeta: (taskCount: number, totalMin: number) => `${taskCount} 节安排 · 共 ${totalMin} 分钟`,
    // 队列条目状态标签：尚未开始
    queueStatePending: '待开始',
    // 队列条目状态标签：当前正在进行
    queueStateActive: '进行中',
    // 队列条目状态标签：已完成
    queueStateDone: '已完成',
    // 队列条目状态标签：主动跳过
    queueStateSkipped: '已跳过',
    // 队列条目右侧圆形播放键的悬停说明
    queuePlayTooltip: (taskTitle: string) => `直接开始「${taskTitle}」`,
    // 队列条目更多菜单：跳过本节放到改天
    queueSkipBtn: '跳过这节，改天再补',
    // 休息日主面板中央卡片标题
    restCardTitle: '今天不用赶进度，安心休息',
    // 休息日主面板中央卡片说明正文
    restCardBody: '每周稳稳学满 5 天就已经走得很扎实了。要是今天刚好清闲，也可以翻几张無機卡片，或者把明天的学习日挪过来。',
    // 休息日可选的轻量复习次要按钮
    restLightReviewBtn: '翻 10 分钟背诵卡热身',
    // 休息日把最近一个学习日挪到今天的按钮
    restMoveStudyHereBtn: '挪一天学习日到今天',
    // 漏学后顶部温和重排提示条标题
    missedNoticeTitle: (days: number) => (days === 1 ? '昨天没顾上学，完全没关系' : `前阵子落下了 ${days} 个学习日，别有负担`),
    // 漏学后顶部温和重排提示条正文说明
    missedNoticeBody: '我已经把落下的重点平摊到后面几周里了，不用熬夜补账，今天照常学好这 2 小时就行。',
    // 漏学重排提示条右侧查看新排期的按钮
    missedViewPlanBtn: '查看重排后的本周安排',
    // 漏学重排提示条右侧收起提示的按钮
    missedAckBtn: '收起提示，直接开练',
  },

  // 「计划」页面（#/plan）：到 6/20 路线图、四阶段与减量周、里程碑、周视图与学习日切换
  plan: {
    // 「计划」页面主面板大标题
    title: '计划',
    // 「计划」页面标题下方的一行说明
    subtitle: '从 11 月 19 日到明年 6 月 20 日，30 周的推进节奏都在这张图上。',
    // 每周天数和实际每日预算。
    schedule: (days: number, minutes: number) => `每周 ${days} 天 · 单日 ${minutes} 分钟`,
    // 路线图区块标题
    roadmapTitle: '到 6/20 的备考路线图',
    // 横向时间轴上当前日期亮点下方的标记词
    todayPin: '今天',
    // 横向时间轴终点旗标文字
    examDayPin: '6/20 EJU 正式考',
    // 月历与时间轴的月份数字。
    monthLabel: (n: number) => `${n} 月`,
    // 第一阶段名称（11月下旬–12月底）
    phase1Name: '靶向补弱',
    // 第一阶段起止时间标签
    phase1Span: '11 月下旬 – 12 月底',
    // 第一阶段核心目标一行说明
    phase1Summary: '集中火力把 電磁誘導、コンデンサー、数列、無機 等 11 个弱项的概念和基本题型摸透。',
    // 第二阶段名称（1月–2月底）
    phase2Name: '专题攻坚',
    // 第二阶段起止时间标签
    phase2Span: '1 月 – 2 月底',
    // 第二阶段核心目标一行说明
    phase2Summary: '拉起标准题与偏难题梯度，啃下有機構造決定、熱化学 ΔH 计算与置換積分，把耗时压下来。',
    // 第三阶段名称（3月–4月底）
    phase3Name: '套卷与校内考',
    // 第三阶段起止时间标签
    phase3Span: '3 月 – 4 月底',
    // 第三阶段核心目标一行说明
    phase3Summary: '开始 EJU 整卷掐表训练，每周穿插早稻田与 MARCH 理工记述题，往上打开得分天花板。',
    // 第四阶段名称（5月–6/20）
    phase4Name: '实战定型',
    // 第四阶段起止时间标签
    phase4Span: '5 月 – 6 月 20 日',
    // 第四阶段核心目标一行说明
    phase4Summary: '按真题节奏保持手感、清光陈年错题；最后一周主动减量，留足精力进考场。',
    // 考前最后一周特殊阶段胶囊标签
    taperWeekBadge: '考前减量周',
    // 考前最后一周说明文字
    taperWeekSummary: '6 月 14 日起每天只留 60 分钟轻量回顾错题与笔记，不再碰偏题怪题。',
    // 按阶段索引获取阶段名的动态辅助函数
    phaseNameByIndex: (index: 1 | 2 | 3 | 4) =>
      index === 1 ? '靶向补弱' : index === 2 ? '专题攻坚' : index === 3 ? '套卷与校内考' : '实战定型',
    // 时间轴里程碑旗标悬停标题
    milestonesHeading: '阶段里程碑',
    // 路线图进度下的各科数字，按实际档案生成。
    milestoneScores: (math: number, physics: number, chemistry: number) => `数学 ${math} · 物理 ${physics} · 化学 ${chemistry}`,
    // 12 月底里程碑旗标文案
    milestone1Label: '12 月底 · 11 个弱项过完首轮，冲数学 145 · 物理 62 · 化学 72',
    // 2 月底里程碑旗标文案
    milestone2Label: '2 月底 · 标准题基本不丢分，冲数学 160 · 物理 72 · 化学 78',
    // 4 月底里程碑旗标文案
    milestone3Label: '4 月底 · 整卷时间充裕，记述题拿稳步骤分，冲数学 178 · 物理 82 · 化学 85',
    // 6 月考前里程碑旗标文案
    milestone4Label: '6 月考前 · 站稳目标线：数学 190 · 物理 90 · 化学 90',
    // 页面右上角学习日胶囊开关组标题
    studyDaysPickerLabel: '每周学习日',
    // 学习日胶囊开关组下方的小字说明
    studyDaysPickerHint: (count: number) => `已选每周 ${count} 天 · 每天 120 分钟（临时有事随时挪）`,
    // 当用户选少于或多于 5 天时的温和提示
    studyDaysCountTip: '长线备考最推荐每周 5 天，留 2 天给生活和脑子缓冲。',
    // 下半部分周视图标题
    weekStripTitle: '日程与单日安排',
    // 周月切换和月份箭头。
    week: '按周',
    // 月历切换按钮。
    month: '按月',
    // 周视图切换按钮：看上一周
    prevWeekBtn: '看上一周',
    // 周视图切换按钮：回到本周
    backToThisWeekBtn: '回到本周',
    // 周视图切换按钮：看下一周
    nextWeekBtn: '看下一周',
    // 月历返回前一月。
    previousMonth: '切到上个月',
    // 月历进入后一月。
    nextMonth: '切到下个月',
    // 周视图竖条卡状态标签：正常学习日
    dayTagStudy: '学习日',
    // 周视图竖条卡状态标签：休息日
    dayTagRest: '休息',
    // 周视图竖条卡状态标签：当日任务已完成
    dayTagCompleted: '已学完',
    // 周视图竖条卡状态标签：漏学已自动顺延
    dayTagRescheduled: '已顺延',
    // 周视图竖条卡状态标签：考前减量日
    dayTagTaper: '减量日',
    // 日期状态已经超出计划。
    outside: '非备考期',
    // 周视图点击某一天后底部或侧边展开面板的标题
    dayDetailHeading: (monthDay: string, weekday: string) => `${monthDay}（${weekday}）的安排`,
    // 展开某一天后将该学习日改为休息日的按钮
    setDayAsRestBtn: '把这天改成休息日',
    // 展开某一天后将该休息日改为学习日的按钮
    setDayAsStudyBtn: '把这天设为学习日',
    // 展开某一天后把当天任务平移到另一天的按钮
    moveDayTasksBtn: '挪到另一天去学',
    // 单日重新补学。
    catchUp: '补练这天落下的题',
    // 挪日弹窗标题
    moveModalTitle: '要把这天的安排挪到哪天？',
    // 挪日弹窗说明正文
    moveModalBody: '挑一个近期空闲的休息日就行，错题复习和模考节点会自动跟着顺延，不会乱套。',
    // 计划挪动日期输入。
    moveDate: '选择要挪去的日期',
    // 挪日弹窗确认按钮
    confirmMoveDayBtn: '确认挪到这一天',
    // 无法挪到目标日时的反馈。
    cannotMove: '只能挪到考前还没开学的空闲日期，换一天试试',
    // 今天台本、队列和计划周视图里的校内考任务标题。
    schoolTaskTitle: (school: string, purpose: string) => `${school} · ${purpose}`,
    // 校内任务采用真考形式时的短标签。
    schoolExamStyle: '笔试风格',
    // 校内任务用于院校拔高时的短标签。
    schoolExtension: '名校拔高',
    // 今日台本、队列、助教一句话与计划周视图用的早稻田短名。
    schoolShortWaseda: '早大',
    // 今日台本、队列、助教一句话与计划周视图用的明治短名。
    schoolShortMeiji: '明治',
    // 今日台本、队列、助教一句话与计划周视图用的青山学院短名。
    schoolShortAoyama: '青学',
    // 今日台本、队列、助教一句话与计划周视图用的立教短名。
    schoolShortRikkyo: '立教',
    // 今日台本、队列、助教一句话与计划周视图用的中央短名。
    schoolShortChuo: '中央',
    // 今日台本、队列、助教一句话与计划周视图用的法政短名。
    schoolShortHosei: '法政',
  },

  // 「练习」页面（#/practice）：科目分段、考点掌握度地图、真题卷、校内考拔高与考点详情侧栏
  practice: {
    // 「练习」页面主面板大标题
    title: '练习',
    // 「练习」页面标题下方的一行说明
    subtitle: '想自己挑考点或套卷加练时来这里，做完的每道题都会实时计入掌握度。',
    // 页面标题区右侧搜索框占位提示
    searchPlaceholder: '搜考点、年份或学校，如 コンデンサー、2024、明治…',
    // 视图切换分段控件：按考点掌握度地图
    tabTopics: '按考点',
    // 视图切换分段控件：按 EJU 历年真题卷
    tabPapers: '按真题卷',
    // 视图切换分段控件：早稻田与 MARCH 校内考
    tabSchools: '校内考拔高',
    // 单元标题下的考点个数。
    topicCount: (n: number) => `共 ${n} 个细分考点`,
    // 考点侧栏标题。
    topicHeading: '考点掌握详情',
    // 掌握度地图顶部图例：薄弱待补强（低亮度玻璃砖）
    legendWeak: '待补强',
    // 掌握度地图顶部图例：熟悉进阶中（中亮度玻璃砖）
    legendGrowing: '进阶中',
    // 掌握度地图顶部图例：已稳固（高亮度玻璃砖）
    legendSolid: '已稳固',
    // 掌握度地图小玻璃砖上琥珀色圆点的悬停说明
    weakDotTooltip: '主攻弱项 · 计划重点倾斜',
    // 掌握度地图小玻璃砖上的优势维持标签
    strongTopicBadge: '优势保温',
    // 小玻璃砖底部显示的已刷题数比例
    tileProgress: (done: number, total: number) => `${done}/${total} 题`,
    // 点击某块考点玻璃砖后右侧详情面板的掌握度标题
    detailMasteryTitle: '当前掌握度',
    // 考点详情侧面板：已练习题量标签
    detailPracticedLabel: '已刷题量',
    // 考点详情侧面板：单题平均耗时标签
    detailAvgTimeLabel: '平均耗时',
    // 考点详情侧面板：EJU 出题权重标签
    detailWeightLabel: '考纲权重',
    // 考点近期答题对错。
    recent: '近期作答对错',
    // 考点细分难度展示。
    difficulty: '按难度挑题',
    // 考点详情侧面板：针对薄弱考点的学长建议文案
    detailWeakTip: '这块是你的提分大户。如果概念还有点模糊，先花 3 分钟扫一眼考点笔记再开刷。',
    // 考点详情侧面板：针对优势考点的学长建议文案
    detailStrongTip: '这块你底子很稳，不用花太多整块时间，偶尔抽几道维持手感即可。',
    // 考点详情侧面板难度筛选：全部
    filterDiffAll: '全部梯度',
    // 考点详情侧面板难度筛选：难度 1
    filterDiff1: '概念入门',
    // 考点详情侧面板难度筛选：难度 2
    filterDiff2: 'EJU 标准',
    // 考点详情侧面板难度筛选：难度 3
    filterDiff3: '压轴与校内考',
    // 考点详情侧面板次要按钮：打开对应考点笔记
    openTopicNoteBtn: '打开这篇考点笔记',
    // 考点详情侧面板主按钮：开始练习该考点
    startTopicPracticeBtn: (topicName: string) => `开始练「${topicName}」`,
    // 考点视图顶部快捷按钮：随机抽一组弱项题
    quickWeakSetBtn: '抽 10 道主攻弱项练手',
    // 分批做整卷练习、复习队列时的反馈。
    batch: (n: number) => `题量比较多，这一节先帮你装前 ${n} 道开练`,
    // 真题卷列表卡片标题格式
    paperTitle: (year: number, round: 1 | 2) => `${year} 年第 ${round} 回 EJU 真题`,
    // 真题卷列表卡片完成度副标题
    paperProgress: (done: number, total: number) => `已练 ${done} / ${total} 题`,
    // 真题卷卡片单题拆练按钮
    startPaperDrillBtn: '拆开单题练这卷',
    // 真题卷列表底部的整卷模考引导提示
    paperMockTip: '想留着整套掐表测真实水平？去「模考」区开考更有考场感。',
    // 真题或校内卷结果为空。
    noPapers: '这科暂时还没有收录整套试卷',
    // 校内考视图顶部一行说明
    schoolViewIntro: '收录早稻田与 MARCH 理工留学生入试风格题，用来练纸上推导步骤、顺带吃透 EJU 难题。',
    // 六校名称：早稻田
    schoolWaseda: '早稻田大学 · 基幹 / 創造 / 先進理工',
    // 六校名称：明治
    schoolMeiji: '明治大学 · 理工学部',
    // 六校名称：青山学院
    schoolAoyama: '青山学院大学 · 理工学部',
    // 六校名称：立教
    schoolRikkyo: '立教大学 · 理学部',
    // 六校名称：中央
    schoolChuo: '中央大学 · 基幹 / 社会 / 先進理工',
    // 六校名称：法政
    schoolHosei: '法政大学 · 理工 / 生命科学 / デザイン工',
    // 题目来源性质标签：官方真题
    sourceKindOfficial: '历年真题',
    // 题目来源性质标签：有校内笔试学校的同风格原创题
    sourceKindSchoolStyle: '校内考笔试风格 · 原创',
    // 题目来源性质标签：书审/面试为主学校的院校水平拔高题
    sourceKindBoost: '院校水平拔高 · 原创',
    // 校内考题目卡片上的记述式标记
    writtenFormatTag: '记述式 · 纸笔作答',
    // 校内考卡片开始练习按钮
    startSchoolPracticeBtn: '开始做这组题',
  },

  // 「复习」页面（#/review）：到期错题 + 易错点 + 无机/有机背诵卡合一队列与翻卡器
  review: {
    // 「复习」页面主面板大标题
    title: '复习',
    // 「复习」页面标题下方的一行说明
    subtitle: '错题、慢题、易错点和無機・有機背诵卡都在这儿，算好遗忘时间自动浮上来。',
    // 顶部第一个统计数字卡标题：到期错题
    statMistakesLabel: '到期错题',
    // 顶部第二个统计数字卡标题：易错与慢题
    statTrapsLabel: '易错点与慢题',
    // 顶部第三个统计数字卡标题：到期背诵卡
    statCardsLabel: '待翻背诵卡',
    // 顶部主操作区左侧的耗时预估摘要
    dueSummary: (totalCount: number, estMinutes: number) => `当前共 ${totalCount} 项待复习，大约 ${estMinutes} 分钟清完`,
    // 「复习」页面顶部主操作按钮
    startReviewQueueBtn: (count: number) => `开始复习这 ${count} 项`,
    // 顶部右侧快捷筛选按钮：只翻背诵卡
    startFlashcardsOnlyBtn: '翻一组背诵卡',
    // 顶部右侧快捷筛选按钮：只刷错题
    startMistakesOnlyBtn: '重做到期错题',
    // 列表筛选标签：全部到期项
    filterAll: '全部待复习',
    // 列表筛选标签：错题重做
    filterMistakes: '错题',
    // 列表筛选标签：易错点与超时慢题
    filterTrapsAndSlow: '易错与超时',
    // 列表筛选标签：无机与有机背诵卡
    filterFlashcards: '背诵卡',
    // 卡片数据尚无标签时的通用名。
    card: '速记背诵卡',
    // 新卡尚无到期日期。
    newCard: '新背诵卡',
    // 队列行右侧到期状态：今天刚到期
    dueTodayBadge: '今天到期',
    // 队列行右侧到期状态：已超期天数
    overdueBadge: (days: number) => `超期 ${days} 天`,
    // 队列行右侧到期状态：明天预告
    dueTomorrowBadge: '明天到期',
    // 队列行标记：上次答对但用时超过目标 1.8 倍
    slowAttemptTag: '上次做慢了',
    // 易错和猜测标签。
    possibleGuess: '疑似蒙对 · 需复测',
    // 队列行标记：上次做题时标了没把握或蒙的
    unsureAttemptTag: '上次没把握',
    // 队列行连对次数进度说明
    streakProgress: (streak: number) => `已连对 ${streak} 次`,
    // 复习列表底部，展开当前筛选下超过 30 条的全部今日队列。
    showAllItemsBtn: (count: number) => `展开全部 ${count} 项待复习`,
    // 背诵卡翻卡模式顶部卡组标签：无机化学
    deckInorganic: '無機化学 · 颜色/沉淀/气体制法',
    // 背诵卡翻卡模式顶部卡组标签：有机化学
    deckOrganic: '有機化学 · 官能团与反应路线',
    // 背诵卡顶部进度指示
    cardCounter: (current: number, total: number) => `第 ${current} / ${total} 张`,
    // 背诵卡正面底部操作提示文字
    cardFrontPrompt: '先在脑子里过一遍答案，按空格翻看背面',
    // 背诵卡正面翻面按钮
    flipCardBtn: '翻看背面答案',
    // 背诵卡背面底部的自评引导提示
    cardSelfRatePrompt: '刚才答得利索吗？按 1 / 2 / 3 选一下：',
    // 背诵卡自评按钮 1：没记住
    rateAgainBtn: '1 · 没想起来',
    // 背诵卡自评按钮 1 下方间隔说明小字
    rateAgainHint: '待会儿再见一面',
    // 背诵卡自评按钮 2：卡顿犹豫
    rateHardBtn: '2 · 有点卡壳',
    // 背诵卡自评按钮 2 下方间隔说明小字
    rateHardHint: '过两天再抽查',
    // 背诵卡自评按钮 3：熟练秒答
    rateGoodBtn: '3 · 秒答稳了',
    // 背诵卡自评按钮 3 下方间隔说明小字
    rateGoodHint: '拉长复习间隔',
    // 一组背诵卡翻完后的完成卡标题
    deckCompleteTitle: '这组背诵卡过完了',
    // 一组背诵卡翻完后的完成卡反馈说明
    deckCompleteBody: (againCount: number) =>
      againCount > 0
        ? `刚才标「没想起来」的 ${againCount} 张，明后天热身时再帮你拎出来过一遍。`
        : '全数秒答！無機和有機这些碎知识点就是靠这样一遍遍磨成肌肉记忆的。',
  },

  // 「模考」页面（#/mock）：EJU 整卷模考、校内考套卷、开考确认与成绩单回看
  mock: {
    // 「模考」页面主面板大标题
    title: '模考',
    // 「模考」页面标题下方的一行说明
    subtitle: '留出整块时间掐表实战，练熟考场上的时间分配与弃题果断度。',
    // 第一排区块标题：EJU 正式规格整卷
    ejuRowTitle: 'EJU 整卷模考',
    // 第一排区块右侧说明小字
    ejuRowSubtitle: '严格按考场 80 分钟倒计时，交卷后生成分数环与考点得失诊断',
    // EJU 数学コース2 模考大卡标题
    ejuMathTitle: 'EJU 数学コース 2 整卷',
    // EJU 数学コース2 模考大卡规格说明
    ejuMathSpec: '80 分钟 · 满分 200 分 · 答题卡填空',
    // EJU 理科整卷模考大卡标题
    ejuScienceTitle: 'EJU 理科整卷（物理 + 化学）',
    // EJU 理科整卷模考大卡规格说明
    ejuScienceSpec: '80 分钟 · 满分 200 分（物理 100 + 化学 100）',
    // 第二排区块标题：早稻田与 MARCH 校内考套卷
    schoolRowTitle: '校内考限时套卷',
    // 第二排区块右侧说明小字
    schoolRowSubtitle: '备好草稿纸手写完整推导，交卷后逐题核对评分细则或让助教批改',
    // 校内题按入试目的显示标签。
    examStyle: '校内笔试风格',
    // 校内题按入试目的显示标签。
    extension: '名校压轴拔高',
    // 校内考套卷底部的募集要项核对提醒
    schoolPolicyNote: '注：各校年度入试科目与时长可能调整，出愿前请务必核对当年官方募集要项。',
    // 模考成绩历史的标题。
    history: '历次模考记录',
    // 模考卡片上的上次成绩展示文字
    lastScore: (score: number, maxScore: number) => `上次成绩：${score} / ${maxScore}`,
    // 校内卷分值使用评分点原始分。
    rawScore: (score: number) => `实得 ${score}%`,
    // 模考率分和空题数据。
    answered: (n: number, total: number) => `已作答 ${n} / ${total} 题`,
    // 模考卡片尚未考过时的占位状态文字
    neverTaken: '尚未模考',
    // 模考卡片上的下次计划模考日期文字
    nextScheduled: (dateText: string) => `计划日期：${dateText}`,
    // 学习计划中暂时无这套卷的日期。
    unscheduled: '随时可考',
    // 模考卡片主按钮：开始整卷计时
    startMockBtn: '开始整卷计时模考',
    // 模考卡片存在未交卷存档时的恢复按钮
    resumeMockBtn: '继续未交卷的模考',
    // 模考卡片查看历史成绩单按钮
    openReportBtn: '回看上次成绩单',
    // 开考前确认弹窗标题
    confirmStartTitle: '准备好进入考场节奏了吗？',
    // 开考前确认弹窗正文说明
    confirmStartBody: (minutes: number) =>
      `接下来 ${minutes} 分钟会全屏倒计时，期间不显示对错和解析。把手机放远、草稿纸铺好，一道题卡住超过 4 分钟先标「没把握」往后做。`,
    // 开考前确认弹窗主按钮
    confirmStartNowBtn: (minutes: number) => `开始 ${minutes} 分钟倒计时`,
    // 成绩回看面板标题
    reportTitle: '模考诊断成绩单',
    // 成绩回看分数环中心总分格式
    reportScoreRing: (score: number, maxScore: number) => `${score} / ${maxScore}`,
    // 成绩回看总用时与限对比文字
    reportDuration: (usedMin: number, limitMin: number) => `交卷用时 ${usedMin} / ${limitMin} 分钟`,
    // 成绩回看各考点得失分列表标题
    reportBreakdownTitle: '各考点得分与失分明细',
    // 成绩回看失分集中考点的自动诊断提示
    reportLossSummary: (topicsText: string) => `本卷失分主要在 ${topicsText}，已同步调高后面两周的对应权重。`,
    // 从模考诊断打开历史题。
    reviewQuestion: '逐题作答与解析回看',
    // 成绩回看底部主按钮：逐题复盘错题
    reviewMockMistakesBtn: '逐题复盘本卷错题',
    // 成绩回看底部次按钮：返回模考主页
    backToMocksBtn: '返回模考列表',
  },

  // 「笔记」页面（#/notes）：左列科目单元目录、弱项置顶、右侧阅读区与速查抽屉
  notes: {
    // 「笔记」页面主面板大标题
    title: '笔记',
    // 「笔记」页面标题下方的一行说明
    subtitle: '核心公式、無機必背表和常见掉坑点都在这，你的 11 个主攻弱项已置顶。',
    // 页面标题区右侧搜索框占位提示
    searchPlaceholder: '在笔记中搜公式、定律、沉淀颜色或反应…',
    // 左列目录顶部置顶分组标题
    pinnedWeakHeading: '置顶 · 主攻弱项',
    // 左列目录全部考纲单元分组标题
    allSyllabusHeading: '按考纲单元浏览',
    // 左列目录条目旁的弱项小标签
    weakTopicTag: '主攻',
    // 笔记正文小节标题：知识框架
    headingFramework: '知识框架',
    // 笔记正文小节标题：必背清单与公式
    headingFormulas: '必背清单与核心公式',
    // 笔记正文小节标题：EJU 常考题型
    headingPatterns: 'EJU 常见出题套路',
    // 笔记正文小节标题：考场易错点
    headingTraps: '高频易错坑点',
    // 笔记正文小节标题：30 秒自检
    headingSelfCheck: '30 秒合书自检',
    // 笔记正文小节标题：日语题干术语对照
    headingTerms: '题干常见日语表述',
    // 题库尚未为此考点添加正文。
    missingNote: '这篇考纲精要还在整理中，可以先在下面记你自己的总结，或点右边让助教现讲一遍。',
    // 个人考点笔记编辑框标题。
    personal: '我的随手批注',
    // 个人考点笔记编辑框占位。
    personalHint: '记下你自己的口诀、常掉的符号坑，或者做错过的题号…',
    // 保存个人笔记成功时的提示。
    personalSaved: '你的批注已存好，全局搜索也能搜到',
    // 笔记阅读区底部主按钮：去刷该考点的题
    practiceFromNoteBtn: (topicName: string) => `开始练几道「${topicName}」`,
    // 笔记阅读区底部次按钮：针对这篇笔记提问助教
    askCoachFromNoteBtn: '请助教换个讲法举例',
    // 悬浮胶囊呼出的「速查笔记」侧抽屉标题
    quickDrawerTitle: '速查考点笔记',
    // 速查笔记抽屉右上角跳转到完整笔记页的按钮
    openInNotesPageBtn: '打开完整笔记页',
  },

  // 「数据」页面（#/insights）：诚实预测分、每周复盘、掌握度热力、每日时长与速度散点
  insights: {
    // 「数据」页面主面板大标题
    title: '数据',
    // 「数据」页面标题下方的一行说明
    subtitle: '每张图只回答一个真问题：你现在大概多少分、哪块涨了、哪块还慢。',
    // 顶部左卡：预测分区间卡片标题
    forecastTitle: '当前实力区间估计',
    // 预测分卡副标题说明
    forecastSubtitle: '结合近期正确率、题目难度与作答速度的保守推算',
    // 预测分总分大号区间文字
    forecastTotalRange: (low: number, high: number) => `${low} – ${high} 分`,
    // 预测分单科区间行文字
    forecastSubjectRow: (subjectName: string, low: number, high: number, full: number) =>
      `${subjectName}：${low}–${high} / ${full}`,
    // 预测分区间条上的目标刻度线说明
    forecastTargetMark: (targetScore: number) => `目标线 ${targetScore}`,
    // 预测分区间条上的 11 月基线刻度说明
    forecastBaselineMark: (baseScore: number) => `11 月起点 ${baseScore}`,
    // 预测样本量与证据量。
    forecastEvidence: (n: number, evidence: string) => `基于 ${n} 道首刷题 · ${evidence}`,
    // 数据页低证据预测区间下方的首刷样本数，证据由同一行的小标签说明。
    forecastSamples: (count: number) => (count > 0 ? `刚测过 ${count} 道首刷题，区间较宽` : '先按起点估算，做几节就会收窄'),
    // 今天预测分卡与数据页各科预测证据为 sparse 时的小标签。
    sparseBadge: '题量尚少',
    // 预测证据三档。
    sparse: '样本还少，区间偏宽',
    // 预测证据三档。
    developing: '题量积累中，逐渐收窄',
    // 预测证据三档。
    broader: '考点覆盖较全，参考度高',
    // 做题样本较少时预测分卡底部的诚实说明
    forecastLowDataNote: '目前积累的限时题量还不多，区间会留得宽一些；多打两场小测和模考就会越收越实。',
    // 样本充足时预测分卡底部的趋势说明
    forecastSteadyNote: '按近两周的真实作答速度和准确率推算，继续稳住每周 10 小时就能一步步逼近目标线。',
    // 顶部右卡：每周复盘卡片标题
    weeklyReviewTitle: '本周复盘',
    // 周复盘统计的完成天数。
    completedDays: '已学天数',
    // 周复盘统计的学习时长。
    hours: '本周投入',
    // 周复盘统计的掌握度上涨考点数。
    gains: '涨分考点',
    // 每周复盘卡：本周计划完成度行
    weeklyCompletionRow: (doneMin: number, plannedMin: number) =>
      `有效投入 ${Math.round((doneMin / 60) * 10) / 10} / ${Math.round((plannedMin / 60) * 10) / 10} 小时`,
    // 周复盘尚无作答。
    noWeeklyAttempts: '这周还没开始刷题，今天点「开始」跑完第一节就有记录了。',
    // 每周复盘卡：本周进步最明显的考点
    weeklyBestGain: (topicName: string, gainPct: number) => `涨势最猛：${topicName}（+${gainPct}%）`,
    // 每周复盘卡：下周最需要补的考点
    weeklyTopGap: (topicName: string) => `最该盯紧：${topicName}`,
    // 每周复盘卡：下周计划自动调整方向标题
    weeklyNextAdjustmentLabel: '下周排课微调',
    // 每周复盘卡在未调用 AI 时的默认结构化总结文案
    weeklyDefaultSummary: '本周节奏保持得不错，下周会给刚暴露出来的慢题和错题多留一节专项训练。',
    // 每周复盘卡底部按钮：让 AI 助教写一段自然语言周评
    askWeeklyCoachReviewBtn: '生成本周助教点评',
    // 下方图表一标题：掌握度热力图（考点 × 周）
    heatmapTitle: '考点掌握度演进（按周）',
    // 掌握度热力图只回答的那一个问题（副标题）
    heatmapQuestion: '这 11 个主攻弱项是一周比一周亮，还是停在原地？',
    // 热力图每周日期。
    weekColumn: (n: number) => `第${n}周`,
    // 下方图表二标题：每日学习时长柱状图
    hoursChartTitle: '每日有效学习时长',
    // 每日时长柱状图只回答的那一个问题（副标题）
    hoursChartQuestion: '每周 5 天 × 120 分钟的节奏稳住了吗？',
    // 每日时长柱状图上的 120 分钟虚线刻度说明
    hoursTargetLineLabel: '120 分钟目标线',
    // 下方图表三标题：答题速度 × 准确率散点图
    speedScatterTitle: '各考点速度与准确率分布',
    // 速度散点图只回答的那一个问题（副标题）
    speedScatterQuestion: '哪些考点虽然能算对，但在考场上太吃时间？',
    // 速度图暂无计时作答。
    noSpeed: '做完几组带计时的练习后，各考点的快慢与准度就会落在这张图上',
    // 速度散点横轴。
    speedAxis: '耗时比（越靠左越快，1.0 为考场标准节奏）',
    // 速度散点纵轴。
    accuracyAxis: '得分率（越靠上越稳）',
    // 速度散点悬停提示。
    speedPoint: (topic: string, speed: number, accuracy: number) =>
      `${topic} · 标准用时的 ${speed} 倍 · 得分率 ${accuracy}%`,
    // 速度散点图象限标签：高准确 + 快于目标用时
    quadrantFastSolid: '又快又稳',
    // 速度散点图象限标签：高准确 + 慢于目标用时
    quadrantSlowAccurate: '算得对但偏慢（练提速）',
    // 速度散点图象限标签：低准确 + 下笔过快
    quadrantRushedWrong: '下笔太急（防粗心坑）',
    // 速度散点图象限标签：低准确 + 耗时长
    quadrantNeedFoundation: '概念待补强',
  },

  // 「做题器（专注模式）」（#/session/:id）：选择题、数学答题卡、记述题自评与 AI 批改、解析与胶囊控制
  session: {
    // 未找到或过期的会话。
    missing: '没找到这节练习记录，可能已经结束或清理掉了',
    // 专注模式左上角暂存退出按钮
    pauseAndExitBtn: '暂存并退出',
    // 回到来源页面。
    returnToOrigin: '回到刚才的页面',
    // 停在会话页面时的暂停提示。
    paused: '已暂停计时',
    // 整卷模考途中点退出时的确认弹窗标题
    exitMockModalTitle: '模考还在倒计时，要先退出来吗？',
    // 整卷模考途中点退出时的确认弹窗说明
    exitMockModalBody: '已经填好的答案会原样留着，回来能接着考；如果想直接结算成绩，请点立即交卷。',
    // 退出确认弹窗：留在考场继续做题按钮
    stayInSessionBtn: '留在专注模式继续做',
    // 退出确认弹窗：确认暂存并退出按钮
    confirmSaveExitBtn: '暂存进度并离开',
    // 整卷模考右上角主按钮：立即交卷
    submitMockPaperBtn: '立即交卷看成绩',
    // 模考剩余时间归零。
    timeUp: '到点停笔啦，核对一眼就开始交卷结算吧',
    // 答题卡空题确认信息。
    finishWithUnanswered: (n: number) => `还有 ${n} 道题空着没答，确定现在就结算吗？`,
    // 完卷时的确认按钮。
    confirmFinish: '确认结算本节',
    // 顶部题号进度指示
    questionProgress: (current: number, total: number) => `第 ${current} / ${total} 题`,
    // 单题目标参考用时提示
    targetTimeHint: (seconds: number) => `参考节奏 ${Math.max(1, Math.round(seconds / 60))} 分钟`,
    // 单题耗时明显超出目标时的温和提醒
    overTimeNudge: '这题花的时间有点久了，考场上可以先标「没把握」往后走',
    // 历史题面里的中文对照开关。
    translation: '展开题干中文对照',
    // 真题附带原卷 PDF 时的查看按钮
    openSourcePdfBtn: '对照原卷 PDF',
    // 图片缺少原始说明时的替代文本。
    figure: (n: number) => `题目配图 ${n}`,
    // 理科选择题作答区顶部的操作微提示
    choiceKeyHint: '按数字键 1–9 直接选，Enter 提交',
    // 表格型选择题选项提示。
    seeOptionsTable: '对照题干表内对应组合',
    // 选择题与填空题提交当前题按钮
    submitItemBtn: '提交本题作答',
    // 已提交后进入下一题的主按钮
    nextQuestionBtn: '进入下一题',
    // 回到上一题按钮
    prevQuestionBtn: '回到上一题',
    // 最后一题作答完结本节的主按钮
    finishSessionBtn: '完成本节并结算',
    // 学习段总结的继续按钮。
    continue: '进入今天下一节',
    // EJU 数学引导式填空答题卡区块标题
    mathSheetTitle: 'EJU 数学答题卡',
    // EJU 数学答题卡填写规则一行说明
    mathSheetHint: '按题干方框字母顺序逐格键入数字或符号（- / ±），同一方框全对才得分',
    // 数学答题卡单组方框标签（如 空 [AB]）
    mathBoxGroupLabel: (letters: string) => `空 [${letters}]`,
    // 切换题目时的下一格提示。
    blankLabel: (name: string) => `答题卡方格 ${name}`,
    // 数学答题卡清空整题所有空格按钮
    mathClearAllBtn: '重填全部空格',
    // 数学答题卡还有未填格时的提示
    mathUnfilledWarning: (emptyCount: number) => `还有 ${emptyCount} 个方格没填`,
    // 数学答题卡提交后全对标签
    mathAllCorrectBadge: '全组答对',
    // 数学答题卡提交后部分组答对标签
    mathPartialBadge: (rightGroups: number, totalGroups: number) => `答对 ${rightGroups} / ${totalGroups} 组`,
    // 校内考记述题题干顶部的纸笔作答提示条
    writtenHeaderBadge: '校内考记述题 · 请先在草稿纸上完整写出设元、定律与推导过程',
    // 模考进行中的文字答题草稿。
    examWrittenDraft: '考场作答留底（敲入关键式，或点下方标明已在纸上写完）',
    // 模考纸面作答按钮。
    paperDraft: '标记已在草稿纸写完',
    // 模考纸面已作答的引擎占位文本。
    paperDraftText: '（已在草稿纸完成作答，请用「按评分点自评」逐条核对得分）',
    // 模考记述题草稿已实时保存的状态提示。
    draftStored: '草稿已实时暂存',
    // 封卷后待评的题目数量。
    pendingWritten: (n: number) =>
      n > 0 ? `卷面已封存，还有 ${n} 道记述题等你对照细则打分` : '记述题已全部打完分，点右边正式出成绩单吧',
    // 批改或自评后题目已保存。
    writtenSaved: '这题分数记下了，接着评下一道记述题',
    // 记述题大题总分标注
    writtenTotalPoints: (points: number) => `本题共 ${points} 分`,
    // 记述题各小问分值标注
    writtenPartPoints: (points: number) => `（${points} 分）`,
    // 记述题写完纸面答案后展开标准解答与评分细则的主按钮
    revealWrittenAnswerBtn: '写好了，看标准解答',
    // 记述题展开区的标准解答标题
    modelAnswerHeading: '标准解答与关键式',
    // 记述题简短最终答案标签
    finalAnswerHeading: '最终结论核对',
    // 记述题批改方式切换标签：逐条对照自评
    tabSelfGrade: '按评分点自评',
    // 记述题批改方式切换标签：交给 AI 助教批改
    tabAiGrade: '让助教批改步骤',
    // 记述题自评区顶部引导语
    selfGradePrompt: '对照下面的采分点，勾上你在纸上明确写出来的步骤：',
    // 记述题每条 rubric 右侧的分值胶囊
    rubricPointsTag: (points: number) => `+${points} 分`,
    // 记述题自评实时合计得分文字
    selfGradeTotal: (earned: number, maxPoints: number) => `自评得分：${earned} / ${maxPoints} 分`,
    // 记述题保存自评分数并继续的主按钮
    saveSelfGradeBtn: (earned: number, maxPoints: number) => `记入 ${earned}/${maxPoints} 分并继续`,
    // 记述题 AI 批改输入框上方说明
    aiGradeInputLabel: '把你纸上的核心方程、推导逻辑和最终结果敲在下面（公式可直接写如 V = BLv）：',
    // 记述题 AI 批改多行输入框占位示例
    aiGradePlaceholder: '例：(1) 由运动方程 ma = mg sinθ - μmg cosθ 得加速度 a… (2) 代入能量守恒…',
    // 记述题提交给 AI 批改的按钮
    submitToAiGradeBtn: '交给助教按评分细则批改',
    // 记述题 AI 正在批改时的等待文案
    aiGradingStatus: '助教正在对照采分点逐行检查你的式子与符号…',
    // 记述题 AI 批改结果标题
    aiGradeResultHeading: (earned: number, maxPoints: number) => `助教给分：${earned} / ${maxPoints} 分`,
    // 记述题 AI 批改扣分点与改进建议小标题
    aiGradeFeedbackLabel: '逐条点评与补分建议',
    // 采纳 AI 批改得分并进入下一题的按钮
    acceptAiGradeBtn: '记入批改成绩并继续',
    // 专注模式底部悬浮胶囊按钮：标记没把握（快捷键 F）
    flagUnsureBtn: '标记没把握',
    // 专注模式底部悬浮胶囊按钮：已标记没把握激活态
    flagUnsureActive: '已标没把握',
    // 专注模式底部悬浮胶囊按钮：带着本题呼出助教（快捷键 /）
    askCoachInSessionBtn: '问助教这道题',
    // 专注模式底部悬浮胶囊按钮：展开题号总览卡
    openSheetOverviewBtn: '展开答题卡总览',
    // 答题卡总览浮层标题
    overviewPopoverTitle: '本节题目总览',
    // 答题卡总览图例：已作答
    overviewDone: '已答',
    // 答题卡总览图例：当前题
    overviewCurrent: '当前',
    // 答题卡总览图例：标了没把握
    overviewUnsure: '没把握',
    // 答题卡总览图例：未作答
    overviewUnanswered: '未答',
    // 实在卡壳时跳过作答直接看解析的次要按钮
    giveUpAndSeeExplainBtn: '跳过作答，直接看解析',
    // 提交后即时反馈横幅：干脆答对
    feedbackCorrect: '答对了，思路很稳',
    // 提交后即时反馈横幅：答对但耗时超标
    feedbackCorrectSlow: (usedSec: number, targetSec: number) =>
      `算对了！不过用了 ${usedSec} 秒（考场建议 ${targetSec} 秒内），看看解析里有没有更快解法。`,
    // 提交后即时反馈横幅：答对但标了没把握或蒙的
    feedbackCorrectUnsure: '虽然选对了但底气还不实，扫一眼下面的推导，过两天会再抽查一次。',
    // 提交后即时反馈横幅：答错
    feedbackWrong: '这道掉坑里了，别急着翻页，看看是卡在哪一步。',
    // 提交后即时反馈横幅：放弃直接看解析
    feedbackRevealed: '先把标准破题点看明白，过两天换个时间让你独立重做一遍。',
    // 展开解析按钮（快捷键 E）
    expandExplainBtn: '展开完整解析',
    // 收起解析按钮（快捷键 E）
    collapseExplainBtn: '收起本题解析',
    // 解析面板分段小标题：破题思路（思路 → 步骤 → 结论之首）
    explainIdeaHeading: '破题思路',
    // 解析面板分段小标题：推导步骤（思路 → 步骤 → 结论之中）
    explainStepsHeading: '完整推导步骤',
    // 解析面板分段小标题：最终结论（思路 → 步骤 → 结论之尾）
    explainConclusionHeading: '结论核对',
    // 解析面板分段小标题：考场快解技巧
    explainShortcutHeading: '考场省时快解',
    // 解析面板分段小标题：本题考察考点
    explainKeyPointsHeading: '考察考点',
    // 解析面板分段小标题：常见易错坑点
    explainTrapsHeading: '这题最容易错在哪',
    // 解析面板分段小标题：题干日语术语小注
    explainTermsHeading: '题干日语术语',
    // 答错或没把握时底部的生成同类变式题按钮
    spawnVariantBtn: '出一道同类变式题当场巩固',
    // 变式题生成与独立重解验算中的等待提示
    spawningVariantHint: '助教正在出题并做第二次独立重解核对答案，稍等几秒…',
    // 变式题生成完毕后的顶部来源标签
    variantReadyTag: '同类变式巩固 · 已双次独立验算',
    // 本节练习全部做完后的结算画面大标题
    summaryModalTitle: '这一节稳稳拿下了',
    // 本节结算画面核心数据行
    summaryStatsLine: (correctCount: number, totalCount: number, usedMin: number) =>
      `共 ${totalCount} 题 · 答对 ${correctCount} 题 · 用时 ${usedMin} 分钟`,
    // 本节结算画面考点掌握度变化提示
    summaryMasteryDelta: (topicName: string, fromPct: number, toPct: number) =>
      `${topicName} 掌握度 ${fromPct}% → ${toPct}%`,
    // 本节结算画面主按钮：回到「今天」继续下一节
    backToTodayFlowBtn: '回到今天继续下一节',
    // 本节结算画面次按钮：留下来回看刚才做错的题
    reviewWrongJustNowBtn: '回看刚才做错的题',
  },

  // 「AI 助教」对话面板（从悬浮胶囊弹出或贴靠右侧）：欢迎语、思考中、失败重试与建议问题
  coach: {
    // 助教面板顶部标题
    title: 'AI 助教',
    // 助教面板右上角切换为右侧固定停靠按钮提示
    pinToRightBtn: '贴靠到窗口右侧',
    // 助教面板右上角切换回悬浮卡片按钮提示
    unpinFloatBtn: '切回悬浮面板',
    // 助教面板右上角清空当前对话历史按钮提示
    clearHistoryBtn: '清空这段对话',
    // 助教面板顶部上下文胶囊：带入了具体题目
    contextQuestion: (itemLabel: string) => `已带入题目 · ${itemLabel}`,
    // 助教面板顶部上下文胶囊：带入了当前考点笔记
    contextNote: (topicName: string) => `已带入笔记 · ${topicName}`,
    // 页面级上下文标签。
    contextPage: (name: string) => `正在浏览 · ${name}`,
    // 助教面板顶部上下文胶囊：全局备考对话
    contextGlobal: '数理化备考助教',
    // 绝对禁止考中看题解时的文案。
    lockedDuringExam: '现在是正式掐表模考，我得先闭嘴避嫌。等交完卷，哪步没算顺我们再细盘！',
    // 平时在主页或练习页打开助教时的欢迎语
    welcomeGeneral: '今天哪块学着别扭？不管是公式总记混、某类题下不去笔，还是想聊聊早大和 MARCH 的节奏，直接跟我说。',
    // 做题器里带着当前题目打开助教时的欢迎语
    welcomeWithQuestion: '这道题我已经看到了。说说你推到哪一步卡住了，或者哪个干扰项让你纠结，我们顺着你的草稿往下理。',
    // 阅读考点笔记时打开助教的欢迎语
    welcomeWithNote: '这篇笔记里哪条公式或反应条件看着绕？我可以给你换个更直白的物理/化学图景讲一遍，或者当场考你一小问。',
    // 没有题号时的可执行提示。
    chooseQuestion: '想聊具体某道题的话，先点进那道题或对应考点笔记再叫我；现在也可以点下面让我做本周复盘。',
    // 建议问题胶囊列表上方的引导短语
    suggestionsLabel: '点一下直接问：',
    // 建议问题 1：做题破题切入点
    suggestBreakthrough: '这道题第一眼该抓哪个条件切入？',
    // 建议问题 2：错误选项归因
    suggestWhyDistractor: '帮我分析一下我刚选错的那个选项是怎么算歪的？',
    // 建议问题 3：考场提速技巧
    suggestExamShortcut: '在 EJU 考场上这道题有没有更省时间的算法？',
    // 建议问题 4：概念直觉理解
    suggestDeepIntuition: '别光背公式，帮我讲讲它背后的物理/化学直觉',
    // 建议问题 5：易混考点辨析
    suggestTrapCompare: '这个考点最容易跟哪个相似概念搞混？',
    // 建议问题 6：生成同类变式题
    suggestAnotherOne: '照着这个考法再给我出一道变式题练手',
    // 建议问题 7：结合本周数据聊调整
    suggestWeeklyPlan: '看我这周的表现，接下来几天最该优先补哪块？',
    // 启动已验算变式练习。
    startVariant: '开始做这道变式题',
    // 练完当前题段后可启动独立变式。
    variantAfterSession: '先把眼前这节做完或暂存，出来就能单练这道变式题。',
    // 助教底部输入框占位文字
    inputPlaceholder: '写下你的疑问或卡住的式子，按 Enter 发送…',
    // 助教底部发送按钮
    sendMessageBtn: '发送提问',
    // 助教正在推理时的刻度环转动状态文字
    thinkingGeneral: '正在顺着题目一步步推导…',
    // 助教正在生成变式题并做二次独立求解校验时的状态文字
    thinkingVariantCheck: '正在出题并做第二次独立求解验算，确保答案万无一失…',
    // 助教正在批改记述题答案时的状态文字
    thinkingRubricGrade: '正在对照评分细则核对你的推导步骤…',
    // 取消助教运行任务。
    cancelJob: '停下这次推演',
    // 助教任务取消后的状态。
    cancelled: '已经停下刚才的推演了，想问别的随时发给我。',
    // 助教忙时的状态。
    busy: '我还在算上一道题，等这步出结果了再问下一条吧。',
    // 助教请求失败时的通用温和提示
    errorGeneral: '助教刚刚走神没接上话，点下面重发一次就好。',
    // 助教推理超时时的提示
    errorTimeout: '这道题推演花的时间有点超了，连接断了，点一下重试吧。',
    // 本机 Codex 服务未就绪、未开启或未登录时的提示
    errorServiceUnavailable: '暂时没连上助教，请检查设置里是否已开启助教、以及本机 Codex 是否已登录。',
    // 变式题两次独立求解答案不一致被安全拦截时的提示
    errorVariantUnverified: '刚编的变式题两次验算结果没对上，为了不坑你已拦下，再点一次重出一道。',
    // 失败消息气泡下方的重试按钮
    retryAskBtn: '重新发送刚才的问题',
  },

  // 「首次引导三步」（全屏毛玻璃卡）：定目标 → 选每周 5 天与每日时长 → 核对起点与弱项
  onboarding: {
    // 引导页左上角欢迎小标
    welcomeEyebrow: '澄学 EJU 3.0 · 备考启程',
    // 引导页右上角步骤进度指示
    stepProgress: (step: 1 | 2 | 3) => `第 ${step} / 3 步`,
    // 引导页底部返回上一步按钮
    backStepBtn: '返回上一步',
    // 第一步大标题：目标院校与目标分
    step1Title: '先把明年 6 月的目标立住',
    // 第一步副标题说明
    step1Subtitle: '已按早稻田理工与 MARCH 稳妥线预填（数学 190 · 物理 90 · 化学 90），随时能在设置里改。',
    // 第一步目标院校方向字段标题
    targetSchoolsLabel: '目标院校范围',
    // 第一步目标院校选项：早稻田理工三学部
    optionWaseda: '早稻田大学（基幹・創造・先進理工）',
    // 第一步目标院校选项：MARCH 理工系
    optionMarch: 'MARCH 理工系（明治・青学・立教・中央・法政）',
    // 第一步考期确认说明行
    examDateReadout: '锁定考期：2027 年 6 月 20 日（第 1 回 EJU）· 只考数学コース 2、物理、化学',
    // 第一步各科目标滑块区标题
    subjectTargetsHeading: '各科目标分参考线',
    // 第一步数学目标字段标签
    mathTargetField: '数学コース 2（满分 200）',
    // 第一步物理目标字段标签
    physicsTargetField: '物理（满分 100）',
    // 第一步化学目标字段标签
    chemistryTargetField: '化学（满分 100）',
    // 第一步三科总分实时汇总文字
    totalTargetSummary: (totalScore: number) => `三科目标合计：${totalScore} / 400 分`,
    // 第一步进入第二步的主按钮
    toStep2Btn: '保存目标，去排每周时间',
    // 第二步大标题：选择每周学习日与每日时长
    step2Title: '定下每周稳稳投入的 5 天',
    // 第二步副标题说明
    step2Subtitle: '7 个月的长跑拼的是不断档。每周固定 5 天、每天专注 2 小时，剩下的交给我来排。',
    // 第二步星期胶囊选择区标签
    pickWeekdaysLabel: '选出你通常有空的星期（哪天临时有事随时能挪）',
    // 第二步已选学习日天数实时提示
    pickedDaysSummary: (daysCount: number) => `当前已选每周 ${daysCount} 天`,
    // 第二步单日学习时长滑块标题
    dailyDurationLabel: '每个学习日的专注时长',
    // 第二步单日时长数值显示
    dailyDurationReadout: (minutes: number) => `${minutes} 分钟（${Math.round((minutes / 60) * 10) / 10} 小时）`,
    // 第二步累计到考前总学时预估提示
    cumulativeHoursNote: (totalHours: number) => `照这个节奏到 6 月考前，你将攒下约 ${totalHours} 小时实打实的靶向训练。`,
    // 第二步进入第三步的主按钮
    toStep3Btn: '选好时间，核对起点与弱项',
    // 第三步大标题：确认上次成绩起点与重点弱项
    step3Title: '核对你的起点与主攻短板',
    // 第三步副标题说明
    step3Subtitle: '已按上次实战成绩（数学 132 · 物理 54 · 化学 66，理科合计 120）和薄弱点预填好了，好钢全用在刀刃上。',
    // 第三步起点分数区小标题
    baselineHeading: '上次实战起点（用于校准初始难度）',
    // 第三步数学起点输入标签
    baselineMathField: '数学コース 2 起点（/ 200）',
    // 第三步物理起点输入标签
    baselinePhysicsField: '物理起点（/ 100）',
    // 第三步化学起点输入标签
    baselineChemistryField: '化学起点（/ 100）',
    // 第三步预选薄弱考点区标题
    weakTopicsHeading: '优先倾斜时间的主攻弱项（可点选增减）',
    // 首次引导第三步，每科弱项折叠区展开其他考点的按钮。
    moreTopicsBtn: '加选其他薄弱考点',
    // 第三步已选弱项数量说明
    weakTopicsCountNote: (count: number) => `已圈定 ${count} 个重点突破考点；强项只排少量间隔复习保手感`,
    // 第三步完成引导的主按钮
    completeOnboardingBtn: '生成 30 周计划，开始第一天',
  },

  // 「设置」页面（#/settings）：目标与弱项、学习日作息、六张季节场景/天气粒子/轻钢琴音乐、AI 助教与备份
  settings: {
    // 「设置」页面主面板大标题
    title: '设置',
    // 「设置」页面标题下方的一行说明
    subtitle: '调整目标、每周作息、季节场景和助教偏好，所有学习记录都安心存在本机。',
    // 第一组标题：目标与薄弱考点
    groupGoalTitle: '目标与主攻弱项',
    // 第一组说明文字
    groupGoalDesc: '改动各科目标分或主攻弱项后，明天起尚未执行的每日任务会自动重新配比。',
    // 设置项标签：目标院校
    fieldTargetSchools: '目标院校方向',
    // 设置项说明：目标院校影响校内考题目的穿插比例
    fieldTargetSchoolsDesc: '决定 3 月起计划里穿插哪些学校的记述题与拔高题。',
    // 设置项标签：目标考期
    fieldExamDate: '目标 EJU 考期',
    // 设置项说明：目标考期
    fieldExamDateDesc: '路线图阶段划分与考前减量周均以此日期倒推计算。',
    // 设置项标签：三科目标分
    fieldTargetScores: '各科目标分（数学 / 物理 / 化学）',
    // 设置项说明：三科目标分
    fieldTargetScoresDesc: '将显示在数据页预测分区间条的目标刻度线上。',
    // 设置项标签：11 月起点基线分
    fieldBaselineScores: '起点参考分',
    // 设置项说明：起点参考分
    fieldBaselineScoresDesc: '用于对比整个备考周期的净提分幅度。',
    // 设置项标签：主攻弱项列表
    fieldWeakTopics: '重点攻坚弱项',
    // 设置项说明：主攻弱项列表
    fieldWeakTopicsDesc: '勾选的考点会在练习地图标琥珀点、笔记页置顶，并获得更高排课权重。',
    // 打开弱项勾选弹窗的按钮
    manageWeakTopicsBtn: '编辑主攻弱项清单',
    // 保存目标分组修改的按钮
    saveGoalChangesBtn: '保存目标并重排后续计划',
    // 第二组标题：每周作息与计划节奏
    groupScheduleTitle: '每周学习节奏',
    // 第二组说明文字
    groupScheduleDesc: '设定常规每周哪几天学、每天学多久；单日临时变动直接在「今天」或「计划」页点挪日即可。',
    // 设置项标签：固定学习日
    fieldWeeklyDays: '每周默认学习日',
    // 设置项说明：固定学习日
    fieldWeeklyDaysDesc: '建议选满 5 天，留出 2 天做机动缓冲。',
    // 设置项标签：每日投入时长
    fieldDailyMinutes: '单日计划时长',
    // 设置项说明：每日投入时长
    fieldDailyMinutesDesc: '默认 120 分钟（光球一圈 120 格刻度），含中场 5 分钟小憩。',
    // 第三组标题：外观、六张季节场景、天气粒子与背景音乐
    groupAppearanceTitle: '外观与空间场景',
    // 第三组说明文字
    groupAppearanceDesc: '切换冬春初夏六张季节场景、天气粒子、毛玻璃明暗与轻钢琴背景乐；进入做题器后粒子和视差自动静止。',
    // 设置项标签：背景场景模式
    fieldSceneMode: '背景场景',
    // 设置项说明：背景场景模式
    fieldSceneModeDesc: '默认随备考季节（冬 → 春 → 初夏）与昼夜时间自动流转，也可手动固定成其中一张。',
    // 场景自动和固定分段。
    sceneAuto: '随时间流转',
    // 场景固定分段。
    sceneFixed: '手动固定',
    // 场景缩略图按季节时段标记。
    winterDay: '冬日晴雪',
    // 场景缩略图按季节时段标记。
    winterNight: '冬夜静雪',
    // 场景缩略图按季节时段标记。
    springDay: '春日落樱',
    // 场景缩略图按季节时段标记。
    springNight: '春夜樱风',
    // 场景缩略图按季节时段标记。
    summerDay: '初夏晴光',
    // 场景缩略图按季节时段标记。
    summerNight: '夏夜流萤',
    // 设置项标签：毛玻璃明暗主题
    fieldGlassTheme: '毛玻璃材质明暗',
    // 设置项说明：毛玻璃明暗主题
    fieldGlassThemeDesc: '暗玻璃适合夜晚沉浸刷题，亮玻璃适合白天阅读，题干区始终保持高对比度。',
    // 玻璃主题选项：跟随场景
    themeOptionAuto: '跟随场景自动适配',
    // 玻璃主题选项：暗玻璃
    themeOptionDark: '夜 · 暗色毛玻璃',
    // 玻璃主题选项：亮玻璃
    themeOptionLight: '昼 · 亮色毛玻璃',
    // 设置项标签：天气粒子开关
    fieldParticles: '天气粒子',
    // 设置项说明：雪/花瓣/萤火三种天气粒子
    fieldParticlesDesc: '随季节飘落冬雪、春樱花瓣或夏夜萤火，专注做题时自动静止不抢视线。',
    // 设置项标签：鼠标视差摆动
    fieldParallax: '面板轻微视差',
    // 设置项说明：鼠标视差摆动
    fieldParallaxDesc: '鼠标移动时玻璃面板微幅跟随；若系统开启了「减少动态效果」会自动关闭。',
    // 背景音乐区标题。
    music: '轻钢琴背景乐',
    // 音乐音量滑杆标签。
    volume: '背景乐音量',
    // 已有钢琴曲目的显示名。
    pianoTrack: (n: number) => (n === 1 ? '轻钢琴一' : n === 2 ? '轻钢琴二' : n === 3 ? '轻钢琴三' : `轻钢琴 ${n}`),
    // 第四组标题：AI 助教参数
    groupCoachTitle: 'AI 助教',
    // 第四组说明文字
    groupCoachDesc: '调用这台电脑上已登录的 Codex 为你拆解题思路、批改记述步骤、出变式题与做每周复盘。',
    // 助教开关的标签。
    coachEnabled: '开启 AI 助教',
    // 设置项标签：助教模型名称
    fieldCoachModel: '助教推理模型',
    // 设置项说明：助教模型名称
    fieldCoachModelDesc: '默认配置已针对数理化公式推导与响应速度做过平衡。',
    // 设置项标签：推理思考深度
    fieldCoachEffort: '推理深度',
    // 设置项说明：推理思考深度
    fieldCoachEffortDesc: '日常追问用「均衡」回得最快；复杂记述题批改可切到「深入」。',
    // 推理深度选项：轻快
    effortOptionLow: '轻快秒回',
    // 推理深度选项：均衡默认
    effortOptionMedium: '均衡（推荐）',
    // 推理深度选项：深入
    effortOptionHigh: '深入推演',
    // 测试助教连通性按钮
    testCoachBtn: '测试本机助教连接',
    // 助教状态检查确认发现本机 CLI。
    coachCliFound: '已连上本机 Codex 助教，做题时随时可以发问',
    // 第五组标题：本地数据与导出备份
    groupDataTitle: '学习记录与备份',
    // 第五组说明文字
    groupDataDesc: '你的历史作答、错题本和计划状态只保存在这台电脑上，定期导出一份备份更踏实。',
    // 导出学习数据备份按钮
    exportBackupBtn: '导出学习备份文件',
    // 检查备份文件并准备恢复按钮
    importBackupBtn: '检查并恢复备份文件',
    // 备份校验后的确认状态。
    importVerified: '备份文件核对无误',
    // 原生备份恢复入口暂时没有服务写入支持。
    importStaged:
      '这份备份完好可用。先点下面存为 state-v3.json，关掉澄学后用它替换项目 data 文件夹里的同名文件，重新打开就恢复好了（替换前建议先把旧文件留个底）。',
    // 备份检查后导出导入用的文件。
    saveImportCopy: '保存 state-v3.json 恢复文件',
    // 设置页底部的软件版本与本地存储说明
    footerVersionNote: (version: string) => `澄学 EJU ${version} · 数据保存在本机`,
  },

  // 通用文案槽位：三科名称、通用动词按钮、加载与出错反馈、确认弹窗通用操作与度量格式
  common: {
    // 科目简称：数学
    math: '数学',
    // 科目全称：数学コース2
    mathFull: '数学コース 2',
    // 科目简称：物理
    physics: '物理',
    // 科目简称：化学
    chemistry: '化学',
    // 理科合称：物理 + 化学
    science: '理科（物理・化学）',
    // 根据科目代码返回中文科目名的辅助函数
    subjectName: (subject: 'math' | 'physics' | 'chemistry') =>
      subject === 'math' ? '数学' : subject === 'physics' ? '物理' : '化学',
    // 难度等级标签映射函数
    difficultyName: (level: 1 | 2 | 3) =>
      level === 1 ? '基础入门' : level === 2 ? 'EJU 标准' : '难题与拔高',
    // 同时存在学习会话时，从其他入口提示继续或结束。
    activeSession: '手头还有一节练习没收尾，先回到那边做完吧。',
    // 失效或已移出题库的题目标识。
    missingItem: '这道题已从题库移出，直接跳过即可',
    // 保存时另一窗口已更新档案。
    staleState: '另一个窗口刚更新过学习进度，已帮你同步到最新，再点一次就行',
    // 日期选取及数据不足时的短占位。
    noValue: '—',
    // 各处科目分数总分。
    outOf: (max: number) => `/ ${max}`,
    // 主动结束无作答的会话。
    abandon: '放弃本次练习',
    // 主动结束后保留的记录说明。
    abandonNote: '已经提交过的题目都记入掌握度了；点暂存离开后，下次回来还能接着做。',
    // 通用弹窗确认按钮
    confirmBtn: '确认选择',
    // 通用弹窗取消按钮
    cancelBtn: '取消改动',
    // 通用关闭浮层或抽屉按钮
    closeBtn: '关闭面板',
    // 通用返回上一级按钮
    backBtn: '返回上一页',
    // 通用保存修改按钮
    saveBtn: '保存修改',
    // 通用恢复默认按钮
    resetBtn: '恢复默认设置',
    // 通用出错重试按钮
    retryBtn: '重新加载内容',
    // 通用查看全部按钮
    viewAllBtn: '查看全部内容',
    // 通用展开折叠区按钮
    expandBtn: '展开更多考点',
    // 通用收起折叠区按钮
    collapseBtn: '收起对照内容',
    // 通用知晓关闭提示按钮
    gotItBtn: '收起提示',
    // 页面或面板骨架加载中的说明文字
    loading: '正在整理题目与学习进度…',
    // 保存操作进行中的提示文字
    saving: '正在保存…',
    // 页面数据加载失败时的卡片标题
    errorTitle: '这页内容刚刚没读出来',
    // 页面数据加载失败时的温和说明
    errorBody: '确认本机后台服务还在运行后，点下面重新加载就行，之前做过的题都稳稳留着。',
    // 与本地服务短暂断连时的顶栏轻提示
    offlineBanner: '与本机服务断开了连接，正在自动重连…',
    // 分数单位格式
    scorePoints: (pts: number) => `${pts} 分`,
    // 题目数量格式
    questionCount: (count: number) => `${count} 题`,
    // 卡片数量格式
    cardCount: (count: number) => `${count} 张`,
    // 百分比通用格式
    percent: (pct: number) => `${pct}%`,
    // 正确率百分比标注格式
    accuracy: (pct: number) => `正确率 ${pct}%`,
    // 掌握度百分比标注格式
    mastery: (pct: number) => `掌握度 ${pct}%`,
    // 推荐小标签
    recommendedTag: '推荐',
    // 选做小标签
    optionalTag: '选做',
  },

  // 空状态文案（所有列表为空、队列清零、搜索无结果、尚未积累数据时的展示）
  empty: {
    // 「今天」全部学完且无剩余队列时的空状态标题
    todayDoneTitle: '今天的任务已经清零了',
    // 「今天」全部学完时的空状态说明
    todayDoneBody: '每天踏踏实实推进这 2 小时就够厉害了。关掉窗口去休息，明天我们接着往下走。',
    // 「复习」队列到期数为 0 时的空状态标题
    reviewClearTitle: '今天没有到期的错题和背诵卡',
    // 「复习」队列到期数为 0 时的空状态说明
    reviewClearBody: '前几天的账都按时清干净了！想手痒加练的话，去「练习」挑一块带琥珀点的弱项砖吧。',
    // 「复习」切换某个分类筛选后为空的提示
    reviewFilterEmpty: '这个分类下眼下没有待复习的条目。',
    // 「练习」搜索无匹配题目时的空状态标题
    practiceNoMatchTitle: (keyword: string) => `没找到包含「${keyword}」的题目`,
    // 「练习」搜索无匹配题目时的空状态建议
    practiceNoMatchBody: '换个日语考纲原词（比如 電磁誘導、場合の数）或者删掉几个字再搜搜看。',
    // 「练习」某考点在当前难度筛选下无题目的提示
    practiceFilterEmpty: '这个难度档位下暂时没有题目，切回「全部梯度」看看。',
    // 「模考」尚未做过任何整卷时的历史成绩空状态标题
    mockNoRecordTitle: '还没有整卷模考成绩单',
    // 「模考」尚未做过任何整卷时的空状态说明
    mockNoRecordBody: '等周末留出整块 80 分钟来打第一场，做完的各科得失分都会记在这里。',
    // 「笔记」搜索无结果时的空状态标题
    notesNoMatchTitle: (keyword: string) => `笔记里没搜到「${keyword}」`,
    // 「笔记」搜索无结果时的空状态建议
    notesNoMatchBody: '试试搜核心名词或化学式，也可以直接点右下角让助教给你现讲一遍。',
    // 「笔记」尚未选中左侧具体考点时的右侧占位说明
    notesIdlePrompt: '从左边挑一个考点，核心公式、常考套路和易错坑点会在这里展开。',
    // 「数据」刚起步还没有足够作答记录时的空状态标题
    insightsColdStartTitle: '做完今天第一节，这里就会亮起来',
    // 「数据」刚起步时的空状态说明
    insightsColdStartBody: '等你积累几轮真实作答之后，实力区间估计、掌握度热力图和速度象限都会如实画出来。',
    // 全局 ⌘K 搜索框无任何匹配结果时的提示
    globalSearchEmpty: '没搜到对应的题目或笔记，换个考点词试试。',
  },

  // 顶部/底部轻提示（Toast）：保存、挪日、重排、标记、备份导出与助教状态通知
  toast: {
    // 设置保存成功提示
    settingsSaved: '设置已保存，后面的日程已跟着更新好了',
    // 学习日挪动成功提示
    dayMoved: '学习日已挪好，后续复习节点自动顺延',
    // 当天切换为休息日成功提示
    markedRestDay: '已把今天改为休息日，任务平摊到后面几天了',
    // 休息日切换为学习日成功提示
    markedStudyDay: '今天已设为学习日，今日安排已就绪',
    // 题目标记为「没把握」提示
    markedUnsure: '已记下「没把握」，过两天换个时间再抽查你',
    // 取消「没把握」标记提示
    clearedUnsure: '已取消「没把握」标记',
    // 答错自动加入间隔复习队列提示
    addedToReviewQueue: '这道题已放进间隔复习队列，到遗忘临界点会提醒你',
    // 做题中途暂存退出成功提示
    sessionSaved: '当前进度已存好，回来随时接着做',
    // 同类变式题生成并双验算成功提示
    variantReady: '同类变式题已就绪，开始巩固吧',
    // 导出本地备份成功提示
    backupExported: '学习记录备份已导出到本地文件夹',
    // 备份文件校验不通过时的错误提示
    backupInvalid: '这份文件不是有效的澄学备份，请核对后再选一次',
    // 测试 AI 助教连接成功提示
    coachConnected: '助教连接畅通，随时可以发问',
    // 测试 AI 助教连接失败提示
    coachUnreachable: '没连上助教，请确认已开启助教且本机 Codex 已正常登录',
    // 复制公式或文本成功提示
    copied: '已复制到剪贴板',
  },

  // 各种时间、日期、周次与数量的格式化函数（分钟、小时、还有 N 天、第 N 周、星期、计时表盘等）
  time: {
    // 距离目标日期的天数倒计时文案
    leftDays: (n: number) => (n > 0 ? `还有 ${n} 天` : n === 0 ? '就是今天' : `已过 ${Math.abs(n)} 天`),
    // 纯天数数量格式
    days: (n: number) => `${n} 天`,
    // 未来相对天数自然表述（今天/明天/后天/N天后）
    inDays: (n: number) => (n <= 0 ? '今天' : n === 1 ? '明天' : n === 2 ? '后天' : `${n} 天后`),
    // 过去相对天数自然表述（今天/昨天/前天/N天前）
    daysAgo: (n: number) => (n <= 0 ? '今天' : n === 1 ? '昨天' : n === 2 ? '前天' : `${n} 天前`),
    // 备考第 N 周格式
    weekNumber: (week: number) => `第 ${week} 周`,
    // 备考第 N 周带总周数格式
    weekOfTotal: (week: number, totalWeeks: number) => `第 ${week} / ${totalWeeks} 周`,
    // 距离考试剩余周数格式
    weeksLeft: (weeks: number) => `还剩 ${weeks} 周`,
    // 每周学习天数格式
    daysPerWeek: (days: number) => `每周 ${days} 天`,
    // 秒数格式
    seconds: (sec: number) => `${sec} 秒`,
    // 分钟数格式
    minutes: (min: number) => `${min} 分钟`,
    // 小时数格式（自动保留整点或一位小数）
    hours: (hr: number) => `${Math.round(hr * 10) / 10} 小时`,
    // 分钟数自动转为「X 小时 Y 分钟」的人性化时长格式
    durationMin: (totalMin: number) => {
      const m = Math.max(0, Math.round(totalMin));
      const h = Math.floor(m / 60);
      const rem = m % 60;
      if (h === 0) return `${rem} 分钟`;
      if (rem === 0) return `${h} 小时`;
      return `${h} 小时 ${rem} 分钟`;
    },
    // 秒数自动转为「X 分 Y 秒」的做题耗时格式
    durationSec: (totalSec: number) => {
      const s = Math.max(0, Math.round(totalSec));
      const m = Math.floor(s / 60);
      const rem = s % 60;
      if (m === 0) return `${rem} 秒`;
      if (rem === 0) return `${m} 分钟`;
      return `${m} 分 ${rem} 秒`;
    },
    // 倒计时或正计时等宽数字表盘格式（MM:SS 或 H:MM:SS）
    timerClock: (totalSec: number) => {
      const s = Math.max(0, Math.floor(totalSec));
      const h = Math.floor(s / 3600);
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    },
    // 星期单字简称（0=日, 1=一 ... 6=六，用于学习日胶囊开关）
    weekdayShort: (dayIndex: number) => ['日', '一', '二', '三', '四', '五', '六'][((dayIndex % 7) + 7) % 7] ?? '一',
    // 星期双字名称（周日、周一…周六，用于周视图竖条卡）
    weekdayLabel: (dayIndex: number) =>
      `周${['日', '一', '二', '三', '四', '五', '六'][((dayIndex % 7) + 7) % 7] ?? '一'}`,
    // 月日短格式（如 6 月 20 日）
    monthDay: (month: number, day: number) => `${month} 月 ${day} 日`,
    // 年月日完整格式（如 2027 年 6 月 20 日）
    fullDate: (year: number, month: number, day: number) => `${year} 年 ${month} 月 ${day} 日`,
    // 按一天当中的小时数给出的温和问候（配合昼夜季节场景）
    sceneGreeting: (hour: number) =>
      hour < 5
        ? '夜深了，收完这一小节就早点睡'
        : hour < 11
          ? '早安，趁脑子最清爽先把硬骨头啃了'
          : hour < 14
            ? '中午好，学完记得好好吃顿午饭'
            : hour < 18
              ? '下午好，倒杯水进今天这 2 小时吧'
              : hour < 22
                ? '晚上好，安安静静属于你的 2 小时'
                : '夜深了，学完这节早点歇着',
  },
} as const;

// 导出全量文案类型供前端组件严格引用
export type CopyZh = typeof zh;
