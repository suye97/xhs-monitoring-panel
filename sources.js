import fixture from './fixtures/gold.json' with { type: 'json' };
import { createDirect } from './direct.js';

const LIMIT = 30;
const DEMO = [
  ['回购了三次，还是喜欢', '使用了两个月，体验很满意。', 186, 23],
  ['这次真的踩雷了', '实物有异味，已经申请退款。', 112, 35],
  ['使用体验记录', '周一到货，周三开始使用。', 31, 6],
  ['好用，但售后让我失望', '本身好用，售后的处理让我失望。', 223, 56],
  ['价格和规格整理', '记录两个版本的规格与价格变化。', 76, 8],
  ['买完就后悔了', '连续出现故障，客服建议退货。', 142, 28],
  ['这次入手很惊喜', '确实好用，之后还会回购。', 97, 13],
  ['', '', 25, 5],
];

// 限制上游 JSON 响应体大小并隐藏上游原始错误。
async function jsonResponse(response, code) {
  let raw;
  try { raw = await response.text(); if (raw.length > 1_000_000) throw new Error(); return JSON.parse(raw); }
  catch { throw Object.assign(new Error(code), { code }); }
}

// 创建网页搜索、受控网关、演示与直连数据源。
export function createSources({ web, endpoint, commentsEndpoint, token, directEnabled, cookie, request = fetch, qps }) {
  const direct = createDirect({ cookie, enabled: directEnabled, request, qps });
  // 延迟校验网关 URL，避免错误配置影响其他数据源。
  function parseUrl(value) {
    try { return value ? new URL(value) : null; }
    catch { return null; }
  }
  const apiUrl = parseUrl(endpoint);
  const commentsUrl = commentsEndpoint ? parseUrl(commentsEndpoint) : apiUrl;

  // 拒绝不安全的网关地址。
  function validate(url) {
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.hash) throw Object.assign(new Error('apiConfiguration'), { code: 'apiConfiguration', status: 503 });
  }

  // 以 Bearer 令牌调用管理员配置的网关。
  async function gateway(url, params, signal) {
    validate(url);
    const target = new URL(url);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
    const response = await request(target, { headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, redirect: 'error', signal });
    if (!response.ok) {
      await response.body?.cancel();
      const code = response.status === 429 ? 'rateLimited' : 'apiFailed';
      throw Object.assign(new Error(code), { code });
    }
    return jsonResponse(response, 'apiFormat');
  }

  return {
    web: {
      // 从网页索引提取笔记摘要，索引不提供评论分页。
      async search(keyword, signal) {
        if (!web) throw Object.assign(new Error('webUnavailable'), { code: 'webUnavailable', status: 503 });
        const result = await web.search({ query: `site:xiaohongshu.com ${keyword.replace(/:/g, ' ')}`, maxResults: LIMIT }, signal);
        return { posts: result.sources, truncated: result.truncated === true || result.sources?.length >= LIMIT };
      },
    },
    api: {
      // 网关使用统一关键词搜索契约。
      async search(keyword, signal) {
        if (endpoint && !apiUrl) throw Object.assign(new Error('apiConfiguration'), { code: 'apiConfiguration', status: 503 });
        if (!apiUrl) throw Object.assign(new Error('apiUnavailable'), { code: 'apiUnavailable', status: 503 });
        const result = await gateway(apiUrl, { keyword, limit: LIMIT }, signal);
        if (!Array.isArray(result?.posts)) throw Object.assign(new Error('apiFormat'), { code: 'apiFormat' });
        return { posts: result.posts, truncated: result.truncated === true || result.posts.length > LIMIT };
      },
      // 网关按笔记 ID 与游标返回评论页。
      async comments(note, cursor, signal) {
        const result = await gateway(commentsUrl, { note_id: note.id, cursor, limit: 20 }, signal);
        if (!Array.isArray(result?.comments) || typeof result.has_more !== 'boolean') throw Object.assign(new Error('apiFormat'), { code: 'apiFormat' });
        return { comments: result.comments, cursor: result.cursor ?? '', hasMore: result.has_more };
      },
    },
    demo: {
      // 黄金使用覆盖广告与跑题样本的固定演示数据。
      async search(keyword) {
        if (keyword === '黄金') return { posts: fixture.posts, truncated: false };
        return { posts: DEMO.map(([title, text, likes, comments], index) => ({ title: title ? `${keyword}：${title}` : '', text, likes, comments,
          url: `https://www.xiaohongshu.com/explore/${(index + 1).toString(16).padStart(24, '0')}` })), truncated: false };
      },
      // 演示数据也按游标分页，便于离线验收扫描流程。
      async comments(note, cursor) {
        const rows = fixture.comments[note.id] ?? [];
        const offset = Number(cursor || 0);
        const next = offset + 20;
        return { comments: rows.slice(offset, next), cursor: next < rows.length ? String(next) : '', hasMore: next < rows.length };
      },
    },
    direct: direct?.unavailable ? {
      async search() { throw Object.assign(new Error(direct.unavailable), { code: direct.unavailable, status: 503 }); },
    } : direct,
    qps,
  };
}
