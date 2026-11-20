import { cleanText } from './text.js';

const NOTE_PATH = /^\/(?:explore|discovery\/item|search_result)\/([a-f\d]{24})\/?$/i;

// 校验笔记地址并限制可返回的字段。
export function normalizeNotes(rows, classify, limit = 30, preserveToken = false) {
  const notes = new Map();
  for (const row of rows) {
    if (typeof row?.url !== 'string' || row.url.length > 2048) continue;
    let url;
    try { url = new URL(row.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !['www.xiaohongshu.com', 'xiaohongshu.com'].includes(url.hostname)) continue;
    const match = NOTE_PATH.exec(url.pathname);
    if (!match) continue;
    const id = match[1].toLowerCase();
    url.hash = '';
    const token = preserveToken ? url.searchParams.get('xsec_token') : null;
    url.search = '';
    if (token) url.searchParams.set('xsec_token', token);
    const title = cleanText(row.title, 180);
    const text = cleanText(row.text || row.snippet || row.summary, 1000);
    const metrics = {};
    for (const key of ['likes', 'comments', 'saves', 'shares']) {
      if (Number.isSafeInteger(row[key]) && row[key] >= 0 && row[key] <= 1_000_000_000) metrics[key] = row[key];
    }
    const note = { id, url: url.href, title, text, metrics, ...classify(title, text) };
    const prior = notes.get(id);
    if (!prior || Number(Boolean(title)) + Number(Boolean(text)) > Number(Boolean(prior.title)) + Number(Boolean(prior.text))) notes.set(id, note);
  }
  return [...notes.values()].slice(0, limit);
}

// 对评论执行字段白名单与长度限制。
export function normalizeComment(row, noteId) {
  const id = String(row?.id ?? row?.comment_id ?? '').slice(0, 80);
  const text = cleanText(row?.text ?? row?.content, 500);
  if (!id || !text) return null;
  return { id, noteId, text, likes: Number.isSafeInteger(row?.likes) && row.likes >= 0 ? Math.min(row.likes, 1_000_000_000) : 0 };
}
