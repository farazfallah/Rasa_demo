// صفحه‌های اصلی: خانه، درخواست دمو، پرسش‌های رایج، امنیت و نصب، صفحه یافت نشد
import { readFileSync } from 'node:fs';
import { breadcrumbLd, breadcrumbs, CTA, esc, faqLd, icon, SITE } from './layout.mjs';
import { FEATURES } from './features.mjs';
import { GUIDES } from './guides.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const DEMO_FORM = read('./demo-form.html');

/** پرسش‌های عمومی (صفحه پرسش‌ها و خانه) */
export const GENERAL_FAQ = [
  ['رسا چیست؟', 'رسا نرم‌افزار یکپارچه مدیریت مدرسه است که حضور و غیاب، دفتر نمره و کارنامه، آزمون آنلاین، برنامه هفتگی، امتحانات نوبت، شهریه، پرتال اولیا و دانش‌آموزان، پیش‌ثبت‌نام و سایت مدرسه را در یک سامانه فارسی جمع می‌کند.'],
  ['رسا برای کدام مدارس مناسب است؟', 'برای مدارس ابتدایی، متوسطه اول و متوسطه دوم، دولتی و غیردولتی. کارنامه ابتدایی توصیفی و کارنامه متوسطه مطابق قالب رسمی آموزش و پرورش است.'],
  ['رسا کجا نصب می‌شود؟', 'روی سرور خود مدرسه یا سروری که مدرسه انتخاب می‌کند. اطلاعات دانش‌آموزان و اولیا نزد خود مدرسه می‌ماند و هر روز خودکار از آن پشتیبان گرفته می‌شود.'],
  ['به اینترنت دائمی نیاز دارد؟', 'داخل شبکه مدرسه بدون اینترنت هم کار می‌کند. برای دسترسی اولیا و دانش‌آموزان از خانه، پرداخت آنلاین و پیامک، سرور باید از اینترنت در دسترس باشد.'],
  ['اطلاعات فعلی مدرسه را می‌شود منتقل کرد؟', 'بله. دانش‌آموزان با اطلاعات اولیا و کارکنان از همان فایل اکسل فعلی مدرسه، با هر ترتیب و عنوان ستون، وارد می‌شوند و حساب کاربری اولیا خودکار ساخته می‌شود.'],
  ['برای مدرسه ما کدام بخش‌ها فعال می‌شود؟', 'هر بخش جداگانه فعال یا غیرفعال می‌شود. می‌توانید با حضور و غیاب و دفتر نمره شروع کنید و بقیه بخش‌ها را هر وقت آماده بودید فعال کنید.'],
  ['اولیا و دانش‌آموزان باید برنامه نصب کنند؟', 'خیر. پرتال اولیا و دانش‌آموزان با مرورگر گوشی کار می‌کند و برای گوشی طراحی شده است.'],
  ['سرور با چه مشخصاتی لازم است؟', 'یک سرور لینوکسی معمولی کافی است. رسا با ۵۰۰ دانش‌آموز هم‌زمان در آزمون آنلاین روی سروری با ۲ هسته پردازنده و ۲ گیگابایت حافظه آزموده شده است.'],
  ['به‌روزرسانی چطور انجام می‌شود؟', 'نسخه جدید با یک دستور نصب می‌شود؛ پیش از آن خودکار پشتیبان گرفته می‌شود و اگر مشکلی پیش بیاید، سامانه خودکار به نسخه قبل برمی‌گردد.'],
  ['اطلاعات دمو واقعی است؟', 'خیر. مدرسه نمونه، دانش‌آموزان، نمره‌ها و پرداخت‌ها همه ساختگی‌اند. در دمو پرداخت واقعی انجام نمی‌شود و پیامکی هم ارسال نمی‌شود.'],
  ['تغییراتی که در دمو می‌دهم می‌ماند؟', 'تا پایان همان روز بله. داده‌های دمو هر شب از نو ساخته می‌شود و نام کاربری و رمز شما تا پایان مهلت دسترسی معتبر می‌ماند.'],
];

function faqBlock(list) {
  return list.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n      ');
}

