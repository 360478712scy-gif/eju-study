// 待 Carbon 改写的新增文案（音乐播放窗、自定义背景、助教交互式回答）。结构与 zh.ts 相同；并入 zh.ts 后清空本文件。
export const pending = {
  music: {
    // 导航底部音乐键的提示，也是播放小窗的标题
    title: '背景音乐',
    // 播放窗：当前曲目是自己添加的
    mine: '我添加的',
    // 播放窗：上一首 / 下一首 / 播放 / 暂停 / 音量 / 拖动进度
    prev: '上一首',
    next: '下一首',
    play: '播放',
    pause: '暂停',
    volume: '音量',
    seek: '跳到这里',
    // 播放窗：展开 / 收起音乐目录
    openFolder: '音乐目录',
    hideFolder: '收起音乐目录',
    // 音乐目录：添加曲子按钮
    add: '添加钢琴曲',
    // 音乐目录：删除自己添加的曲子
    remove: '删除这首',
    // 添加成功提示（n 首）
    added: (n: number) => `已添加 ${n} 首`,
    // 添加失败提示（格式不支持或文件太大）
    addFailed: '没能添加，换一个 mp3 或 m4a 文件试试',
  },
  settings: {
    // 场景选择：添加自己的图片
    backgroundAdd: '添加图片',
    // 场景选择：删除自己添加的图片
    backgroundRemove: '删除这张图片',
    // 添加图片成功（已经换上）
    backgroundAdded: '新背景已换上',
    // 添加图片失败
    backgroundAddFailed: '没能添加，换一张 jpg 或 png 试试',
  },
  coach: {
    // 交互式回答：逐级提示「再给一点提示」按钮
    moreHint: '再给一点提示',
    // 交互式回答：提示已经全部给出
    hintsDone: '提示就到这里，剩下的一步交给你',
    // 交互式回答：引导提问下的回复按钮与输入框占位
    reply: '回答',
    replyPlaceholder: '说说你的想法…',
    // 交互式回答：完整解法里「全部展开」
    stepsShowAll: '全部展开',
    // 交互式回答：自测小题答对 / 答错
    choiceCorrect: '对了',
    choiceTryAgain: '再想想',
    // 交互式回答：重点 / 易错 / 小技巧卡片的标签
    calloutKey: '关键',
    calloutTrap: '易错',
    calloutTip: '小技巧',
    // 学生点「我想看答案」时作为他的消息显示
    revealAsk: '我想看完整解法',
  },
} as const;
