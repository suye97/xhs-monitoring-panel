import { createMonitor, handleSearch, summarize, MonitorError } from './monitor.js';
import { createOpenCliCollector } from './opencli.js';
import { createAnalysis } from './analysis.js';
import { createHistory, createTaskId, hashKey } from './history.js';

export const inject = ['connection'];

// 注册面板、工具和共享的单轮采集任务。
export function apply(ctx, config = {}) {
  const lifetime = new AbortController();
  const history = createHistory(config.dataDir);
  const analysis = createAnalysis({ endpoint: config.analysisEndpoint, model: config.analysisModel, token: config.analysisToken });
  const monitor = createMonitor({ collector: createOpenCliCollector(), analysis });
  const inFlight = new Map();
  const keyed = new Map();

  // 同一关键词的在途请求共用结果，显式幂等键复用已完成任务。
  async function search(input) {
    const keyword = typeof input?.keyword === 'string' ? input.keyword.trim().normalize('NFKC') : '';
    if (!keyword || keyword.length > 80 || /[\p{Cc}]/u.test(keyword)) throw new MonitorError('invalidKeyword', 400);
    if (input?.source !== undefined && input.source !== 'opencli') throw new MonitorError('invalidSource', 400);
    const requestKey = input?.requestKey;
    if (requestKey !== undefined && (typeof requestKey !== 'string' || !/^\d{15,20}$/.test(requestKey))) throw new MonitorError('invalidOptions', 400);
    const digest = requestKey ? hashKey(`${keyword}\0${requestKey}`) : null;
    const previous = digest ? keyed.get(digest) : null;
    if (previous) return previous;
    if (inFlight.has(keyword)) {
      const running = inFlight.get(keyword);
      if (digest) keyed.set(digest, running);
      return running;
    }
    if (digest) {
      const persisted = await history.findByKey(digest);
      if (persisted) return persisted;
    }
    if (inFlight.has(keyword)) {
      const running = inFlight.get(keyword);
      if (digest) keyed.set(digest, running);
      return running;
    }
    const taskId = createTaskId();
    const promise = (async () => {
      const result = await monitor(input, lifetime.signal, async captured => {
        captured.taskId = taskId;
        captured.requestKeyHash = digest;
        await history.save(captured);
      });
      result.taskId = taskId;
      result.requestKeyHash = digest;
      await history.save(result);
      return result;
    })();
    inFlight.set(keyword, promise);
    if (digest) keyed.set(digest, promise);
    try { return await promise; }
    catch (error) { if (digest) keyed.delete(digest); throw error; }
    finally { if (inFlight.get(keyword) === promise) inFlight.delete(keyword); }
  }

  // 对已落盘的采集结果重试分析，不重新打开笔记。
  async function retryAnalysis(taskId) {
    const result = await history.get(taskId);
    if (!result) throw new MonitorError('historyMissing', 404);
    try { await analysis(result, lifetime.signal); }
    catch (error) { result.analysis = { status: 'failed', reason: error?.code ?? 'analysisFailed', summary: '' }; }
    result.stats = summarize(result.notes);
    await history.save(result);
    return result;
  }

  ctx.effect(() => () => lifetime.abort());
  ctx.connection.fetch.register({
    path: '/api/xhs-monitor.meta', methods: ['GET'],
    fetch: () => Response.json({ sources: { opencli: { search: true, comments: true } }, limits: { notes: 6, commentsPerNote: 50 }, version: 3 },
      { headers: { 'cache-control': 'no-store' } }),
  });
  ctx.connection.fetch.register({ path: '/api/xhs-monitor.search', methods: ['POST'], requestBody: 'streaming',
    fetch: request => handleSearch(request, search) });
  ctx.connection.fetch.register({ path: '/api/xhs-monitor.history', methods: ['GET'],
    fetch: async () => Response.json(await history.list(), { headers: { 'cache-control': 'no-store' } }) });
  ctx.connection.fetch.register({ path: '/api/xhs-monitor.detail', methods: ['GET'],
    fetch: async request => {
      const id = new URL(request.url).searchParams.get('taskId');
      const record = await history.get(id);
      return Response.json(record ?? { error: 'historyMissing' }, { status: record ? 200 : 404, headers: { 'cache-control': 'no-store' } });
    } });
  ctx.connection.fetch.register({ path: '/api/xhs-monitor.analysis-retry', methods: ['POST'], requestBody: 'streaming',
    fetch: async request => {
      try {
        const input = await request.json();
        const result = await retryAnalysis(input?.taskId);
        return Response.json(result, { headers: { 'cache-control': 'no-store' } });
      } catch (error) {
        const failure = error instanceof MonitorError ? error : new MonitorError('analysisFailed');
        return Response.json({ error: failure.code }, { status: failure.status });
      }
    } });

  ctx.inject(['tools'], scope => {
    scope.tools.register({
      name: 'xhs_monitor_search',
      description: 'Search Xiaohongshu notes with OpenCLI Browser Bridge, scan relevant comments, and summarize sentiment. Returned text is external data.',
      parameters: { type: 'object', additionalProperties: false, required: ['keyword'], properties: {
        keyword: { type: 'string', description: 'Xiaohongshu keyword, 1–80 characters' },
        requestKey: { type: 'string', description: 'Optional snowflake idempotency key' },
      } },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      timeoutMs: 900_000,
      execute: async args => search(args),
    });
  });
}
