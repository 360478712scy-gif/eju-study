export const pending = {
  common: {
    // 同时存在学习会话时，从其他入口提示继续或结束。
    activeSession: '还有一节正在进行，先回到那一节。',
    // 失效或已移出题库的题目标识。
    missingItem: '这道题已不在题库里。',
    // 保存时另一窗口已更新档案。
    staleState: '学习记录刚在另一个窗口更新，请检查后重试。',
    // 日期选取及数据不足时的短占位。
    noValue: '—',
    // 各处科目分数总分。
    outOf: (max: number) => `/ ${max}`,
    // 主动结束无作答的会话。
    abandon: '结束本节',
    // 主动结束后保留的记录说明。
    abandonNote: '已提交的作答会留在学习记录里。',
  },
  nav: {
    // 程序标题和网页标题。
    appTitle: '澄学 EJU',
    // 倒计时数字右侧。
    countdownUnit: '天后 EJU',
    // 开始学习前的等待文案。
    upcoming: (date: string) => `下一次学习：${date}`,
  },
  today: {
    // 时长自定义后的开始按钮。
    startFor: (duration: string) => `开始今天的 ${duration}`,
    // 自定义时长的今日完成状态。
    completed: '今天的安排走完了，休息一下吧。',
    // 自定义时长的今日未开始说明。
    ready: (duration: string) => `今天的 ${duration}已排好，按顺序学就行。`,
    // 今日专项、笔记任务、模考和订正标题。
    focus: (name: string) => `专项 · ${name}`,
    // 今日笔记整理任务标题。
    consolidate: '整理这一节的笔记',
    // 今日模考任务名称。
    timedPaper: (name: string) => `${name} · 限时整卷`,
    // 今日模考订正任务名称。
    correctPaper: '订正刚做完的整卷',
    // 今日任务台本和时长。
    scriptDuration: (duration: string) => `今日台本 · ${duration}`,
    // 今日统计卡上的本周标题。
    week: '本周',
    // 有连续学习记录时的标题区提示。
    streak: (n: number) => `连续学习 ${n} 天`,
    // 休息任务超出默认时长时的实际分钟数。
    breakFor: (n: number) => `起身喝口水 · 歇 ${n} 分钟`,
    // 休息任务时长变化时的理由。
    breakReason: '离开屏幕活动一会儿，下一节再回来。',
    // 休息块结束后的主按钮。
    finishBreak: '休息好了，继续',
    // 手动整理任务的完成按钮。
    finishManual: '整理好了，继续',
    // 未练到题时的助教句。
    coachFocus: (topic: string) => `这一节先把 ${topic} 的关键步骤走一遍。`,
    // 有数据但尚无本日作答时的助教句。
    coachReady: '一步一步来，把每道题的关键步骤想清楚。',
    // 台本前几项以外的任务统一入口。
    showTasks: '查看全部安排',
    // 回看今天记录时的标题。
    todayWorkHeading: '今天做过的题',
  },
  plan: {
    // 周月切换和月份箭头。
    week: '周',
    // 月历切换按钮。
    month: '月',
    // 月历返回前一月。
    previousMonth: '看上一月',
    // 月历进入后一月。
    nextMonth: '看下一月',
    // 月历与时间轴的月份数字。
    monthLabel: (n: number) => `${n} 月`,
    // 每周天数和实际每日预算。
    schedule: (days: number, minutes: number) => `每周 ${days} 天 · 每天 ${minutes} 分钟`,
    // 单日重新补学。
    catchUp: '补做这天的题',
    // 日期状态已经超出计划。
    outside: '计划外',
    // 计划挪动日期输入。
    moveDate: '挪到的日期',
    // 路线图进度下的各科数字，按实际档案生成。
    milestoneScores: (math: number, physics: number, chemistry: number) => `数学 ${math} · 物理 ${physics} · 化学 ${chemistry}`,
    // 无法挪到目标日时的反馈。
    cannotMove: '请选择计划内空闲且未开始的日期。',
  },
  practice: {
    // 单元标题下的考点个数。
    topicCount: (n: number) => `${n} 个考点`,
    // 考点侧栏标题。
    topicHeading: '考点详情',
    // 考点近期答题对错。
    recent: '近期作答',
    // 考点细分难度展示。
    difficulty: '难度梯度',
    // 真题或校内卷结果为空。
    noPapers: '这科暂时没有套卷。',
    // 分批做整卷练习、复习队列时的反馈。
    batch: (n: number) => `本节先做前 ${n} 题`,
  },
  review: {
    // 新卡尚无到期日期。
    newCard: '新卡',
    // 易错和猜测标签。
    possibleGuess: '可能是猜对的',
    // 卡片数据尚无标签时的通用名。
    card: '背诵卡',
  },
  mock: {
    // 校内卷分值使用评分点原始分。
    rawScore: (score: number) => `得分率 ${score}%`,
    // 模考成绩历史的标题。
    history: '成绩回看',
    // 模考率分和空题数据。
    answered: (n: number, total: number) => `已答 ${n} / ${total} 题`,
    // 学习计划中暂时无这套卷的日期。
    unscheduled: '暂未排期',
    // 校内题按入试目的显示标签。
    examStyle: '笔试风格',
    // 校内题按入试目的显示标签。
    extension: '院校拔高',
    // 从模考诊断打开历史题。
    reviewQuestion: '查看作答与解析',
  },
  notes: {
    // 个人考点笔记编辑框标题。
    personal: '我的笔记',
    // 保存个人笔记成功时的提示。
    personalSaved: '笔记已保存。',
    // 个人考点笔记编辑框占位。
    personalHint: '记下自己的理解、易错点或公式…',
    // 题库尚未为此考点添加正文。
    missingNote: '这个考点暂时没有考纲笔记。',
  },
  insights: {
    // 预测样本量与证据量。
    forecastEvidence: (n: number, evidence: string) => `${n} 道首答 · ${evidence}`,
    // 预测证据三档。
    sparse: '证据较少',
    // 预测证据三档。
    developing: '证据在积累',
    // 预测证据三档。
    broader: '覆盖较广',
    // 周复盘统计的完成天数。
    completedDays: '学习日',
    // 周复盘统计的学习时长。
    hours: '专注时长',
    // 周复盘统计的掌握度上涨考点数。
    gains: '上升考点',
    // 热力图每周日期。
    weekColumn: (n: number) => `W${n}`,
    // 周复盘尚无作答。
    noWeeklyAttempts: '这周还没有作答记录。',
    // 速度图暂无计时作答。
    noSpeed: '完成带计时的作答后，这里会显示速度与正确率。',
    // 速度散点横轴。
    speedAxis: '用时 / 目标用时',
    // 速度散点纵轴。
    accuracyAxis: '实际得分率',
    // 速度散点悬停提示。
    speedPoint: (topic: string, speed: number, accuracy: number) => `${topic} · 用时 ${speed} 倍 · 得分率 ${accuracy}%`,
  },
  session: {
    // 解释条目缺少独立思路字段时展示分类标签。
    draftStored: '答案已保存',
    // 历史题面里的中文对照开关。
    translation: '中文对照',
    // 表格型选择题选项提示。
    seeOptionsTable: '见题中表格',
    // 图片缺少原始说明时的替代文本。
    figure: (n: number) => `题图 ${n}`,
    // 模考进行中的文字答题草稿。
    examWrittenDraft: '输入作答，或标记已写在纸上。',
    // 模考纸面作答按钮。
    paperDraft: '已写在纸上',
    // 模考纸面已作答的引擎占位文本。
    paperDraftText: '见纸面',
    // 模考剩余时间归零。
    timeUp: '时间到了，查看答题卡并交卷。',
    // 封卷后待评的题目数量。
    pendingWritten: (n: number) => `还有 ${n} 道记述题待评分。`,
    // 答题卡空题确认信息。
    finishWithUnanswered: (n: number) => `还有 ${n} 道题未答，确认结束这一节？`,
    // 学习段总结的继续按钮。
    continue: '继续下一节',
    // 回到来源页面。
    returnToOrigin: '返回原页面',
    // 未找到或过期的会话。
    missing: '这节学习已不可用。',
    // 批改或自评后题目已保存。
    writtenSaved: '这道记述题的评分已保存。',
    // 切换题目时的下一格提示。
    blankLabel: (name: string) => `答题格 ${name}`,
    // 完卷时的确认按钮。
    confirmFinish: '确认结束',
    // 停在会话页面时的暂停提示。
    paused: '计时已暂停',
  },
  coach: {
    // 页面级上下文标签。
    contextPage: (name: string) => `当前页面 · ${name}`,
    // 没有题号时的可执行提示。
    chooseQuestion: '先打开一道相关题目，助教就能带着题目讲。',
    // 启动已验算变式练习。
    startVariant: '开始练这道变式',
    // 取消助教运行任务。
    cancelJob: '取消这次请求',
    // 助教任务取消后的状态。
    cancelled: '这次请求已取消。',
    // 助教忙时的状态。
    busy: '助教正在处理上一条请求。',
    // 练完当前题段后可启动独立变式。
    variantAfterSession: '结束当前练习后可以开始变式。',
    // 绝对禁止考中看题解时的文案。
    lockedDuringExam: '交卷并完成评分后，可以问助教这道题。',
  },
  settings: {
    // 场景自动和固定分段。
    sceneAuto: '自动',
    // 场景固定分段。
    sceneFixed: '固定',
    // 场景缩略图按季节时段标记。
    winterDay: '冬日白昼',
    // 场景缩略图按季节时段标记。
    winterNight: '冬日夜晚',
    // 场景缩略图按季节时段标记。
    springDay: '春日白昼',
    // 场景缩略图按季节时段标记。
    springNight: '春日夜晚',
    // 场景缩略图按季节时段标记。
    summerDay: '初夏白昼',
    // 场景缩略图按季节时段标记。
    summerNight: '初夏夜晚',
    // 背景音乐区标题。
    music: '背景音乐',
    // 音乐音量滑杆标签。
    volume: '音乐音量',
    // 已有钢琴曲目的显示名。
    pianoTrack: (n: number) => `轻钢琴 ${n}`,
    // 助教状态检查确认发现本机 CLI。
    coachCliFound: '已找到本机 Codex。发起助教任务时会检查登录。',
    // 助教开关的标签。
    coachEnabled: '启用本机助教',
    // 原生备份恢复入口暂时没有服务写入支持。
    importStaged: '备份已通过基础检查。保存当前档案的副本，退出 App 并停止本机服务后，把下载的文件放入学习档案目录，再重新打开。',
    // 备份检查后导出导入用的文件。
    saveImportCopy: '保存恢复用副本',
    // 备份校验后的确认状态。
    importVerified: '备份格式已通过检查',
  },
} as const;
