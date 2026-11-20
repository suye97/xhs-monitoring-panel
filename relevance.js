import { cleanText, similarity } from './text.js';

const aliases = { 黄金: ['金价', '足金', '克价', '工费', '回收价', '金条', '金饰', '金店', '金价走势', '黄金首饰'] };

// 结合关键词、同义词和帖文上下文计算相关度。
export function relevance(keyword, text, context = '') {
  const query = cleanText(keyword, 80).toLowerCase();
  const body = cleanText(text, 1000).toLowerCase();
  if (!query || !body) return 0;
  const direct = body.includes(query) ? 0.75 : 0;
  const related = (aliases[query] ?? []).reduce((score, term) => Math.max(score, body.includes(term) ? 0.62 : 0), 0);
  const lexical = similarity(query, body) * 0.65;
  const contextual = context && /这个|这款|价格|买了|同款/u.test(body)
    ? Math.min(0.15, relevance(query, context) * 0.2) : 0;
  return Math.min(1, Math.max(direct, related, lexical) + contextual);
}
