#!/usr/bin/env python3
"""Offline acoustic contrast audit. Does not listen, transcribe, or prove pronunciation correctness.
Every generated sample is cached and retained; existing assets are read only.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import threading
import select
import wave
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SMALL = dict(zip('ぁぃぅぇぉゃゅょっゎァィゥェォャュョッヮ', 'あいうえおやゆよつわアイウエオヤユヨツワ'))
VOWELS = {}
for vowel, chars in [('a','あかがさざただなはばぱまゃやらわぁゎ'),('i','いきぎしじちぢにひびぴみりぃ'),('u','うくぐすずつづぬふぶぷむゅゆるゔぅ'),('e','えけげせぜてでねへべぺめれぇ'),('o','おこごそぞとどのほぼぽもょよろをぉ')]:
    for char in chars:
        VOWELS[char] = vowel
        VOWELS[chr(ord(char)+0x60)] = vowel


def kata(text):
    return ''.join(chr(ord(c)+0x60) if 'ぁ' <= c <= 'ゖ' else c for c in text)


def variants(text):
    rows=[]
    for i,c in enumerate(text):
        if c in SMALL:
            rows.append({'kind':'small-kana-expanded','position':i,'from':c,'to':SMALL[c],'text':text[:i]+SMALL[c]+text[i+1:]})
            rows.append({'kind':'small-kana-deleted','position':i,'from':c,'to':'','text':text[:i]+text[i+1:]})
        if c == 'ー':
            rows.append({'kind':'long-mark-deleted','position':i,'from':c,'to':'','text':text[:i]+text[i+1:]})
        if i and c in 'あいうえおアイウエオ':
            prior=VOWELS.get(text[i-1]); current=VOWELS.get(c)
            if prior == current or (prior,current) in [('o','u'),('e','i')]:
                rows.append({'kind':'possible-long-vowel-deleted','position':i,'from':c,'to':'','text':text[:i]+text[i+1:]})
    return rows


def call(args):
    subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def readwav(path):
    with wave.open(str(path)) as src:
        channels,width,rate,n=src.getnchannels(),src.getsampwidth(),src.getframerate(),src.getnframes()
        if channels != 1 or width != 2 or not n:
            raise ValueError(f'Expected nonempty mono PCM16: {channels=} {width=} {n=}')
        x=np.frombuffer(src.readframes(n),dtype='<i2').astype(np.float64)
        if len(x) != n or not np.isfinite(x).all():
            raise ValueError('Truncated or invalid waveform')
        if np.max(np.abs(x)) < 20:
            raise ValueError('Silent or almost silent waveform')
        return x,rate


def metadata(path):
    x,rate=readwav(path)
    return {'file':str(path.relative_to(ROOT)),'frames':len(x),'sampleRate':rate,'seconds':round(len(x)/rate,6),'sha256':sha(path),'peak':int(np.max(np.abs(x)))}


@lru_cache(maxsize=160)
def featurize(path):
    x,rate=readwav(Path(path))
    if len(x)<512:x=np.pad(x,(0,512-len(x)))
    frames=np.lib.stride_tricks.sliding_window_view(x,512)[::128]
    power=abs(np.fft.rfft(frames*np.hanning(512),axis=1))**2
    frequencies=np.fft.rfftfreq(512,1/rate)
    edges=700*np.expm1(np.linspace(0,np.log(1+rate/2/700),41))
    bands=np.array([power[:,(frequencies>=lo)&(frequencies<hi)].sum(axis=1) for lo,hi in zip(edges[:-1],edges[1:])]).T
    energy=np.sqrt((frames*frames).mean(axis=1))
    spectral=np.log1p(bands/1e5)
    spectral/=np.maximum(np.linalg.norm(spectral,axis=1,keepdims=True),1e-9)
    return x,rate,energy,spectral


def compare(left,right):
    x,rate,ex,fx=featurize(str(left)); y,rate2,ey,fy=featurize(str(right))
    if rate != rate2: raise ValueError('Rate mismatch')
    n=min(len(ex),len(ey)); voiced=(ex[:n]>100)|(ey[:n]>100)
    corr=float(np.corrcoef(ex[:n],ey[:n])[0,1])
    cosine=float((fx[:n]*fy[:n]).sum(axis=1)[voiced].mean())
    delta=abs(len(x)-len(y))/rate
    identical=bool(np.array_equal(x,y))
    return {'pcmIdentical':identical,'durationDifferenceSeconds':round(delta,6),'energyEnvelopeCorrelation':round(corr,8),'alignedSpectralCosine':round(cosine,8),'nearIdentical':bool(identical or (delta<=.015 and corr>=.997 and cosine>=.998)), 'reviewNear':bool(identical or (delta<=.015 and corr>=.985 and cosine>=.985))}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,default=ROOT/'tests/pronunciation-audit-20261006')
    p.add_argument('--workers',type=int,default=4)
    p.add_argument('--renderer',choices=['batch','say'],default='batch')
    p.add_argument('--manifest',type=Path,default=ROOT/'public/assets/pronunciation/manifest.json')
    args=p.parse_args(); out=args.output.resolve(); out.mkdir(parents=True,exist_ok=True)
    audio=out/'audio'; audio.mkdir(exist_ok=True); decoded=out/'decoded'; decoded.mkdir(exist_ok=True)
    manifest_path=args.manifest.resolve()
    manifest=json.loads(manifest_path.read_text()); (out/'manifest-audited.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    entries=list(manifest['assets'].values()); words=[a for a in entries if a['kind']=='word']
    names={a['id']:[] for a in words}
    for v in manifest['vocabularyByQuestionId'].values():names[v['wordAssetId']].append({'word':v['word'],'questionId':v['questionId'],'type':'vocabulary'})
    for v in manifest['termsByJapanese'].values():names[v['wordAssetId']].append({'word':v['ja'],'type':'term'})
    samples={}; audit=[]
    def sample(text):
        key=hashlib.sha256(json.dumps(['Kyoko',170,22050,text],ensure_ascii=False).encode()).hexdigest()[:24]
        samples[key]={'id':key,'text':text,'path':audio/(key+'.wav')}; return key
    for word in words:
        row={'assetId':word['id'],'reading':word['text'],'speechText':word.get('speechText',word['text']),'names':names[word['id']]}
        row['baseline']=sample(row['speechText']); row['readingBaseline']=sample(row['reading']); row['katakana']=sample(kata(row['reading']))
        row['canonical']=[{'word':s,'sample':sample(s)} for s in dict.fromkeys(x['word'] for x in row['names'])]
        row['variants']=[dict(v,sample=sample(v['text'])) for v in variants(row['reading'])]
        row['coverage']={'smallKanaPositions':[i for i,c in enumerate(row['reading']) if c in SMALL],'longMarkPositions':[i for i,c in enumerate(row['reading']) if c=='ー'],'possibleLongVowelPositions':sorted(set(v['position'] for v in row['variants'] if v['kind']=='possible-long-vowel-deleted')),'variantCount':len(row['variants'])}
        audit.append(row)
    plan={'wordAssets':len(words),'audioAssets':len(entries),'vocabulary':len(manifest['vocabularyByQuestionId']),'terms':len(manifest['termsByJapanese']),'uniqueSamples':len(samples),'variants':sum(len(r['variants']) for r in audit),'workers':max(1,min(4,args.workers))}
    (out/'scope.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n'); print(json.dumps(plan),flush=True)
    started=time.time(); failures=[]; generated=[]; checks=[]
    thread_state=threading.local(); renderers=[]; renderer_lock=threading.Lock()
    batch_binary=out/'render_batch'
    if args.renderer == 'batch' and not batch_binary.exists():
        call(['/usr/bin/swiftc','-suppress-warnings',str(ROOT/'tests/pronunciation-audit-20261006/render_batch.swift'),'-o',str(batch_binary)])
    def synthesize(text,aiff):
        if args.renderer == 'say':
            txt=aiff.with_suffix('.txt'); txt.write_text(text+'\n')
            call(['/usr/bin/say','-v','Kyoko','-r','170','-f',str(txt),'-o',str(aiff)])
            txt.unlink(); return
        if not hasattr(thread_state,'renderer'):
            thread_state.renderer=subprocess.Popen([str(batch_binary)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1)
            with renderer_lock:renderers.append(thread_state.renderer)
        process=thread_state.renderer
        process.stdin.write(json.dumps({'text':text+'\n','path':str(aiff)},ensure_ascii=False)+'\n'); process.stdin.flush()
        if not select.select([process.stdout],[],[],120)[0]:raise TimeoutError('Batch synthesis timeout')
        result=json.loads(process.stdout.readline())
        if not result.get('ok'):raise ValueError('Batch synthesis failed '+repr(result))
    def render(item):
        dest=item['path']
        if not dest.exists():
            aiff=dest.with_suffix('.aiff')
            synthesize(item['text'],aiff)
            call(['/usr/bin/afconvert','-f','WAVE','-d','LEI16','-r','22050',str(aiff),str(dest)])
            aiff.unlink()
        return dict(id=item['id'],text=item['text'],**metadata(dest))
    def decode(item):
        source=ROOT/'public'/item['url'].lstrip('/'); dest=decoded/(item['id']+'.wav')
        actual=sha(source); expected=item.get('sha256')
        if actual != expected:raise ValueError('Published SHA mismatch '+item['id'])
        if not dest.exists():call(['/usr/bin/afconvert','-f','WAVE','-d','LEI16','-r','22050',str(source),str(dest)])
        return dict(assetId=item['id'],kind=item['kind'],source=str(source.relative_to(ROOT)),publishedSha256=actual,sha256MatchesManifest=True,**metadata(dest))
    with ThreadPoolExecutor(max_workers=plan['workers']) as pool:
        jobs={pool.submit(render,s):('render',s['id']) for s in samples.values()}
        jobs.update({pool.submit(decode,a):('decode',a['id']) for a in entries})
        total=len(jobs)
        for n,future in enumerate(as_completed(jobs),1):
            kind,key=jobs[future]
            try:
                result=future.result(); (generated if kind=='render' else checks).append(result)
            except Exception as exc: failures.append({'kind':kind,'id':key,'error':repr(exc)});print('ERROR '+repr(failures[-1]),flush=True)
            if n%50==0 or n==total:print(f'Prepared {n}/{total}, elapsed {time.time()-started:.1f}s',flush=True)
    for process in renderers:
        process.stdin.close(); process.wait(timeout=30)
    (out/'asset-integrity.json').write_text(json.dumps({'checks':checks,'failures':[f for f in failures if f['kind']=='decode']},ensure_ascii=False,indent=2)+'\n')
    (out/'sample-index.json').write_text(json.dumps(generated,ensure_ascii=False,indent=2)+'\n')
    generated_ids={s['id'] for s in generated}; checkids={s['assetId'] for s in checks}
    candidates=[]; review_candidates=[]
    for n,row in enumerate(audit,1):
        try:
            baseline=samples[row['baseline']]['path']
            row['baselineAudio']=metadata(baseline)
            row['katakanaComparison']=compare(baseline,samples[row['katakana']]['path'])
            if row['assetId'] in checkids:row['publishedComparison']=compare(baseline,decoded/(row['assetId']+'.wav'))
            for canonical in row['canonical']:
                canonical['audio']=metadata(samples[canonical['sample']]['path'])
                canonical['comparison']=compare(baseline,samples[canonical['sample']]['path'])
                canonical['katakanaComparison']=compare(samples[row['katakana']]['path'],samples[canonical['sample']]['path'])
            for variant in row['variants']:
                variant['comparison']=compare(baseline,samples[variant['sample']]['path'])
                # Original kana is a separately retained diagnostic after an explicit product override.
                variant['readingComparison']=compare(samples[row['readingBaseline']]['path'],samples[variant['sample']]['path'])
                if variant['comparison']['reviewNear']:
                    target=candidates if variant['comparison']['nearIdentical'] else review_candidates
                    target.append({'assetId':row['assetId'],'reading':row['reading'],'speechText':row['speechText'],'names':row['names'],'variant':variant,'canonical':row['canonical'],'katakanaComparison':row['katakanaComparison'],'baselineAudio':row['baselineAudio']})
            row['classification']='collapse-candidate' if any(v['comparison']['nearIdentical'] for v in row['variants']) else 'no-targeted-collapse-observed'
            if row['classification']!='collapse-candidate' and any(v['comparison']['reviewNear'] for v in row['variants']):row['classification']='review-near-candidate'
            if not row['variants']:row['classification']='no-targeted-phoneme-contrast'
            row['dimensions']={'fileIntegrity':'decoded-and-sha-verified' if row['assetId'] in checkids else 'incomplete','standardReading':'authored manifest reading; requires separate lexical audit','phoneticContrasts':row['classification'],'humanListening':'not-performed'}
            row['limitations']=['An invalid written mutation can be normalized by the TTS dictionary into a valid spoken form; candidate similarity alone does not establish current mispronunciation.','Contrasts test only encoded small-kana/possible-long-vowel distinctions; voiced consonants, pitch accent and general transcription are not validated.','A differing canonical waveform is not proof of an error; identical wrong variants are collapse candidates, not human listening.']
        except Exception as exc:row['classification']='incomplete';row['error']=repr(exc);failures.append({'kind':'compare','id':row['assetId'],'error':repr(exc)})
        if n%50==0 or n==len(audit):print(f'Compared {n}/{len(audit)}, elapsed {time.time()-started:.1f}s',flush=True)
    controls=[]
    prior=ROOT/'tests/pronunciation-fix-20261006/audio'
    for label, small, expanded in [('pressure','small-kana','large-kana'),('tension','choryoku-small','choryoku-large'),('extraction','chushutsu-small','chushutsu-second-large')]:
        try:controls.append({'case':label,'source':'prior observed failure','left':metadata(prior/(small+'.wav')),'right':metadata(prior/(expanded+'.wav')),'comparison':compare(prior/(small+'.wav'),prior/(expanded+'.wav'))})
        except Exception as exc:controls.append({'case':label,'error':repr(exc)})
    (out/'known-controls.json').write_text(json.dumps(controls,ensure_ascii=False,indent=2)+'\n')
    result={'date':'2026-10-06','scope':plan,'method':{'humanListening':False,'phoneticTranscription':False,'voice':'Kyoko','renderer':args.renderer,'cacheProvenance':'Initial cache rendered by macOS say; remaining samples by equivalent persistent NSSpeechSynthesizer. Existing WAV files are reused unchanged.','batchEngine':'NSSpeechSynthesizer com.apple.voice.compact.ja-JP.Kyoko; six cached say controls were PCM-identical (batch-equivalence.json)','wordsPerMinute':170,'sampleRate':22050,'speakersUsed':False,'reviewNearThreshold':{'durationDifferenceMaxSeconds':.015,'energyEnvelopeCorrelationMin':.985,'alignedSpectralCosineMin':.985},'nearIdenticalThreshold':{'durationDifferenceMaxSeconds':.015,'energyEnvelopeCorrelationMin':.997,'alignedSpectralCosineMin':.998},'features':'512-sample Hann, 128-sample hop; 40 log-frequency band powers, voiced RMS > 100; no time warping','limitations':['Similarity does not establish linguistic correctness.','Long-vowel deletion includes possible hiatus; candidates require linguistic review.','No difference is a potential synthesis distinction failure; difference is not proof of correct output.','Wrong written variants may be dictionary-normalized into correct speech; candidate classification requires separate review.']},'elapsedSeconds':round(time.time()-started,2),'failures':failures,'candidateCount':len(candidates),'candidateWordCount':len(set(c['assetId'] for c in candidates)),'reviewNearAdditionalCount':len(review_candidates),'reviewNearAdditionalWordCount':len(set(c['assetId'] for c in review_candidates)),'knownControls':controls,'words':audit}
    (out/'acoustic-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    (out/'review-near-candidates.json').write_text(json.dumps(review_candidates,ensure_ascii=False,indent=2)+'\n')
    (out/'collapse-candidates.json').write_text(json.dumps(candidates,ensure_ascii=False,indent=2)+'\n')
    lines=['# Offline acoustic audit','','This audit did not play audio or perform human listening. Similarity is diagnostic, not pronunciation certification.','',f"Coverage: {len(words)} word assets, {len(checks)}/{len(entries)} existing assets decoded and SHA verified, {len(generated)}/{len(samples)} unique generated waveforms, {plan['variants']} per-position contrast cases.",'',f"Candidates: {result['candidateWordCount']} words / {len(candidates)} contrasts; failures: {len(failures)}.",'','| Word | Reading | Current speech text | Candidate erroneous input | Kind / position | PCM identical | Energy correlation | Spectral cosine |','|---|---|---|---|---|---|---|---|']
    for c in candidates:
        v=c['variant'];metric=v['comparison'];lines.append('| '+' | '.join([', '.join(n['word'] for n in c['names']),c['reading'],c['speechText'],v['text'],v['kind']+' / '+str(v['position']),str(metric['pcmIdentical']),str(metric['energyEnvelopeCorrelation']),str(metric['alignedSpectralCosine'])])+' |')
    lines += ['', 'Additional review-near candidates (duration delta <= 0.015 s, energy correlation >= 0.985, spectral cosine >= 0.985):', '', '| Word | Reading | Mutated input | Energy correlation | Spectral cosine |', '|---|---|---|---|---|']
    for c in review_candidates:
        v=c['variant']; metric=v['comparison']; lines.append('| '+' | '.join([', '.join(n['word'] for n in c['names']),c['reading'],v['text'],str(metric['energyEnvelopeCorrelation']),str(metric['alignedSpectralCosine'])])+' |')
    lines += ['', 'Known pressure, tension and extraction failure controls are retained in known-controls.json; the review-near threshold detects all three. The stricter threshold alone would miss pressure and tension.', '', 'Each word in acoustic-audit.json separately records file integrity, authored reading source, tested contrasts and human-listening status. Readings require a separate lexical audit; all human-listening statuses are not-performed.', '', 'Wrong written inputs can be corrected by the speech dictionary. A collapse candidate is not a confirmed error. A different waveform is not proof that the alternative is correct. General consonants, pitch accent, naturalness and example sentence pronunciation remain outside this targeted contrast audit.', '', 'Reproduction (existing WAV cache reused):', '', '```sh', 'python3 tools/audit_pronunciation_acoustics.py --manifest tests/pronunciation-audit-20261006/manifest-audited.json', '```', '', 'Requires macOS Kyoko and Python with NumPy. This run used the bundled Codex Python runtime. The batch renderer is compiled from render_batch.swift; --renderer say uses individual say calls. Six batch-vs-say controls are PCM-identical in batch-equivalence.json. Initial cache entries used say; remaining entries used the persistent equivalent voice. No speaker playback occurs.']
    (out/'README.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({k:result[k] for k in ['elapsedSeconds','candidateCount','candidateWordCount','reviewNearAdditionalCount','reviewNearAdditionalWordCount','failures']},ensure_ascii=False),flush=True)

if __name__ == '__main__':main()
