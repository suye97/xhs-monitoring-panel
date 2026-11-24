import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { MonitorError, normalizeNotes, type Collector } from './monitor';

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));
// A child process needs a physical working directory outside the ASAR archive.
const childWorkingDirectory = /[\\/]app\.asar[\\/]/.test(moduleDirectory) ? process.resourcesPath : moduleDirectory;
const NOTE_LIMIT = 6;
const TOP_LIMIT = 10;
const COMMENT_LIMIT = 20;
const OUTPUT_LIMIT = 2 * 1024 * 1024;

type CliRow = Record<string, unknown>;
export type OpenCliRunner = (command: 'search' | 'comments' | 'note', options: string[], value: string, signal?: AbortSignal) => Promise<unknown[]>;

function cliRows(rows: unknown[]): CliRow[] {
  return rows.filter((row): row is CliRow => typeof row === 'object' && row !== null);
}

function failureCode(error: unknown): MonitorError['code'] {
  const cause = error as { code?: unknown; stdout?: unknown; stderr?: unknown; killed?: boolean };
  const diagnostic = `${cause?.code ?? ''}\n${cause?.stdout ?? ''}\n${cause?.stderr ?? ''}`;
  if (/SECURITY_BLOCK|CAPTCHA|RATE_LIMIT|TOO_MANY_REQUESTS/i.test(diagnostic)) return 'collectorBlocked';
  if (/AUTH_REQUIRED|requires login|not logged in|login required/i.test(diagnostic)) return 'collectorLogin';
  if (/BRIDGE_NOT_CONNECTED|BROWSER_(?:NOT_CONNECTED|CONNECT)|extension.*(?:connect|install)|no (?:browser|extension) connected|daemon.*(?:unavailable|not running)/i.test(diagnostic)) return 'collectorBridge';
  if (cause?.code === 'ENOENT') return 'collectorUnavailable';
  if (cause?.killed) return 'timeout';
  return 'collectorFailed';
}

export function createOpenCliRunner(entry = process.env.XHS_MONITOR_OPENCLI_ENTRY): OpenCliRunner {
  return async function run(command, options, value, signal) {
    signal?.throwIfAborted();
    let script = entry;
    try {
      script ||= require.resolve('@jackwener/opencli');
      if (!isAbsolute(script) || !/\.[cm]?js$/i.test(script)) throw new Error('absolute JavaScript entry required');
      const unpacked = script.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
      if (unpacked !== script && existsSync(unpacked)) script = unpacked;
    } catch { throw new MonitorError('collectorUnavailable'); }
    const executable = process.env.XHS_MONITOR_NODE_EXECUTABLE || (process.versions.electron ? 'node' : process.execPath);
    let stdout: string;
    try {
      const result = await execute(executable, [script, 'xiaohongshu', command, '-f', 'json', ...options, '--', value], {
        signal,
        timeout: 25_000,
        maxBuffer: OUTPUT_LIMIT,
        windowsHide: true,
        encoding: 'utf8',
        cwd: childWorkingDirectory,
        env: { ...process.env, OPENCLI_BROWSER_CONNECT_TIMEOUT: '8', OPENCLI_BROWSER_COMMAND_TIMEOUT: '22' },
      });
      stdout = result.stdout;
    } catch (error) {
      signal?.throwIfAborted();
      throw new MonitorError(failureCode(error));
    }
    try {
      const output: unknown = JSON.parse(stdout);
      const rows = typeof output === 'object' && output !== null && 'ok' in output && 'data' in output
        ? (output as { ok: unknown; data: unknown }).ok === true ? (output as { data: unknown }).data : output
        : output;
      if (!Array.isArray(rows)) throw new Error('expected rows');
      return rows;
    } catch { throw new MonitorError('collectorFormat'); }
  };
}

