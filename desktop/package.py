#!/usr/bin/env python3
"""Package 澄学 EJU as a standalone macOS app (no project folder, no Python, no Node install needed).

The bundle carries: the native shell, a stripped Node runtime, the server + shared engine (TypeScript run
directly by Node), the built front end, the content bank, only the assets the bank references, the piano
tracks, and a seed of the current study record. Data lives in ~/Library/Application Support/澄学 EJU.

    python3 desktop/package.py          → desktop/release/澄学 EJU.app and Chengxue-EJU-<version>.zip
"""
from pathlib import Path
import hashlib, json, os, plistlib, re, shutil, subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = HERE / 'release'
APP = OUT / '澄学 EJU.app'
VERSION = (ROOT / 'VERSION').read_text().strip() or '3.0.0'
NODE = Path(os.environ.get('EJU_NODE', shutil.which('node') or ''))


def run(*args, **kw):
    subprocess.run(list(map(str, args)), check=True, **kw)


def update_repo():
    slug = os.environ.get('EJU_UPDATE_REPO')
    if slug is None:
        try:
            remote = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], cwd=ROOT, text=True,
                                             stderr=subprocess.DEVNULL).strip()
        except (OSError, subprocess.CalledProcessError):
            remote = ''
        for prefix in ('https://github.com/', 'git@github.com:'):
            if remote.startswith(prefix):
                slug = remote[len(prefix):].removesuffix('.git')
                break
    slug = (slug or '').strip()
    if re.fullmatch(r'[A-Za-z0-9-]+/[A-Za-z0-9_.-]+', slug) and slug.split('/')[1] not in ('.', '..'):
        return {'ChengxueUpdateRepo': slug}
    print('警告：无法解析 GitHub 更新源，请检查 origin 或 EJU_UPDATE_REPO。', flush=True)
    return {}


def main():
    run('npm', 'run', '-s', 'build', cwd=ROOT)
    if APP.exists():
        shutil.rmtree(APP)
    macos = APP / 'Contents/MacOS'
    res = APP / 'Contents/Resources'
    app = res / 'app'
    macos.mkdir(parents=True)
    app.mkdir(parents=True)

    run('/usr/bin/xcrun', 'swiftc', '-swift-version', '5', '-O', '-framework', 'AppKit', '-framework', 'WebKit',
        '-framework', 'UniformTypeIdentifiers', HERE / 'Chengxue.swift', '-o', macos / 'Chengxue')
    shutil.copy2(HERE / 'icon' / 'AppIcon.icns', res / 'AppIcon.icns')

    # Node runtime, symbols stripped (~25 MB smaller); re-signed with the bundle below.
    node = res / 'node'
    shutil.copy2(os.path.realpath(NODE), node)
    run('/usr/bin/strip', '-x', node)
    # strip invalidates Node's signature and --deep does not re-sign executables under Resources.
    run('/usr/bin/codesign', '--force', '--sign', '-', node)
    run(node, '--version')

    # Program: server + shared engine + built front end + content.
    for name in ['server.mjs', 'package.json', 'VERSION']:
        shutil.copy2(ROOT / name, app / name)
    ignore = shutil.ignore_patterns('*.test.ts', '__tests__', '.DS_Store')
    shutil.copytree(ROOT / 'server', app / 'server', ignore=ignore)
    shutil.copytree(ROOT / 'shared', app / 'shared', ignore=ignore)
    shutil.copytree(ROOT / 'app' / 'dist', app / 'app' / 'dist', ignore=ignore)
    (app / 'content' / 'dist').mkdir(parents=True)
    shutil.copy2(ROOT / 'content' / 'dist' / 'bank.json', app / 'content' / 'dist' / 'bank.json')

    # Only the assets the bank references, plus the piano tracks.
    bank = (ROOT / 'content' / 'dist' / 'bank.json').read_text()
    refs = sorted(set(re.findall(r'/assets/[^"\\)\s#]+', bank)))
    copied = 0
    for ref in refs:
        src = ROOT / 'public' / ref.lstrip('/')
        if src.is_file():
            dst = app / 'public' / ref.lstrip('/')
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            copied += 1
    shutil.copytree(ROOT / 'public' / 'assets' / 'music', app / 'public' / 'assets' / 'music')

    # Seed: the current study record, used only when the data folder is empty.
    state = ROOT / 'data' / 'state-v3.json'
    if state.exists():
        (app / 'seed').mkdir()
        shutil.copy2(state, app / 'seed' / 'state-v3.json')

    info = {
        'CFBundleDisplayName': '澄学 EJU', 'CFBundleName': '澄学 EJU', 'CFBundleExecutable': 'Chengxue',
        'CFBundleIdentifier': 'app.chengxue.eju', 'CFBundlePackageType': 'APPL',
        'CFBundleVersion': VERSION, 'CFBundleShortVersionString': VERSION, 'CFBundleIconFile': 'AppIcon',
        'LSMinimumSystemVersion': '13.0', 'NSHighResolutionCapable': True, 'LSApplicationCategoryType': 'public.app-category.education',
        'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True, 'NSAllowsArbitraryLoadsInWebContent': True},
        'NSHumanReadableCopyright': '澄学 EJU',
        **update_repo(),
    }
    with (APP / 'Contents/Info.plist').open('wb') as f:
        plistlib.dump(info, f)

    run('/usr/bin/xattr', '-cr', APP)
    run('/usr/bin/codesign', '--force', '--deep', '--sign', '-', APP)
    run('/usr/bin/codesign', '--verify', '--deep', '--strict', APP)

    zip_path = OUT / f'Chengxue-EJU-{VERSION}.zip'
    if zip_path.exists():
        zip_path.unlink()
    run('/usr/bin/ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', APP, zip_path)
    checksum_path = zip_path.with_suffix('.zip.sha256')
    with zip_path.open('rb') as f:
        checksum = hashlib.sha256()
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            checksum.update(chunk)
    checksum_path.write_text(f'{checksum.hexdigest()}  {zip_path.name}\n', encoding='ascii')

    size = lambda p: sum(f.stat().st_size for f in Path(p).rglob('*') if f.is_file())
    print(json.dumps({'app': str(APP), 'zip': str(zip_path), 'sha256': str(checksum_path), 'appMB': round(size(APP) / 1e6, 1),
                      'zipMB': round(zip_path.stat().st_size / 1e6, 1), 'assets': copied, 'version': VERSION}, ensure_ascii=False))


if __name__ == '__main__':
    main()
