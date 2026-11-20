# 小红书关键词搜索与评论开源项目调研

核对日期：2026-11-20。仅参考采集流程和错误边界，不复制其他项目代码。

| 项目 | 关键词笔记搜索 | 笔记评论 | 对本项目的启发 |
| --- | --- | --- | --- |
| [OpenCLI](https://github.com/jackwener/OpenCLI/blob/main/docs/adapters/index.md) | `xiaohongshu search` | `note`、`comments` | 固定使用 2.0.3 Browser Bridge；同页组合读取详情，避免重复打开笔记。其[站点会话问题记录](https://github.com/jackwener/OpenCLI/issues/2470)说明连续详情导航可能触发平台限制。 |
| [MediaCrawler](https://github.com/NanmiCoder/MediaCrawler/blob/main/media_platform/xhs/core.py) | 按关键词和页采集 | 批量读取评论 | 参考搜索结果去重、批量处理、采样上限；不引入其代码或依赖。 |
| [ReaJason/xhs](https://github.com/ReaJason/xhs/blob/master/xhs/core.py) | `get_note_by_keyword` | `get_note_comments`，含游标与 `xsec_token` | 保留搜索结果的签名链接供本轮详情采集，保存历史前移除链接查询参数。 |
| [xiaohongshu-cli](https://github.com/tamnd/xiaohongshu-cli/blob/main/README.md) | `xhs search` | `xhs comments --deep` | 参考一级评论与回复合计、错误分类；不引入 Go 运行时。 |

本项目采用 OpenCLI 为唯一采集入口。综合排序结果按笔记 ID 去重；在每篇单个详情页读取正文和最多 75 条一级评论及其回复的候选，过滤营销、重复及跑题文本，按相关度取前 50 条。记录过滤数和候选不足或截断原因。平台页面、登录态和风控会变化，真实采集结果须以当次覆盖信息判断。
