import { classify } from './sentiment.js';
import { createAnalysis } from './analysis.js';

export class MonitorError extends Error {
  // 对外仅返回稳定错误码。
  constructor(code, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// 汇总正负情绪指数，分母只包含有效样本。
export function sentimentIndex(items) {
  const counts = { positive: 0, negative: 0, neutral: 0, mixed: 0, unknown: 0 };
  let excludedAi = 0;
  for (const item of items) {
    if (item.analysis?.aiGenerated === true) { excludedAi++; continue; }
    const sentiment = item.analysis?.sentiment ?? 'unknown';
    counts[sentiment in counts ? sentiment : 'unknown']++;
  }
  const valid = counts.positive + counts.negative + counts.neutral + counts.mixed;
  return { index: valid ? Math.round(100 * (counts.positive - counts.negative) / valid) : null,
    valid, excludedAi, counts };
}

// 为一批笔记计算笔记、评论各自的指数与覆盖率。
export function summarize(notes) {
  const noteIndex = sentimentIndex(notes);
  const commentItems = notes.flatMap(note => note.commentScan?.items ?? []);
  const commentIndex = sentimentIndex(commentItems);
  const interactions = notes.map(note => Object.values(note.metrics ?? {}));
  const interactionCoverage = interactions.filter(values => values.length).length;
  return { count: notes.length, notes: noteIndex, comments: commentIndex,
    interactions: interactionCoverage ? interactions.flat().reduce((sum, value) => sum + value, 0) : null,
    interactionCoverage,
    sampledNotes: notes.filter(note => note.commentScan?.status === 'sampled').length,
    failedNotes: notes.filter(note => note.commentScan?.status === 'failed').length };
}

// 限制面板请求体大小并验证 JSON。
async function readJson(body, maximum) {
  if (!body) throw new MonitorError('invalidBody', 400);
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let value = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) throw new Error('body limit');
      value += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(value + decoder.decode());
  } catch {
    await reader.cancel().catch(() => {});
    throw new MonitorError('invalidBody', 400);
  } finally { reader.releaseLock(); }
}

// 校验关键词并运行唯一的 OpenCLI 采集流程。
export function createMonitor({ collector, analysis = createAnalysis(), now = () => new Date() }) {
  return async function search(input, signal, onCapture = async () => {}) {
    const keyword = typeof input?.keyword === 'string' ? input.keyword.trim().normalize('NFKC') : '';
    if (!keyword || keyword.length > 80 || /[\p{Cc}]/u.test(keyword)) throw new MonitorError('invalidKeyword', 400);
    if (input?.source !== undefined && input.source !== 'opencli') throw new MonitorError('invalidSource', 400);
    if (!collector) throw new MonitorError('collectorUnavailable', 503);
    const captured = await collector(keyword, signal);
    const result = { keyword, source: 'opencli', capturedAt: now().toISOString(), limited: captured.limited,
      notes: captured.notes, analysis: { status: 'pending', summary: '' } };
    result.stats = summarize(result.notes);
    await onCapture(result);
    try {
      await analysis(result, signal);
    } catch (error) {
      signal?.throwIfAborted();
      result.analysis = { status: 'failed', reason: error?.code ?? 'analysisFailed', summary: '' };
    }
    result.stats = summarize(result.notes);
    return result;
  };
}

// 将搜索结果或稳定错误码转换为 HTTP 响应。
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
