const LIMIT = 30;
const NOTE_PATH = /^\/(?:explore|discovery\/item)\/([a-f\d]{24})\/?$/i;
const NEGATIVE = /避雷|踩雷|差评|失望|退款|退货|翻车|糟糕|难用|难喝|难吃|太贵|被骗|欺骗|虚假宣传|过敏|质量差|服务差|异味|漏液|不推荐|不满意|不值得|不(?:太)?(?:喜欢|好用|好喝|好吃|会回购)|后悔|投诉|故障|崩溃/g;
const POSITIVE = /满意|推荐|喜欢|惊喜|好用|好喝|好吃|值得|回购|好评|性价比高|物超所值|支持|不错|很棒/g;

export class MonitorError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function classify(title, text) {
  const content = [title, text].filter(Boolean).join('。').normalize('NFKC');
  if (!content) return { sentiment: 'unknown', signals: [] };
  const cleaned = content.replace(/(?:没有|并无|并不|不会|没|不)(?:踩雷|翻车|失望|后悔|难用|难喝|难吃|糟糕|被骗)/g, '');
  const negative = [...new Set(cleaned.match(NEGATIVE) ?? [])];
  const positive = [...new Set(cleaned.replace(NEGATIVE, '').replace(/(?:没有|并不|不是|不)(?:满意|推荐|喜欢|值得|回购|错)/g, '').match(POSITIVE) ?? [])];
  if (negative.length && positive.length >= negative.length) return { sentiment: 'mixed', signals: [...negative, ...positive] };
  if (negative.length) return { sentiment: 'negative', signals: negative };
  if (positive.length) return { sentiment: 'positive', signals: positive };
  return { sentiment: 'neutral', signals: [] };
}

function clean(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim().slice(0, max) : '';
}

export function normalizeNotes(rows) {
  const notes = new Map();
  for (const row of rows) {
    if (typeof row?.url !== 'string' || row.url.length > 2048) continue;
    let url;
    try { url = new URL(row.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !['www.xiaohongshu.com', 'xiaohongshu.com'].includes(url.hostname)) continue;
    const match = NOTE_PATH.exec(url.pathname);
    if (!match) continue;
    const id = match[1].toLowerCase();
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key !== 'xsec_token' && key !== 'xsec_source') url.searchParams.delete(key);
    }
    const title = clean(row.title, 180);
    const text = clean(row.text, 1000) || clean(row.snippet, 1000) || clean(row.summary, 1000);
    const metrics = {};
    for (const key of ['likes', 'comments', 'saves', 'shares']) {
      if (Number.isSafeInteger(row[key]) && row[key] >= 0 && row[key] <= 1_000_000_000) metrics[key] = row[key];
    }
    const note = { id, url: url.href, title, text, metrics, ...classify(title, text) };
    const previous = notes.get(id);
    if (!previous || Number(Boolean(title)) + Number(Boolean(text)) > Number(Boolean(previous.title)) + Number(Boolean(previous.text))) notes.set(id, note);
  }
  return [...notes.values()].slice(0, LIMIT);
}

export function summarize(notes) {
  const counts = { negative: 0, positive: 0, neutral: 0, mixed: 0, unknown: 0 };
  let interactions = 0;
  let interactionCoverage = 0;
  for (const note of notes) {
    counts[note.sentiment]++;
    const metrics = Object.values(note.metrics);
    if (metrics.length) {
      interactionCoverage++;
      interactions += metrics.reduce((total, count) => total + count, 0);
    }
  }
  const analyzed = notes.length - counts.unknown;
  return { count: notes.length, counts, analyzed, negativeRatio: analyzed ? counts.negative / analyzed : null,
    interactions: interactionCoverage ? interactions : null, interactionCoverage };
}

async function readJson(body, maximum) {
  if (!body) throw new MonitorError('invalidBody', 400);
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('body limit');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    await reader.cancel().catch(() => {});
    throw new MonitorError('invalidBody', 400);
  } finally { reader.releaseLock(); }
}

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

export function createMonitor({ web, endpoint, token, request = fetch, now = () => new Date() }) {
  return async function search(input, parentSignal) {
    const keyword = typeof input?.keyword === 'string' ? input.keyword.trim().normalize('NFKC') : '';
    const source = input?.source ?? 'web';
    if (!keyword || keyword.length > 80 || /[\p{Cc}]/u.test(keyword)) throw new MonitorError('invalidKeyword', 400);
    const deadline = AbortSignal.timeout(25_000);
    const signal = parentSignal ? AbortSignal.any([parentSignal, deadline]) : deadline;
    signal.throwIfAborted();
    let rows;
    let limited = false;
    try {
      if (source === 'demo') {
        rows = DEMO.map(([title, text, likes, comments], index) => ({ title: title ? `${keyword}｜${title}` : '', text, likes, comments,
          url: `https://www.xiaohongshu.com/explore/${(index + 1).toString(16).padStart(24, '0')}` }));
      } else if (source === 'web') {
        if (!web) throw new MonitorError('webUnavailable', 503);
        const query = `site:xiaohongshu.com ${keyword.replace(/:/g, ' ')}`;
        const result = await web.search({ query, maxResults: LIMIT }, signal);
        rows = result.sources;
        limited = result.truncated === true || rows.length >= LIMIT;
      } else if (source === 'api') {
        if (!endpoint) throw new MonitorError('apiUnavailable', 503);
        const url = new URL(endpoint);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new MonitorError('apiConfiguration', 503);
        url.searchParams.set('keyword', keyword);
        url.searchParams.set('limit', String(LIMIT));
        const headers = { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
        const response = await request(url, { headers, redirect: 'error', signal });
        if (!response.ok) {
          await response.body?.cancel();
          throw new MonitorError(response.status === 429 ? 'rateLimited' : 'apiFailed');
        }
        const result = await readJson(response.body, 1_000_000).catch(() => { throw new MonitorError('apiFormat'); });
        rows = result?.posts;
        if (!Array.isArray(rows)) throw new MonitorError('apiFormat');
        limited = result.truncated === true || rows.length > LIMIT;
      } else {
        throw new MonitorError('invalidSource', 400);
      }
    } catch (error) {
      parentSignal?.throwIfAborted();
      if (deadline.aborted) throw new MonitorError('timeout', 504);
      if (error instanceof MonitorError) throw error;
      if (error?.code?.startsWith('WEB_PROVIDER') || error?.code === 'AUTH') throw new MonitorError('webUnavailable', 503);
      throw new MonitorError(source === 'api' ? 'apiFailed' : 'searchFailed');
    }
    signal.throwIfAborted();
    const notes = normalizeNotes(rows);
    if (source === 'demo') for (const note of notes) note.url = null;
    return { keyword, source, capturedAt: now().toISOString(), limited, stats: summarize(notes), notes };
  };
}

export async function handleSearch(request, search) {
  try {
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') throw new MonitorError('invalidBody', 400);
    const input = await readJson(request.body, 4096);
    const result = await search(input, request.signal);
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (!(error instanceof MonitorError)) request.signal.throwIfAborted();
    const failure = error instanceof MonitorError ? error : new MonitorError('searchFailed');
    return Response.json({ error: failure.code }, { status: failure.status, headers: { 'cache-control': 'no-store' } });
  }
}
