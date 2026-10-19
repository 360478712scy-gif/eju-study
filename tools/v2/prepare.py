#!/usr/bin/env python3
"""Render official paper pages to PNG for transcription (content/work/...). Idempotent."""
import sys, warnings
import pymupdf
from sources import *
warnings.filterwarnings('ignore')

def render(src, page, out, dpi=170):
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        return
    doc = pymupdf.open(src)
    pix = doc[page - 1].get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
    pix.save(out)

def main():
    for s in SESSIONS:
        sci, mth, ans = pdf(s, 'science'), pdf(s, 'math'), pdf(s, 'answers')
        for p in PHYSICS_PAGES:
            render(sci, p, WORK / s / 'physics' / f'p{p:02d}.png')
        a, b = CHEM_PAGES[s]
        for p in [CHEM_CONSTANTS_PAGE] + list(range(a, b + 1)):
            render(sci, p, WORK / s / 'chemistry' / f'p{p:02d}.png')
        for p in MATH_PAGES:
            render(mth, p, WORK / s / 'math' / f'p{p:02d}.png')
        sp, mp, jp = ANSWER_PAGES[s]
        render(ans, sp, WORK / s / 'answers' / 'science.png', dpi=220)
        render(ans, mp, WORK / s / 'answers' / 'math.png', dpi=220)
        if jp:
            render(ans, jp, WORK / s / 'answers' / 'japanese.png', dpi=220)
        print('rendered', s, flush=True)
    # Japanese papers and scripts
    ja = ASSETS / 'japanese-expanded'
    jsrc = {
        '2016_1': {'question': ja / '2016_1-question.pdf', 'script-lr': ja / '2016_1-script.pdf', 'script-l': ja / '2016_1-hearing-script.pdf'},
        '2016_2': {'question': ja / '2016_2-question.pdf', 'script-lr': ja / '2016_2-script.pdf', 'script-l': ja / '2016_2-hearing-script.pdf'},
        '2017_1': {'question': ja / '2017_1-question.pdf', 'script-lr': ja / '2017_1-av-script.pdf', 'script-l': ja / '2017_1-script.pdf'},
        '2017_2': {'question': ja / '2017_2-question.pdf', 'script-lr': ja / '2017_2-av-script.pdf', 'script-l': ja / '2017_2-script.pdf'},
        '2018_1': {'question': ASSETS / 'papers' / '2018_1-japanese.pdf', 'script-lr': ASSETS / 'papers' / '2018_1-script-10.pdf', 'script-l': ASSETS / 'papers' / '2018_1-script-11.pdf'},
    }
    for s, files in jsrc.items():
        for kind, path in files.items():
            n = len(pymupdf.open(path))
            for p in range(1, n + 1):
                render(path, p, WORK / s / 'japanese' / kind / f'p{p:02d}.png', dpi=150)
        print('rendered japanese', s, flush=True)

if __name__ == '__main__':
    main()
