import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Real browser decoding of bundled audio, with a read-only static server.
// This deliberately does not write learner state or exercise unintegrated UI.
const root=path.resolve(import.meta.dirname,'../public');
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><meta charset="utf-8"><title>Pronunciation playback test</title>');return;}
  const filename=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.json':'application/json','.m4a':'audio/mp4'})[path.extname(filename)]||'application/octet-stream','Content-Length':fs.statSync(filename).size});
  fs.createReadStream(filename).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.EJU_CHROMIUM_PATH||'~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--autoplay-policy=no-user-gesture-required']});
  const page=await browser.newPage(),requests=[];
  page.on('request',r=>requests.push(r.url()));
  await page.goto(base);
  const result=await page.evaluate(async()=>{
    const {createPronunciationPlayer,PRONUNCIATION_EVENT}=await import('/pronunciation.js');
    window.voiceEvents=[];window.voiceAudios=[];
    window.addEventListener(PRONUNCIATION_EVENT,event=>window.voiceEvents.push(event.detail));
    class TrackedAudio{constructor(src){const audio=new Audio(src);window.voiceAudios.push(audio);return audio;}}
    const p=createPronunciationPlayer({AudioClass:TrackedAudio});window.voicePlayer=p;
    const manifest=await p.loadManifest();
    const first=await p.playWord('vx140',{rate:0.8});
    const word={started:first,duration:voiceAudios[0].duration,rate:voiceAudios[0].playbackRate,src:voiceAudios[0].currentSrc,expected:manifest.vocabularyByQuestionId.vx140.wordAudio,reading:manifest.vocabularyByQuestionId.vx140.reading};
    const second=await p.playExample('vx001',{rate:1.2});
    const example={started:second,duration:voiceAudios[1].duration,rate:voiceAudios[1].playbackRate,wordStopped:voiceAudios[0].paused};
    const third=await p.playTerm('炭酸水素ナトリウム',{rate:1});
    const term={started:third,duration:voiceAudios[2].duration,rate:voiceAudios[2].playbackRate,exampleStopped:voiceAudios[1].paused};
    return {word,example,term,counts:manifest.counts,events:voiceEvents.map(e=>e.playing)};
  });
  for(const kind of ['word','example','term']){assert.equal(result[kind].started,true);assert.ok(result[kind].duration>0,kind+' decodes with positive duration');}
  assert.equal(result.word.rate,0.8);assert.equal(result.example.rate,1.2);assert.equal(result.term.rate,1);
  assert.equal(result.word.reading,'あつりょく');assert.equal(result.word.src,base+result.word.expected);
  assert.ok(!result.word.src.includes('0437b802d80f1e79f52dce2b'),'must decode corrected pressure audio, never the old file');
  assert.equal(result.example.wordStopped,true);assert.equal(result.term.exampleStopped,true);
  assert.deepEqual(result.events,[true,false,true,false,true]);
  await page.waitForFunction(()=>window.voiceEvents.at(-1)?.reason==='ended',{},{timeout:15000});
  assert.equal(await page.evaluate(()=>voicePlayer.isPlaying()),false);
  const corrections=await page.evaluate(async()=>{
    const manifest=await voicePlayer.loadManifest(),results=[];
    const words=['提出','反射','補助金','対処','接触','必修'];
    for(const word of words){
      const row=Object.values(manifest.vocabularyByQuestionId).find(v=>v.word===word);
      const started=await voicePlayer.playWord(row.questionId),audio=voiceAudios.at(-1);
      results.push({word,started,duration:audio.duration,src:audio.currentSrc,expected:row.wordAudio,speechText:manifest.assets[row.wordAssetId].speechText});
    }
    const row=manifest.termsByJapanese['ローレンツ力'];
    const started=await voicePlayer.playTerm(row.ja),audio=voiceAudios.at(-1);
    results.push({word:row.ja,started,duration:audio.duration,src:audio.currentSrc,expected:row.wordAudio,speechText:manifest.assets[row.wordAssetId].speechText});
    const example=manifest.vocabularyByQuestionId.vx007,exampleStarted=await voicePlayer.playExample('vx007'),exampleAudio=voiceAudios.at(-1);
    results.push({word:'10分 example',started:exampleStarted,duration:exampleAudio.duration,src:exampleAudio.currentSrc,expected:example.exampleAudio,speechText:manifest.assets[example.exampleAssetId].speechText});
    voicePlayer.stop();return results;
  });
  assert.equal(corrections.length,8);
  for(const item of corrections){assert.equal(item.started,true);assert.ok(item.duration>0);assert.equal(item.src,base+item.expected);if(item.word==='10分 example')assert.match(item.speechText,/バスで10分ほど/);else assert.equal(item.speechText,item.word);}
  assert.ok(requests.every(url=>url.startsWith(base+'/')),'all playback remains on the local origin');
  console.log(JSON.stringify({ok:true,checks:['word/example/term AAC decoding','0.8/1/1.2 pitch-preserving playback','exclusive replacement','end event releases playback state','no remote speech request','all eight audit replacements decode'],...result,corrections},null,2));
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