function parseCount(value: unknown): number | undefined {
  if (Number.isSafeInteger(value)) return value as number;
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+(?:\.\d+)?)\s*([万亿wk]?)$/iu.exec(value.trim().replaceAll(',', ''));
  if (!match?.[1]) return undefined;
  const factor = { '万': 10_000, '亿': 100_000_000, w: 10_000, k: 1000 }[match[2]?.toLowerCase() ?? ''] ?? 1;
  return Math.round(Number(match[1]) * factor);
}

function normalizeComments(rows: CliRow[]) {
  return rows.filter(row => typeof row.text === 'string' && row.text.trim())
    .slice(0, COMMENT_LIMIT).map(row => ({
      text: (row.text as string).trim().slice(0, 1000),
      isReply: row.is_reply === true,
      sentiment: 'unknown' as const,
      signals: [],
    }));
}

const stoppingErrors = new Set(['collectorBlocked', 'collectorLogin', 'collectorBridge', 'collectorUnavailable']);

export function createOpenCliCollector(run: OpenCliRunner = createOpenCliRunner()): Collector {
  let busy = false;
  return async function collect(keyword, parentSignal) {
    if (busy) throw new MonitorError('collectorBusy');
    busy = true;
    try {
      const budget = AbortSignal.timeout(100_000);
      const signal = parentSignal ? AbortSignal.any([parentSignal, budget]) : budget;
      let rows: CliRow[];
      try {
        rows = cliRows(await run('search', ['--limit', String(NOTE_LIMIT), '--sort', 'latest'], keyword, signal));
      } catch (error) {
        parentSignal?.throwIfAborted();
        if (budget.aborted) throw new MonitorError('timeout');
        throw error;
      }
      const notes = normalizeNotes(rows.map(row => ({ url: row.url, title: row.title, likes: parseCount(row.likes) }))).slice(0, NOTE_LIMIT);
      let halted: string | undefined;
      for (const note of notes) {
        parentSignal?.throwIfAborted();
        if (budget.aborted) halted ??= 'timeout';
        if (halted || !new URL(note.url!).searchParams.get('xsec_token')) {
          note.commentScan = { status: 'skipped', reason: halted ?? 'collectorNoteLink', items: [] };
          continue;
        }
        try {
          const comments = cliRows(await run('comments', ['--with-replies', '--limit', String(TOP_LIMIT)], note.url!, signal));
          const topCount = comments.filter(row => row.is_reply === false).length;
          note.commentScan = {
            status: 'sampled',
            items: normalizeComments(comments),
            limited: topCount >= TOP_LIMIT || comments.length >= COMMENT_LIMIT,
          };
        } catch (error) {
          parentSignal?.throwIfAborted();
          const reason = budget.aborted ? 'timeout' : error instanceof MonitorError ? error.code : 'collectorFailed';
          note.commentScan = { status: 'failed', reason, items: [] };
          if (budget.aborted || stoppingErrors.has(reason)) halted = reason;
        }
        if (halted) continue;
        try {
          const details = cliRows(await run('note', [], note.url!, signal));
          const fields = new Map(details.filter(row => typeof row.field === 'string').map(row => [row.field as string, row.value]));
          const title = fields.get('title');
          const content = fields.get('content');
          note.title = typeof title === 'string' && title.trim() ? title.trim().slice(0, 180) : note.title;
          note.text = typeof content === 'string' ? content.trim().slice(0, 1000) : '';
          for (const [field, key] of [['likes', 'likes'], ['comments', 'comments'], ['collects', 'saves'], ['shares', 'shares']] as const) {
            const count = parseCount(fields.get(field));
            if (Number.isSafeInteger(count) && count! >= 0 && count! <= 1_000_000_000) note.metrics[key] = count!;
          }
        } catch (error) {
          parentSignal?.throwIfAborted();
          note.detailError = budget.aborted ? 'timeout' : error instanceof MonitorError ? error.code : 'collectorFailed';
          if (budget.aborted || stoppingErrors.has(note.detailError)) halted = note.detailError;
        }
      }
      parentSignal?.throwIfAborted();
      return { notes, limited: rows.length >= NOTE_LIMIT };
    } finally { busy = false; }
  };
}
