// 待 Carbon 改写的新增文案（3.0 学习清单布局）。结构与 zh.ts 相同；并入 zh.ts 后清空本文件。
export const pending = {
  today: {
    // 今天页左侧主卡的标题（今天的学习清单）
    planCardTitle: '今天的安排',
    // 主卡标题旁的总量：项数与总分钟
    planCardMeta: (count: number, minutes: number) => `${count} 项 · ${minutes} 分钟`,
    // 清单里每一项的类型标签（learn 专项新学 / review 到期复习 / interleave 交错练习 / quiz 限时小测 / school 校内考记述题 / mock 整卷模考 / break 休息 / notes 整理笔记）
    kindLabel: (kind: string) =>
      (({ learn: '专项', review: '复习', interleave: '交错练习', quiz: '限时小测', school: '校内考', mock: '整卷模考', break: '休息', notes: '整理笔记' }) as Record<string, string>)[kind] ?? kind,
    // 清单当前一项右侧的开始按钮
    startThisBtn: '开始',
    // 清单当前一项右侧的继续按钮（已开始过）
    continueThisBtn: '继续',
    // 右侧倒计时卡的标题
    countdownTitle: '距离 EJU',
    // 倒计时卡里的全程进度说明：当前阶段名 + 已走过的百分比
    phaseProgress: (phase: string, pct: number) => `${phase} · 全程已走 ${pct}%`,
    // 右侧预测分卡的标题
    forecastTitle: '预测分',
    // 预测分条右侧的目标值
    forecastTarget: (n: number) => `目标 ${n}`,
    // 休息日时主卡里下一次学习的预告标题
    restNextTitle: (date: string) => `下次学习 · ${date}`,
    // 今天学完后主卡的标题
    doneTitle: '今天的 2 小时完成了',
  },
  nav: {
    // 学习进行中时主面板顶部状态栏左侧的小标签
    barStudying: '正在学',
    // 状态栏：当前一项在今天安排里的位置
    barStep: (i: number, n: number) => `第 ${i} / ${n} 项`,
    // 状态栏：本项剩余时间
    barRemaining: (clock: string) => `剩 ${clock}`,
    // 状态栏：暂停按钮
    barPauseBtn: '暂停',
    // 状态栏：继续按钮
    barResumeBtn: '继续',
    // 状态栏：手动任务（休息、整理笔记）完成按钮
    barFinishBtn: '完成这一项',
    // 状态栏：回到正在做的题目
    barOpenBtn: '回到题目',
    // 右下角悬浮的助教按钮
    fabCoach: '问助教',
    // 导航底部的背景音乐开关
    musicToggle: '背景音乐',
  },
  session: {
    // 做题器顶部：暂停计时
    headPauseBtn: '暂停',
    // 做题器顶部：继续计时
    headResumeBtn: '继续',
    // 做题器顶部：打开答题卡总览
    headSheetBtn: '答题卡',
  },
} as const;
