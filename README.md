# 小红书舆情监控

DeepSeek Harness 侧栏面板。输入关键词，选择数据源，再点「搜索并分析」。面板展示最多 30 篇去重笔记、前 50 条相关评论、过滤统计、情绪与热度趋势。评论正文和作者不会写入浏览器历史；v2 历史仅保存聚合快照。

## 数据源

- **Harness 网页搜索**通过当前 Harness 配置的网页搜索服务检索网站收录的小红书笔记。分类使用搜索结果提供的标题、摘要，互动数据通常为空。搜索覆盖率取决于供应商索引，服务可能计费。
- **笔记数据 API**连接你有权使用的结构化笔记服务。可以通过插件配置字段 `searchEndpoint` 或 Host 环境变量 `XHS_MONITOR_SEARCH_URL` 设置完整 HTTPS 地址。接口密钥可通过 Host 环境变量 `XHS_MONITOR_SEARCH_TOKEN` 传入，提供时使用 Bearer 认证。
- **演示样本**使用「黄金」可离线扫描六篇虚构笔记中的 120 条评论；其他关键词展示原有八篇演示笔记。
- **小红书直连**默认关闭，仅当管理员设置 `XHS_MONITOR_DIRECT=1` 并通过 `XHS_MONITOR_COOKIE` 提供有效登录态时可用。签名使用固定版本的 MIT 依赖 `xhshow-js`。不使用代理池、账号池或验证码绕过。遇登录验证立即停止。

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

## 评论扫描与网关契约

`searchEndpoint` 或环境变量 `XHS_MONITOR_SEARCH_URL` 指向有权使用的 HTTPS 网关。可用 `commentsEndpoint` 或 `XHS_MONITOR_COMMENTS_URL` 单独设置评论地址；未设置时沿用搜索地址。开启评论扫描时，插件发送 `GET`，查询参数为 `note_id`、`cursor` 和 `limit=20`。响应须包含 `comments` 数组、`cursor` 字符串和 `has_more` 布尔值。每条评论至少包含 `id`、`text`，可选非负整数 `likes`。

```json
{
  "comments": [{ "id": "1234567890", "text": "今天金价和工费都涨了", "likes": 3 }],
  "cursor": "next-page-token",
  "has_more": true
}
```

`POST /api/xhs-monitor.search` 接受 `keyword`、`source`、`includeComments`、`commentLimit`（1–50）和 `scanNotes`（1–10）。`GET /api/xhs-monitor.meta` 返回数据源能力。`comments` 包含状态、扫描数量、过滤原因及按相关度排列的评论。网页搜索没有评论分页能力，返回 `unsupported`；单篇评论失败时返回 `partial`。

默认扫描相关度最高的六篇笔记，每篇最多三页或 60 条原始评论，总上限 600 条，并发二、请求频率最高每秒 1.5 次。前 50 条先按每篇最多 15 条分配，不足时从剩余评论补齐。`truncated` 表示扫描或返回达到上限。联系方式、营销引导、重复、纯表情、低信息与跑题评论会过滤。规则相关度需要人工抽检。

可通过 `XHS_MONITOR_QPS`（0.5–1.5）和 `XHS_MONITOR_SCAN_NOTES`（1–10）调整默认限制。直连 Cookie 仅从环境变量读取，不写入浏览器历史或服务端日志。直连接口和签名可能随平台变化；上线前应确认平台条款与使用权限。候选项目和许可证见[开源调研](docs/xhs-oss-research.md)。


## 统计口径

- **负面占比**为负面笔记数除以存在标题或文本的笔记数。混合和中性计入分母，无文本样本单独显示。分类使用中文词语规则，命中词可在帖子列表中查看，反讽、隐晦表达和语境可能导致误判。
- **已知互动量**是采集样本中已知的赞、评、藏和分享总和，并附带覆盖篇数。按钮触发的新搜索建立一条快照。用户可在首次搜索成功后启用每 30 分钟刷新，面板打开且可见时运行。记录反映返回样本及当次累计互动量，适合观察采集趋势。

## 安装

通过 Harness「插件 → 添加插件」选择此目录。安装后从左侧栏打开「小红书舆情监控」。

插件还注册了 `xhs_monitor_search` 工具。它复用面板的搜索和统计逻辑，并最多返回十条笔记摘要索引。面板快照保存在使用面板的浏览器中。

```powershell
npm test
```
