# 小红书搜索与评论开源项目调研

调研日期：2026-11-20。仅借鉴接口和采集边界设计，不复制候选项目代码。

| 项目 | 许可证 | 搜索与评论能力 | 分页、限流及验证 | 本项目取舍 |
| --- | --- | --- | --- | --- |
| [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler) | [非商业学习许可证 1.1](https://github.com/NanmiCoder/MediaCrawler/blob/main/LICENSE) | 支持关键词搜索笔记和批量评论采集 | 搜索按页，评论由爬虫批量采集；提供测试目录 | 仅参考流程，不引入代码或依赖 |
| [ReaJason/xhs](https://github.com/ReaJason/xhs) | [MIT](https://github.com/ReaJason/xhs/blob/master/LICENSE) | `get_note_by_keyword` 与 `get_note_comments` | 评论接口含 `cursor` 和 `xsec_token`；维护记录见 [CHANGELOG](https://github.com/ReaJason/xhs/blob/master/CHANGELOG.md) | 参考公开接口契约及分页字段，不复制 Python 代码 |
| [xiaohongshu-cli](https://github.com/tamnd/xiaohongshu-cli) | [Apache-2.0](https://github.com/tamnd/xiaohongshu-cli/blob/main/LICENSE) | CLI 提供搜索和详情评论 | 有区分登录、限流和接口变更的退出码，仓库有 CI | 参考稳定错误分类，不引入 Go 运行时 |
| [xhshow-js](https://github.com/renmu123/xhshow-js) | [MIT](https://github.com/renmu123/xhshow-js/blob/main/LICENSE) | 提供 `x-s` 等请求签名，不负责采集 | 仓库提供签名测试；请求格式可能随平台变化 | 仅直连路径使用，固定 npm `1.0.0`，锁文件记录完整性 |

实现采用统一数据源适配器，搜索返回笔记，评论按游标分页。扫描严格限制笔记数、页数、原始评论数与请求频率；验证码、登录态失效及接口变化返回固定错误码。真实平台接口和签名可能变化，直连默认关闭，建议优先使用管理员拥有授权的数据网关。演示源的「黄金」样本用于离线检查过滤和排序，不能证明实时平台可用性。
