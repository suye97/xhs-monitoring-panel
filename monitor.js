import { classify } from './sentiment.js';
import { normalizeNotes as normalizeRows } from './normalize.js';
import { createSources } from './sources.js';
import { scanComments } from './comments.js';

export { classify } from './sentiment.js';

export class MonitorError extends Error {
  // 对外仅暴露固定错误码，避免泄露上游正文或凭据。
  constructor(code, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// 保留原有导出并委托给统一笔记归一化模块。
export function normalizeNotes(rows) {
  return normalizeRows(rows, classify);
}

// 汇总笔记情绪和已知互动量。
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

// 限制面板请求体并验证 JSON 格式。
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

// 构建统一的关键词搜索及评论扫描入口。
export function createMonitor({ web, endpoint, commentsEndpoint, token, request = fetch, now = () => new Date(),
  directEnabled = false, cookie, qps = 1.5, defaultScanNotes = 6 } = {}) {
  const sources = createSources({ web, endpoint, commentsEndpoint, token, request, directEnabled, cookie, qps });
  return async function search(input, parentSignal) {
    const keyword = typeof input?.keyword === 'string' ? input.keyword.trim().normalize('NFKC') : '';
    const source = input?.source ?? 'web';
    if (!keyword || keyword.length > 80 || /[\p{Cc}]/u.test(keyword)) throw new MonitorError('invalidKeyword', 400);
    if (!['web', 'api', 'demo', 'direct'].includes(source)) throw new MonitorError('invalidSource', 400);
    if (source === 'direct' && !directEnabled) throw new MonitorError('directUnavailable', 503);
    const limit = input?.commentLimit ?? 50;
    const scanNotes = input?.scanNotes ?? defaultScanNotes;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(scanNotes) || scanNotes < 1 || scanNotes > 10 ||
      (input?.includeComments !== undefined && typeof input.includeComments !== 'boolean')) throw new MonitorError('invalidOptions', 400);
    const deadline = AbortSignal.timeout(28_000);
    const signal = parentSignal ? AbortSignal.any([parentSignal, deadline]) : deadline;
    signal.throwIfAborted();
    let result;
    try { result = await sources[source].search(keyword, signal); }
    catch (error) {
      parentSignal?.throwIfAborted();
      if (deadline.aborted) throw new MonitorError('timeout', 504);
      if (error?.code?.startsWith('WEB_PROVIDER') || error?.code === 'AUTH') throw new MonitorError('webUnavailable', 503);
      const code = error?.code ?? (source === 'api' ? 'apiFailed' : 'searchFailed');
      const status = error?.status ?? (code === 'rateLimited' ? 429 : code === 'providerLoginRequired' ? 503 : 502);
      throw new MonitorError(code, status);
    }
    signal.throwIfAborted();
    const notes = normalizeNotes(result.posts);
    if (source === 'demo') for (const note of notes) note.url = null;
    let comments = { status: 'skipped', scannedNotes: 0, scannedRaw: 0, returned: 0, filtered: {}, items: [], truncated: false };
    if (input?.includeComments !== false) {
      try { comments = await scanComments({ keyword, notes, fetchPage: sources[source].comments, signal, limit, scanNotes, qps }); }
      catch (error) {
        parentSignal?.throwIfAborted();
        comments = { ...comments, status: 'partial', reason: deadline.aborted ? 'timeout' : 'commentFailed' };
      }
    }
    return { keyword, source, capturedAt: now().toISOString(), limited: result.truncated === true,
      stats: summarize(notes), notes, comments };
  };
}

// 将搜索结果或稳定错误码转为 HTTP 响应。
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
