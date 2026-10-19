#!/usr/bin/env python3
"""Crop a figure from an official PDF page at high resolution.

usage: python3 tools/v2/crop.py <session> <kind:math|science|answers|ja-question> <page> <x0> <y0> <x1> <y1> <out-name>
  x0..y1 are FRACTIONS of the page (0..1, origin top-left), as seen on the rendered page PNG.
  out-name is a file name like 2019_1-phy-13-1.png; the image is written to
  public/assets/v2/fig/<out-name> and the asset URL is printed.
"""
import sys, warnings
from pathlib import Path
import pymupdf
sys.path.insert(0, str(Path(__file__).parent))
from sources import ASSETS, pdf
warnings.filterwarnings('ignore')

def main():
    if len(sys.argv) != 9:
        print(__doc__)
        sys.exit(2)
    session, kind, page = sys.argv[1], sys.argv[2], int(sys.argv[3])
    x0, y0, x1, y1 = map(float, sys.argv[4:8])
    name = sys.argv[8]
    if not name.endswith('.png') or '/' in name:
        sys.exit('out-name must be a bare *.png file name')
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        sys.exit('bbox must be fractions with x0<x1, y0<y1 in [0,1]')
    if kind == 'ja-question':
        src = ASSETS / 'papers' / '2018_1-japanese.pdf' if session == '2018_1' else ASSETS / 'japanese-expanded' / f'{session}-question.pdf'
    else:
        src = pdf(session, kind)
    doc = pymupdf.open(src)
    pg = doc[page - 1]
    r = pg.rect  # displayed (rotated) page rect
    clip = pymupdf.Rect(r.x0 + x0 * r.width, r.y0 + y0 * r.height, r.x0 + x1 * r.width, r.y0 + y1 * r.height)
    # PyMuPDF takes the clip in displayed (rotation-applied) page coordinates, same as pg.rect.
    pix = pg.get_pixmap(dpi=300, clip=clip, colorspace=pymupdf.csGRAY)
    out = ASSETS / 'v2' / 'fig' / name
    out.parent.mkdir(parents=True, exist_ok=True)
    pix.save(out)
    print(f'/assets/v2/fig/{name}  ({pix.width}x{pix.height}px)')

if __name__ == '__main__':
    main()
