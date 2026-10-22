// مقاله‌های راهنما از فایل‌های Markdown در site/content/guides ساخته می‌شوند (راهنمای نوشتن: site/CONTENT.md).
// هر مقاله پیش از ساخت بررسی می‌شود؛ اگر قاعده‌ای رعایت نشده باشد ساخت سایت خطا می‌دهد.
import { readdirSync, readFileSync } from 'node:fs';
import { breadcrumbLd, breadcrumbs, CTA, esc, faqLd, icon, SITE } from './layout.mjs';
import { parseFrontMatter, plain, renderMarkdown } from './markdown.mjs';

const DIR = new URL('../content/guides/', import.meta.url);
const SUFFIX = ' | سامانه رسا';
const SHOTS = new URL('../assets/shots/', import.meta.url);

export const faDate = (iso) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
const faNum = (n) => n.toLocaleString('fa-IR');

function load() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const { data, body } = parseFrontMatter(readFileSync(new URL(file, DIR), 'utf8'));
      const { html, headings, faq } = renderMarkdown(body);
      const text = plain(body);
      const words = text.split(/\s+/).filter(Boolean).length;
      const firstPara = body.split(/\n\s*\n/).find((b) => b.trim() && !/^[#>|!-]/.test(b.trim())) ?? '';
      return {
        file,
        slug: file.replace(/\.md$/, ''),
        title: data.title ?? '',
        h1: data.h1 ?? data.title ?? '',
        description: data.description ?? '',
        keyword: data.keyword ?? '',
        date: data.date ?? '',
        updated: data.updated || data.date || '',
        image: data.image || 'dashboard',
        related: data.related ?? [],
        features: data.features ?? [],
        lead: plain(firstPara),
        body,
        html,
        headings,
        faq,
        words,
        minutes: Math.max(1, Math.round(words / 200)),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export const ARTICLES = load();
const bySlug = new Map(ARTICLES.map((a) => [a.slug, a]));

/** مقاله‌هایی که در front matter به یک صفحه امکانات اشاره کرده‌اند */
export const guidesFor = (featureSlug) => ARTICLES.filter((a) => a.features.includes(featureSlug));

/** قاعده‌های نوشتن (CONTENT.md)؛ خروجی فهرست اشکال‌ها است */
export function checkArticles(featureSlugs) {
  const problems = [];
  const has = (s, k) => s.replace(/‌/g, ' ').includes(k.replace(/‌/g, ' '));
  for (const a of ARTICLES) {
    const p = (msg) => problems.push(`content/guides/${a.file}: ${msg}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) p('نام فایل فقط حروف کوچک انگلیسی، عدد و خط تیره');
    for (const k of ['title', 'h1', 'description', 'keyword', 'date']) if (!a[k]) p(`${k} ندارد`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !/^\d{4}-\d{2}-\d{2}$/.test(a.updated)) p('date/updated به شکل 2026-10-22');
    const full = a.title + SUFFIX;
    if (full.length > 70) p(`عنوان با «${SUFFIX.trim()}» ${full.length} حرف است (حداکثر ۷۰)`);
    if (a.description.length < 110 || a.description.length > 165) p(`description ${a.description.length} حرف است (۱۱۰ تا ۱۶۵)`);
    if (a.words < 700) p(`${a.words} کلمه (حداقل ۷۰۰)`);
    if (a.headings.length < 3) p('کمتر از ۳ عنوان ##');
    if (a.keyword) {
      for (const [k, v] of [
        ['عنوان', a.title],
        ['h1', a.h1],
        ['description', a.description],
        ['پاراگراف اول', a.lead],
      ])
        if (!has(v, a.keyword)) p(`کلیدواژه «${a.keyword}» در ${k} نیامده`);
    }
    const internal = new Set([...a.body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]));
    if (internal.size < 2) p('کمتر از ۲ پیوند داخلی (مثلا به /features/... یا راهنمای دیگر)');
    for (const href of internal) {
      const g = href.match(/^\/guides\/(.+)$/);
      if (g && !bySlug.has(g[1])) p(`پیوند به راهنمای ناموجود ${href}`);
      const f = href.match(/^\/features\/([^#]+)/);
      if (f && !featureSlugs.includes(f[1])) p(`پیوند به امکان ناموجود ${href}`);
    }
    for (const m of a.body.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) if (!m[1].trim()) p(`تصویر بدون متن جایگزین: ${m[2]}`);
    for (const r of a.related) if (!bySlug.has(r)) p(`related ناموجود: ${r}`);
    for (const f of a.features) if (!featureSlugs.includes(f)) p(`features ناموجود: ${f}`);
    try {
      readFileSync(new URL(`${a.image}.jpg`, SHOTS));
    } catch {
      p(`تصویر ${a.image}.jpg در assets/shots نیست`);
    }
    // قالب Caddy هر {{ را دستور می‌داند
    if (a.body.includes('{{')) p('«{{» در متن مجاز نیست');
  }
  return problems;
}

const card = (a, tag = 'h2') => `<a class="feature-card guide-card" href="/guides/${a.slug}">
      <span class="guide-meta"><span>${faDate(a.updated)}</span><span>${faNum(a.minutes)} دقیقه مطالعه</span></span>
      <${tag}>${esc(a.h1)}</${tag}>
      <p>${esc(a.description)}</p>
      <span class="more">خواندن راهنما ${icon('arrow')}</span>
    </a>`;

/** کارت‌های راهنما برای صفحه خانه و صفحه‌های امکانات */
export const guideCards = (list, tag = 'h3') => list.map((a) => card(a, tag)).join('\n');

export function articlePage(a) {
  const path = `/guides/${a.slug}`;
  const trail = [
    ['/', 'خانه'],
    ['/guides', 'راهنماها'],
    [path, a.h1],
  ];
  const related = (a.related.length ? a.related.map((s) => bySlug.get(s)) : ARTICLES.filter((x) => x !== a).slice(0, 3)).filter(Boolean);
  const toc = a.headings.map(([id, h]) => `<li><a href="#${id}">${esc(h)}</a></li>`).join('');
  // بخش پرسش‌ها به شکل بازشونده، مثل صفحه‌های امکانات
  const html = a.html.replace(/(<h2 id="s\d+">[^<]*پرسش[\s\S]*?<\/h2>)([\s\S]*?)(?=<h2 |$)/, (_, h, rest) => {
    const items = [...rest.matchAll(/<h3>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3>|$)/g)].map(([, q, ans]) => `<details><summary>${q}</summary>${ans.trim()}</details>`);
    return `<section class="faq">${h}\n${items.join('\n')}</section>\n`;
  });
  const body = `
  <section class="page-hero compact">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="container narrow">
      ${breadcrumbs(trail)}
      <h1>${esc(a.h1)}</h1>
      <p class="guide-meta">
        <span>به‌روزرسانی: <time datetime="${a.updated}">${faDate(a.updated)}</time></span>
        <span>${faNum(a.minutes)} دقیقه مطالعه</span>
      </p>
    </div>
  </section>
  <div class="container article-layout">
    <aside class="toc" aria-label="فهرست این راهنما">
      <b>در این راهنما</b>
      <ol>${toc}</ol>
    </aside>
    <article class="prose article">
      ${html}
      <aside class="note">
        <b>نسخه نمایشی رایگان</b>
        <p>آنچه در این راهنما آمده را می‌توانید در نسخه نمایشی رسا، با اطلاعات یک مدرسه نمونه و از نگاه مدیر، معلم، ولی و دانش‌آموز امتحان کنید. <a href="/demo">درخواست دمو</a></p>
      </aside>
    </article>
  </div>
  ${
    related.length
      ? `<section class="section section-tint">
    <div class="container">
      <div class="head center"><h2>راهنماهای مرتبط</h2></div>
      <div class="feature-grid">${guideCards(related)}</div>
    </div>
  </section>`
      : ''
  }
  ${CTA}`;
  const schema = [
    breadcrumbLd(trail),
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: a.h1,
      description: a.description,
      datePublished: a.date,
      dateModified: a.updated,
      wordCount: a.words,
      inLanguage: 'fa-IR',
      mainEntityOfPage: `${SITE}${path}`,
      image: `${SITE}/assets/shots/${a.image}.jpg`,
      author: { '@type': 'Organization', name: 'سامانه رسا', url: `${SITE}/` },
      publisher: { '@type': 'Organization', name: 'سامانه رسا', logo: { '@type': 'ImageObject', url: `${SITE}/assets/logo.svg` } },
    },
  ];
  if (a.faq.length) schema.push(faqLd(a.faq));
  return {
    path,
    title: a.title + SUFFIX,
    description: a.description,
    type: 'article',
    image: `/assets/shots/${a.image}.jpg`,
    body,
    current: '/guides',
    lastmod: a.updated,
    schema,
  };
}

export function guidesHub() {
  const trail = [
    ['/', 'خانه'],
    ['/guides', 'راهنماها'],
  ];
  const body = `
  <section class="page-hero compact">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="container">
      ${breadcrumbs(trail)}
      <h1>راهنماهای مدیریت مدرسه</h1>
      <p class="lead">راهنماهای کاربردی برای مدیران، معاونان و معلمان؛ از انتخاب نرم‌افزار و چیدن برنامه هفتگی تا کارنامه، حضور و غیاب، شهریه و آزمون آنلاین.</p>
    </div>
  </section>
  <section class="section">
    <div class="container feature-grid">
      ${guideCards(ARTICLES, 'h2')}
    </div>
  </section>
  ${CTA}`;
  return {
    path: '/guides',
    title: 'راهنماهای مدیریت مدرسه | سامانه رسا',
    description: 'راهنماهای کاربردی برای مدیران مدارس: انتخاب نرم‌افزار مدیریت مدرسه، برنامه هفتگی بدون تداخل، کارنامه و معدل، حضور و غیاب، شهریه و آزمون آنلاین.',
    body,
    lastmod: ARTICLES[0]?.updated,
    schema: [
      breadcrumbLd(trail),
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: ARTICLES.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.h1, url: `${SITE}/guides/${a.slug}` })),
      },
    ],
  };
}

/** خوراک RSS برای خواننده‌های خبرخوان و کشف سریع‌تر مقاله‌های تازه */
export function rssFeed() {
  const x = (s) => esc(s).replace(/'/g, '&apos;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>راهنماهای مدیریت مدرسه | سامانه رسا</title>
  <link>${SITE}/guides</link>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
  <description>راهنماهای کاربردی برای مدیران، معاونان و معلمان مدارس</description>
  <language>fa-IR</language>
${ARTICLES.map(
  (a) => `  <item>
    <title>${x(a.h1)}</title>
    <link>${SITE}/guides/${a.slug}</link>
    <guid isPermaLink="true">${SITE}/guides/${a.slug}</guid>
    <pubDate>${new Date(`${a.date}T08:00:00Z`).toUTCString()}</pubDate>
    <description>${x(a.description)}</description>
  </item>`,
).join('\n')}
</channel>
</rss>
`;
}
