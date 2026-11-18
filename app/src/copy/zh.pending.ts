export const pending = {
  today: {
    // 今天页侧面板及窄屏抽屉的未来任务预览标题。
    queuePreviewTitle: (date: string) => `${date} · 学习预览`,
    // 今天已学完但明天休息时，预览列表中的空状态。
    queuePreviewNoTasks: '这一天没有安排学习任务。',
    // 休息日之后没有学习日时，今天页侧面板的标题。
    queueNoUpcoming: '暂无后续学习安排',
    // 今天页助教一句话：最近一个有作答的学习日里失分最多的考点。
    coachRecentMistakes: (date: string, topic: string, count: number) =>
      `${date}「${topic}」错得最多，有 ${count} 题。可以先回看这几题的易错点。`,
    // 今天页助教一句话：首个专项是弱项时显示该考点的掌握度。
    coachWeakFocus: (topic: string, mastery: number) =>
      `今天先练「${topic}」，目前掌握度 ${mastery}%。把最容易卡住的那一步练熟。`,
    // 今天页助教一句话：有校内考任务时提示计划内的学校。
    coachSchoolPractice: (school: string) => `今天安排了${school}的校内考练习，留意它的题型和步骤。`,
    // 今天页助教一句话：无更优先线索时提示连续学习天数。
    coachStudyStreak: (days: number) => `已经连续学了 ${days} 天，保持这个节奏就好。`,
  },
  plan: {
    // 今天台本、队列和计划周视图里的校内考任务标题。
    schoolTaskTitle: (school: string, purpose: string) => `${school} · ${purpose}`,
    // 校内任务采用真考形式时的短标签。
    schoolExamStyle: '真考形式',
    // 校内任务用于院校拔高时的短标签。
    schoolExtension: '院校拔高',
    // 今日台本、队列、助教一句话与计划周视图用的早稻田短名。
    schoolShortWaseda: '早稻田',
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
  review: {
    // 复习列表底部，展开当前筛选下超过 30 条的全部今日队列。
    showAllItemsBtn: (count: number) => `查看全部 ${count} 项`,
  },
  insights: {
    // 今天预测分卡与数据页各科预测证据为 sparse 时的小标签。
    sparseBadge: '数据还少',
    // 数据页低证据预测区间下方的首刷样本数，证据由同一行的小标签说明。
    forecastSamples: (count: number) => `基于 ${count} 道首刷题`,
  },
  onboarding: {
    // 首次引导第三步，每科弱项折叠区展开其他考点的按钮。
    moreTopicsBtn: '添加其他考点',
  },
} as const;