export function homePage() {
  let body = read('./home-body.html').replace('<!--DEMO_FORM-->', DEMO_FORM);
  // پرسش‌های خانه از همان فهرست عمومی (برای یکسان بودن با داده ساخت‌یافته)
  const homeFaq = GENERAL_FAQ.filter((_, i) => [2, 3, 4, 5, 9, 10].includes(i));
  body = body.replace(/(<section id="faq"[\s\S]*?<\/div>\s*)(<details>[\s\S]*<\/details>)(\s*<\/div>\s*<\/section>)/, (_, a, __, c) => `${a}${faqBlock(homeFaq)}\n      <p class="center-link"><a href="/faq">همه پرسش‌ها ${icon('arrow')}</a></p>${c}`);
  // راهنماها: پیوند داخلی برای خواننده و موتور جستجو
  const guides = `
  <section class="section">
    <div class="container">
      <div class="head center"><p class="eyebrow">راهنماها</p><h2>برای مدیران و معاونان مدارس</h2></div>
      <div class="feature-grid">
        ${GUIDES.map((g) => `<a class="feature-card" href="/guides/${g.slug}"><h3>${esc(g.h1)}</h3><p>${esc(g.description)}</p><span class="more">خواندن راهنما ${icon('arrow')}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>
`;
  body = body.replace('  <!-- ---------------------------------------------------------------- پرسش‌ها -->', `${guides}\n  <!-- ---------------------------------------------------------------- پرسش‌ها -->`);
  return {
    path: '/',
    title: 'نرم‌افزار مدیریت مدرسه رسا | حضور و غیاب، کارنامه، آزمون آنلاین',
    description: 'رسا نرم‌افزار یکپارچه مدیریت مدرسه است: حضور و غیاب با پیامک، کارنامه رسمی، آزمون آنلاین، برنامه هفتگی خودکار، امتحانات نوبت، شهریه و پرتال اولیا؛ روی سرور خود مدرسه.',
    body,
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'سامانه رسا',
        alternateName: 'نرم‌افزار مدیریت مدرسه رسا',
        url: `${SITE}/`,
        inLanguage: 'fa-IR',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'سامانه رسا',
        applicationCategory: 'EducationalApplication',
        applicationSubCategory: 'نرم‌افزار مدیریت مدرسه',
        operatingSystem: 'Web, Linux server',
        inLanguage: 'fa-IR',
        url: `${SITE}/`,
        image: `${SITE}/assets/shots/dashboard.jpg`,
        description: 'نرم‌افزار یکپارچه مدیریت مدرسه با حضور و غیاب، کارنامه رسمی، آزمون آنلاین، برنامه هفتگی خودکار، امتحانات نوبت، شهریه و پرتال اولیا.',
        featureList: FEATURES.map((f) => f.name),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'IRR', description: 'نسخه نمایشی رایگان یک‌هفته‌ای' },
      },
      faqLd(homeFaq),
    ],
  };
}

export function demoPage() {
  const trail = [
    ['/', 'خانه'],
    ['/demo', 'درخواست دمو'],
  ];
  const body = `
  <section class="page-hero compact">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="container">${breadcrumbs(trail)}</div>
  </section>
  ${DEMO_FORM.replace('<h2>رسا را در یک مدرسه واقعی امتحان کنید</h2>', '<h1>درخواست دمو رایگان سامانه رسا</h1>')}`;
  return {
    path: '/demo',
    title: 'درخواست دمو رایگان نرم‌افزار مدیریت مدرسه | سامانه رسا',
    description: 'یک هفته دسترسی رایگان به نسخه نمایشی رسا با اطلاعات کامل یک مدرسه نمونه و حساب مدیر، معلم، ولی و دانش‌آموز. فرم درخواست کمتر از یک دقیقه وقت می‌گیرد.',
    body,
    current: '/demo',
    schema: [breadcrumbLd(trail)],
  };
}

export function faqPage() {
  const trail = [
    ['/', 'خانه'],
    ['/faq', 'پرسش‌های رایج'],
  ];
  const groups = [
    ['عمومی', GENERAL_FAQ],
    ...FEATURES.filter((f) => f.faq.length >= 2).map((f) => [f.name, f.faq, f.slug]),
  ];
  const all = groups.flatMap(([, list]) => list);
  const body = `
  <section class="page-hero compact">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="container">
      ${breadcrumbs(trail)}
      <h1>پرسش‌های رایج درباره سامانه رسا</h1>
      <p class="lead">پاسخ پرسش‌هایی که مدیران و معاونان مدارس پیش از شروع می‌پرسند. پاسخ پرسش‌تان را پیدا نکردید؟ <a href="/demo">درخواست دمو</a> بدهید تا با شما تماس بگیریم.</p>
    </div>
  </section>
  <section class="section">
    <div class="container faq">
      ${groups
        .map(
          ([name, list, slug]) => `<h2 class="faq-group">${esc(name)}${slug ? ` <a href="/features/${slug}">جزئیات این بخش</a>` : ''}</h2>
      ${faqBlock(list)}`,
        )
        .join('\n')}
    </div>
  </section>
  ${CTA}`;
  return {
    path: '/faq',
    title: 'پرسش‌های رایج درباره نرم‌افزار مدیریت مدرسه رسا',
    description: 'پاسخ پرسش‌های رایج درباره سامانه رسا: محل نصب، نیاز به اینترنت، انتقال اطلاعات از اکسل، کارنامه رسمی، آزمون آنلاین، برنامه هفتگی و پرتال اولیا.',
    body,
    schema: [breadcrumbLd(trail), faqLd(all)],
  };
}

export function securityPage() {
  const trail = [
    ['/', 'خانه'],
    ['/security', 'امنیت و نصب'],
  ];
  const items = [
    ['server', 'نصب روی سرور مدرسه', 'رسا روی سرور خود مدرسه یا سروری که مدرسه انتخاب می‌کند نصب می‌شود. داخل شبکه مدرسه بدون اینترنت هم کار می‌کند و در صورت نیاز از اینترنت هم در دسترس اولیاست. اطلاعات دانش‌آموزان و اولیا از اختیار مدرسه خارج نمی‌شود.'],
    ['database', 'پشتیبان‌گیری خودکار', 'هر روز از پایگاه داده و فایل‌ها (عکس‌ها، مدارک، پاسخ تکالیف) پشتیبان گرفته می‌شود و بازگردانی آن با یک دستور انجام می‌شود.'],
    ['refresh', 'به‌روزرسانی امن با بازگشت خودکار', 'نسخه جدید با یک دستور نصب می‌شود. پیش از آن پشتیبان گرفته می‌شود و پس از نصب سلامت سامانه بررسی می‌شود؛ اگر مشکلی باشد، سامانه خودکار به نسخه قبل برمی‌گردد.'],
    ['lock', 'نقش‌ها و دسترسی‌های دقیق', 'هر نقش فقط به بخش‌های لازم دسترسی دارد و نقش‌های سفارشی با دسترسی‌های دلخواه ساخته می‌شوند. فایل‌های بارگذاری‌شده فقط برای کاربران مجاز قابل دیدن است و رمز اولیه کاربران در اولین ورود عوض می‌شود.'],
    ['shield', 'ثبت همه فعالیت‌های مهم', 'تغییرات مهم مثل ویرایش نمره، پرداخت یا تغییر دسترسی با نام کاربر و زمان ثبت می‌شود تا هر تغییر قابل پیگیری باشد.'],
    ['chart', 'کارایی آزموده‌شده', 'رسا با ۵۰۰ دانش‌آموز هم‌زمان در آزمون آنلاین روی سروری با ۲ هسته پردازنده و ۲ گیگابایت حافظه آزموده شده است.'],
  ];
  const body = `
  <section class="page-hero compact">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="container">
      ${breadcrumbs(trail)}
      <h1>امنیت، نصب و نگهداری سامانه رسا</h1>
      <p class="lead">اطلاعات مدرسه فقط در اختیار مدرسه است. رسا روی سرور خود مدرسه نصب می‌شود، هر روز پشتیبان می‌گیرد و با یک دستور به‌روز می‌شود.</p>
    </div>
  </section>
  <section class="section">
    <div class="container sec-grid">
      ${items.map(([ic, h, p]) => `<div class="sec-item">${icon(ic)}<h2>${esc(h)}</h2><p>${esc(p)}</p></div>`).join('\n      ')}
    </div>
  </section>
  <section class="section section-tint">
    <div class="container narrow prose">
      <h2>نصب و راه‌اندازی چطور انجام می‌شود؟</h2>
      <ol class="steps">
        <li><b>آماده کردن سرور</b><span>یک سرور لینوکسی (داخل مدرسه یا مرکز داده) با دسترسی مدیر.</span></li>
        <li><b>نصب با یک اسکریپت</b><span>اسکریپت نصب همه سرویس‌ها را راه‌اندازی می‌کند و پشتیبان‌گیری روزانه را فعال می‌کند.</span></li>
        <li><b>ورود اطلاعات مدرسه</b><span>دستیار راه‌اندازی قدم‌به‌قدم سال تحصیلی، پایه‌ها، کلاس‌ها و درس‌ها را تعریف می‌کند و دانش‌آموزان و کارکنان از اکسل وارد می‌شوند.</span></li>
        <li><b>آموزش و شروع کار</b><span>هر نقش فقط بخش‌های خودش را می‌بیند؛ با حضور و غیاب و دفتر نمره شروع کنید و بقیه بخش‌ها را به‌تدریج فعال کنید.</span></li>
      </ol>
    </div>
  </section>
  ${CTA}`;
  return {
    path: '/security',
    title: 'امنیت و نصب نرم‌افزار مدیریت مدرسه روی سرور مدرسه | رسا',
    description: 'رسا روی سرور خود مدرسه نصب می‌شود: پشتیبان‌گیری روزانه خودکار، به‌روزرسانی با بازگشت خودکار، نقش‌ها و دسترسی‌های دقیق و ثبت همه فعالیت‌های مهم.',
    body,
    schema: [breadcrumbLd(trail)],
  };
}

export function notFoundPage() {
  const body = `
  <section class="page-hero compact notfound">
    <div class="hero-bg" aria-hidden="true"></div>
    <div class="container">
      <h1>این صفحه پیدا نشد</h1>
      <p class="lead">شاید نشانی را اشتباه وارد کرده‌اید یا صفحه جابه‌جا شده است.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="/">صفحه اصلی</a>
        <a class="btn btn-ghost btn-lg" href="/features">امکانات</a>
      </div>
    </div>
  </section>`;
  return { path: '/404', title: 'صفحه پیدا نشد | سامانه رسا', description: 'صفحه مورد نظر پیدا نشد.', body, noindex: true };
}
