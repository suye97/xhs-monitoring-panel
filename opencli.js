import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { MonitorError, normalizeNotes } from './monitor.js';

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const NOTE_LIMIT = 6;
const TOP_LIMIT = 10;
const COMMENT_LIMIT = 20;
const OUTPUT_LIMIT = 2 * 1024 * 1024;

function failureCode(error) {
  const diagnostic = `${error?.code ?? ''}\n${error?.stdout ?? ''}\n${error?.stderr ?? ''}`;
  if (/SECURITY_BLOCK|CAPTCHA|RATE_LIMIT|TOO_MANY_REQUESTS/i.test(diagnostic)) return 'collectorBlocked';
  if (/AUTH_REQUIRED|requires login|not logged in|login required/i.test(diagnostic)) return 'collectorLogin';
  if (/BRIDGE_NOT_CONNECTED|BROWSER_(?:NOT_CONNECTED|CONNECT)|extension.*(?:connect|install)|no (?:browser|extension) connected|daemon.*(?:unavailable|not running)/i.test(diagnostic)) return 'collectorBridge';
  if (error?.code === 'ENOENT') return 'collectorUnavailable';
  if (error?.killed) return 'timeout';
  return 'collectorFailed';
}

export function createOpenCliRunner(entry = process.env.XHS_MONITOR_OPENCLI_ENTRY) {
  return async function run(command, options, value, signal) {
    signal?.throwIfAborted();
    let script = entry;
    try {
      script ||= require.resolve('@jackwener/opencli');
      if (!isAbsolute(script) || !/\.[cm]?js$/i.test(script)) throw new Error('absolute JavaScript entry required');
    } catch { throw new MonitorError('collectorUnavailable', 503); }
    const executable = process.env.XHS_MONITOR_NODE_EXECUTABLE || (process.versions.electron ? 'node' : process.execPath);
    let stdout;
    try {
      ({ stdout } = await execute(executable, [script, 'xiaohongshu', command, '-f', 'json', ...options, '--', value], {
        signal, timeout: 25_000, maxBuffer: OUTPUT_LIMIT, windowsHide: true,
        cwd: new URL('.', import.meta.url),
        env: { ...process.env, OPENCLI_BROWSER_CONNECT_TIMEOUT: '8', OPENCLI_BROWSER_COMMAND_TIMEOUT: '22' },
      }));
    } catch (error) {
      signal?.throwIfAborted();
      throw new MonitorError(failureCode(error));
    }
    try {
      const output = JSON.parse(stdout);
      const rows = output?.ok === true ? output.data : output;
      if (!Array.isArray(rows)) throw new Error('expected rows');
      return rows;
    } catch { throw new MonitorError('collectorFormat'); }
  };
}

function parseCount(value) {
  if (Number.isSafeInteger(value)) return value;
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+(?:\.\d+)?)\s*([万亿wk]?)$/iu.exec(value.trim().replaceAll(',', ''));
  if (!match) return undefined;
  const factor = { '万': 10_000, '亿': 100_000_000, w: 10_000, k: 1000 }[match[2].toLowerCase()] ?? 1;
  return Math.round(Number(match[1]) * factor);
}

function normalizeComments(rows) {
  return rows.filter(row => typeof row?.text === 'string' && row.text.trim())
    .slice(0, COMMENT_LIMIT).map(row => ({ text: row.text.trim().slice(0, 1000), isReply: row.is_reply === true }));
}

const stoppingErrors = new Set(['collectorBlocked', 'collectorLogin', 'collectorBridge', 'collectorUnavailable']);

export function createOpenCliCollector(run = createOpenCliRunner()) {
  let busy = false;
  return async function collect(keyword, parentSignal) {
    if (busy) throw new MonitorError('collectorBusy', 409);
    busy = true;
    try {
      const budget = AbortSignal.timeout(100_000);
      const signal = parentSignal ? AbortSignal.any([parentSignal, budget]) : budget;
      let rows;
      try {
        rows = await run('search', ['--limit', String(NOTE_LIMIT), '--sort', 'latest'], keyword, signal);
      } catch (error) {
        parentSignal?.throwIfAborted();
        if (budget.aborted) throw new MonitorError('timeout', 504);
        throw error;
      }
      const notes = normalizeNotes(rows.map(row => ({ url: row?.url, title: row?.title, likes: parseCount(row?.likes) }))).slice(0, NOTE_LIMIT);
      let halted;
      for (const note of notes) {
        parentSignal?.throwIfAborted();
        if (budget.aborted) halted ??= 'timeout';
        if (halted || !new URL(note.url).searchParams.get('xsec_token')) {
          note.commentScan = { status: 'skipped', reason: halted ?? 'collectorNoteLink', items: [] };
          continue;
        }
        try {
          const comments = await run('comments', ['--with-replies', '--limit', String(TOP_LIMIT)], note.url, signal);
          const topCount = comments.filter(row => row?.is_reply === false).length;
          note.commentScan = { status: 'sampled', items: normalizeComments(comments),
            limited: topCount >= TOP_LIMIT || comments.length >= COMMENT_LIMIT };
        } catch (error) {
          parentSignal?.throwIfAborted();
          const reason = budget.aborted ? 'timeout' : error?.code ?? 'collectorFailed';
          note.commentScan = { status: 'failed', reason, items: [] };
          if (budget.aborted || stoppingErrors.has(reason)) halted = reason;
        }
        if (halted) continue;
        try {
          const details = await run('note', [], note.url, signal);
          const fields = new Map(details.filter(row => typeof row?.field === 'string').map(row => [row.field, row.value]));
          note.title = typeof fields.get('title') === 'string' && fields.get('title').trim() ? fields.get('title').trim().slice(0, 180) : note.title;
          note.text = typeof fields.get('content') === 'string' ? fields.get('content').trim().slice(0, 1000) : '';
          for (const [field, key] of [['likes', 'likes'], ['comments', 'comments'], ['collects', 'saves'], ['shares', 'shares']]) {
            const count = parseCount(fields.get(field));
            if (Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000_000) note.metrics[key] = count;
          }
        } catch (error) {
          parentSignal?.throwIfAborted();
          note.detailError = budget.aborted ? 'timeout' : error?.code ?? 'collectorFailed';
          if (budget.aborted || stoppingErrors.has(note.detailError)) halted = note.detailError;
        }
      }
      parentSignal?.throwIfAborted();
      return { notes, limited: rows.length >= NOTE_LIMIT };
    } finally { busy = false; }
  };
}
