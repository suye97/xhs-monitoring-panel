import { cleanText } from './text.js';

const contact = /(?:1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}|微信|微[\s._-]?信|加\s*[vVＶ]|vx|v信|https?:\/\/|www\.|[a-z\d.-]+\.(?:com|cn|net)\b)/iu;
const solicitation = /(?:私信|看主页|主页有|点头像|加我|联系我|领券|优惠券|招代理|招商|加盟|代购|批发|引流|进群|返佣|下单找我)/u;
const emojiOnly = /^(?:[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Variation_Selector}\s\p{P}])+$/u;

// 给出明确的过滤原因；未过滤时返回空值。
export function filterComment(value, seen) {
  const text = cleanText(value, 500);
  if (!text || emojiOnly.test(text)) return 'emptyOrEmoji';
  if (contact.test(text)) return 'contact';
  if (solicitation.test(text)) return 'promotion';
  const key = text.toLowerCase().replace(/[\p{P}\s]/gu, '');
  if (key.length < 4) return 'lowInformation';
  if (seen?.has(key)) return 'duplicate';
  seen?.add(key);
  return null;
}
