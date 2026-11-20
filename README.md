# 小红书舆情监控

DeepSeek Harness 侧栏面板。输入关键词，选择数据源，再点「搜索并分析」。面板显示采集笔记数、负面占比、已知互动量、近八次采集记录，以及可按情绪筛选的笔记样本。搜索快照保存于当前浏览器，按关键词和数据源区分。每次最多展示 30 篇去重笔记。

## 数据源

- **OpenCLI 笔记与评论**使用开源 [OpenCLI](https://github.com/jackwener/opencli) 2.0.3 的只读命令。按最新排序搜索最多 6 篇笔记，逐篇读取评论及回复，并尝试补全笔记正文和互动指标。每篇向上游请求最多 10 条一级评论，面板最多保留 20 条文本评论和回复（合计）。
- **Harness 网页搜索**通过当前 Harness 配置的网页搜索服务检索网站收录的小红书笔记。分类使用搜索结果提供的标题、摘要，互动数据通常为空。搜索覆盖率取决于供应商索引，服务可能计费。
- **笔记数据 API**连接你有权使用的结构化笔记服务。可以通过插件配置字段 `searchEndpoint` 或 Host 环境变量 `XHS_MONITOR_SEARCH_URL` 设置完整 HTTPS 地址。接口密钥可通过 Host 环境变量 `XHS_MONITOR_SEARCH_TOKEN` 传入，提供时使用 Bearer 认证。
- **演示样本**可使用任意关键词，展示八条虚构笔记。演示与实际搜索的快照分别保存。

### 使用 OpenCLI

1. 从本目录安装 Host 依赖 `npm ci --ignore-scripts`。已安装的工作区链接可直接使用这份依赖。桌面版从 Host 的 `PATH` 查找 Node.js（需 20.18.1 或更新版本）。可用 `XHS_MONITOR_NODE_EXECUTABLE` 指定 Node 可执行文件，或用 `XHS_MONITOR_OPENCLI_ENTRY` 指定单独安装的 OpenCLI JavaScript 入口绝对路径。
2. 在 Chrome 安装并启用 [OpenCLI Browser Bridge](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)，在同一浏览器登录小红书。保持浏览器打开。用 `node node_modules/@jackwener/opencli/dist/src/main.js doctor` 检查 `extensionConnected`。 [桥接文档](https://github.com/jackwener/opencli/blob/main/docs/guide/browser-bridge.md)
3. 打开 Harness 侧栏「小红书舆情监控」，选择「OpenCLI 笔记与评论」，输入关键词并点「搜索笔记并扫描评论」。展开各篇笔记下的评论条目查看正文和情绪。

面板分别显示笔记负面占比、评论负面占比和评论扫描覆盖。成功扫描但采到零条文本时，评论负面占比显示为空。失败和跳过会附原因，已成功的样本仍会显示。历史快照只记录统计数字。

### 笔记数据 API 约定

插件向配置地址发送 `GET` 请求，查询参数包括 `keyword` 和 `limit=30`。响应为 JSON 对象，其中 `posts` 为笔记数组，可选 `truncated: true` 标记上游截断。`url` 必须是 HTTPS 小红书笔记链接。`title`、`text`、`likes`、`comments`、`saves`、`shares` 为可选字段，互动字段接受非负整数。已有服务若返回不同结构，可在其数据网关转换后接入。

```json
{
  "posts": [
    {
      "url": "https://www.xiaohongshu.com/explore/0123456789abcdef01234567",
      "title": "试用两周的感受",
      "text": "有异味，已经申请退款。",
      "likes": 12,
      "comments": 3
    }
  ]
}
```

## 统计口径

- **负面占比**为负面笔记数除以存在标题或文本的笔记数。混合和中性计入分母，无文本样本单独显示。分类使用中文词语规则，命中词可在帖子列表中查看，反讽、隐晦表达和语境可能导致误判。
- **已知互动量**是采集样本中已知的赞、评、藏和分享总和，并附带覆盖篇数。按钮触发的新搜索建立一条快照。用户可在首次搜索成功后启用每 30 分钟刷新，面板打开且可见时运行。记录反映返回样本及当次累计互动量，适合观察采集趋势。

## 安装

通过 Harness「插件 → 添加插件」选择此目录。安装后从左侧栏打开「小红书舆情监控」。

插件还注册了 `xhs_monitor_search` 工具。它复用面板的搜索和统计逻辑，并最多返回十条笔记摘要索引。面板快照保存在使用面板的浏览器中。

```powershell
npm test
```
