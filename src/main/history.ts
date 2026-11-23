import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CaptureRecord, CaptureResult, CaptureSummary, Note } from '../shared/types';

const MAX_RECORDS = 80;
const sentiments = new Set(['negative', 'positive', 'neutral', 'mixed', 'unknown']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStats(value: unknown): boolean {
  if (!isObject(value) || !isObject(value.counts)) return false;
  const counts = value.counts;
  return ['count', 'analyzed', 'interactionCoverage'].every(key => isFiniteNumber(value[key]))
    && ['negative', 'positive', 'neutral', 'mixed', 'unknown'].every(key => isFiniteNumber(counts[key]))
    && (value.negativeRatio === null || isFiniteNumber(value.negativeRatio))
    && (value.interactions === null || isFiniteNumber(value.interactions));
}

function isCommentStats(value: unknown): boolean {
  if (!isObject(value) || !isObject(value.counts)) return false;
  const counts = value.counts;
  return ['count', 'sampledNotes', 'failedNotes', 'skippedNotes'].every(key => isFiniteNumber(value[key]))
    && ['negative', 'positive', 'neutral', 'mixed'].every(key => isFiniteNumber(counts[key]))
    && (value.negativeRatio === null || isFiniteNumber(value.negativeRatio));
}

function isNote(value: unknown): value is Note {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.text !== 'string'
    || (value.url !== null && typeof value.url !== 'string') || !isObject(value.metrics)
    || typeof value.sentiment !== 'string' || !sentiments.has(value.sentiment)
    || !Array.isArray(value.signals) || !value.signals.every(signal => typeof signal === 'string')) return false;
  if (value.commentScan === undefined) return true;
  if (!isObject(value.commentScan) || !['sampled', 'failed', 'skipped'].includes(value.commentScan.status as string)
    || !Array.isArray(value.commentScan.items)) return false;
  return value.commentScan.items.every(item => isObject(item) && typeof item.text === 'string'
    && typeof item.isReply === 'boolean' && typeof item.sentiment === 'string' && sentiments.has(item.sentiment)
    && Array.isArray(item.signals) && item.signals.every(signal => typeof signal === 'string'));
}

function isCaptureRecord(value: unknown): value is CaptureRecord {
  if (!isObject(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 100
    && typeof value.keyword === 'string' && value.keyword.length > 0 && value.keyword.length <= 80
    && value.source === 'opencli' && typeof value.capturedAt === 'string' && Number.isFinite(Date.parse(value.capturedAt))
    && typeof value.limited === 'boolean' && isStats(value.stats) && isCommentStats(value.comments)
    && Array.isArray(value.notes) && value.notes.length <= 6 && value.notes.every(isNote);
}

function toSummary(record: CaptureRecord): CaptureSummary {
  const { id, keyword, source, capturedAt, limited, stats, comments } = record;
  return { id, keyword, source, capturedAt, limited, stats, comments };
}

export class HistoryStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly filePath: string) {}

  private async read(): Promise<CaptureRecord[]> {
    try {
      const data: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (!isObject(data) || data.version !== 1 || !Array.isArray(data.records)) return [];
      return data.records.filter(isCaptureRecord).slice(0, MAX_RECORDS) as CaptureRecord[];
    } catch { return []; }
  }

  private async write(records: CaptureRecord[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, records }), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.filePath);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  async list(): Promise<CaptureSummary[]> {
    return structuredClone((await this.read()).map(toSummary));
  }

  async get(id: string): Promise<CaptureRecord | null> {
    if (typeof id !== 'string' || !id || id.length > 100) return null;
    const record = (await this.read()).find(item => item.id === id);
    return record ? structuredClone(record) : null;
  }

  async add(result: CaptureResult): Promise<CaptureRecord> {
    const operation = this.queue.catch(() => {}).then(async () => {
      const record: CaptureRecord = { ...structuredClone(result), id: randomUUID() };
      await this.write([record, ...(await this.read())].slice(0, MAX_RECORDS));
      return record;
    });
    this.queue = operation.then(() => {});
    return operation;
  }
}
