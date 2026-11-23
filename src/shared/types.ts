export type Sentiment = 'negative' | 'positive' | 'neutral' | 'mixed' | 'unknown';
export type MetricName = 'likes' | 'comments' | 'saves' | 'shares';

export interface Note {
  id: string;
  url: string | null;
  title: string;
  text: string;
  metrics: Partial<Record<MetricName, number>>;
  sentiment: Sentiment;
  signals: string[];
  detailError?: string;
  commentScan?: CommentScan;
}

export interface CommentItem {
  text: string;
  isReply: boolean;
  sentiment: Sentiment;
  signals: string[];
}

export interface CommentScan {
  status: 'sampled' | 'failed' | 'skipped';
  reason?: string;
  items: CommentItem[];
  limited?: boolean;
}

export interface SentimentCounts {
  negative: number;
  positive: number;
  neutral: number;
  mixed: number;
  unknown: number;
}

export interface CaptureStats {
  count: number;
  counts: SentimentCounts;
  analyzed: number;
  negativeRatio: number | null;
  interactions: number | null;
  interactionCoverage: number;
}

export interface CommentStats {
  count: number;
  counts: Omit<SentimentCounts, 'unknown'>;
  sampledNotes: number;
  failedNotes: number;
  skippedNotes: number;
  negativeRatio: number | null;
}

export interface CaptureResult {
  keyword: string;
  source: 'opencli';
  capturedAt: string;
  limited: boolean;
  stats: CaptureStats;
  comments: CommentStats;
  notes: Note[];
}

export interface CaptureRecord extends CaptureResult {
  id: string;
}

export interface CaptureSummary {
  id: string;
  keyword: string;
  source: 'opencli';
  capturedAt: string;
  limited: boolean;
  stats: CaptureStats;
  comments: CommentStats;
}

export type ErrorCode =
  | 'invalidKeyword'
  | 'invalidSource'
  | 'collectorUnavailable'
  | 'collectorBridge'
  | 'collectorLogin'
  | 'collectorBlocked'
  | 'collectorBusy'
  | 'collectorFailed'
  | 'collectorFormat'
  | 'collectorNoteLink'
  | 'timeout'
  | 'scanCanceled'
  | 'searchFailed';

export type CaptureResponse =
  | { ok: true; record: CaptureRecord }
  | { ok: false; error: ErrorCode };

export interface MonitorApi {
  search(keyword: string): Promise<CaptureResponse>;
  cancel(): Promise<void>;
  listHistory(): Promise<CaptureSummary[]>;
  getHistory(id: string): Promise<CaptureRecord | null>;
  openNote(url: string): Promise<void>;
}

export const IPC_CHANNELS = {
  search: 'xhs-monitor:search',
  cancel: 'xhs-monitor:cancel',
  listHistory: 'xhs-monitor:list-history',
  getHistory: 'xhs-monitor:get-history',
  openNote: 'xhs-monitor:open-note',
} as const;
