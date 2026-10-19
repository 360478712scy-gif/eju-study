#!/usr/bin/env python3
"""Synthesize example-sentence audio (macOS Kyoko) for vocabulary entries whose example has no
matching recording. Audio files are keyed by a hash of the sentence, so an edited sentence
always gets a new recording and an unchanged one is never redone.

usage: python3 tools/v2/tts_vocab.py [content/vocab/*.json ...]
"""
import hashlib, json, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'assets' / 'v2' / 'vocab'

def main():
    files = [Path(p) for p in sys.argv[1:]] or sorted((ROOT / 'content' / 'vocab').glob('*.json'))
    OUT.mkdir(parents=True, exist_ok=True)
    made = 0
    for f in files:
        data = json.loads(f.read_text())
        changed = False
        for v in data.get('entries', []):
            ex = (v.get('example') or {}).get('ja')
            if not ex:
                continue
            h = hashlib.sha1(ex.encode('utf-8')).hexdigest()[:20]
            rel = f'/assets/v2/vocab/ex-{h}.m4a'
            dst = OUT / f'ex-{h}.m4a'
            if not dst.exists():
                with tempfile.TemporaryDirectory() as tmp:
                    aiff = Path(tmp) / 'x.aiff'
                    subprocess.run(['say', '-v', 'Kyoko', '-o', str(aiff), ex], check=True)
                    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '48000', str(aiff), str(dst)], check=True)
                made += 1
            audio = v.get('audio') or {}
            if audio.get('example') != rel:
                audio['example'] = rel
                v['audio'] = audio
                changed = True
        if changed:
            f.write_text(json.dumps(data, ensure_ascii=False, indent=1))
        print(f'{f.name}: done', flush=True)
    print(f'synthesized {made} new example clip(s)')

if __name__ == '__main__':
    main()
