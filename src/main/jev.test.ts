import { describe, expect, it, vi } from 'vitest';
import type { CommentItem } from '../shared/types';
import { createJevFilter, type JevClient } from './jev';

function setup(create = vi.fn()) {
  const client = { systemOne: { create } } as unknown as JevClient;
  return { create, filter: createJevFilter({ client, requestTimeoutMs: 1_000 }) };
}

function comment(text: string, isReply = false): CommentItem {
  return { text, isReply, sentiment: 'unknown', signals: [] };
}

describe('JEV validity filter', () => {
  it('uses the JEV System One decision API for one note at a time', async () => {
    const { create, filter } = setup(vi.fn().mockResolvedValue({ answers: { note: { type: 'noul', noul: 1 } } }));
    await expect(filter.isNoteValid({ title: '真实标题', text: '真实正文' })).resolves.toBe(true);
    expect(create).toHaveBeenCalledOnce();
    const [request, options] = create.mock.calls[0]!;
    expect(request.decisionsRequest.model).toBe('jev-latest');
    expect(request.decisionsRequest.state).toEqual({ title: '真实标题', text: '真实正文' });
    expect(request.decisionsRequest.questions.note).toMatchObject({ type: 'noul' });
    expect(options).toMatchObject({ retries: { strategy: 'none' } });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('honors an explicit OpenRouter model identifier', async () => {
    const create = vi.fn().mockResolvedValue({ answers: { note: { type: 'noul', noul: 1 } } });
    const client = { systemOne: { create } } as unknown as JevClient;
    const filter = createJevFilter({ client, model: ' typesafe/jev-1.13 ' });
    await filter.isNoteValid({ title: '标题', text: '正文' });
    expect(create.mock.calls[0]![0].decisionsRequest.model).toBe('typesafe/jev-1.13');
  });

  it('judges a complete comment and reply collection in one request and preserves valid originals', async () => {
    const { create, filter } = setup(vi.fn().mockResolvedValue({ answers: {
      comment_0: { type: 'noul', noul: 1 },
      comment_1: { type: 'noul', noul: 0 },
      comment_2: { type: 'noul', noul: 1 },
    } }));
    const items = [comment('真实评论'), comment('广告回复', true), comment('另一条真实回复', true)];
    await expect(filter.filterComments(items)).resolves.toEqual([items[0], items[2]]);
    expect(create).toHaveBeenCalledOnce();
    const [request] = create.mock.calls[0]!;
    expect(request.decisionsRequest.state).toEqual({ comments: [
      { id: 0, text: '真实评论', isReply: false },
      { id: 1, text: '广告回复', isReply: true },
      { id: 2, text: '另一条真实回复', isReply: true },
    ] });
    expect(Object.keys(request.decisionsRequest.questions)).toEqual(['comment_0', 'comment_1', 'comment_2']);
    expect(request.decisionsRequest.questions.comment_0.instructions).toContain('id 为 0');
    expect(request.decisionsRequest.questions.comment_1.instructions).toContain('id 为 1');
    expect(request.decisionsRequest.questions.comment_0.instructions).toContain('忽略其他评论');
    await expect(filter.filterComments([])).resolves.toEqual([]);
    expect(create).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing answers', { comment_0: { type: 'noul', noul: 1 } }],
    ['unexpected or out-of-range answers', {
      comment_0: { type: 'noul', noul: 1 }, comment_1: { type: 'noul', noul: 0 }, comment_2: { type: 'noul', noul: 1 },
    }],
    ['refusals', { comment_0: { type: 'noul', noul: 1 }, comment_1: { type: 'refusal' } }],
    ['non-boolean decisions', { comment_0: { type: 'noul', noul: 1 }, comment_1: { type: 'noul', noul: 0.5 } }],
    ['non-object answers', null],
  ])('fails closed for %s', async (_name, answers) => {
    const { filter } = setup(vi.fn().mockResolvedValue({ answers }));
    await expect(filter.filterComments([comment('一'), comment('二')])).rejects.toMatchObject({ code: 'aiFilterFormat' });
  });

  it('reports missing configuration and request failures without calling a client', async () => {
    const unconfigured = createJevFilter({ apiKey: ' ' });
    await expect(unconfigured.isNoteValid({ title: '标题', text: '正文' })).rejects.toMatchObject({ code: 'aiFilterUnavailable' });
    const { filter } = setup(vi.fn().mockRejectedValue(new Error('upstream unavailable')));
    await expect(filter.isNoteValid({ title: '标题', text: '正文' })).rejects.toMatchObject({ code: 'aiFilterFailed' });
  });

  it('distinguishes request timeouts from user cancellation', async () => {
    const pending = vi.fn().mockImplementation((_request, options) => new Promise((_, reject) => {
      if (options.signal.aborted) reject(options.signal.reason);
      else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const client = { systemOne: { create: pending } } as unknown as JevClient;
    const timed = createJevFilter({ client, requestTimeoutMs: 5 });
    await expect(timed.isNoteValid({ title: '标题', text: '正文' })).rejects.toMatchObject({ code: 'aiFilterTimeout' });

    pending.mockClear();
    const { create, filter } = setup(pending);
    const controller = new AbortController();
    const active = filter.isNoteValid({ title: '标题', text: '正文' }, controller.signal);
    controller.abort();
    await expect(active).rejects.toMatchObject({ name: 'AbortError' });
    expect(create).toHaveBeenCalledOnce();
  });
});
