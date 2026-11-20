import assert from 'node:assert/strict';
import test from 'node:test';
import { classify, createMonitor, handleSearch } from './monitor.js';
import { apply } from './index.js';

const note = 'https://www.xiaohongshu.com/explore/0123456789abcdef01234567';
const other = 'https://www.xiaohongshu.com/discovery/item/aaaaaaaaaaaaaaaaaaaaaaaa';

function request(input) {
  return new Request('https://local.test/api/xhs-monitor.search', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
}

test('classifies Chinese text, mixed feedback, negation, and missing content', () => {
  assert.deepEqual(classify('不推荐', '踩雷'), { sentiment: 'negative', signals: ['不推荐', '踩雷'] });
  assert.equal(classify('没踩雷', '很好用').sentiment, 'positive');
  assert.equal(classify('好用，但失望', '').sentiment, 'mixed');
  assert.equal(classify('不太好喝', '').sentiment, 'negative');
  assert.equal(classify('', '').sentiment, 'unknown');
});

test('filters search hits and deduplicates by note ID before calculating the ratio', async () => {
  const search = createMonitor({ web: { search: async ({ query, maxResults }, signal) => {
    assert.equal(query, 'site:xiaohongshu.com 茶');
    assert.equal(maxResults, 30);
    assert.ok(signal instanceof AbortSignal);
    return { sources: [
      { url: `${note}?utm_term=x`, title: '难喝' },
      { url: note.replace('/explore/', '/discovery/item/'), title: '难喝' },
      { url: other },
      { url: note.replace('www.xiaohongshu.com', 'www.xiaohongshu.com.evil.example'), title: '好喝' },
      { url: 'https://www.xiaohongshu.com/user/profile/0123456789abcdef01234567', title: '好喝' },
    ] };
  } } });
  const { stats, notes } = await search({ keyword: ' 茶 ' });
  assert.equal(stats.count, 2);
  assert.equal(stats.analyzed, 1);
  assert.equal(stats.negativeRatio, 1);
  assert.equal(stats.interactions, null);
  assert.equal(notes[0].url, note);
});

test('calls a configured API and sums only known nonnegative integer counts', async () => {
  const search = createMonitor({ endpoint: 'https://notes.example/search', token: 'fixture', request: async (url, options) => {
    assert.equal(url.searchParams.get('keyword'), '咖啡 + 茶');
    assert.equal(url.searchParams.get('limit'), '30');
    assert.equal(options.headers.authorization, 'Bearer fixture');
    assert.equal(options.redirect, 'error');
    return Response.json({ posts: [{ url: note, text: '满意', likes: 0, comments: 4, shares: -1 }, { url: other, text: '不错' }] });
  } });
  const response = await handleSearch(request({ keyword: '咖啡 + 茶', source: 'api' }), search);
  assert.equal(response.status, 200);
  const { stats } = await response.json();
  assert.equal(stats.negativeRatio, 0);
  assert.equal(stats.interactions, 4);
  assert.equal(stats.interactionCoverage, 1);
});

test('uses an explicit unavailable state when API configuration is missing', async () => {
  const response = await handleSearch(request({ keyword: '茶', source: 'api' }), createMonitor({}));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'apiUnavailable' });
});

test('keeps empty samples distinct from an observed zero percent', async () => {
  const search = createMonitor({ web: { search: async () => ({ sources: [] }) } });
  const result = await search({ keyword: '某品牌' });
  assert.equal(result.stats.count, 0);
  assert.equal(result.stats.negativeRatio, null);
});

test('routes the agent tool and authenticated panel request through the same monitor', async () => {
  let route;
  let tool;
  let dispose;
  apply({
    connection: { fetch: { register(value) { route = value; } } },
    get() { return undefined; },
    effect(effect) { dispose = effect(); },
    inject(_keys, callback) { callback({ tools: { register(value) { tool = value; } } }); },
  });
  try {
    const input = { keyword: '咖啡', source: 'demo' };
    const response = await route.fetch(request(input));
    assert.equal(response.status, 200);
    const panel = await response.json();
    const agent = await tool.execute(input, { signal: new AbortController().signal });
    assert.deepEqual(agent.stats, panel.stats);
    assert.equal(panel.stats.negativeRatio, 2 / 7);
    assert.equal(panel.stats.interactions, 1066);
    assert.ok(panel.notes.every(({ url }) => url === null));
  } finally { dispose(); }
});
