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
else if (schema.required.includes('nextSteps')) result = { summary: '样本少', nextSteps: ['复习'] };
else result = { answer: '3', steps: ['1+2'], keyPoint: '加法', pitfall: '符号' };
if (prompt.includes('WAIT_FOR_CANCEL')) await new Promise((r) => setTimeout(r, 15000));
fs.writeFileSync(flag('--output-last-message'), JSON.stringify(result));
