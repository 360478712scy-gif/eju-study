# 澄学 EJU 原生桌面壳

`python3 desktop/build.py` 编译 Swift AppKit + WKWebView、签名并安装到 `~/Applications/澄学 EJU.app`，桌面的 `澄学 EJU.app` 是指向它的符号链接，仍可双击原来的桌面图标。替换前把旧应用完整复制到 `desktop/backups/`。安装不会启动应用。此布局避免云桌面自动添加 FinderInfo 元数据使应用严格签名验证失效；签名和元数据清理仅作用于生成的应用包。

`python3 launch.py` 优先打开桌面应用链接，链接不存在时打开 `~/Applications/澄学 EJU.app`；应用通过 `launch.py --server-only --json --no-error-dialog` 复用或启动 `127.0.0.1:18763` 的 Node 服务。服务独立运行，不随窗口关闭退出。

生产窗口使用持久 `WKWebsiteDataStore.default()`。关窗、隐藏和最小化会发送 `eju-window-hidden` 并暂停所有 WebKit 媒体；重开保留同一窗口并发送 `eju-window-visible`。网页负责尊重用户暂停音乐的偏好。

菜单：Cmd1 今日、Cmd2 课前复习、Cmd3 笔记、Cmd4 复盘；CmdShiftM 音乐、CmdShiftF 专注、Cmd/ 帮助；CtrlCmdF 系统全屏。编辑菜单使用 macOS 响应者链。重复自定义快捷键被忽略，输入法 marked text 期间不分发自定义动作。CmdR、ShiftCmdR、CmdL、CmdT、CmdN、CmdP、CmdF、Cmd[、Cmd]、Cmd缩放及 F5 不触发网页导航；导航代理也拒绝 reload/backForward。官方外部链接在系统浏览器打开。

网页桥仅允许主框架的同源本地页面使用：

```js
await window.ejuNative.saveText('学习备份.json', jsonText);
await window.ejuNative.writeClipboard(text);
const text = await window.ejuNative.readClipboard();
```

`saveText` 返回 `{saved:true,filename}` 或 `{cancelled:true}`。`<a download>` 的备份与 blob 下载也通过 WKDownload + NSSavePanel 保存。桥不支持任意脚本执行、文件路径读写或诊断命令。

## 原生 QA（独立数据）

先以 `PORT=18764 EJU_DATA_DIR=/tmp/你的隔离目录` 启动项目 `server.mjs`。不要使用生产数据目录。然后由 Python `subprocess.Popen` 或其他保留 stdin 的工具直接运行：

```text
~/Desktop/澄学 EJU.app/Contents/MacOS/Chengxue --qa --qa-url http://127.0.0.1:18764
```

仅 `--qa` 模式读取 stdin，一行一个 JSON 对象；标准输出以 `EJU_QA ` 开头，其余系统日志忽略。生产模式不读取诊断输入。QA 默认端口 18764，拒绝端口 18763，使用非持久 WebKit 存储。stdin EOF 会退出 QA；后端隔离服务需调用者关闭。

```json
{"id":"s","command":"status"}
{"id":"e","command":"eval","script":"document.title"}
{"id":"a","command":"evalAsync","script":"return await fetch('/api/health').then(r=>r.json())"}
{"id":"k","command":"key","characters":"2","modifiers":["command"],"keyCode":19}
{"id":"m","command":"menu","action":"navigate","page":"learning"}
{"id":"p","command":"snapshot","path":"/tmp/eju-native.png"}
{"id":"h","command":"hide"}
{"id":"v","command":"show"}
{"id":"media","command":"media"}
{"id":"prepare","command":"save-panel-prepare","path":"/tmp/eju-backup.json"}
{"id":"save-info","command":"save-panel-info"}
{"id":"save","command":"save-panel","path":"/tmp/eju-backup.json"}
{"id":"cancel","command":"save-panel","cancel":true}
{"id":"preserve","command":"clipboard-preserve"}
{"id":"edit","command":"edit","action":"copy:"}
{"id":"restore","command":"clipboard-restore"}
{"id":"q","command":"quit"}
```

响应 `{id,ok,value,error}`；异步通知 `{event:"boot"|"ready"|"download-finished",...}`。`key` 生成真实 `NSEvent` 交给 `NSApplication.sendEvent`，不是网页 KeyboardEvent。测试普通编辑前用 eval 聚焦文本框并选中文字；key 的 keyCode 使用 macOS 虚拟键码，例如 C=8、V=9、Z=6、W=13、R=15、L=37、F5=96。`menu` 经过相同原生动作入口；`edit` 直接调用系统编辑响应者链。

`snapshot` 使用正在运行的 WKWebView.takeSnapshot，记录原生窗口内实际渲染。它不包含 macOS 标题栏；`status` 单独提供窗口号、可见性、窗口数量、存储和媒体配置。`media` 返回 WebKit aggregate media state（可能包括静音壁纸），BGM 状态应同时查看页面对应 audio。

剪贴板 QA 必须先 `clipboard-preserve`，结束后 `clipboard-restore`。保留每个原始 NSPasteboardItem 的所有可读取数据类型，内容只留内存，绝不写日志。正常退出也恢复。仅比较测试字符串的相等结果，不打印原剪贴板。

保存 QA 顺序：先 `save-panel-prepare` 指定本次测试目标，再通过页面备份按钮、桥调用或下载打开真实面板。`save-panel-info` 返回面板实际 URL、目录、文件名、窗口状态。确认 URL 与目标完全相同后，`save-panel` 使用 AppKit 公共 `endSheet(returnCode: .OK)` 结束真实面板；保存仍由正常的桥或 WKDownload completion 执行，诊断代码不直接写备份。取消使用 `.cancel`，应确认文件未写入。此预置仅存在于 `--qa`，避免当前 macOS 远程面板在打开后修改路径属性却不更新实际 URL、缺少默认按钮且不响应合成 Return 的问题。正常使用仍由用户操作系统保存窗口。

确认文件存在、内容可解析，且窗口 URL 保持不变。真实窗口验收应覆盖：首次自动 BGM、暂停偏好、CmdW 关窗停音与重开、页面快捷键/草稿、系统编辑、菜单/右键、备份面板与取消，以及禁用浏览器导航键。
