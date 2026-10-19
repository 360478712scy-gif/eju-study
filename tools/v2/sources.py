"""Where each official paper lives locally and which PDF pages hold each subject.
Page numbers are 1-based PDF pages (verified by the 2026-10-20 bank audit)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'public' / 'assets'
WORK = ROOT / 'content' / 'work'

SESSIONS = ['2021_1', '2020_2', '2019_1', '2018_2', '2018_1', '2017_2', '2017_1', '2016_2', '2016_1', '2015_2']

def pdf(session: str, kind: str) -> Path:
    """kind: math | science | answers"""
    for base in ('papers', 'expanded'):
        p = ASSETS / base / f'{session}-{kind}.pdf'
        if p.exists():
            return p
    raise FileNotFoundError(f'{session} {kind}')

def asset_url(p: Path) -> str:
    return '/assets/' + str(p.relative_to(ASSETS))

# Physics: answer row n is on PDF page n+3 (rows 1..19).
PHYSICS_PAGES = list(range(4, 23))

# Chemistry question pages (p25 is the constants/periodic-table page).
CHEM_PAGES = {
    '2015_2': (26, 37), '2016_1': (26, 37), '2016_2': (26, 38), '2017_1': (26, 39), '2017_2': (26, 37),
    '2018_1': (26, 40), '2018_2': (26, 42), '2019_1': (26, 39), '2020_2': (26, 39), '2021_1': (26, 39),
}
CHEM_CONSTANTS_PAGE = 25

# Math Course 2: cover p17, problems p18..p29 (odd pages may be memo or continuation).
MATH_PAGES = list(range(17, 30))

# Answer-key pages: (science page, math page, japanese page or None)
ANSWER_PAGES = {s: (2, 4, 1) for s in ['2015_2', '2016_1', '2016_2', '2017_1', '2017_2', '2018_1']}
ANSWER_PAGES.update({s: (1, 2, None) for s in ['2018_2', '2019_1', '2020_2', '2021_1']})

JA_SESSIONS = ['2018_1', '2017_2', '2017_1', '2016_2', '2016_1']
