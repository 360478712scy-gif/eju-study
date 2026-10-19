#!/usr/bin/env python3
"""Build content/work/ja-manifest.json from the v1 Japanese item metadata and transcode audio to AAC."""
import json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from sources import ROOT, ASSETS, WORK

def main(transcode=True):
    je = json.load(open(ROOT / 'public/japanese-expanded.json'))
    off = [q for q in json.load(open(ROOT / 'public/official.json')) if q['subject'] == 'japanese']
    out = {}
    (ASSETS / 'v2' / 'audio').mkdir(parents=True, exist_ok=True)
    for q in je + off:
        m = re.match(r'o-(\d{4}_\d)-(r|l|av)(\d+)', q['id'])
        s, kind, n = m.group(1), m.group(2), int(m.group(3))
        section = {'r': 'reading', 'av': 'listening-reading', 'l': 'listening'}[kind]
        if s == '2018_1' and kind == 'l':
            section = 'listening'
        sid = {'reading': 'r', 'listening-reading': 'lr', 'listening': 'l'}[section]
        new_id = f'{s}-ja-{sid}{n:02d}'
        entry = {
            'id': new_id, 'session': s, 'section': section, 'row': n,
            'pdfPages': q.get('pages') or [q.get('page')],
            'passageId': q.get('passageId'), 'oldId': q['id'], 'title': q.get('title'),
            'answerSource': q.get('answerSource'),
        }
        if q.get('answer') is not None:
            entry['v1Answer1Based'] = q['answer'] + 1
        if q.get('audio'):
            src = ROOT / 'public' / q['audio'].lstrip('/')
            dst = ASSETS / 'v2' / 'audio' / f'{new_id}.m4a'
            if transcode and not dst.exists():
                subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', '-c', '1', '--mix', str(src), str(dst)], check=True)
            entry['audio'] = f'/assets/v2/audio/{new_id}.m4a'
            entry['audioSeconds'] = q.get('audioDurationSeconds')
            entry['transcriptPages'] = q.get('transcriptPages')
            entry['transcriptImages'] = q.get('transcriptImages')
        out.setdefault(s, []).append(entry)
    for s in out:
        out[s].sort(key=lambda e: ({'reading': 0, 'listening-reading': 1, 'listening': 2}[e['section']], e['row']))
    (WORK / 'ja-manifest.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print({s: len(v) for s, v in out.items()})

if __name__ == '__main__':
    main()
