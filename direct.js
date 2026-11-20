import { Client } from 'xhshow-js';

const origin = 'https://www.xiaohongshu.com';
const agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 只为签名器解析 a1，Cookie 原文始终只用于上游请求。
function getA1(cookie) {
  return cookie.split(';').map(part => part.trim()).find(part => part.startsWith('a1='))?.slice(3) ?? '';
}

// 生成服务端搜索会话标识，不作为数据库或业务主键。
function searchId() {
  return ((BigInt(Date.now()) << 64n) + BigInt(Math.floor(Math.random() * 2147483646))).toString(36).toUpperCase();
}

// 将直连上游封装为与网关相同的搜索和分页接口。
export function createDirect({ cookie, enabled, request = fetch, qps = 1.5 }) {
  if (!enabled) return null;
  const a1 = getA1(cookie ?? '');
  if (!a1 || !cookie?.includes('web_session=')) return { unavailable: 'providerLoginRequired' };
  const signer = new Client();
  const tokens = new Map();
  let nextRequest = 0;

  // 所有直连搜索和评论请求共享低频请求时隙。
  async function throttle(signal) {
    const start = Math.max(Date.now(), nextRequest);
    nextRequest = start + 1000 / Math.max(0.5, Math.min(1.5, qps));
    const delay = Math.max(0, start - Date.now());
    if (!delay) return signal.throwIfAborted();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(done, delay);
      function done() { signal.removeEventListener('abort', cancel); resolve(); }
      function cancel() { clearTimeout(timer); reject(signal.reason); }
      signal.addEventListener('abort', cancel, { once: true });
    });
  }

  // 仅在一次限流后退避，取消信号会中断等待。
  function waitForRetry(signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const timer = setTimeout(done, 1300);
      function done() { signal.removeEventListener('abort', cancel); resolve(); }
      function cancel() { clearTimeout(timer); reject(signal.reason); }
      signal.addEventListener('abort', cancel, { once: true });
    });
  }

  // 发出签名请求并将平台错误转换为稳定错误码。
  async function call(path, method, payload, signal) {
    await throttle(signal);
    let signature;
    try { signature = signer.signXS(method, path, a1, 'xhs-pc-web', payload); }
    catch { throw Object.assign(new Error('signatureFailed'), { code: 'signatureFailed' }); }
    const url = new URL(path, origin);
    if (method === 'GET') for (const [key, value] of Object.entries(payload)) url.searchParams.set(key, value);
    const response = await request(url, { method, redirect: 'error', signal,
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': agent,
        referer: `${origin}/`, cookie, 'x-s': signature, 'x-t': String(signer.getXT()),
        'x-s-common': signer.signXSCommon({ a1, web_session: cookie.match(/(?:^|;)\s*web_session=([^;]+)/)?.[1] ?? '' }),
        'x-b3-traceid': signer.getB3TraceId(), 'x-xray-traceid': signer.getXrayTraceId() },
      ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}) });
    if ([401, 403, 461, 471].includes(response.status)) { await response.body?.cancel(); throw Object.assign(new Error('providerLoginRequired'), { code: 'providerLoginRequired' }); }
    if (response.status === 429) { await response.body?.cancel(); throw Object.assign(new Error('rateLimited'), { code: 'rateLimited' }); }
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('upstreamChanged'), { code: 'upstreamChanged' }); }
    let data;
    try {
      const raw = await response.text();
      if (raw.length > 1_000_000) throw new Error();
      data = JSON.parse(raw);
    } catch { throw Object.assign(new Error('upstreamChanged'), { code: 'upstreamChanged' }); }
    if ([461, 471].includes(data?.code)) throw Object.assign(new Error('providerLoginRequired'), { code: 'providerLoginRequired' });
    if (data?.code === 429) throw Object.assign(new Error('rateLimited'), { code: 'rateLimited' });
    if (data?.success === false) throw Object.assign(new Error('upstreamChanged'), { code: 'upstreamChanged' });
    return data?.data ?? data;
  }

  return {
    // 获取关键词笔记，并仅在内存中保留搜索令牌。
    async search(keyword, signal) {
      const payload = { keyword, page: 1, page_size: 30, search_id: searchId(), sort: 'general', note_type: 0 };
      let data;
      try { data = await call('/api/sns/web/v1/search/notes', 'POST', payload, signal); }
      catch (error) {
        if (error?.code !== 'rateLimited') throw error;
        await waitForRetry(signal);
        data = await call('/api/sns/web/v1/search/notes', 'POST', payload, signal);
      }
      if (!Array.isArray(data?.items)) throw Object.assign(new Error('upstreamChanged'), { code: 'upstreamChanged' });
      const posts = data.items.filter(item => item?.id && item?.model_type !== 'rec_query' && item?.model_type !== 'hot_query').map(item => {
        tokens.set(item.id, item.xsec_token ?? '');
        return { url: `${origin}/explore/${item.id}`, title: item.note_card?.display_title ?? item.note_card?.title ?? '',
          text: item.note_card?.desc ?? '', likes: Number(item.note_card?.interact_info?.liked_count) || 0,
          comments: Number(item.note_card?.interact_info?.comment_count) || 0 };
      });
      return { posts, truncated: data.has_more === true };
    },
    // 通过游标读取单篇笔记评论。
    async comments(note, cursor, signal) {
      const data = await call('/api/sns/web/v2/comment/page', 'GET',
        { note_id: note.id, cursor, image_formats: 'jpg,webp,avif', xsec_token: tokens.get(note.id) ?? '' }, signal);
      if (!Array.isArray(data?.comments)) throw Object.assign(new Error('upstreamChanged'), { code: 'upstreamChanged' });
      return { comments: data.comments, cursor: data.cursor ?? '', hasMore: data.has_more === true };
    },
  };
}
