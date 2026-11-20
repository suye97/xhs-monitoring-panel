import { cleanText, similarity } from './text.js';

const aliases = { 黄金: ['金价', '足金', '克价', '工费', '回收价', '金条', '金饰', '金店', '金价走势', '黄金首饰'] };

// 根据关键词与主题词计算文本相关度。
export function relevance(keyword, text, context = '') {
  const query = cleanText(keyword, 80).toLowerCase();
  const body = cleanText(text, 1000).toLowerCase();
  if (!query || !body) return 0;
  const direct = body.includes(query) ? 0.75 : 0;
  const related = (aliases[query] ?? []).reduce((score, term) => Math.max(score, body.includes(term) ? 0.62 : 0), 0);
  const lexical = similarity(query, body) * 0.65;
  const contextual = context && (body.includes('这个') || body.includes('这款') || body.includes('价格'))
    ? Math.min(0.15, relevance(query, context) * 0.2) : 0;
  return Math.min(1, Math.max(direct, related, lexical) + contextual);
}

// 按主题相关度排列候选笔记。
export function rankNotes(keyword, notes) {
  return [...notes].map(note => ({ note, score: relevance(keyword, `${note.title} ${note.text}`) }))
    .sort((a, b) => b.score - a.score).map(item => item.note);
}
