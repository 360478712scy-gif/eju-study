import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const bank = JSON.parse(readFileSync(publicDir + 'japanese-expanded.json', 'utf8'));
const sources = JSON.parse(readFileSync(publicDir + 'assets/japanese-expanded/verified-sources.json', 'utf8'));

test('Japanese selection contains 41 reading questions, 59 hearing questions and 17 audio-visual questions', () => {
  assert.equal(bank.length, 117);
  assert.equal(new Set(bank.map(q => q.id)).size, 117);
  assert.equal(bank.filter(q => q.topic === 'reading').length, 41);
  assert.equal(new Set(bank.filter(q => q.passageId).map(q => q.passageId)).size, 29);
  assert.equal(bank.filter(q => q.listeningMode === 'audio-only').length, 59);
  assert.equal(bank.filter(q => q.listeningMode === 'audio-visual').length, 17);
  for (const year of ['2017_2', '2017_1', '2016_2', '2016_1']) {
    const listening = bank.filter(q => q.id.startsWith(`o-${year}-l`));
    const expected = Array.from({length: 15}, (_, i) => i + 13).filter(n => year !== '2016_2' || n !== 18);
    assert.deepEqual(listening.map(q => Number(q.id.split('-l')[1])), expected);
  }
});

test('2017 track filenames and 2016-2 mislabeled filename map by official link labels', () => {
  const get = id => bank.find(q => q.id === id);
  assert.match(get('o-2017_2-l13').audioSourceUrl, /172al22\.wav$/);
  assert.match(get('o-2017_1-l13').audioSourceUrl, /171al22_1\.wav$/);
  assert.equal(get('o-2016_2-l18'), undefined, 'the duplicate/ambiguous q18 recording must not enter tasks');
  assert.match(get('o-2016_2-l19').audioSourceUrl, /162al19\.wav$/);
  const excluded = JSON.parse(readFileSync(publicDir + 'assets/japanese-expanded/excluded-sources.json', 'utf8'));
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].number, 18);
  assert.match(excluded[0].url, /162al19_1\.wav$/);
  assert.equal(excluded[0].sha256, get('o-2016_2-l19').audioSha256);
  assert.equal(new Set(bank.filter(q => q.audio).map(q => q.audioSha256)).size, 76);
  for (const q of bank.filter(q => q.audio)) {
    const audiovisual = q.listeningMode === 'audio-visual';
    const number = Number(q.id.split(audiovisual ? '-av' : '-l')[1]);
    assert.ok(q.audioSourceLabel.startsWith(`${audiovisual ? '聴読解' : '聴解'}${number}番`), q.id);
    assert.ok(!q.audioSourceLabel.includes('練習'), q.id);
    assert.ok(!q.audioSourceLabel.includes('説明'), q.id);
  }
});

test('all source and explanation media exist; answers remain official-image self grading', () => {
  for (const q of bank) {
    assert.equal(q.official, true);
    assert.equal(q.selfGrade, true);
    assert.equal(q.answer, undefined, `${q.id} must not contain a guessed answer`);
    assert.ok(q.answerImages.length > 0, q.id);
    assert.ok(q.answerSource.includes('第1页'), q.id);
    assert.ok(q.sourceUrl.startsWith('https://www.jasso.go.jp/'), q.id);
    for (const media of [q.pdf, q.audio, q.transcriptPdf, q.answerPdf,
      ...q.images || [], ...q.answerImages || [], ...q.transcriptImages || []].filter(Boolean)) {
      assert.ok(existsSync(publicDir + media.slice(1)), `${q.id}: missing ${media}`);
    }
  }
});

test('shared passages count the reading budget once and listening uses actual audio duration', () => {
  for (const q of bank.filter(q => q.audio)) {
    assert.ok(q.audioDurationSeconds > 30 && q.audioDurationSeconds < 240, q.id);
    assert.ok(Math.abs(q.estimatedSeconds - q.audioDurationSeconds - 25) < 0.005, q.id);
    assert.ok(Math.abs(q.minutes * 60 - q.estimatedSeconds) < 0.005, q.id);
  }
  for (const passage of new Set(bank.filter(q => q.passageId).map(q => q.passageId))) {
    const qs = bank.filter(q => q.passageId === passage);
    assert.equal(qs.length, qs[0].sharedPassageQuestionCount, passage);
    assert.ok(Math.abs(qs.reduce((sum, q) => sum + q.estimatedSeconds, 0) - qs[0].passageTotalSeconds) < 0.005, passage);
    assert.ok(qs[0].passageTotalSeconds >= 120 && qs[0].passageTotalSeconds <= 300, passage);
    assert.ok(qs[0].passageJapaneseCharacters > 300, passage);
  }
});

test('listening scripts are hearing scripts and preserve verified cross-page continuations', () => {
  const get = id => bank.find(q => q.id === id);
  assert.match(get('o-2016_2-l13').transcriptPdf, /hearing-script\.pdf$/);
  assert.match(get('o-2016_1-l13').transcriptPdf, /hearing-script\.pdf$/);
  assert.deepEqual(get('o-2017_2-l15').transcriptPages, [2, 3]);
  assert.deepEqual(get('o-2017_1-l13').transcriptPages, [1, 2]);
  assert.deepEqual(get('o-2016_2-l20').transcriptPages, [5, 6]);
  assert.deepEqual(get('o-2016_1-l26').transcriptPages, [8, 9]);
  assert.deepEqual(get('o-2017_2-av7').transcriptPages, [3, 4]);
  assert.deepEqual(get('o-2017_1-av4').transcriptPages, [2, 3]);
  for (const q of bank.filter(q => q.listeningMode === 'audio-visual')) {
    assert.ok(q.images.length > 0, `${q.id}: diagrams must be visible before the answer`);
    assert.ok(q.answerSource.includes('聴読解'), q.id);
  }
  for (const q of bank.filter(q => q.audio)) {
    assert.equal(q.transcriptPages.length, q.transcriptImages.length, q.id);
    assert.ok(q.transcriptPages.every(p => p >= 1 && p <= 9), q.id);
  }
});

test('verified source manifest excludes practice audio and preserves acquired document hashes', () => {
  assert.equal(sources.length, 93);
  const audioSources = sources.filter(s => s.kind === 'audio');
  assert.equal(audioSources.length, 60);
  assert.ok(audioSources.every(s => /^聴解\d+番/.test(s.sourceLabel)));
  for (const source of sources.filter(s => s.path.endsWith('.pdf'))) {
    const digest = createHash('sha256').update(readFileSync(publicDir + source.path.slice(1))).digest('hex');
    assert.equal(digest, source.sha256, source.path);
  }
});
