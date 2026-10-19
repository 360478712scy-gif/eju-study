"""Build a verified, private-use index of JASSO's publicly available selections.

Audio numbers are taken from link LABELS, not filenames: the 2017 filenames
contain CD track numbers, and 2016-2's question 18 is named 162al19_1.wav.
Script mappings were visually checked against the original PDF headings.
The source PDFs remain unchanged. Answer numbers are intentionally not
transcribed from garbled PDF text: users compare with the official answer page.
"""
from pathlib import Path
from urllib.parse import urljoin
import hashlib
import json
import math
import re
import subprocess
import wave
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
ASSETS = PUBLIC / 'assets/japanese-expanded'
PAGES = ASSETS / 'pages'
PAGES.mkdir(exist_ok=True)
YEARS = ['2017_2', '2017_1', '2016_2', '2016_1']
RAW_SOURCES = json.loads((ASSETS / 'sources.json').read_text())
EXTRA_SOURCES = json.loads((ASSETS / 'index-extra-sources.json').read_text())
AV_SOURCES = json.loads((ASSETS / 'av-sources.json').read_text())
RESOURCES_BY_URL = {r['url']: r for r in RAW_SOURCES + EXTRA_SOURCES + AV_SOURCES}
DOCUMENTS = {}
VERIFIED = []
EXCLUDED = []


def source_url(year):
    return f'https://www.jasso.go.jp/ryugaku/eju/examinee/pastpaper_sample/pastpaper_{year}.html'


def links(year):
    archived = ASSETS / f'{year}-index.html'
    if not archived.exists():
        cached = Path('/tmp') / f'eju-{year}.html'
        if cached.exists():
            archived.write_bytes(cached.read_bytes())
        else:
            subprocess.run(['curl', '-fsSL', '--retry', '2', '--max-time', '60',
                            source_url(year), '-o', str(archived)], check=True)
    return [(urljoin(source_url(year), u), label.strip())
            for u, label in re.findall(r'<a href="([^"]+)"[^>]*>([^<]+)', archived.read_text())]


