const NEGATIVE = /避雷|踩雷|差评|失望|退款|退货|翻车|糟糕|难用|难喝|难吃|太贵|被骗|欺骗|虚假宣传|过敏|质量差|服务差|异味|漏液|不推荐|不满意|不值得|不(?:太)?(?:喜欢|好用|好喝|好吃|会回购)|后悔|投诉|故障|崩溃/g;
const POSITIVE = /满意|推荐|喜欢|惊喜|好用|好喝|好吃|值得|回购|好评|性价比高|物超所值|支持|不错|很棒/g;

// 根据中文词语规则估算笔记情绪。
export function classify(title, text) {
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
