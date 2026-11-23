import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'vitest';
import { createOpenCliCollector, createOpenCliRunner } from './src/main/opencli.ts';
import { createMonitor, MonitorError } from './src/main/monitor.ts';

const first = 'https://www.xiaohongshu.com/search_result/0123456789abcdef01234567?xsec_token=a&xsec_source=pc_search';
const second = 'https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa?xsec_token=b';
const third = 'https://www.xiaohongshu.com/explore/bbbbbbbbbbbbbbbbbbbbbbbb?xsec_token=c';

it('uses OpenCLI envelopes and keeps keyword input in a single positional argument', async context => {
  const dir = await mkdtemp(join(tmpdir(), 'xhs-monitor-test-'));
  context.onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const fixture = join(dir, 'fixture.cjs');
  await writeFile(fixture, `const args = process.argv.slice(2);
if (args.at(-1) === 'disconnect') {
  console.log(JSON.stringify({ok:false,error:{code:'BROWSER_CONNECT'}}));
  process.exitCode = 69;
} else {
  console.log(JSON.stringify({ok:true,data:args}));
}`);
  const run = createOpenCliRunner(fixture);
  assert.deepEqual(await run('search', ['--limit', '6'], '--help & echo fixture'),
    ['xiaohongshu', 'search', '-f', 'json', '--limit', '6', '--', '--help & echo fixture']);
  await assert.rejects(run('search', [], 'disconnect'), { code: 'collectorBridge' });
});

it('keeps a successful comment sample when another note is blocked and later notes are skipped', async () => {
  const calls = [];
  const collector = createOpenCliCollector(async (verb, options, value) => {
    calls.push([verb, value]);
    if (verb === 'search') return [{ url: first, title: '搜索标题', likes: '1.2万' }, { url: second }, { url: third }];
    if (verb === 'note') return [{ field: 'title', value: '推荐' }, { field: 'content', value: '很好用' }, { field: 'comments', value: '18' }];
    assert.deepEqual(options, ['--with-replies', '--limit', '10']);
    if (value === first) return [{ text: '踩雷' }, { text: '喜欢', is_reply: true }, { text: ' ' }];
    throw new MonitorError('collectorBlocked');
  });
  const result = await createMonitor({ collector })({ keyword: '咖啡', source: 'opencli' });
  assert.deepEqual(calls.map(([verb]) => verb), ['search', 'comments', 'note', 'comments']);
  assert.equal(result.stats.count, 3);
  assert.equal(result.stats.negativeRatio, 0);
  assert.equal(result.notes[0].metrics.likes, 12000);
  assert.equal(result.notes[0].metrics.comments, 18);
  assert.equal(result.notes[0].commentScan.items[1].isReply, true);
  assert.deepEqual(result.notes.slice(1).map(note => note.commentScan.status), ['failed', 'skipped']);
  assert.deepEqual(result.comments, { count: 2, sampledNotes: 1, failedNotes: 1, skippedNotes: 1,
    counts: { negative: 1, positive: 1, neutral: 0, mixed: 0 }, negativeRatio: 0.5 });
});

it('distinguishes successful empty comments and link skips from a measured zero percent', async () => {
  const collect = createOpenCliCollector(async verb => verb === 'search' ? [{ url: first }, { url: second.split('?')[0] }] : []);
  const result = await createMonitor({ collector: collect })({ keyword: '茶', source: 'opencli' });
  assert.equal(result.comments.negativeRatio, null);
  assert.equal(result.comments.sampledNotes, 1);
  assert.equal(result.notes[1].commentScan.reason, 'collectorNoteLink');
});

it('cancels an active scan and prevents another request from sharing its browser session', async () => {
  const collect = createOpenCliCollector(async (_verb, _options, _value, signal) => {
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const controller = new AbortController();
  const active = collect('茶', controller.signal);
  await assert.rejects(collect('咖啡'), { code: 'collectorBusy' });
  controller.abort();
  await assert.rejects(active, { name: 'AbortError' });
});
