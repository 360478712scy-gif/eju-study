// One-time: convert the v1.4 vocabulary (330 words) to content/vocab/v1.json, keeping ids and audio.
import fs from 'node:fs';
const { VOCAB_EXPANDED } = await import('../../public/vocabulary-expanded.js');
const { VOCAB } = await import('../../public/content.js');
const { VOCAB_CONTENT } = await import('../../public/vocab-content.js');
const manifest = JSON.parse(fs.readFileSync('public/assets/pronunciation/manifest.json', 'utf8'));
const SCIENCE = new Set(['实验现象', '实验器具与物理量']);
const out = [];
for (const v of [...VOCAB, ...VOCAB_EXPANDED]) {
  const rich = VOCAB_CONTENT[v.id];
  const audio = manifest.vocabularyByQuestionId[v.id];
  out.push({
    id: v.id,
    word: v.word,
    reading: v.reading,
    meaningZh: (rich && rich.meaning) || v.meaning,
    category: SCIENCE.has(v.category) ? 'science' : 'general',
    subject: SCIENCE.has(v.category) ? 'physics' : undefined,
    example: v.example ? { ja: v.example } : undefined,
    audio: audio ? { word: audio.wordAudio, example: audio.exampleAudio } : undefined,
    group: v.category || '基础学术词',
  });
}
fs.writeFileSync('content/vocab/v1.json', JSON.stringify({ title: 'v1.4 vocabulary (converted)', entries: out }, null, 1));
console.log('vocab', out.length, 'with audio', out.filter((x) => x.audio).length);
