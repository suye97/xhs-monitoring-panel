// 统一清洗文本，避免全角字符与多余空白影响匹配。
export function cleanText(value, limit = 1000) {
  return typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, limit) : '';
}

// 将文本拆成相邻双字，供短文本相关度计算。
export function bigrams(value) {
  const text = cleanText(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const parts = new Set();
  for (let index = 0; index < text.length - 1; index++) parts.add(text.slice(index, index + 2));
  return parts;
}

// 计算两个文本的双字 Jaccard 相似度。
export function similarity(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const part of a) if (b.has(part)) shared++;
  return shared / (a.size + b.size - shared);
}
