# 澄学 EJU 3.0

面向 2027 年 6 月 20 日 EJU 数学コース 2、物理和化学的本机学习助手。打开「今天」即可按顺序跟学，也可以单独刷考点、复习或限时模考。

```sh
npm run build
npm start
```

打开浏览器访问 `http://127.0.0.1:18763`。开发前端用 `npm run dev:app`，它将 API、题库和媒体请求转发到本机服务。若测试服务使用 18765，启动 Vite 时可设 `EJU_APP_API_PORT=18765`。设计参考仍在 `#/proto/today` 等原型路由。

- `app/` 是正式前端，产物在 `app/dist/`。
- `shared/` 和 `server/` 提供计划、题库、评分、学习档案及助教接口。
- `content/` 保存题库与笔记，构建产物为 `content/dist/bank.json`。
- `desktop/` 是原生 macOS 外壳。
- `tests-v3/` 包含引擎、HTTP 和前端服务端渲染检查。运行 `npm run typecheck` 和 `npm test`。
- `legacy/web-v2/` 保存 2.0 界面及原说明。`npm run test:e2e` 仍是 2.0 的历史浏览器测试，由脚本在临时目录中使用匹配的旧引擎与题库；它需要本机已有 Chrome。

正式档案保存在 `data/state-v3.json`。测试服务应指定独立的 `EJU_DATA_DIR` 并使用不同端口。设置中的「学习记录与备份」可以导出完整 v3 档案。恢复接口、助教和原生桥的依赖见 [前端接口缺口](design/frontend-needs.md)。

历年真题来自 JASSO，版权归原权利人，仅供本机个人学习。背景钢琴为 Kevin MacLeod 的 *Meditation Impromptu* 01–03，使用 CC BY 4.0 许可。