def resource(url, label, year, kind, number=None):
    if url not in RESOURCES_BY_URL:
        raise ValueError(f'Missing verified source: {year} {label} {url}')
    item = dict(RESOURCES_BY_URL[url])
    path = PUBLIC / item['path'].lstrip('/')
    assert path.exists(), path
    item.update(year=year, kind=kind, sourceLabel=label,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    if number is not None:
        item['number'] = number
    VERIFIED.append(item)
    return item


def pdf_document(path):
    if path not in DOCUMENTS:
        DOCUMENTS[path] = fitz.open(PUBLIC / path.lstrip('/'))
    return DOCUMENTS[path]


def image(path, page):
    name = Path(path).stem
    target = PAGES / f'{name}-{page}.png'
    if not target.exists():
        pdf_document(path)[page - 1].get_pixmap(matrix=fitz.Matrix(1.8, 1.8)).save(target)
    return '/assets/japanese-expanded/pages/' + target.name


READINGS = {
    '2017_2': [
        ([2], [10, 11], '志愿者募集告示'),
        ([3], [12], '力量训练与性别差异'),
        ([6], [15], '观察鸟类与自然'),
        ([8], [17], '效率与社会目的'),
        ([9], [18], '跨文化沟通的特点'),
        ([10], [19], '宇航员训练与合作'),
        ([15, 16], [23, 24], '绘画中的色彩与阴影'),
        ([21, 22], [27, 28], '落叶与昆虫的生态关系'),
    ],
    '2017_1': [
        ([1], [9], '信息断食与独立判断'),
        ([2], [10], '文化价值与受众人数'),
        ([3], [11], '医生与患者的信息交流'),
        ([11, 12], [13, 14], '健康检查通知'),
        ([13, 14], [15, 16], '沟通与理解他人'),
        ([17, 18], [18, 19], '儿童书籍的分类与读者'),
    ],
    '2016_2': [
        ([2], [5], '新生课程与手续通知'),
        ([9], [6], '茶园风扇的作用'),
        ([10], [7], '在国外研究日本文化'),
        ([15, 16], [8, 9], '野生动物观察的方法'),
        ([21, 22], [10, 11], '卵与精子的生物学关系'),
    ],
    '2016_1': [
        ([1], [5], '登山的方式'),
        ([2], [6], '植花志愿者募集'),
        ([3], [7], '如何认识毒蘑菇'),
        ([6], [8], '个人与社会群体'),
        ([8], [9], '地球与古老矿物'),
        ([10], [10], '调查与核实信息'),
        ([17, 18], [11, 12], '镜子中的自我形象'),
        ([19, 20], [13, 14], '黑猩猩的工具学习'),
        ([21, 22], [15, 16], '展望记忆与遗忘'),
        ([23, 24, 25], [17, 18], '策展人的角色'),
    ],
}

# Each list corresponds to hearing questions 13 through 27, inclusive. Page
# spans include the continuation and choices, not only the question heading.
SCRIPT_PAGES = {
    '2017_2': [[1], [2], [2, 3], [3], [3, 4], [4], [4, 5], [5],
               [6], [6, 7], [7], [7, 8], [8], [8, 9], [9]],
    '2017_1': [[1, 2], [2], [2, 3], [3], [3, 4], [4], [5], [5, 6],
               [6], [6, 7], [7], [8], [8], [9], [9]],
    '2016_2': [[1], [2], [2], [3], [3], [4], [5], [5, 6],
               [6], [6, 7], [7], [7, 8], [8], [8, 9], [9]],
    '2016_1': [[1], [2], [2], [3], [4], [4, 5], [5], [5, 6],
               [6], [6, 7], [7], [7, 8], [8], [8, 9], [9]],
}
HEARING_PAGE = {'2017_2': 47, '2017_1': 40, '2016_2': 16, '2016_1': 21}
AV_PAGES = {
    '2017_2': {1: (34, [1]), 3: (36, [2]), 5: (38, [3]),
               7: (40, [3, 4]), 11: (44, [5]), 12: (45, [5, 6])},
    '2017_1': {1: (27, [1]), 2: (28, [1, 2]), 4: (30, [2, 3]),
               5: (31, [3]), 8: (34, [4]), 11: (37, [5]), 12: (38, [5, 6])},
    '2016_2': {1: (13, [1]), 5: (14, [1]), 6: (15, [2])},
    '2016_1': {4: (20, [1])},
}

bank = []
for year in YEARS:
    year_links = links(year)
    question = next(r for r in RAW_SOURCES if r['year'] == year and r['kind'] == 'question')
    answer = next(r for r in RAW_SOURCES if r['year'] == year and r['kind'] == 'answer')
    resource(question['url'], '日本語 問題冊子（公開選題）', year, 'question')
    resource(answer['url'], '正解表', year, 'answer')
    script_url = next(url for url, label in year_links if label == '聴解問題スクリプト')
    script = resource(script_url, '聴解問題スクリプト', year, 'hearing-script')
    base = {
        'official': True, 'subject': 'japanese', 'sourceUrl': source_url(year),
        'source': f'JASSO {year[:4]}年第{year[-1]}回 · 官方公开选题',
        'sourceType': 'official', 'selfGrade': True,
        'pdf': question['path'], 'questionPdfSha256': question['sha256'],
        'answerImages': [image(answer['path'], 1)], 'answerPdf': answer['path'],
        'answerPage': 1, 'answerPdfSha256': answer['sha256'],
        'answerVerification': '官方正解表原图自评；未将乱码文本猜读为答案数字',
        'rights': 'JASSO 原始资料，仅本机个人学习；不得将题页或音频公开发布。',
    }
    for rows, pages, title in READINGS[year]:
        text = ''.join(pdf_document(question['path'])[n - 1].get_text() for n in pages)
        assert '著作権上の都合' not in text, (year, pages)
        visible_rows = [int(n) for n in re.findall(r'(?m)^\d{1,2}$', text)]
        assert all(row in visible_rows for row in rows), (year, rows, visible_rows)
        characters = len(re.findall(r'[\u3040-\u30ff\u4e00-\u9fff]', text))
        # A trial baseline: 300 Japanese characters/minute and 25 seconds per
        # question. Reading is shared between questions, never counted twice.
        total_seconds = min(300, max(120, math.ceil(characters / 5 + 25 * len(rows))))
        seconds_each = total_seconds / len(rows)
        for position, number in enumerate(rows):
            bank.append(dict(base,
                id=f'o-{year}-r{number}', topic='reading', topics=['reading'],
                unitKind='reading-question', questionCount=1, page=pages[0], pages=pages,
                title=f'{year[:4]}-{year[-1]} 读解 · 解答栏{number} · {title}',
                prompt=f'只做解答栏 {number} 对应的小问。先读原文并填写选项编号，再展开官方正解表核对。',
                images=[image(question['path'], p) for p in pages],
                passageId=f'{year}-reading-p{pages[0]}',
                sharedPassageQuestionCount=len(rows), passageQuestionPosition=position + 1,
                passageQuestionRows=rows, passageJapaneseCharacters=characters,
                passageTotalSeconds=total_seconds, estimatedSeconds=round(seconds_each, 3),
                minutes=round(seconds_each / 60, 4),
                timeBasis='首次限时参考：300日文字/分+每问25秒；共文小问均摊阅读，订正另计。实际数据可校准。',
                skill='reading:context-evidence',
                explanation=f'请核对下方官方正解表左侧「読解」解答番号 {number}。这是原图自评，不是AI评分。订正时标出原文依据，并说明一个干扰项错在哪里。',
                answerSource=f'{year} 正解表 PDF第1页 / 読解 解答番号{number}',
            ))
    audio_links = {}
    for url, label in year_links:
        match = re.match(r'^聴解(\d+)番\b', label)
        # Japanese 番 followed by a space is not a regex word boundary on all
        # engines, so use an explicit prefix fallback for the official labels.
        if not match:
            match = re.match(r'^聴解(\d+)番(?:\s|\()', label)
        if match and url.endswith('.wav'):
            audio_links[int(match[1])] = (url, label)
    assert sorted(audio_links) == list(range(13, 28)), (year, audio_links.keys())
    for number, (url, label) in sorted(audio_links.items()):
        audio = resource(url, label, year, 'audio', number)
        if year == '2016_2' and number == 18:
            canonical = RESOURCES_BY_URL[audio_links[19][0]]
            canonical_hash = hashlib.sha256((PUBLIC / canonical['path'].lstrip('/')).read_bytes()).hexdigest()
            # At retrieval, the official page's q18 URL served exactly the same
            # bytes as its q19 URL. Do not fabricate a second practice question
            # or pair the q18 script with the duplicated q19 recording.
            if audio['sha256'] == canonical_hash:
                EXCLUDED.append(dict(audio, reason='官方第18番链接与第19番WAV字节完全相同，题音配对存疑；第18番不纳入任务。', duplicateOf='o-2016_2-l19'))
                continue
        with wave.open(str(PUBLIC / audio['path'].lstrip('/')), 'rb') as wav:
            duration = wav.getnframes() / wav.getframerate()
        assert 30 < duration < 240, (year, number, duration)
        transcript_pages = SCRIPT_PAGES[year][number - 13]
        seconds = round(duration + 25, 3)
        bank.append(dict(base,
            id=f'o-{year}-l{number}', topic='listening', topics=['listening'],
            unitKind='listening-question', listeningMode='audio-only', questionCount=1, page=HEARING_PAGE[year],
            title=f'{year[:4]}-{year[-1]} 日语聴解 · {number}番',
            prompt=f'听解 {number} 番。首听不暂停，题目和四个选项都在音频里；填写所选编号后，再核对官方答案。',
            audio=audio['path'], audioSourceUrl=url, audioSourceLabel=label,
            audioSha256=audio['sha256'], audioDurationSeconds=round(duration, 3),
            transcriptPdf=script['path'], transcriptPages=transcript_pages,
            transcriptImages=[image(script['path'], p) for p in transcript_pages],
            transcriptVerification='已逐页查看本题标题、跨页续文及选项；音频题号依官方网站链接文字映射。',
            estimatedSeconds=seconds, minutes=round(seconds / 60, 4),
            timeBasis='原音频真实时长+25秒作答；二听、定位错句和跟读属于另列的复盘活动。',
            skill='listening:conditions-and-conclusion',
            explanation=f'请核对官方正解表右侧「聴解」{number}番。之后仅查看脚本第{number}番：定位转折、条件和最后决定，遮住脚本再听。',
            answerSource=f'{year} 正解表 PDF第1页 / 聴解 {number}番',
        ))
    av_script_url = next(url for url, label in year_links if label == '聴読解問題スクリプト')
    av_script = resource(av_script_url, '聴読解問題スクリプト', year, 'audio-visual-script')
    av_links = {}
    for url, label in year_links:
        match = re.match(r'^聴読解(\d+)番', label)
        if match and url.endswith('.wav'):
            av_links[int(match[1])] = (url, label)
    assert sorted(av_links) == sorted(AV_PAGES[year]), (year, av_links.keys())
    for number, (url, label) in sorted(av_links.items()):
        question_page, transcript_pages = AV_PAGES[year][number]
        text = pdf_document(question['path'])[question_page - 1].get_text()
        assert '著作権上の都合' not in text, (year, number, question_page)
        # Some PDFs encode the visual "N 番" heading as unnamed glyphs; the
        # answer box still has selectable digits. The page/heading mapping was
        # therefore visually reviewed as well as checked against this text.
        assert re.search(rf'(?m)^{number}(?:\s*番|\s*$)', text), (year, number, question_page)
        audio = resource(url, label, year, 'audio-visual', number)
        with wave.open(str(PUBLIC / audio['path'].lstrip('/')), 'rb') as wav:
            duration = wav.getnframes() / wav.getframerate()
        assert 30 < duration < 240, (year, number, duration)
        seconds = round(duration + 25, 3)
        bank.append(dict(base,
            id=f'o-{year}-av{number}', topic='listening', topics=['listening'],
            unitKind='listening-question', listeningMode='audio-visual', questionCount=1,
            page=question_page, pages=[question_page],
            title=f'{year[:4]}-{year[-1]} 日语聴読解 · {number}番',
            prompt=f'聴読解 {number} 番：一边看本题原图，一边听音频。首听不暂停，填写所选编号后，再展开官方答案和脚本。',
            images=[image(question['path'], question_page)],
            audio=audio['path'], audioSourceUrl=url, audioSourceLabel=label,
            audioSha256=audio['sha256'], audioDurationSeconds=round(duration, 3),
            transcriptPdf=av_script['path'], transcriptPages=transcript_pages,
            transcriptImages=[image(av_script['path'], p) for p in transcript_pages],
            transcriptVerification='已核对公开题页、网站音频题号和本题脚本跨页范围；版权省略题未收录。',
            estimatedSeconds=seconds, minutes=round(seconds / 60, 4),
            timeBasis='原音频真实时长+25秒看图作答；精听、复述和错句定位另列。',
            skill='listening:diagram-and-conditions',
            explanation=f'核对官方正解表中间「聴読解」{number}番，不要看右侧「聴解」同号。订正时把音频信息对应到图表的区域、变化或条件，再遮住脚本复听。',
            answerSource=f'{year} 正解表 PDF第1页 / 聴読解 {number}番',
        ))

assert len(bank) == 117
assert len({q['id'] for q in bank}) == len(bank)
assert sum(q['topic'] == 'reading' for q in bank) == 41
assert len({q['passageId'] for q in bank if 'passageId' in q}) == 29
assert sum(q.get('listeningMode') == 'audio-only' for q in bank) == 59
assert sum(q.get('listeningMode') == 'audio-visual' for q in bank) == 17
assert len({q['audioSha256'] for q in bank if 'audioSha256' in q}) == 76
for q in bank:
    for path in q.get('images', []) + q.get('answerImages', []) + q.get('transcriptImages', []):
        assert (PUBLIC / path.lstrip('/')).is_file(), (q['id'], path)
(PUBLIC / 'japanese-expanded.json').write_text(json.dumps(bank, ensure_ascii=False, indent=2))
(ASSETS / 'verified-sources.json').write_text(json.dumps(VERIFIED, ensure_ascii=False, indent=2))
(ASSETS / 'excluded-sources.json').write_text(json.dumps(EXCLUDED, ensure_ascii=False, indent=2))
print(json.dumps({'questions': len(bank), 'readingQuestions': 41, 'readingPassages': 29,
                  'audioOnlyQuestions': 59, 'audioVisualQuestions': 17,
                  'firstPassMinutes': round(sum(q['estimatedSeconds'] for q in bank) / 60, 1),
                  'sourceRecords': len(VERIFIED)}, ensure_ascii=False))
