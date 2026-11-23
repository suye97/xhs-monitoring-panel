import type { CaptureResult } from './types';

export function captureFixture(keyword = '咖啡'): CaptureResult {
  return {
    keyword,
    source: 'opencli',
    capturedAt: '2026-11-23T01:00:00.000Z',
    limited: false,
    stats: {
      count: 1,
      counts: { negative: 1, positive: 0, neutral: 0, mixed: 0, unknown: 0 },
      analyzed: 1,
      negativeRatio: 1,
      interactions: 12,
      interactionCoverage: 1,
    },
    comments: {
      count: 1,
      counts: { negative: 1, positive: 0, neutral: 0, mixed: 0 },
      sampledNotes: 1,
      failedNotes: 0,
      skippedNotes: 0,
      negativeRatio: 1,
    },
    notes: [{
      id: '0123456789abcdef01234567',
      url: 'https://www.xiaohongshu.com/explore/0123456789abcdef01234567?xsec_token=a&xsec_source=pc_search',
      title: '历史笔记标题',
      text: '历史笔记正文',
      metrics: { likes: 12 },
      sentiment: 'negative',
      signals: ['踩雷'],
      commentScan: {
        status: 'sampled',
        items: [{ text: '历史评论正文', isReply: false, sentiment: 'negative', signals: ['踩雷'] }],
      },
    }],
  };
}
