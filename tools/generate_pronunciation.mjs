#!/usr/bin/env node
// Local asset build only. Playback uses the bundled M4A files and never downloads
// a speech voice or sends learner text to a speech service.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {VOCAB} from '../public/content.js';
import {VOCAB_EXPANDED} from '../public/vocabulary-expanded.js';
import {LEARNING_CARDS} from '../public/learning-cards.js';

const exec=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));
const destination=path.join(root,'public/assets/pronunciation');
export const SPEECH_SOURCE=Object.freeze({
  type:'synthetic-speech',engine:'macOS say',voice:'Kyoko',language:'ja-JP',wordsPerMinute:170,
  format:'AAC / M4A',label:'macOS 日语合成语音（Kyoko），非真人录音',
  wordStrategy:'reviewed-word-overrides-v2',
  wordTextBasis:'标准 reading 原样保留；默认按假名合成，已核验的词法误读使用显式 speechText 覆盖，不整库改写假名',
  exampleTextBasis:'只朗读词条的日语例句原文，不朗读中文释义、题干或选项'
});

export const WORD_SPEECH_OVERRIDES=Object.freeze({
  'あつりょく':'圧力',
  'ちょうりょく':'張力',
  'ちゅうしゅつ':'抽出',
  'ていしゅつ':'提出',
  'はんしゃ':'反射',
  'ほじょきん':'補助金',
  'たいしょ':'対処',
  'せっしょく':'接触',
  'ひっしゅう':'必修',
  'ローレンツりょく':'ローレンツ力'
});
export function wordSpeechText(reading){
  // Keep authored kana intact. Acoustic comparison found Kyoko's isolated
  // あつりょく nearly identical to the erroneous あつりよく. The kanji input
  // agrees with アツリョク instead. The full audit added seven targeted
  // lexical inputs; see tests/pronunciation-audit-20261006/.
  // Other reviewed words do not exhibit the same failure,
  // so a global hiragana-to-katakana conversion would introduce new errors.
  if(typeof reading!=='string'||!reading.trim()||!/^[ぁ-ゖァ-ヺー・\s]+$/u.test(reading))throw Error('Word audio must use kana only: '+reading);
  return WORD_SPEECH_OVERRIDES[reading]||reading;
}

export function buildPronunciationSource(){
  const assets={},vocabularyByQuestionId={},termsByJapanese={},termsByReading={};
  function speech(text,kind){
    if(typeof text!=='string'||!text.trim())throw Error('Missing speech text');
    if(kind==='word'&&!/^[ぁ-ゖァ-ヺー・\s]+$/u.test(text))throw Error('Word audio must use kana only: '+text);
    if(kind==='example'&&!/[ぁ-ゖァ-ヺ]/u.test(text))throw Error('Example must be Japanese: '+text);
    const speechText=kind==='word'?wordSpeechText(text):text;
    const overridden=speechText!==text;
    const key=overridden?[SPEECH_SOURCE.voice,SPEECH_SOURCE.wordsPerMinute,kind,text,SPEECH_SOURCE.wordStrategy,speechText]:[SPEECH_SOURCE.voice,SPEECH_SOURCE.wordsPerMinute,kind,text];
    const id=createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0,24);
    const url=`/assets/pronunciation/${id}.m4a`;
    assets[id]={id,url,kind,text,speechText,textBasis:kind==='word'?'reading':'japanese-example',...(overridden?{strategy:SPEECH_SOURCE.wordStrategy}:{})};
    return {id,url};
  }
  for(const v of [...VOCAB,...VOCAB_EXPANDED]){
    const questionId=v.questionId||v.id;
    if(vocabularyByQuestionId[questionId])throw Error('Repeated vocabulary question ID: '+questionId);
    const word=speech(v.reading,'word'),example=speech(v.example,'example');
    vocabularyByQuestionId[questionId]={questionId,word:v.word,reading:v.reading,example:v.example,
      wordAudio:word.url,exampleAudio:example.url,wordAssetId:word.id,exampleAssetId:example.id};
  }
  for(const card of LEARNING_CARDS)for(const term of card.terms){
    const previous=termsByJapanese[term.ja];
    if(previous){
      if(previous.reading!==term.reading)throw Error('Conflicting term pronunciation: '+term.ja);
      previous.cardIds.push(card.id);continue;
    }
    const word=speech(term.reading,'word');
    const entry={ja:term.ja,reading:term.reading,wordAudio:word.url,wordAssetId:word.id,cardIds:[card.id]};
    termsByJapanese[term.ja]=entry;
    // Homographs with the same reading share pronunciation; retaining all term
    // names makes lookup by kana usable without discarding source spellings.
    if(!termsByReading[term.reading])termsByReading[term.reading]={reading:term.reading,wordAudio:word.url,wordAssetId:word.id,japaneseTerms:[]};
    termsByReading[term.reading].japaneseTerms.push(term.ja);
  }
  return {version:2,source:{...SPEECH_SOURCE},vocabularyByQuestionId,termsByJapanese,termsByReading,assets};
}

