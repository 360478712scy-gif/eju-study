import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {VOCAB} from '../public/content.js';
import {VOCAB_EXPANDED} from '../public/vocabulary-expanded.js';
import {LEARNING_CARDS} from '../public/learning-cards.js';
import {buildPronunciationSource,wordSpeechText} from '../tools/generate_pronunciation.mjs';
import {createPronunciationPlayer,PRONUNCIATION_EVENT} from '../public/pronunciation.js';

const manifestPath=new URL('../public/assets/pronunciation/manifest.json',import.meta.url);
const readManifest=()=>JSON.parse(fs.readFileSync(manifestPath,'utf8'));

test('reviewed pronunciation corrections change synthesis and asset identity without corrupting authored readings or other words',()=>{
  const source=buildPronunciationSource(),word=source.vocabularyByQuestionId.vx140,asset=source.assets[word.wordAssetId];
  assert.equal(word.reading,'あつりょく');assert.equal(asset.text,'あつりょく');assert.equal(asset.speechText,'圧力');
  assert.notEqual(word.wordAssetId,'0437b802d80f1e79f52dce2b','must not reuse the incorrect cached audio');
  assert.equal(wordSpeechText('あつりよく'),'あつりよく','large kana is not silently accepted as the intended word');
  for(const [id,reading,text] of [['vx136','ちょうりょく','張力'],['vx064','ちゅうしゅつ','抽出']]){
    const row=source.vocabularyByQuestionId[id];assert.equal(row.reading,reading);assert.equal(source.assets[row.wordAssetId].speechText,text);
  }
  assert.equal(source.termsByJapanese['抽出'].wordAudio,source.vocabularyByQuestionId.vx064.wordAudio,'academic-term pronunciation gets the same correction');
  for(const kana of ['ふりょく','しりょう','がっこう','きゅう','コーヒー'])assert.equal(wordSpeechText(kana),kana);
  assert.equal(source.vocabularyByQuestionId.vx141.wordAssetId,'688ebcf7bb464b6061033f40','reviewed unaffected audio remains unchanged');
});

test('full-library audit corrections keep kana standards while selecting distinct lexical audio',()=>{
  const source=buildPronunciationSource();
  const reviewed=[['ていしゅつ','提出'],['はんしゃ','反射'],['ほじょきん','補助金'],['たいしょ','対処'],['せっしょく','接触'],['ひっしゅう','必修'],['ローレンツりょく','ローレンツ力']];
  for(const [reading,text] of reviewed){
    const original=createHash('sha256').update(JSON.stringify(['Kyoko',170,'word',reading])).digest('hex').slice(0,24);
    const asset=Object.values(source.assets).find(a=>a.kind==='word'&&a.text===reading);
    assert.ok(asset,text);assert.equal(asset.speechText,text);assert.notEqual(asset.id,original);
    assert.equal(wordSpeechText(reading),text);
  }
  assert.equal(wordSpeechText('いちエネルギー'),'いちエネルギー','an inconclusive normalization match must not trigger a blind override');
  const sentence=source.vocabularyByQuestionId.vx007;
  assert.match(sentence.example,/バスで10分ほど/);
  assert.equal(source.assets[sentence.exampleAssetId].speechText,sentence.example);
  assert.notEqual(sentence.exampleAssetId,'eeeae014b4f1cff2794a3978');
  assert.match(source.vocabularyByQuestionId.vx008.example,/十分に練習/,'sufficient and ten minutes are separate readings');
});
function movieDuration(bytes){
  function scan(start,end){
    for(let p=start;p+8<=end;){
      const size=bytes.readUInt32BE(p),type=bytes.toString('ascii',p+4,p+8);
      assert.ok(size>=8&&p+size<=end,'valid M4A atom boundary');
      if(type==='mvhd'){
        const version=bytes[p+8],offset=version===1?p+28:p+20;
        const scale=bytes.readUInt32BE(offset),duration=version===1?Number(bytes.readBigUInt64BE(offset+4)):bytes.readUInt32BE(offset+4);
        return duration/scale;
      }
      if(type==='moov'){const duration=scan(p+8,p+size);if(duration)return duration;}
      p+=size;
    }
  }
  return scan(0,bytes.length);
}

