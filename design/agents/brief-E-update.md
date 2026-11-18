# 委托书 E：从 GitHub 检查并安装更新（原生壳 + 发版脚本）

仓库：`~/Projects/eju-study`（main 分支，远端 `origin` = https://github.com/360478712scy-gif/eju-study ，公开仓库）。
你只改这些文件：`desktop/Chengxue.swift`、`desktop/package.py`、`desktop/build.py`、新建 `desktop/release.py`、`desktop/README.md`（加一节“更新”）。
**不要碰 `app/src/`、`server/`、`shared/`、`tests-v3/`**——前端（设置页的更新行、启动提示）由 Claude 同时在做，它按下面的桥接口写。
不要提交（commit）、不要打 tag、不要创建 GitHub Release、不要推送；做完在回复里列出改了什么、怎么验证的。
不要运行 `~/Applications` 或桌面上那个正在使用中的“澄学 EJU.app”，也不要碰 18763 端口上的服务、`data/state-v2.json`、`data/state-v3.json`。

## 背景

- `desktop/package.py` 打出独立版 `desktop/release/澄学 EJU.app`（Bundle id `app.chengxue.eju`，自带 node，服务端口 18773，数据在 `~/Library/Application Support/澄学 EJU/data`，`Resources/app/server.mjs` 存在即为“独立模式”，见 `embeddedRoot` / `startEmbedded`）和 zip。
- `desktop/build.py` 是开发版安装（`~/Applications/澄学 EJU.app`，从项目目录跑服务，端口 18763）。
- 网页通过 `window.ejuNative` 桥调用原生（`bridgeScript` + `userContentController(_:didReceive:)` + `completeBridge`），原生用 `emit(name, detail:)` 向网页派发 `CustomEvent`。

## 要做的

### 1. 桥接口（网页端已按这个写，名字和形状不要改）

在 `bridgeScript` 的 `ejuNative` 对象里加两个方法，并在消息处理里实现：

```js
await window.ejuNative.checkUpdate()
// → { mode: 'standalone' | 'dev', current: '3.2.0', latest?: '3.2.1', available: boolean,
//     notes?: string /* release body，原样 markdown */, size?: number /* zip 字节数 */,
//     publishedAt?: string, error?: string /* 查不到时给一句中文原因，available=false */ }
await window.ejuNative.installUpdate()
// → 立即 resolve { started: true }；随后在后台下载、校验、替换。只允许 mode==='standalone'，否则 reject(Error('开发版请在项目目录里更新。'))。
// 过程中派发 window 事件 'eju-update-progress'，detail 全是字符串：
//   { phase: 'download', fraction: '0.42' } → { phase: 'verify' } → { phase: 'install' }
//   失败：{ phase: 'error', message: '中文原因' }（不退出 app，网页显示原因）
// 准备好后 app 自己退出并重新打开新版本。
```

`checkUpdate` 两种模式都能用（开发版也能看到有没有新版本，只是不能一键装）。

### 2. 检查

- 仓库 slug 从 Info.plist 的 `ChengxueUpdateRepo` 读（例如 `360478712scy-gif/eju-study`）；没有这个键就返回 `{available:false, error:'未配置更新源。'}`。
- `GET https://api.github.com/repos/<slug>/releases/latest`，头：`Accept: application/vnd.github+json`、`User-Agent: Chengxue-EJU-Updater`、`X-GitHub-Api-Version: 2022-11-28`。超时 15 秒。不带任何令牌。
- 当前版本 = `CFBundleShortVersionString`；最新版本 = tag 去掉前缀 `v`。按数字逐段比较（3.10.0 > 3.9.2）。
- 资产：名字匹配 `Chengxue-EJU-<版本>.zip` 的 zip，和同名加 `.sha256` 的校验文件（内容是 64 位十六进制，可带文件名，取第一个词）。没有 zip 或没有校验文件 → `available:false, error:'这个版本还没有安装包。'`。
- 结果在内存里缓存 10 分钟（安装时会重新取）。网络错误给出简短中文 `error`，不要把英文堆栈抛给网页。

### 3. 安装（只在独立模式）

