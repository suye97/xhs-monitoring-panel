import { filterComment } from './filters.js';
import { normalizeComment } from './normalize.js';
import { rankNotes, relevance } from './relevance.js';

// 在取消信号生效时终止等待。
function pause(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(done, milliseconds);
    function done() { signal.removeEventListener('abort', cancel); resolve(); }
    function cancel() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener('abort', cancel, { once: true });
  });
}

// 扫描有限数量的评论页，保留每篇与全局最相关的评论。
export async function scanComments({ keyword, notes, fetchPage, signal, limit = 50, scanNotes = 6, qps = 1.5 }) {
  if (!fetchPage) return { status: 'unsupported', scannedNotes: 0, scannedRaw: 0, returned: 0, filtered: {}, items: [], truncated: false };
  const candidates = rankNotes(keyword, notes).slice(0, Math.min(10, scanNotes));
  const state = { status: 'ok', scannedNotes: 0, scannedRaw: 0, returned: 0, filtered: {}, items: [], truncated: false };
  const seenIds = new Set();
  const seenTexts = new Set();
  let nextRequest = 0;
  let stopped = false;
  const perNote = new Map();

  // 在并发工作者之间串行分配请求时隙。
  async function throttle() {
    const start = Math.max(Date.now(), nextRequest);
    nextRequest = start + 1000 / Math.max(0.5, Math.min(1.5, qps));
    await pause(Math.max(0, start - Date.now()), signal);
  }

  // 每篇最多读取三页、六十条原始评论。
  async function scan(note) {
    let cursor = '';
    let count = 0;
    const visited = new Set();
    state.scannedNotes++;
    try {
      for (let pageNumber = 0; pageNumber < 3 && count < 60 && state.scannedRaw < 600 && !stopped; pageNumber++) {
        signal.throwIfAborted();
        await throttle();
        let page;
        try { page = await fetchPage(note, cursor, signal); }
        catch (error) {
          if (error?.code !== 'rateLimited') throw error;
          await pause(1300, signal);
          await throttle();
          page = await fetchPage(note, cursor, signal);
        }
        if (!page || !Array.isArray(page.comments) || typeof page.hasMore !== 'boolean') throw Object.assign(new Error('upstreamChanged'), { code: 'upstreamChanged' });
        for (const row of page.comments.slice(0, 60 - count)) {
          if (state.scannedRaw >= 600) { state.truncated = true; break; }
          count++;
          state.scannedRaw++;
          const item = normalizeComment(row, note.id);
          if (!item || seenIds.has(item.id)) { state.filtered.invalidOrDuplicate = (state.filtered.invalidOrDuplicate ?? 0) + 1; continue; }
          seenIds.add(item.id);
          const reason = filterComment(item.text, seenTexts);
          if (reason) { state.filtered[reason] = (state.filtered[reason] ?? 0) + 1; continue; }
          item.relevance = Math.round(relevance(keyword, item.text, `${note.title} ${note.text}`) * 100);
          if (item.relevance < 45) { state.filtered.offTopic = (state.filtered.offTopic ?? 0) + 1; continue; }
          const bucket = perNote.get(note.id) ?? [];
          bucket.push(item);
          perNote.set(note.id, bucket);
        }
        if (!page.hasMore) break;
        if (typeof page.cursor !== 'string' || !page.cursor || visited.has(page.cursor) || page.cursor === cursor) { state.truncated = true; break; }
        visited.add(page.cursor);
        cursor = page.cursor;
        if (pageNumber === 2) state.truncated = true;
      }
    } catch (error) {
      signal.throwIfAborted();
      state.status = 'partial';
      if (['providerLoginRequired', 'signatureFailed', 'upstreamChanged'].includes(error?.code)) stopped = true;
    }
  }

  // 两个工作者共享限流器及总预算。
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(2, candidates.length) }, async () => {
    while (index < candidates.length && !stopped) await scan(candidates[index++]);
  }));
  const sorted = [...perNote.values()].map(bucket => bucket.sort((a, b) => b.relevance - a.relevance || b.likes - a.likes));
  const first = sorted.flatMap(bucket => bucket.slice(0, 15)).sort((a, b) => b.relevance - a.relevance || b.likes - a.likes);
  const remainder = sorted.flatMap(bucket => bucket.slice(15)).sort((a, b) => b.relevance - a.relevance || b.likes - a.likes);
  state.items = [...first, ...remainder].slice(0, limit);
  state.returned = state.items.length;
  state.truncated ||= first.length + remainder.length > limit;
  return state;
}