test('all 330 vocabulary readings and Japanese examples map only to their authored speech text',()=>{
  const manifest=readManifest(),source=buildPronunciationSource();
  assert.deepEqual(manifest.vocabularyByQuestionId,source.vocabularyByQuestionId);
  assert.equal(Object.keys(manifest.vocabularyByQuestionId).length,330);
  for(const v of [...VOCAB,...VOCAB_EXPANDED]){
    const row=manifest.vocabularyByQuestionId[v.questionId||v.id];
    assert.equal(row.word,v.word);assert.equal(row.reading,v.reading);assert.equal(row.example,v.example);
    const word=manifest.assets[row.wordAssetId],example=manifest.assets[row.exampleAssetId];
    assert.equal(word.text,v.reading);assert.match(word.text,/^[ぁ-ゖァ-ヺー・\s]+$/u);
    assert.equal(example.text,v.example);assert.match(example.text,/[ぁ-ゖァ-ヺ]/u);
    assert.equal(word.textBasis,'reading');assert.equal(example.textBasis,'japanese-example');
    assert.equal(row.wordAudio,word.url);assert.equal(row.exampleAudio,example.url);
  }
  assert.equal(Object.values(manifest.assets).filter(a=>a.kind==='example').length,330);
  assert.equal(manifest.source.type,'synthetic-speech');assert.equal(manifest.source.voice,'Kyoko');
  assert.match(manifest.source.label,/合成.*非真人/);
});

test('107 distinct academic terms are searchable by Japanese spelling and exact kana, retaining every card link',()=>{
  const manifest=readManifest();
  assert.equal(Object.keys(manifest.termsByJapanese).length,107);
  for(const card of LEARNING_CARDS)for(const term of card.terms){
    const row=manifest.termsByJapanese[term.ja],kana=manifest.termsByReading[term.reading];
    assert.equal(row.reading,term.reading);assert.ok(row.cardIds.includes(card.id));
    assert.ok(kana.japaneseTerms.includes(term.ja));assert.equal(kana.wordAudio,row.wordAudio);
    assert.equal(manifest.assets[row.wordAssetId].text,term.reading);
  }
  assert.equal(manifest.termsByJapanese['酢酸エチル'].reading,'さくさんエチル');
  assert.equal(manifest.termsByJapanese['アセトアルデヒド'].reading,'アセトアルデヒド');
  assert.equal(manifest.termsByJapanese['第二級アルコール'].reading,'だいにきゅうアルコール');
});

test('every referenced offline M4A has real duration, a valid container and the recorded checksum',()=>{
  const manifest=readManifest(),expected=buildPronunciationSource();
  assert.deepEqual(Object.keys(manifest.assets).sort(),Object.keys(expected.assets).sort());
  for(const item of Object.values(manifest.assets)){
    assert.match(item.url,/^\/assets\/pronunciation\/[a-f0-9]{24}\.m4a$/);
    assert.ok(item.durationSeconds>0&&item.durationSeconds<45,item.id);
    const bytes=fs.readFileSync(new URL('../public'+item.url,import.meta.url));
    assert.equal(bytes.length,item.bytes);assert.equal(bytes.toString('ascii',4,8),'ftyp');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
    const duration=movieDuration(bytes);
    assert.ok(duration>0&&Math.abs(duration-item.durationSeconds)<0.35,`container and valid-frame duration agree: ${item.id}`);
  }
});

const url=id=>`/assets/pronunciation/${id.repeat(24)}.m4a`;
const fixture={vocabularyByQuestionId:{v1:{wordAudio:url('a'),exampleAudio:url('b')}},termsByJapanese:{酢酸:{wordAudio:url('c')}},termsByReading:{さくさん:{wordAudio:url('c')}}};
function harness({fetcher,playBehavior}={}){
  const audios=[],events=[],eventTarget=new EventTarget();let fetchCount=0;
  class FakeAudio extends EventTarget{
    constructor(src){super();this.src=src;this.playbackRate=1;this.paused=true;this.currentTime=0;audios.push(this);}
    play(){this.paused=false;return playBehavior?playBehavior(this):Promise.resolve();}
    pause(){this.paused=true;}
  }
  eventTarget.addEventListener(PRONUNCIATION_EVENT,event=>events.push(event.detail));
  const player=createPronunciationPlayer({AudioClass:FakeAudio,eventTarget,fetcher:async()=>{fetchCount++;return fetcher?fetcher():{ok:true,json:async()=>fixture};}});
  return {player,audios,events,fetchCount:()=>fetchCount};
}

