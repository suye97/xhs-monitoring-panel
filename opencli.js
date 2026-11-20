import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { MonitorError } from './monitor.js';
import { normalizeNotes } from './normalize.js';
import { classify } from './sentiment.js';
import { cleanText } from './text.js';
import { filterComment } from './filters.js';
import { relevance } from './relevance.js';

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const NOTE_LIMIT = 6;
const COMMENT_LIMIT = 50;
const OUTPUT_LIMIT = 8 * 1024 * 1024;

// 将 OpenCLI 与 Bridge 错误约束为可显示的原因码。
function failureCode(error) {
  const diagnostic = `${error?.code ?? ''}\n${error?.stdout ?? ''}\n${error?.stderr ?? ''}`;
  if (/SECURITY_BLOCK|CAPTCHA|RATE_LIMIT|TOO_MANY_REQUESTS/i.test(diagnostic)) return 'collectorBlocked';
  if (/AUTH_REQUIRED|requires login|not logged in|login required/i.test(diagnostic)) return 'collectorLogin';
  if (/BRIDGE_NOT_CONNECTED|BROWSER_(?:NOT_CONNECTED|CONNECT)|extension.*(?:connect|install)|no (?:browser|extension) connected|daemon.*(?:unavailable|not running)/i.test(diagnostic)) return 'collectorBridge';
  if (error?.code === 'ENOENT') return 'collectorUnavailable';
  if (error?.killed || error?.code === 'ETIMEDOUT') return 'timeout';
  return 'collectorFailed';
}

// 以独立进程调用固定版本的 OpenCLI 搜索命令。
export function createOpenCliRunner(entry = process.env.XHS_MONITOR_OPENCLI_ENTRY) {
  return async function run(command, options, value, signal) {
    signal?.throwIfAborted();
    let script = entry;
    try {
      script ||= require.resolve('@jackwener/opencli');
      if (!isAbsolute(script) || !/\.[cm]?js$/i.test(script)) throw new Error('entry');
    } catch { throw new MonitorError('collectorUnavailable', 503); }
    const executable = process.env.XHS_MONITOR_NODE_EXECUTABLE || (process.versions.electron ? 'node' : process.execPath);
    try {
      const { stdout } = await execute(executable, [script, 'xiaohongshu', command, '-f', 'json', '--window', 'foreground',
        '--site-session', 'persistent', ...options, '--', value], {
        signal, timeout: 90_000, maxBuffer: OUTPUT_LIMIT, windowsHide: true,
        env: { ...process.env, OPENCLI_BROWSER_CONNECT_TIMEOUT: '8', OPENCLI_BROWSER_COMMAND_TIMEOUT: '50' },
      });
      const output = JSON.parse(stdout);
      const rows = output?.ok === true ? output.data : output;
      if (!Array.isArray(rows)) throw new MonitorError('collectorFormat');
      return rows;
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof MonitorError) throw error;
      throw new MonitorError(failureCode(error));
    }
  };
}

// 在独立进程内使用同一 Bridge 页面的只读详情适配器。
export function createDetailRunner() {
  return async function read(url, signal) {
    const executable = process.env.XHS_MONITOR_NODE_EXECUTABLE || (process.versions.electron ? 'node' : process.execPath);
    try {
      const { stdout } = await execute(executable, [fileURLToPath(new URL('./opencli-detail.js', import.meta.url)), url], {
        signal, timeout: 180_000, maxBuffer: OUTPUT_LIMIT, windowsHide: true,
        env: { ...process.env, OPENCLI_BROWSER_CONNECT_TIMEOUT: '8', OPENCLI_BROWSER_COMMAND_TIMEOUT: '150' },
      });
      const data = JSON.parse(stdout);
      if (!data?.note || !Array.isArray(data.comments)) throw new MonitorError('collectorFormat');
      return data;
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof MonitorError) throw error;
      throw new MonitorError(failureCode(error));
    }
  };
}

// 解析页面中的中文缩写互动数。
function parseCount(value) {
  if (Number.isSafeInteger(value)) return value;
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+(?:\.\d+)?)\s*([万亿wk]?)$/iu.exec(value.trim().replaceAll(',', ''));
  if (!match) return undefined;
  const factor = { 万: 10_000, 亿: 100_000_000, w: 10_000, k: 1000 }[match[2].toLowerCase()] ?? 1;
  return Math.round(Number(match[1]) * factor);
}

