import type {
  CaptureResult,
  CommentItem,
  CommentStats,
  MetricName,
  Note,
  Sentiment,
  SentimentCounts,
} from '../shared/types';

const LIMIT = 30;
const NOTE_PATH = /^\/(?:explore|discovery\/item|search_result)\/([a-f\d]{24})\/?$/i;
const NEGATIVE = /避雷|踩雷|差评|失望|退款|退货|翻车|糟糕|难用|难喝|难吃|太贵|被骗|欺骗|虚假宣传|过敏|质量差|服务差|异味|漏液|不推荐|不满意|不值得|不(?:太)?(?:喜欢|好用|好喝|好吃|会回购)|后悔|投诉|故障|崩溃/g;
const POSITIVE = /满意|推荐|喜欢|惊喜|好用|好喝|好吃|值得|回购|好评|性价比高|物超所值|支持|不错|很棒/g;

export type MonitorErrorCode = 'invalidKeyword' | 'invalidSource' | 'collectorUnavailable' | 'collectorBridge'
  | 'collectorLogin' | 'collectorBlocked' | 'collectorBusy' | 'collectorFailed' | 'collectorFormat'
  | 'collectorNoteLink' | 'timeout' | 'aiFilterUnavailable' | 'aiFilterFailed' | 'aiFilterTimeout'
  | 'aiFilterFormat' | 'searchFailed';

export class MonitorError extends Error {
  constructor(readonly code: MonitorErrorCode) {
    super(code);
    this.name = 'MonitorError';
  }
}

export function classify(title: string, text: string): { sentiment: Sentiment; signals: string[] } {
  const content = [title, text].filter(Boolean).join('。').normalize('NFKC');
  if (!content) return { sentiment: 'unknown', signals: [] };
  const cleaned = content.replace(/(?:没有|并无|并不|不会|没|不)(?:踩雷|翻车|失望|后悔|难用|难喝|难吃|糟糕|被骗)/g, '');
  const negative = [...new Set(cleaned.match(NEGATIVE) ?? [])];
  const positive = [...new Set(cleaned.replace(NEGATIVE, '').replace(/(?:没有|并不|不是|不)(?:满意|推荐|喜欢|值得|回购|错)/g, '').match(POSITIVE) ?? [])];
  if (negative.length && positive.length >= negative.length) return { sentiment: 'mixed', signals: [...negative, ...positive] };
  if (negative.length) return { sentiment: 'negative', signals: negative };
  if (positive.length) return { sentiment: 'positive', signals: positive };
  return { sentiment: 'neutral', signals: [] };
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim().slice(0, max) : '';
}

export function normalizeNoteUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url['password']
    || !['www.xiaohongshu.com', 'xiaohongshu.com'].includes(url.hostname) || !NOTE_PATH.test(url.pathname)) return null;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key !== 'xsec_token' && key !== 'xsec_source') url.searchParams.delete(key);
  }
  return url.href;
}

export function normalizeNotes(rows: unknown[]): Note[] {
  const notes = new Map<string, Note>();
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const input = row as Record<string, unknown>;
    const url = normalizeNoteUrl(input.url);
    if (!url) continue;
    const id = NOTE_PATH.exec(new URL(url).pathname)?.[1]?.toLowerCase();
    if (!id) continue;
    const title = clean(input.title, 180);
    const text = clean(input.text, 1000) || clean(input.snippet, 1000) || clean(input.summary, 1000);
    const metrics: Note['metrics'] = {};
    for (const key of ['likes', 'comments', 'saves', 'shares'] satisfies MetricName[]) {
      const value = input[key];
      if (Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000) metrics[key] = value as number;
    }
    const note: Note = { id, url, title, text, metrics, ...classify(title, text) };
    const previous = notes.get(id);
    if (!previous || Number(Boolean(title)) + Number(Boolean(text)) > Number(Boolean(previous.title)) + Number(Boolean(previous.text))) notes.set(id, note);
  }
  return [...notes.values()].slice(0, LIMIT);
}

export function summarize(notes: Note[]): CaptureResult['stats'] {
  const counts: SentimentCounts = { negative: 0, positive: 0, neutral: 0, mixed: 0, unknown: 0 };
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
  return {
    count: notes.length,
    counts,
    analyzed,
    negativeRatio: analyzed ? counts.negative / analyzed : null,
    interactions: interactionCoverage ? interactions : null,
    interactionCoverage,
  };
}

function analyzeCommentScans(notes: Note[]): CommentStats {
  const sampled = notes.filter(note => note.commentScan?.status === 'sampled');
  const counts: CommentStats['counts'] = { negative: 0, positive: 0, neutral: 0, mixed: 0 };
  for (const note of sampled) {
    note.commentScan!.items = note.commentScan!.items.map(item => {
      const classification = classify('', item.text);
      if (classification.sentiment !== 'unknown') counts[classification.sentiment]++;
      return { ...item, ...classification };
    });
  }
  const count = Object.values(counts).reduce((total, value) => total + value, 0);
  return {
    count,
    counts,
    sampledNotes: sampled.length,
    failedNotes: notes.filter(note => note.commentScan?.status === 'failed').length,
    skippedNotes: notes.filter(note => note.commentScan?.status === 'skipped').length,
    negativeRatio: count ? counts.negative / count : null,
  };
}

export type Collector = (keyword: string, signal?: AbortSignal) => Promise<{ notes: Note[]; limited: boolean }>;

export interface ValidityFilter {
  isNoteValid(note: Pick<Note, 'title' | 'text'>, signal?: AbortSignal): Promise<boolean>;
  filterComments(items: CommentItem[], signal?: AbortSignal): Promise<CommentItem[]>;
}

export function createMonitor({ collector, validityFilter, now = () => new Date() }: {
  collector: Collector;
  validityFilter: ValidityFilter;
  now?: () => Date;
}) {
  return async function search(input: { keyword?: unknown; source?: unknown }, parentSignal?: AbortSignal): Promise<CaptureResult> {
    const keyword = typeof input?.keyword === 'string' ? input.keyword.trim().normalize('NFKC') : '';
    if (!keyword || keyword.length > 80 || /[\p{Cc}]/u.test(keyword)) throw new MonitorError('invalidKeyword');
    if (input.source !== 'opencli') throw new MonitorError('invalidSource');
    if (!collector) throw new MonitorError('collectorUnavailable');
    const { notes, limited } = await collector(keyword, parentSignal);
    const validNotes: Note[] = [];
    for (const note of notes) {
      parentSignal?.throwIfAborted();
      if (!await validityFilter.isNoteValid(note, parentSignal)) continue;
      if (note.commentScan?.status === 'sampled' && note.commentScan.items.length) {
        note.commentScan.items = await validityFilter.filterComments(note.commentScan.items, parentSignal);
      }
      Object.assign(note, classify(note.title, note.text));
      validNotes.push(note);
    }
    const comments = analyzeCommentScans(validNotes);
    return { keyword, source: 'opencli', capturedAt: now().toISOString(), limited, stats: summarize(validNotes), comments, notes: validNotes };
  };
}
