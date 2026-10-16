// قالب مشترک همه صفحه‌های سایت معرفی: head با برچسب‌های سئو، سربرگ، پابرگ و داده‌های ساخت‌یافته.
// نشانی سایت در زمان اجرا با قالب Caddy ({{.Host}}) پر می‌شود تا خروجی به دامنه وابسته نباشد.
import { readFileSync } from 'node:fs';

export const SITE = 'https://{{.Host}}';
export const BRAND = 'سامانه رسا';
const ICONS = readFileSync(new URL('./icons.svg.html', import.meta.url), 'utf8');

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const icon = (name, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/** منوی اصلی (هم سربرگ و هم منوی موبایل) */
export const NAV = [
  ['/features', 'امکانات'],
  ['/features/online-class', 'کلاس آنلاین'],
  ['/features/timetable', 'برنامه هفتگی'],
  ['/features/report-card', 'کارنامه'],
  ['/manual', 'راهنمای کامل'],
  ['/guides', 'راهنماها'],
  ['/faq', 'پرسش‌ها'],
  ['/security', 'امنیت و نصب'],
];

function jsonLd(items) {
  return items.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n');
}

export function breadcrumbLd(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([path, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })),
  };
}

export function faqLd(faq) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
}

export const ORG_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: BRAND,
  url: `${SITE}/`,
  logo: `${SITE}/assets/logo.svg`,
};

export function breadcrumbs(trail) {
  return `<nav class="crumbs" aria-label="مسیر صفحه"><ol>${trail
    .map(([path, name], i) => (i === trail.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${path}">${esc(name)}</a></li>`))
    .join('')}</ol></nav>`;
}

/**
 * page: path (مثلا /features/timetable)، title (عنوان مرورگر و گوگل، ۵۰ تا ۶۰ حرف)،
 * description (۱۲۰ تا ۱۶۰ حرف)، body (HTML)، schema (داده‌های ساخت‌یافته)، image، type.
 */
export function page({ path, title, description, body, schema = [], image = '/assets/shots/dashboard.jpg', type = 'website', noindex = false, current = path }) {
  const url = `${SITE}${path === '/' ? '/' : path}`;
  const nav = NAV.map(([href, label]) => `<a href="${href}"${current === href || (href !== '/features' && current.startsWith(href)) || (href === '/features' && current === '/features') ? ' aria-current="page"' : ''}>${label}</a>`).join('\n      ');
  return `<!doctype html>
<html lang="fa-IR" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
${noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="theme-color" content="#0f1b33">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}${image}">
<meta property="og:locale" content="fa_IR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}${image}">
<link rel="preload" href="/fonts/Vazirmatn.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=4">
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">
${jsonLd([ORG_LD, ...schema])}
</head>
<body>
${ICONS}
<a class="skip" href="#main">رفتن به محتوا</a>
<header class="top" id="top">
  <div class="container top-inner">
    <a class="brand" href="/">
      <img src="/assets/logo.svg" alt="" width="36" height="36">
      <span>${BRAND}</span>
    </a>
    <nav class="nav" aria-label="منوی اصلی">
      ${nav}
    </nav>
    <a class="btn btn-primary btn-sm" href="/demo">درخواست دمو</a>
    <details class="menu">
      <summary aria-label="منو">${icon('list')}</summary>
      <nav aria-label="منوی موبایل">
        ${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}
        <a href="/demo">درخواست دمو رایگان</a>
      </nav>
    </details>
  </div>
</header>

<main id="main">
${body}
</main>

<footer class="footer">
  <div class="container footer-grid">
    <div class="footer-about">
      <a class="brand" href="/">
        <img src="/assets/logo.svg" alt="" width="32" height="32">
        <span>${BRAND}</span>
      </a>
      <p>نرم‌افزار یکپارچه مدیریت مدرسه برای مدارس ابتدایی، متوسطه اول و دوم: حضور و غیاب، کارنامه، کلاس و آزمون آنلاین، برنامه هفتگی، امتحانات نوبت، شهریه و پرتال اولیا؛ روی سرور خود مدرسه.</p>
    </div>
    <nav aria-label="امکانات">
      <b>امکانات</b>
      <a href="/features/attendance">حضور و غیاب</a>
      <a href="/features/report-card">کارنامه و دفتر نمره</a>
      <a href="/features/online-class">کلاس آنلاین</a>
      <a href="/features/online-exam">آزمون آنلاین</a>
      <a href="/features/timetable">برنامه هفتگی</a>
      <a href="/features/term-exams">امتحانات نوبت</a>
      <a href="/features/finance">شهریه و حقوق</a>
    </nav>
    <nav aria-label="بیشتر">
      <b>بیشتر</b>
      <a href="/features/parents">پرتال اولیا و دانش‌آموزان</a>
      <a href="/features/students">پرونده و ورود از اکسل</a>
      <a href="/features/staff">حضور کارکنان</a>
      <a href="/features/admission">پیش‌ثبت‌نام آنلاین</a>
      <a href="/features/website">سایت مدرسه</a>
      <a href="/features">همه امکانات</a>
    </nav>
    <nav aria-label="راهنما">
      <b>راهنما و پشتیبانی</b>
      <a href="/manual">راهنمای کامل سامانه (دانلود)</a>
      <a href="/guides">راهنماها</a>
      <a href="/faq">پرسش‌های رایج</a>
      <a href="/security">امنیت و نصب</a>
      <a href="/demo">درخواست دمو</a>
    </nav>
  </div>
  <div class="container footer-bottom">
    <p>${BRAND} — نرم‌افزار مدیریت مدرسه</p>
  </div>
</footer>

<script src="/assets/site.js?v=4" defer></script>
</body>
</html>
`;
}

/** فراخوان پایانی مشترک */
export const CTA = `<section class="cta">
  <div class="container cta-inner">
    <div>
      <h2>رسا را در یک مدرسه نمونه امتحان کنید</h2>
      <p>یک هفته دسترسی رایگان با حساب مدیر، معلم، ولی و دانش‌آموز.</p>
    </div>
    <a class="btn btn-light btn-lg" href="/demo">درخواست دمو رایگان</a>
  </div>
</section>`;
