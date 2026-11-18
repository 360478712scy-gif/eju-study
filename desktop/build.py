#!/usr/bin/env python3
"""Build and install the native app, preserving the previous desktop package."""
from pathlib import Path
import datetime
import json
import plistlib
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
TARGET = Path.home() / 'Desktop' / '澄学 EJU.app'
INSTALLED = Path.home() / 'Applications' / '澄学 EJU.app'
STAGED = HERE / 'dist' / '澄学 EJU.app'

def main():
    binary_dir = STAGED/'Contents/MacOS'
    resources = STAGED/'Contents/Resources'
    binary_dir.mkdir(parents=True, exist_ok=True)
    resources.mkdir(parents=True, exist_ok=True)
    subprocess.run(['/usr/bin/xcrun', 'swiftc', '-swift-version', '5', '-O', '-framework', 'AppKit', '-framework', 'WebKit', '-framework', 'UniformTypeIdentifiers', str(HERE/'Chengxue.swift'), '-o', str(binary_dir/'Chengxue')], check=True)
    # 3.0 icon: desktop/icon/make_icon.swift → AppIcon.icns (frosted orb + tick ring)
    shutil.copy2(HERE/'icon'/'AppIcon.icns', resources/'AppIcon.icns')
    (resources/'runtime.json').write_text(json.dumps({'projectRoot': str(ROOT)}, ensure_ascii=False), encoding='utf-8')
    info = {'CFBundleDisplayName': '澄学 EJU', 'CFBundleName': '澄学 EJU', 'CFBundleExecutable': 'Chengxue', 'CFBundleIdentifier': 'local.user.eju-study', 'CFBundlePackageType': 'APPL', 'CFBundleVersion': '3.0.0', 'CFBundleShortVersionString': '3.0.0', 'CFBundleIconFile': 'AppIcon', 'NSHighResolutionCapable': True, 'LSUIElement': False, 'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True, 'NSAllowsArbitraryLoadsInWebContent': True}, 'NSHumanReadableCopyright': '澄学 EJU — 个人学习空间'}
    with (STAGED/'Contents/Info.plist').open('wb') as f:
        plistlib.dump(info, f)
    # Original icons / Finder-created app folders can carry FinderInfo or resource
    # forks. Clear only this generated bundle before signing, never project data.
    subprocess.run(['/usr/bin/xattr', '-cr', str(STAGED)], check=True)
    subprocess.run(['/usr/bin/codesign', '--force', '--deep', '--sign', '-', str(STAGED)], check=True)
    subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(STAGED)], check=True)
    backups = []
    # The user's cloud-managed Desktop rewrites FinderInfo on real bundles after
    # signing. Keep the signed app outside File Provider; Desktop is only a link.
    for old_app in [INSTALLED, TARGET]:
        if not old_app.exists() or old_app.is_symlink():
            continue
        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        backup = HERE/'backups'/f'澄学 EJU-{stamp}.app'
        backup.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['/usr/bin/ditto', str(old_app), str(backup)], check=True)
        backups.append(str(backup))
    if INSTALLED.exists():
        shutil.rmtree(INSTALLED)
    INSTALLED.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['/usr/bin/ditto', str(STAGED), str(INSTALLED)], check=True)
    subprocess.run(['/usr/bin/xattr', '-cr', str(INSTALLED)], check=True)
    subprocess.run(['/usr/bin/codesign', '--force', '--deep', '--sign', '-', str(INSTALLED)], check=True)
    subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(INSTALLED)], check=True)
    if TARGET.is_symlink():
        TARGET.unlink()
    elif TARGET.exists():
        shutil.rmtree(TARGET)
    TARGET.symlink_to(INSTALLED, target_is_directory=True)
    subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(TARGET)], check=True)
    print(json.dumps({'app': str(INSTALLED), 'desktopLink': str(TARGET), 'binary': str(TARGET/'Contents/MacOS/Chengxue'), 'backups': backups, 'version': '3.0.0', 'launched': False}, ensure_ascii=False))

if __name__ == '__main__':
    main()