async function inspectAudio(filename){
  const {stdout}=await exec('/usr/bin/afinfo',[filename],{encoding:'utf8'});
  const durationSeconds=Number(stdout.match(/estimated duration:\s*([\d.]+) sec/)?.[1]);
  const bytes=await fs.readFile(filename);
  if(!(durationSeconds>0)||bytes.length<100||bytes.toString('ascii',4,8)!=='ftyp')throw Error('Invalid M4A audio: '+filename);
  return {durationSeconds,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}

export async function generatePronunciation({verifyOnly=false,concurrency=4}={}){
  if(process.platform!=='darwin')throw Error('Asset generation requires the preinstalled macOS Kyoko voice; bundled assets play on other platforms.');
  const source=buildPronunciationSource();
  if(Object.keys(source.vocabularyByQuestionId).length!==330||Object.keys(source.termsByJapanese).length!==107)throw Error('Source coverage changed: review the expected counts before regenerating.');
  const {stdout:voices}=await exec('/usr/bin/say',['-v','?'],{encoding:'utf8'});
  if(!/^Kyoko .*ja_JP/m.test(voices))throw Error('The Japanese Kyoko voice is not installed. No voice download is attempted.');
  await fs.access('/usr/bin/afconvert');await fs.access('/usr/bin/afinfo');
  await fs.mkdir(destination,{recursive:true});
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'eju-pronunciation-'));
  const entries=Object.values(source.assets);let next=0,done=0,generated=0;
  try{
    const results=await Promise.allSettled(Array.from({length:Math.max(1,Math.min(8,concurrency))},async()=>{
      while(next<entries.length){
        const item=entries[next++],target=path.join(destination,item.id+'.m4a');
        let existing;
        try{existing=await inspectAudio(target);}catch(error){if(verifyOnly)throw error;}
        if(!existing){
          const textPath=path.join(temp,item.id+'.txt'),aiff=path.join(temp,item.id+'.aiff'),m4a=path.join(temp,item.id+'.m4a');
          await fs.writeFile(textPath,item.speechText+'\n','utf8');
          await exec('/usr/bin/say',['-v',SPEECH_SOURCE.voice,'-r',String(SPEECH_SOURCE.wordsPerMinute),'-f',textPath,'-o',aiff]);
          await exec('/usr/bin/afconvert',['-f','m4af','-d','aac','-b','64000','-q','127',aiff,m4a]);
          existing=await inspectAudio(m4a);
          await fs.rename(m4a,target);generated++;
          await Promise.all([fs.unlink(aiff),fs.unlink(textPath)]);
        }
        Object.assign(item,existing);done++;
        if(done%50===0||done===entries.length)console.log(`Pronunciation ${done}/${entries.length}; new audio ${generated}`);
      }
    }));
    const failures=results.filter(result=>result.status==='rejected');
    if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'Pronunciation build incomplete; the published manifest was not replaced.');
    if(verifyOnly){
      const previous=JSON.parse(await fs.readFile(path.join(destination,'manifest.json'),'utf8'));
      for(const item of entries)if(previous.assets[item.id]?.sha256!==item.sha256)throw Error('Manifest audio checksum mismatch: '+item.id);
    }else{
      source.generatedAt=new Date().toISOString();
      source.counts={vocabulary:Object.keys(source.vocabularyByQuestionId).length,examples:Object.values(source.assets).filter(a=>a.kind==='example').length,terms:Object.keys(source.termsByJapanese).length,audioFiles:entries.length};
      const staged=path.join(destination,'manifest.json.tmp');
      await fs.writeFile(staged,JSON.stringify(source,null,2)+'\n');
      await fs.rename(staged,path.join(destination,'manifest.json'));
    }
    console.log(JSON.stringify({verified:entries.length,generated,totalBytes:entries.reduce((n,a)=>n+a.bytes,0),manifest:path.join(destination,'manifest.json')}));
    return source;
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  generatePronunciation({verifyOnly:process.argv.includes('--verify-only')}).catch(error=>{console.error(error);process.exitCode=1;});
}
