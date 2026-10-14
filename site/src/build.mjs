// ساخت سایت معرفی: node site/src/build.mjs
// خروجی (فایل‌های html، sitemap.xml و robots.txt) کنار پوشه src ساخته و در مخزن نگه داشته می‌شود
// تا روی سرور به Node نیازی نباشد. دامنه در زمان اجرا با قالب Caddy پر می‌شود.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { page, SITE } from './layout.mjs';
import { FEATURES, featurePage, featuresHub } from './features.mjs';
import { GUIDES, guidePage, guidesHub } from './guides.mjs';
import { demoPage, faqPage, homePage, notFoundPage, securityPage } from './pages.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  homePage(),
  featuresHub(),
  ...FEATURES.map(featurePage),
  guidesHub(),
  ...GUIDES.map(guidePage),
  faqPage(),
  securityPage(),
  demoPage(),
  notFoundPage(),
];

const fileOf = (path) => (path === '/' ? 'index.html' : `${path.slice(1)}.html`);
const problems = [];
for (const p of pages) {
  const html = page(p);
  // بررسی‌های سئو: یک h1، طول عنوان و توضیح
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) problems.push(`${p.path}: ${h1} h1`);
  if (p.title.length > 70) problems.push(`${p.path}: title ${p.title.length} chars`);
  if (!p.noindex && (p.description.length < 90 || p.description.length > 175)) problems.push(`${p.path}: description ${p.description.length} chars`);
  const file = join(OUT, fileOf(p.path));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const today = new Date().toISOString().slice(0, 10);
const priority = (path) => (path === '/' ? '1.0' : path.startsWith('/features') ? '0.9' : path === '/demo' ? '0.8' : '0.7');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .filter((p) => !p.noindex)
  .map((p) => `  <url><loc>${SITE}${p.path === '/' ? '/' : p.path}</loc><lastmod>${today}</lastmod><priority>${priority(p.path)}</priority></url>`)
  .join('\n')}
</urlset>
`;
writeFileSync(join(OUT, 'sitemap.xml'), sitemap);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /panel\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`${pages.length} pages built`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
}
