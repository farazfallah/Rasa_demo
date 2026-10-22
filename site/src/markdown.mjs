// تبدیل Markdown ساده به HTML برای مقاله‌های سایت (بدون وابستگی). پشتیبانی:
// ## و ### عنوان، پاراگراف، فهرست - و ۱.، **پررنگ**، [پیوند](/features/...)، `کد`،
// > نکته (کادر رنگی؛ خط اول **عنوان**)، ![متن جایگزین](/assets/...) و جدول | الف | ب |.
import { esc } from './layout.mjs';

/** front matter ساده: key: value و فهرست‌های key: [a, b] یا سطرهای - مقدار */
export function parseFrontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: src };
  const data = {};
  let listKey = null;
  for (const line of m[1].split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (raw === '') {
      data[key] = [];
      listKey = key;
    } else if (raw.startsWith('[')) {
      data[key] = raw.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
      listKey = null;
    } else {
      data[key] = unquote(raw);
      listKey = null;
    }
  }
  return { data, body: src.slice(m[0].length) };
}

const unquote = (s) => s.replace(/^["'](.*)["']$/, '$1');

/** متن درون خطی: پررنگ، پیوند و کد */
export function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const external = /^https?:/.test(href);
      return `<a href="${href}"${external ? ' rel="noopener"' : ''}>${label}</a>`;
    });
}

/** متن ساده (برای شمارش کلمه و خلاصه) */
export const plain = (md) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`|_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * تبدیل بدنه مقاله. خروجی: html، فهرست عنوان‌های h2 (برای فهرست مطالب)
 * و پرسش و پاسخ‌های بخش «پرسش‌های رایج» (برای FAQPage).
 */
export function renderMarkdown(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  const headings = [];
  const faq = [];
  let inFaq = false;
  let i = 0;
  let para = [];
  const flush = () => {
    if (para.length) {
      const text = para.join(' ');
      out.push(`<p>${inline(text)}</p>`);
      if (inFaq && faq.length) faq[faq.length - 1][1] = `${faq[faq.length - 1][1]} ${plain(text)}`.trim();
    }
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      i++;
      continue;
    }
    let m;
    if ((m = line.match(/^##\s+(.+)$/))) {
      flush();
      const id = `s${headings.length + 1}`;
      headings.push([id, m[1].trim()]);
      inFaq = /پرسش/.test(m[1]);
      out.push(`<h2 id="${id}">${inline(m[1].trim())}</h2>`);
      i++;
      continue;
    }
    if ((m = line.match(/^###\s+(.+)$/))) {
      flush();
      if (inFaq) faq.push([plain(m[1].trim()), '']);
      out.push(`<h3>${inline(m[1].trim())}</h3>`);
      i++;
      continue;
    }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      flush();
      out.push(`<figure><img src="${m[2]}" alt="${esc(m[1])}" loading="lazy" decoding="async"><figcaption>${esc(m[1])}</figcaption></figure>`);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*[0-9۰-۹]+[.)]\s+/.test(line)) {
      flush();
      const ordered = /^\s*[0-9۰-۹]+[.)]\s+/.test(line);
      const items = [];
      while (i < lines.length && (ordered ? /^\s*[0-9۰-۹]+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        items.push(lines[i].replace(ordered ? /^\s*[0-9۰-۹]+[.)]\s+/ : /^\s*[-*]\s+/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (line.startsWith('>')) {
      flush();
      const block = [];
      while (i < lines.length && lines[i].startsWith('>')) block.push(lines[i++].replace(/^>\s?/, ''));
      const [first, ...rest] = block;
      const title = first.match(/^\*\*(.+)\*\*$/);
      // سطر خالی «>» پاراگراف‌ها را جدا می‌کند
      const paras = (title ? rest : block).join('\n').split(/\n\s*\n/).map((t) => t.replace(/\n/g, ' ').trim()).filter(Boolean);
      out.push(`<aside class="note">${title ? `<b>${esc(title[1])}</b>` : ''}${paras.map((t) => `<p>${inline(t)}</p>`).join('')}</aside>`);
      continue;
    }
    if (line.startsWith('|')) {
      flush();
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [head, sep, ...body] = rows;
      const hasSep = sep && /^[\s|:-]+$/.test(sep);
      const bodyRows = hasSep ? body : rows.slice(1);
      out.push(
        `<div class="table-wrap"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${bodyRows
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return { html: out.join('\n'), headings, faq: faq.filter(([q, a]) => q && a) };
}
