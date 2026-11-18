// Offline CLI double. Distinct fixtures for independent solves and failed checks.
import fs from 'node:fs';
const args = process.argv.slice(2);
const flag = (key) => args[args.indexOf(key) + 1];
const schema = JSON.parse(fs.readFileSync(flag('--output-schema'), 'utf8'));
const prompt = fs.readFileSync(0, 'utf8');
fs.appendFileSync(
  process.env.EJU_TEST_TRACE,
  JSON.stringify({ dir: process.cwd(), schema: schema.required, prompt, args }) + '\n',
);
let result;
if (schema.required.includes('stem'))
  result = {
    stem: '長さ2の正方形の面積は？',
    options: ['1', '2', '3', '4'],
    answer: 3,
    explanation: 'SECRET_AUTHOR_REASONING',
  };
else if (schema.required.includes('unambiguous'))
  result = { answer: fs.existsSync(process.env.EJU_TEST_MISMATCH) ? 1 : 3, unambiguous: true, solution: '二乗' };
else if (schema.required.includes('rows'))
  result = { rows: [{ partId: '1', points: [4, 6], feedback: '正确' }], summary: '完整' };
else if (schema.required.includes('blocks')) {
  const modes = schema.properties.mode.enum;
  const mode = modes.includes('concept') && modes.length > 1 ? 'concept' : modes[0];
  const question = { type: 'question', md: '这个量描述的是什么？' };
  const hints = {
    type: 'hints',
    intro: null,
    hints: [
      { label: '观察', md: '关注对象。' },
      { label: '比较', md: '哪个条件变了？' },
    ],
  };
  const actions = {
    type: 'actions',
    items: [
      { label: '我想看答案', do: 'reveal' },
      { label: '换个角度', do: 'ask', prompt: '能换个情景吗？' },
    ],
  };
  const lesson = {
    hint: [question, hints, actions],
    concept: [{ type: 'text', md: '先看同一个回路。' }, question],
    reveal: [
      { type: 'steps', steps: [{ title: '推导', md: '由磁通量变化得到电动势。' }] },
      { type: 'formula', tex: 'V=BLv' },
      { type: 'callout', tone: 'trap', md: '注意夹角。' },
      question,
    ],
    review: [
      { type: 'table', head: ['项目'], rows: [['复习']] },
      { type: 'callout', tone: 'tip', md: '样本少。' },
    ],
  };
  result = { mode, blocks: lesson[mode], summary: '先看条件。' };
  if (process.env.EJU_TEST_REPLY && fs.existsSync(process.env.EJU_TEST_REPLY)) {
    const fixture = JSON.parse(fs.readFileSync(process.env.EJU_TEST_REPLY, 'utf8'));
    if (!fixture.firstOnly || !prompt.includes('上一稿包含题目答案')) {
      if (fixture.insert) result.blocks.splice(1, 0, fixture.insert);
      else Object.assign(result, fixture.reply);
    }
  }
} else throw Error('unexpected schema');
if (prompt.includes('WAIT_FOR_CANCEL')) await new Promise((r) => setTimeout(r, 15000));
fs.writeFileSync(flag('--output-last-message'), JSON.stringify(result));
