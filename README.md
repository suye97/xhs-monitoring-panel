# 小红书舆情监控

仅通过固定版本的 [OpenCLI 2.0.3](https://github.com/jackwener/OpenCLI) Browser Bridge 采集已登录浏览器可见的笔记和评论。输入关键词后，按综合排序搜索，按笔记 ID 去重，每轮最多处理 6 篇。每篇在同一个详情页读取正文、互动数与有界评论候选，过滤广告、重复和跑题内容后按相关度保留最多 50 条一级评论及回复。

## 使用

1. 在本目录执行 `npm ci --ignore-scripts`。需要 Node.js 20.18.1 或更新版本。
2. 安装并启用 [OpenCLI Browser Bridge](https://github.com/jackwener/OpenCLI/blob/main/docs/guide/browser-bridge.md)，在同一浏览器登录小红书。保持浏览器可见。
3. 打开侧栏「小红书舆情监控」，输入关键词，例如「黄金」，点击「搜索笔记并扫描评论」。
4. 点击任意采集历史条目可查看当次正文、评论、扫描覆盖、AI 总结和情绪指数。页面刷新或宿主重启后仍可查看。旧版浏览器历史仅显示原有汇总快照。

OpenCLI 未安装在插件依赖位置时，可用 `XHS_MONITOR_OPENCLI_ENTRY` 指向其 JavaScript 入口绝对路径；`XHS_MONITOR_NODE_EXECUTABLE` 可指定 Node 可执行文件。详情适配器使用插件所安装的 2.0.3 版本。

## AI 分析

通过插件配置 `analysisEndpoint`、`analysisModel`、`analysisToken`，或环境变量 `XHS_MONITOR_ANALYSIS_URL`、`XHS_MONITOR_ANALYSIS_MODEL`、`XHS_MONITOR_ANALYSIS_TOKEN` 设置兼容 Chat Completions 的模型服务。地址必须是 HTTPS，或本机 `localhost` / `127.0.0.1`。未配置时采集仍保存，分析状态为 `unconfigured`，在历史详情中配置完成后可点「重试分析」。模型服务失败或返回不完整 JSON 时保留采集结果及失败状态，重试不会重新采集。

模型逐篇独立判断笔记和每条评论的 AI 生成概率及情绪；概率达到 0.85 的笔记只从笔记指数剔除，评论仍逐条独立判断。指数为 `100 × (正向数 − 负向数) ÷ 有效样本数`，分别统计笔记与评论，并显示分母和剔除数量。无有效样本时指数为空。AI 生成判断只是估计，短文本可能不确定。

## 任务与接口

采集结果按雪花任务 ID 保存为独立 JSON 文件。默认目录是宿主工作目录下的 `.xhs-monitor-data`，可用插件 `dataDir` 或 `XHS_MONITOR_DATA_DIR` 指定。保存采用同目录临时文件和重命名。无数据库表结构变化。

- `POST /api/xhs-monitor.search`：`{"keyword":"黄金","requestKey":"可选雪花幂等键"}`。同关键词在途请求共用一轮任务；新键在上一轮结束后启动新采集。
- `GET /api/xhs-monitor.history`：最近 80 次采集的列表。
- `GET /api/xhs-monitor.detail?taskId=...`：当次完整结果。
- `POST /api/xhs-monitor.analysis-retry`：`{"taskId":"..."}`，只重试模型分析。
- 工具 `xhs_monitor_search` 使用同一入口，仅提供关键词和可选幂等键。

扫描覆盖与截断原因随每篇保存。平台登录失效、限制访问、Bridge 断开、评论未加载以及评论不足 50 条均可能使结果不完整。离线的 `fixtures/gold.json` 仅用于核对主题相关性和过滤规则；真实「黄金」采集需要已登录且连接 Bridge 的浏览器环境。

开源项目能力对比见 [调研记录](docs/xhs-oss-research.md)。
