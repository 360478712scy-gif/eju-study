#!/usr/bin/env python3
"""Open the native app; --server-only starts/reuses its detached local server."""
from pathlib import Path
import argparse, json, os, shutil, subprocess, time, urllib.request
ROOT=Path(__file__).resolve().parent
URL='http://127.0.0.1:18763'
EXPECTED=(ROOT/'VERSION').read_text().strip() if (ROOT/'VERSION').exists() else None
def health():
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(URL+'/api/health',timeout=1) as response:
            data=json.load(response)
            return data if data.get('app')=='eju-study' else None
    except Exception:
        return None
def healthy():
    data=health()
    return bool(data) and (EXPECTED is None or data.get('version')==EXPECTED)
def stop_stale():
    """A server from an older version keeps serving old code; stop it before starting ours."""
    data=health()
    if not data or EXPECTED is None or data.get('version')==EXPECTED:
        return
    pids=subprocess.run(['/usr/sbin/lsof','-ti','tcp:18763','-sTCP:LISTEN'],capture_output=True,text=True).stdout.split()
    for pid in pids:
        try:os.kill(int(pid),15)
        except Exception:pass
    for _ in range(30):
        if health() is None:break
        time.sleep(0.1)
def ensure_server():
    stop_stale()
    if not healthy():
        node=next((p for p in [os.environ.get('EJU_NODE'),str(Path.home()/'.local/node/bin/node'),shutil.which('node')] if p and Path(p).exists()),None)
        if not node:
            raise RuntimeError('找不到 Node.js，学习记录仍保存在项目的 data 文件夹。')
        (ROOT/'data').mkdir(exist_ok=True)
        with (ROOT/'data/server.log').open('ab') as log:
            env=os.environ.copy()
            env['PORT']='18763'
            subprocess.Popen([node,str(ROOT/'server.mjs')],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True,env=env)
        for _ in range(80):
            if healthy():break
            time.sleep(.1)
        else:raise RuntimeError('学习空间未能启动。请查看项目 data/server.log；学习记录保存在 state-v3.json。')
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server-only',action='store_true')
    parser.add_argument('--json',action='store_true')
    parser.add_argument('--no-error-dialog',action='store_true')
    parser.add_argument('--browser',action='store_true',help='Explicit browser fallback for troubleshooting')
    args=parser.parse_args()
    try:
        if args.server_only or args.browser:
            ensure_server()
            if args.json:print(json.dumps({'ok':True,'url':URL},ensure_ascii=False))
            if args.browser:subprocess.run(['/usr/bin/open',URL],check=True)
        else:
            app=Path.home()/'Desktop'/'澄学 EJU.app'
            if not (app/'Contents/MacOS/Chengxue').is_file():app=Path.home()/'Applications'/'澄学 EJU.app'
            if not (app/'Contents/MacOS/Chengxue').is_file():raise RuntimeError('独立应用尚未安装。请运行 desktop/build.py 完成安装。')
            subprocess.run(['/usr/bin/open',str(app)],check=True)
    except Exception as e:
        if args.json:print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False))
        if not args.no_error_dialog:
            message=str(e).replace('\\','\\\\').replace('"','\\"')
            subprocess.run(['/usr/bin/osascript','-e',f'display alert "澄学 EJU" message "{message}"'])
        return 1
    return 0
if __name__=='__main__':
    raise SystemExit(main())
