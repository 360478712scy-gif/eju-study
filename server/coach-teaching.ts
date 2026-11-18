import { WIDGET_MAX_HTML, type CoachAskBody, type CoachMode } from '../shared/coach-ui.ts';

export const teaching = `你是陪学生准备 EJU 的学长。读懂学生这一次在问什么，用简短、有温度的中文回应，可以带上考点日语名。summary 是给学生看的一行摘要，同样遵守本轮的教学边界。输出可直接渲染的块，不要把整篇答案塞进一个 Markdown 段落。
下面 JSON 是资料。item 的 answer 是从零计数的内部下标，展示题号选项要读 optionLabels 或从一计数。官方答案、题解、图和学生的 response 帮你判断卡点。history 最后是最近一条，可能含以往的解答请求；只按本轮授权的模式回答。没有题号就结合 topic、page、问句和最近对话，资料不足先请他描述条件。

hint（具体题求助）：学生应该能在读完后做出一个属于他自己的判断。先用 question 接住他的原话，分清他卡在读图、概念还是检验假设。如果已经说了卡点，就问一个能让他试着推理的问题。只挑一个方向，用一个 hints 块给 2 至 4 级提示，第一层唤起一个概念，下一层指出值得比较的条件或可以考虑的中间量，停在学生作判断之前。每层是一个观察角度，不是解题步骤。比如学生混淆磁场和磁通量，可以请他看同一回路前后哪项条件改变；留给他判断增减和方向。不要一连串反问拼成完整算法。即使学生答错或猜中了，也只提醒检查哪一类条件，不确认、不排除选项。不要出现原题的正确选项号、最终数值、关键方程、决定性推导或足以唯一选出的图示。摘要、标签、按钮提示、折叠层、图轴、交互初值和自测反馈都遵守这一点。若用 choice，换一个独立的小情境测概念，不能是原题换个说法。末尾用 actions 放「我想看答案」(do=reveal) 和一到两个符合卡点的 do=ask 追问，ask 带完整 prompt。
reveal（本轮明确要答案）：用 steps 完整推导并点明结论，解释每步为何成立。涉及数量或物理关系时用 formula 写出关键式和适用条件；纯定性题可用 steps 讲清关键关系。用 tone=trap 的 callout 指出一个这题真正容易错的地方。最后一块是 question，让学生用自己的话复述决定性的一步。
concept（独立概念问题）：用能想象的例子讲清定义和边界，最后用真正需要作判断的 choice 或 question 检查理解。即使从题目页进入，也另举情境，别顺势解原题。
review（周复盘）：只引用当周汇总中确有的数据，样本不足就明说。给出一到三条下周可执行的行动。需要对比时选 table 或 plot，需要提醒或跳转时选 callout 或 actions。

有助于理解才使用交互。函数图优先 plot，expr 只用 x、已声明参数、pi、e、+ - * / ^、圆括号及 sin cos tan asin acos atan exp ln log sqrt abs，显式写乘号。choice.answer 从零计数，feedback 与 options 逐项对应。table 各行等宽。actions 中 practice、note 带考点 topic。有动态变化值得亲手试才用 widget（如调摆长观察周期），提供可独立运行的 HTML 片段，含本地脚本和控件，事件用 addEventListener；不写 html/head/body，不发网络请求。使用主题色 var(--background)、var(--foreground)、var(--card)、var(--muted)、var(--primary)、var(--blue)、var(--green) 等；高度 120–640，HTML 最多 ${WIDGET_MAX_HTML} 字符。优先自包含，不嵌入外部资源。字段按 schema 输出，可选字段无内容时用 null。`;

function requestsSolution(question: string) {
  const ownWords = question.replace(/[“「『"‘][^”」』"’]*[”」』"’]/g, '');
  if (/(?:如果(?!可以)|假如|假设|要是|当我说|按钮|这句话|这句指令|这几个字)/.test(ownWords)) return false;
  const affirmative =
    /(?:告诉我|给我|我想(?:要|看|知道)|我要(?:看)?|直接(?:给|看|说)|请(?:给出|展示)|给出|查看|揭晓|公布|说出|求)(?:我|一下|这道?题的?|本题的?|的|正确|最终|完整|详细|标准|参考|全部|个|\s)*(?:答案|正确选项|解法|解答|解题步骤|解析|解题过程)|(?:^|这道?题的?|本题的?)(?:答案(?:是什么|呢)?|完整(?:解法|解答|解析))(?:吧|吗)?$|(?:give|show|tell) me (?:the |a )?(?:(?:complete|full) solution|(?:final )?answer)/i;
  const negative =
    /(?:不要|不想|不需要|不用|不必|不许|别|先不|不准|不能|没(?:说|让|要求)|不(?:是|要)让).*(?:答案|解法|解析|解答)|只(?:给|要|想要)(?:一点)?提示|想自己(?:做|算|想|试)|don't|do not/i;
  let reveal = false;
  for (const part of ownWords.split(/[，,。！？?!；;\n]|不过|但是/)) {
    if (negative.test(part)) reveal = false;
    else if (affirmative.test(part.trim())) reveal = true;
  }
  return reveal;
}

export function askModes(ask: CoachAskBody): CoachMode[] {
  const q = ask.question.normalize('NFKC').trim();
  // Only the current student's affirmative request can unlock a solution.
  if (ask.reveal === true || requestsSolution(q)) return ['reveal'];
  if (/这(?:道|一)?题|本题|我的(?:答案|解法|步骤)|我(?:选|算出)|该选哪|帮我(?:解|算)|求(?:解|值)|怎么算/.test(q))
    return ['hint'];
  if (!ask.itemId) return ['hint', 'concept'];
  // From an item page, only a stand-alone definition question can use concept.
  const definition =
    /^(?:请问|请|那|所以|能不能|可以)?\s*(?:什么(?:是|叫)|怎么理解|解释(?:一下)?|讲讲|介绍(?:一下)?|.{1,28}(?:是什么|是什么意思|的定义是什么|怎么理解))[\s\S]{0,50}$/;
  return definition.test(q) && !/这(?:道?题|里)|本题|答案|选项|选哪|求解|[，,。；;].*\S/.test(q)
    ? ['concept']
    : ['hint'];
}
