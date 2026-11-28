import assert from 'node:assert/strict';
import { it } from 'vitest';
import { classify, createMonitor, MonitorError, normalizeNoteUrl, normalizeNotes, summarize } from './src/main/monitor.ts';

const note = 'https://www.xiaohongshu.com/explore/0123456789abcdef01234567';
const other = 'https://www.xiaohongshu.com/discovery/item/aaaaaaaaaaaaaaaaaaaaaaaa';
const acceptAll = {
  isNoteValid: async () => true,
  filterComments: async items => items,
};

it('classifies Chinese text, mixed feedback, negation, and missing content', () => {
  assert.deepEqual(classify('不推荐', '踩雷'), { sentiment: 'negative', signals: ['不推荐', '踩雷'] });
  assert.equal(classify('没踩雷', '很好用').sentiment, 'positive');
  assert.equal(classify('好用，但失望', '').sentiment, 'mixed');
  assert.equal(classify('不太好喝', '').sentiment, 'negative');
  assert.equal(classify('', '').sentiment, 'unknown');
});

it('filters and deduplicates notes before calculating ratios', () => {
  const notes = normalizeNotes([
    { url: `${note}?utm_term=x`, title: '难喝' },
    { url: note.replace('/explore/', '/discovery/item/'), title: '难喝' },
    { url: other },
    { url: note.replace('www.xiaohongshu.com', 'www.xiaohongshu.com.evil.example'), title: '好喝' },
    { url: 'https://www.xiaohongshu.com/user/profile/0123456789abcdef01234567', title: '好喝' },
    { url: 'https://user:password@www.xiaohongshu.com/explore/cccccccccccccccccccccccc', title: '好喝' },
  ]);
  const stats = summarize(notes);
  assert.equal(stats.count, 2);
  assert.equal(stats.analyzed, 1);
  assert.equal(stats.negativeRatio, 1);
  assert.equal(stats.interactions, null);
  assert.equal(notes[0].url, note);
  assert.equal(normalizeNoteUrl('javascript:alert(1)'), null);
});

it('sums only known nonnegative integer interaction counts', () => {
  const [normalized] = normalizeNotes([{ url: note, text: '满意', likes: 0, comments: 4, shares: -1 }]);
  const stats = summarize([normalized]);
  assert.equal(stats.negativeRatio, 0);
  assert.equal(stats.interactions, 4);
  assert.equal(stats.interactionCoverage, 1);
});

it('keeps empty samples distinct from an observed zero percent', () => {
  const stats = summarize([]);
  assert.equal(stats.count, 0);
  assert.equal(stats.negativeRatio, null);
});

it('accepts only OpenCLI and preserves its complete capture result', async () => {
  const now = new Date('2026-11-23T01:00:00.000Z');
  const search = createMonitor({
    now: () => now,
    validityFilter: acceptAll,
    collector: async (keyword, signal) => {
      assert.equal(keyword, '咖啡');
      assert.ok(signal instanceof AbortSignal);
      const notes = normalizeNotes([{ url: `${note}?xsec_token=a&xsec_source=pc_search`, title: '推荐', likes: 'not-a-number' }]);
      notes[0].commentScan = { status: 'sampled', items: [{ text: '喜欢', isReply: false, sentiment: 'unknown', signals: [] }] };
      return { notes, limited: false };
    },
  });
  const result = await search({ keyword: ' 咖啡 ', source: 'opencli' }, new AbortController().signal);
  assert.equal(result.capturedAt, now.toISOString());
  assert.equal(result.source, 'opencli');
  assert.equal(result.comments.count, 1);
  assert.equal(result.comments.negativeRatio, 0);
  assert.equal(result.notes[0].commentScan.items[0].sentiment, 'positive');
  await assert.rejects(search({ keyword: '咖啡', source: 'web' }), { code: 'invalidSource' });
  await assert.rejects(search({ keyword: ' ', source: 'opencli' }), { code: 'invalidKeyword' });
});

it('surfaces collector errors without converting them to successful empty captures', async () => {
  const search = createMonitor({ collector: async () => { throw new MonitorError('collectorBridge'); }, validityFilter: acceptAll });
  await assert.rejects(search({ keyword: '茶', source: 'opencli' }), { code: 'collectorBridge' });
});

it('filters invalid notes and comments before sentiment and aggregate calculations', async () => {
  const notes = normalizeNotes([
    { url: note, title: '真实体验', text: '满意', likes: 10 },
    { url: other, title: '广告笔记', text: '难喝', likes: 100 },
  ]);
  const items = [
    { text: '喜欢', isReply: false, sentiment: 'unknown', signals: [] },
    { text: '广告回复', isReply: true, sentiment: 'unknown', signals: [] },
    { text: '踩雷', isReply: false, sentiment: 'unknown', signals: [] },
  ];
  notes[0].commentScan = { status: 'sampled', items };
  notes[1].commentScan = { status: 'sampled', items: [{ text: '广告评论', isReply: false, sentiment: 'unknown', signals: [] }] };
  const noteCalls = [];
  const commentCalls = [];
  const search = createMonitor({
    collector: async () => ({ notes, limited: true }),
    validityFilter: {
      isNoteValid: async current => {
        noteCalls.push(current.title);
        return current.title !== '广告笔记';
      },
      filterComments: async current => {
        commentCalls.push(current.map(item => item.text));
        return current.filter(item => item.text !== '广告回复');
      },
    },
  });
  const result = await search({ keyword: '咖啡', source: 'opencli' });
  assert.deepEqual(noteCalls, ['真实体验', '广告笔记']);
  assert.deepEqual(commentCalls, [['喜欢', '广告回复', '踩雷']]);
  assert.equal(result.limited, true);
  assert.equal(result.stats.count, 1);
  assert.equal(result.stats.interactions, 10);
  assert.equal(result.stats.negativeRatio, 0);
  assert.deepEqual(result.notes[0].commentScan.items.map(item => item.text), ['喜欢', '踩雷']);
  assert.deepEqual(result.comments, {
    count: 2, sampledNotes: 1, failedNotes: 0, skippedNotes: 0,
    counts: { negative: 1, positive: 1, neutral: 0, mixed: 0 }, negativeRatio: 0.5,
  });
});

it('returns an empty successful sample when every note is invalid', async () => {
  const search = createMonitor({
    collector: async () => ({ notes: normalizeNotes([{ url: note, title: '广告', text: '推广' }]), limited: false }),
    validityFilter: {
      isNoteValid: async () => false,
      filterComments: async () => { assert.fail('invalid notes must not request comment decisions'); },
    },
  });
  const result = await search({ keyword: '茶', source: 'opencli' });
  assert.equal(result.stats.count, 0);
  assert.equal(result.stats.negativeRatio, null);
  assert.equal(result.comments.count, 0);
  assert.equal(result.comments.sampledNotes, 0);
  assert.deepEqual(result.notes, []);
});

it('does not turn validity failures into unfiltered or empty successful captures', async () => {
  const search = createMonitor({
    collector: async () => ({ notes: normalizeNotes([{ url: note, title: '标题' }]), limited: false }),
    validityFilter: {
      isNoteValid: async () => { throw new MonitorError('aiFilterFormat'); },
      filterComments: acceptAll.filterComments,
    },
  });
  await assert.rejects(search({ keyword: '茶', source: 'opencli' }), { code: 'aiFilterFormat' });
});
