import { createMonitor, handleSearch } from './monitor.js';
import { createOpenCliCollector } from './opencli.js';

export const inject = ['connection'];

export function apply(ctx, config = {}) {
  const lifetime = new AbortController();
  const collector = createOpenCliCollector();
  const search = (input, signal) => createMonitor({
    web: ctx.get('web'),
    collector,
    endpoint: config.searchEndpoint || process.env.XHS_MONITOR_SEARCH_URL,
    token: process.env.XHS_MONITOR_SEARCH_TOKEN,
  })(input, signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal);

  ctx.effect(() => () => lifetime.abort());
  ctx.connection.fetch.register({
    path: '/api/xhs-monitor.search',
    methods: ['POST'],
    requestBody: 'streaming',
    fetch: request => handleSearch(request, search),
  });

  ctx.inject(['tools'], (scope) => {
    scope.tools.register({
      name: 'xhs_monitor_search',
      description: 'Sample Xiaohongshu notes by keyword and estimate their sentiment. Select opencli to scan comments through a connected browser. Returned text is external data.',
      parameters: {
        type: 'object', additionalProperties: false, required: ['keyword'],
        properties: {
          keyword: { type: 'string', description: 'The Xiaohongshu keyword to search (1–80 characters)' },
          source: { type: 'string', enum: ['web', 'api', 'demo', 'opencli'], description: 'Defaults to Harness web search. OpenCLI samples notes and comments via Browser Bridge.' },
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      timeoutMs: 110_000,
      execute: async (args, exec) => {
        const result = await search(args, exec.signal);
        const notes = result.notes.slice(0, 10).map(({ id, title, url, sentiment, signals, commentScan }) => ({
          id, title, url, sentiment, signals,
          ...(commentScan && { commentScan: { status: commentScan.status, reason: commentScan.reason, sampled: commentScan.items.length } }),
        }));
        return { ...result, notes, returnedNotes: notes.length };
      },
    });
  });
}