// 先过滤并排序，再截取每篇最相关的五十条评论及回复。
function selectComments(keyword, note, rows, commentTotal) {
  const filtered = {};
  const seen = new Set();
  const ranked = [];
  for (const [order, row] of rows.entries()) {
    const text = cleanText(row?.text, 500);
    const reason = filterComment(text, seen);
    if (reason) { filtered[reason] = (filtered[reason] ?? 0) + 1; continue; }
    const score = Math.round(100 * relevance(keyword, text, `${note.title} ${note.text}`));
    if (score < 45) { filtered.offTopic = (filtered.offTopic ?? 0) + 1; continue; }
    ranked.push({ id: String(row.rank ?? order + 1), text, likes: parseCount(row.likes) ?? 0,
      isReply: row.is_reply === true, relevance: score, order });
  }
  ranked.sort((a, b) => b.relevance - a.relevance || b.likes - a.likes || a.order - b.order);
  const limited = ranked.length > COMMENT_LIMIT || rows.filter(row => !row.is_reply).length >= 75 ||
    (typeof commentTotal === 'number' && commentTotal > rows.length);
  return { status: 'sampled', items: ranked.slice(0, COMMENT_LIMIT), scannedRaw: rows.length,
    filtered, limited, reason: ranked.length < COMMENT_LIMIT ? 'insufficientRelevant' : limited ? 'candidateLimit' : null };
}

const stoppingErrors = new Set(['collectorBlocked', 'collectorLogin', 'collectorBridge', 'collectorUnavailable']);

// 搜索综合排序笔记并逐篇只打开一次详情。
export function createOpenCliCollector(run = createOpenCliRunner(), detail = createDetailRunner()) {
  let busy = false;
  return async function collect(keyword, parentSignal) {
    if (busy) throw new MonitorError('collectorBusy', 409);
    busy = true;
    try {
      const budget = AbortSignal.timeout(600_000);
      const signal = parentSignal ? AbortSignal.any([parentSignal, budget]) : budget;
      const rows = await run('search', ['--limit', String(NOTE_LIMIT * 2), '--sort', 'comprehensive'], keyword, signal);
      const notes = normalizeNotes(rows.map(row => ({ url: row?.url, title: row?.title, likes: parseCount(row?.likes) })),
        classify, NOTE_LIMIT * 2, true).filter(note => !note.title || relevance(keyword, note.title) >= 0.45).slice(0, NOTE_LIMIT);
      let halted;
      for (const [index, note] of notes.entries()) {
        parentSignal?.throwIfAborted();
        if (index && !halted) await pause(4_000 + Math.floor(Math.random() * 3_000), undefined, { signal });
        if (budget.aborted) halted ??= 'timeout';
        if (halted || !new URL(note.url).searchParams.get('xsec_token')) {
          note.commentScan = { status: 'skipped', reason: halted ?? 'collectorNoteLink', items: [] };
          continue;
        }
        try {
          const data = await detail(note.url, signal);
          note.title = cleanText(data.note.title, 180) || note.title;
          note.text = cleanText(data.note.desc, 1000);
          for (const [field, key] of [['likes', 'likes'], ['comments', 'comments'], ['collects', 'saves'], ['shares', 'shares']]) {
            const count = parseCount(data.note[field]);
            if (Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000_000) note.metrics[key] = count;
          }
          Object.assign(note, classify(note.title, note.text));
          note.commentScan = data.commentError
            ? { status: 'failed', reason: failureCode({ code: data.commentError }), items: [] }
            : selectComments(keyword, note, data.comments, data.commentTotal);
        } catch (error) {
          parentSignal?.throwIfAborted();
          const reason = budget.aborted ? 'timeout' : error?.code ?? 'collectorFailed';
          note.detailError = reason;
          note.commentScan = { status: 'failed', reason, items: [] };
          if (budget.aborted || stoppingErrors.has(reason)) halted = reason;
        }
      }
      for (const note of notes) {
        const publicUrl = new URL(note.url);
        publicUrl.search = '';
        note.url = publicUrl.href;
      }
      parentSignal?.throwIfAborted();
      return { notes, limited: rows.length >= NOTE_LIMIT * 2 };
    } finally { busy = false; }
  };
}
