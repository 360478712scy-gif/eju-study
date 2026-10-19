#!/usr/bin/env python3
"""Synthesize audio for ORIGINAL listening items that carry a "ttsScript".

usage: python3 tools/v2/tts_listening.py content/bank/japanese/orig-listening-1.json

Each item: "ttsScript": [{"voice": "female", "text": "…", "pause": 0.6}, ...]
voice: "female" | "male" | "narrator". Only Kyoko synthesizes to file on this Mac, so
male lines are Kyoko with a lower pitch base, resampled ~8% lower to sound distinct.
Writes public/assets/v2/audio/<id>.m4a, sets item.audio.src and item.targetSec (= seconds + 10).
Re-running re-synthesizes. Text is read exactly as written: use kana for words the
synthesizer might misread (e.g. write 「いっぱんてき」 if 一般的 is read wrongly).
"""
import json, subprocess, sys, tempfile, wave
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'assets' / 'v2' / 'audio'
VOICES = {'female', 'male', 'narrator'}
RATE = 22050

def synth(text, voice, path):
    spoken = ('[[pbas 22]]' + text) if voice == 'male' else text
    subprocess.run(['say', '-v', 'Kyoko', '--file-format=WAVE', f'--data-format=LEI16@{RATE}', '-o', str(path), spoken], check=True)

def lower(raw, factor=0.92):
    """Play back at `factor` speed (lower pitch, slightly slower) by resampling."""
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    n = int(len(a) / factor)
    out = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a)
    return out.astype(np.int16).tobytes()

def main():
    f = Path(sys.argv[1]).resolve()
    data = json.loads(f.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    done = 0
    for it in data['items']:
        script = it.get('ttsScript')
        if not script:
            continue
        with tempfile.TemporaryDirectory() as tmp:
            frames = []
            for i, line in enumerate(script):
                voice = line.get('voice', 'female')
                if voice not in VOICES:
                    sys.exit(f'{it["id"]}: unknown voice {voice}')
                p = Path(tmp) / f'{i}.wav'
                synth(line['text'], voice, p)
                with wave.open(str(p)) as w:
                    raw = w.readframes(w.getnframes())
                if len(raw) < RATE:  # < 0.5 s of audio means the synthesizer failed
                    sys.exit(f'{it["id"]}: synthesis produced no audio for line {i}')
                frames.append(lower(raw) if voice == 'male' else raw)
                pause = float(line.get('pause', 0.55))
                frames.append(b'\x00\x00' * int(RATE * pause))
            joined = Path(tmp) / 'all.wav'
            with wave.open(str(joined), 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
                w.writeframes(b''.join(frames))
            secs = sum(len(x) for x in frames) / 2 / RATE
            dst = OUT / f'{it["id"]}.m4a'
            subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '48000', str(joined), str(dst)], check=True)
        it['audio'] = {'src': f'/assets/v2/audio/{it["id"]}.m4a'}
        it['targetSec'] = int(round(secs + 10))
        done += 1
        print(f'{it["id"]}: {secs:.1f}s')
    f.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    print(f'synthesized {done} item(s)')

if __name__ == '__main__':
    main()
