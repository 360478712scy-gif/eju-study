#!/usr/bin/env python3
"""Package and publish a standalone 澄学 EJU release from main."""
import argparse
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def run(*args, error, capture=False):
    try:
        return subprocess.run(args, cwd=ROOT, check=True, text=True, capture_output=capture).stdout
    except (OSError, subprocess.CalledProcessError):
        raise SystemExit(f'发版失败：{error}') from None


def version_key(version):
    if not re.fullmatch(r'[0-9]+(?:\.[0-9]+)*', version):
        return None
    try:
        parts = [int(part) for part in version.split('.')]
    except ValueError:
        return None
    while len(parts) > 1 and parts[-1] == 0:
        parts.pop()
    return tuple(parts)


def check_release():
    branch = run('git', 'symbolic-ref', '--quiet', '--short', 'HEAD', capture=True, error='请切换到 main 分支。')
    if branch.strip() != 'main':
        raise SystemExit('发版失败：请切换到 main 分支。')
    dirty = run('git', 'status', '--porcelain', '--untracked-files=no', capture=True, error='无法检查 Git 工作区。')
    if dirty.strip():
        raise SystemExit('发版失败：工作区有已跟踪文件的改动，请先提交或整理这些改动。')

    try:
        version = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
    except (OSError, UnicodeError):
        raise SystemExit('发版失败：无法读取 VERSION。') from None
    current = version_key(version)
    if current is None:
        raise SystemExit('发版失败：VERSION 必须是以点分隔的数字版本号。')
    tags = run('git', 'tag', '--list', 'v*', capture=True, error='无法读取 Git 标签。').splitlines()
    numbered_tags = [(key, tag) for tag in tags if (key := version_key(tag[1:])) is not None]
    if numbered_tags:
        highest, tag = max(numbered_tags)
        if current <= highest:
            raise SystemExit(f'发版失败：VERSION {version} 必须高于现有标签 {tag}。')

    notes = HERE / 'release-notes' / f'{version}.md'
    try:
        has_notes = bool(notes.read_text(encoding='utf-8').strip())
    except (OSError, UnicodeError):
        has_notes = False
    if not has_notes:
        raise SystemExit(f'发版失败：请填写 {notes.relative_to(ROOT)}。')
    run('gh', 'auth', 'status', '--hostname', 'github.com', capture=True, error='GitHub CLI 未登录或不可用，请检查 gh auth status。')
    return version, notes


def main():
    parser = argparse.ArgumentParser(description='打包并发布澄学 EJU 独立版。')
    parser.add_argument('--dry-run', action='store_true', help='仅检查并打包')
    args = parser.parse_args()
    version, notes = check_release()
    run(sys.executable, str(HERE / 'package.py'), error='打包失败，请检查上方输出。')
    if args.dry_run:
        print('演练通过，安装包与校验文件已生成。')
        return

    tag, title = f'v{version}', f'澄学 EJU {version}'
    zip_path = HERE / 'release' / f'Chengxue-EJU-{version}.zip'
    run('git', 'tag', '-a', tag, '-m', title, error=f'无法创建标签 {tag}。')
    run('git', 'push', 'origin', 'main', error='无法推送 main。')
    run('git', 'push', 'origin', tag, error=f'无法推送标签 {tag}。')
    url = run('gh', 'release', 'create', tag, str(zip_path), str(zip_path.with_suffix('.zip.sha256')),
              '--title', title, '--notes-file', str(notes), error=f'无法创建 GitHub Release {tag}。', capture=True)
    print(f'发布地址：{url.strip()}')


if __name__ == '__main__':
    main()