1. 拒绝情况（reject 或 error 事件，中文说明）：app 跑在 App Translocation 路径（路径含 `/AppTranslocation/`，提示“请先把 app 拖到「应用程序」文件夹再更新”）；目标所在目录不可写；已经有一次安装在进行中。
2. 下载 zip 到 `~/Library/Caches/app.chengxue.eju/update/<版本>/`（先清空），用 `URLSessionDownloadDelegate` 报进度（节流到每 2% 或 200ms 一次）。
3. 校验：SHA-256（CryptoKit）必须等于 `.sha256` 文件里的值，否则删掉并报错。
4. `ditto -x -k` 解到新的空目录；里面必须恰好有一个 `*.app`；读它的 Info.plist：`CFBundleIdentifier` 必须等于当前 app 的，`CFBundleShortVersionString` 必须等于 latest 且比当前新；`codesign --verify --deep --strict` 通过；`xattr -cr`。
5. 替换：写一个小 shell 脚本（放在缓存目录，参数传 pid、目标路径、新 app 路径），用 `Process` 以 `/bin/sh` 启动并确保 app 退出后它还活着（`setsid` 不可用就用 `nohup` + 后台）。脚本：等原 pid 退出（最多 30 秒）→ `mv 目标 目标.old-<时间戳>` → `mv 新app 目标`（失败就把旧的挪回来）→ `rm -rf` 旧的 → `open 目标`。脚本的输出写到 `~/Library/Application Support/澄学 EJU/update.log`。
6. 派发 `{phase:'install'}` 后约 600ms 调 `NSApp.terminate(nil)`（`applicationWillTerminate` 已经会结束内置 node）。
7. 学习数据在 Application Support 里，不动；`seed` 只在数据目录为空时用，现在的逻辑保持。

### 4. 旧服务不能被新版本复用

`startEmbedded` 里 `healthy()` 现在只要 18773 上有 `eju-study` 就复用。改成：健康检查同时拿到 `version`；若与当前 bundle 的 `CFBundleShortVersionString` 不同，找出监听 18773 的进程（`lsof -nP -iTCP:18773 -sTCP:LISTEN -t`），确认它的可执行文件是某个 `.app/Contents/Resources/node`（`ps -o comm= -p <pid>` 或 `proc_pidpath`），发 SIGTERM，等端口空出来（最多 5 秒），再按原流程启动自己的 node。不是我们的进程就不要杀，显示错误。

### 5. 打包与发版

- `package.py`：Info.plist 加 `ChengxueUpdateRepo`，值从 `git remote get-url origin` 解析（支持 https 和 `git@github.com:` 两种），可用环境变量 `EJU_UPDATE_REPO` 覆盖；解析不到就不写这个键并打印警告。另外产出 ASCII 文件名的发布资产：`desktop/release/Chengxue-EJU-<版本>.zip`（就是现在那个 zip，改名或复制）和 `Chengxue-EJU-<版本>.zip.sha256`（`<hex>  Chengxue-EJU-<版本>.zip`）。原来中文名的 zip 不再需要，可以去掉。
- `build.py`（开发版）：Info.plist 同样写 `ChengxueUpdateRepo`，让开发版也能“检查更新”。
- 新建 `desktop/release.py`：
  1. 检查：在 main 分支；工作区没有已跟踪文件的改动；`VERSION` 比 `git tag` 里最大的 `v*` 新；`desktop/release-notes/<版本>.md` 存在且非空；`gh auth status` 通过。任何一项不满足就打印中文原因退出（非 0）。
  2. 跑 `package.py`。
  3. `git tag -a v<版本> -m "澄学 EJU <版本>"`，`git push origin main`，`git push origin v<版本>`。
  4. `gh release create v<版本> <zip> <sha256> --title "澄学 EJU <版本>" --notes-file desktop/release-notes/<版本>.md`。
  5. 打印 release 的网址。
  支持 `--dry-run`：只做检查和打包，不打 tag、不推送、不发布。

### 6. 验证（在你自己的隔离环境里）

- `swiftc` 编译通过（命令见 `package.py`）。
- 写一个临时脚本，用一个假的 release JSON（或本地 `python3 -m http.server` 起的假 API，通过一个仅 QA/调试用的环境变量 `EJU_UPDATE_API` 覆盖 API 基址——这个覆盖只在 `--qa` 模式下生效）走一遍：检查 → 下载 → 校验失败的情况 → 校验成功 → 解包 → 版本/签名检查。替换那一步在 `/tmp` 下的假目标路径上跑通即可，不要替换任何真实安装的 app。
- `python3 desktop/release.py --dry-run` 能走完检查和打包（版本号检查失败时也要给出清楚的中文提示）。
- README 的“更新”一节写清楚：怎么发版（改 VERSION → 写 release-notes → `python3 desktop/release.py`）、app 里怎么更新、更新失败看哪个日志。

代码风格跟现有 `Chengxue.swift` 一致（紧凑、无第三方依赖）。改完在回复里写：改动清单、验证结果、还有什么没做或有风险。