test('one player exclusively plays word, example and term audio with pitch-preserving speed changes',async()=>{
  const {player,audios,events,fetchCount}=harness();
  assert.equal(await player.playWord('v1',{rate:0.8}),true);
  assert.equal(audios[0].src,url('a'));assert.equal(audios[0].playbackRate,0.8);assert.equal(audios[0].preservesPitch,true);
  assert.equal(await player.playExample('v1',{rate:1.2}),true);
  assert.equal(audios[0].paused,true);assert.equal(audios[1].src,url('b'));assert.equal(audios[1].playbackRate,1.2);
  assert.deepEqual(events.slice(0,3).map(e=>e.playing),[true,false,true]);
  player.setRate(1);assert.equal(audios[1].playbackRate,1);
  await player.playTerm('酢酸');assert.equal(audios[2].src,url('c'));
  await player.playTerm('さくさん');assert.equal(audios[3].src,url('c'));assert.equal(fetchCount(),1);
  audios[3].dispatchEvent(new Event('ended'));assert.equal(player.isPlaying(),false);assert.equal(events.at(-1).reason,'ended');
  assert.throws(()=>player.setRate(2),/只支持/);
  await assert.rejects(player.playWord('v1',{rate:0.9}),/只支持/);
});

test('stopping while the manifest loads cancels the queued voice before official listening can be interrupted',async()=>{
  let resolve;
  const pending=new Promise(r=>{resolve=r;});
  const {player,audios,events}=harness({fetcher:()=>pending});
  const started=player.playWord('v1');
  player.stop();resolve({ok:true,json:async()=>fixture});
  assert.equal(await started,false);assert.equal(audios.length,0);assert.equal(events.length,0);
});

test('a speed change during initial loading applies when the pending request has no explicit rate',async()=>{
  let resolve;
  const pending=new Promise(r=>{resolve=r;});
  const {player,audios}=harness({fetcher:()=>pending});
  const started=player.playWord('v1');player.setRate(0.8);
  resolve({ok:true,json:async()=>fixture});
  assert.equal(await started,true);assert.equal(audios[0].playbackRate,0.8);
  player.stop();
});

test('stale play rejection cannot stop a newer utterance and a failed current play releases music ducking',async()=>{
  let rejectFirst;
  const {player,audios,events}=harness({playBehavior:audio=>audio.src===url('a')?new Promise((_,reject)=>{rejectFirst=reject;}):Promise.resolve()});
  await player.loadManifest();const first=player.playWord('v1');await new Promise(resolve=>setImmediate(resolve));
  await player.playExample('v1');rejectFirst(new Error('old request aborted'));
  assert.equal(await first,false);assert.equal(audios[0].paused,true);assert.equal(player.isPlaying(),true);
  player.stop();assert.equal(events.at(-1).playing,false);
  const failed=harness({playBehavior:()=>Promise.reject(new Error('autoplay blocked'))});
  await assert.rejects(failed.player.playWord('v1'),/未能播放/);
  assert.equal(failed.player.isPlaying(),false);assert.deepEqual(failed.events.map(e=>e.playing),[true,false]);
});

test('missing entries and unavailable manifests fail without speaking arbitrary fallback text',async()=>{
  const h=harness();await assert.rejects(h.player.playWord('missing'),/暂未提供/);
  assert.equal(h.audios.length,0);assert.equal(h.events.length,0);
  const unavailable=harness({fetcher:async()=>({ok:false})});
  await assert.rejects(unavailable.player.playWord('v1'),/未能加载/);
  assert.equal(unavailable.audios.length,0);
});
