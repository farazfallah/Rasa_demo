// سرور کیت دمو: دریافت درخواست از سایت معرفی، پنل مدیریت درخواست‌ها و زمان‌بندی بازسازی شبانه
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { loadConfig } from './config.js';
import { Kit } from './kit.js';
import { log, recentLog } from './lib/log.js';
import { timeIn, todayIn } from './lib/jalali.js';

const config = loadConfig();
const kit = await new Kit(config).init();
const PANEL_HTML = new URL('./panel/index.html', import.meta.url);

// ---------------------------------------------------------------- کمکی‌ها

function send(res, status, body, headers = {}) {
  const isText = typeof body === 'string';
  res.writeHead(status, {
    'content-type': isText ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
  res.end(isText ? body : JSON.stringify(body));
}

async function readBody(req, limit = 20_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('درخواست بیش از حد بزرگ است'), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if ((req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error('بدنه درخواست نامعتبر است'), { status: 400 });
  }
}

function clientIp(req) {
  if (config.trustProxy) {
    const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress ?? '';
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function panelAuthorized(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  const [user, ...rest] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
  return safeEqual(user, config.panelUser) && safeEqual(rest.join(':'), config.panelPassword);
}

// ---------------------------------------------------------------- درخواست دمو (عمومی)

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const FA_TO_EN = (s) => s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

function validateRequest(body) {
  const data = {
    name: clean(body.name, 80),
    school: clean(body.school, 120),
    role: clean(body.role, 40),
    mobile: FA_TO_EN(clean(body.mobile, 20)).replace(/[\s-]/g, '').replace(/^\+98/, '0').replace(/^98(?=9)/, '0'),
    city: clean(body.city, 60),
    students: clean(body.students, 20),
    message: clean(body.message, 1000),
  };
  const errors = {};
  if (data.name.length < 3) errors.name = 'نام و نام خانوادگی را بنویسید';
  if (data.school.length < 3) errors.school = 'نام مدرسه را بنویسید';
  if (!/^09\d{9}$/.test(data.mobile)) errors.mobile = 'شماره موبایل معتبر نیست (مثلا ۰۹۱۲۱۲۳۴۵۶۷)';
  return { data, errors };
}

async function handleRequest(req, res) {
  const body = await readBody(req);
  // فیلد پنهان برای ربات‌ها
  if (body.website) return send(res, 200, { ok: true });
  const ip = clientIp(req);
  if (rateLimited(ip)) return send(res, 429, { ok: false, message: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید' });
  const { data, errors } = validateRequest(body);
  if (Object.keys(errors).length) return send(res, 400, { ok: false, message: Object.values(errors)[0], errors });
  const duplicate = kit.data.leads.find((l) => l.mobile === data.mobile && ['pending', 'active'].includes(l.status));
  if (duplicate) return send(res, 200, { ok: true, duplicate: true });
  await kit.addRequest({ ...data, ip, userAgent: clean(req.headers['user-agent'], 200) });
  send(res, 201, { ok: true });
}

// ---------------------------------------------------------------- پنل مدیریت

function accessText(lead) {
  const u = lead.usernames;
  const exp = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: config.timeZone, dateStyle: 'long' }).format(new Date(lead.expiresAt));
  return [
    `${lead.name} عزیز، سلام`,
    'دسترسی شما به نسخه نمایشی سامانه رسا آماده است.',
    '',
    `نشانی: ${config.demoUrl}`,
    `رمز همه حساب‌ها: ${lead.password}`,
    '',
    `مدیر مدرسه: ${u.admin}`,
    `معلم: ${u.teacher}`,
    `ولی دانش‌آموز: ${u.parent}`,
    `دانش‌آموز: ${u.student}`,
    '',
    `اعتبار تا ${exp}.`,
    'یک کلاس اختصاصی با دانش‌آموزان و سابقه کامل برای شما ساخته شده است. هر شب داده‌ها به حالت اول برمی‌گردد.',
  ].join('\n');
}

function panelState() {
  return {
    now: new Date().toISOString(),
    demoUrl: config.demoUrl,
    leadDays: config.leadDays,
    resetAt: config.resetAt,
    busy: kit.busy,
    build: kit.data.build && {
      state: kit.data.build.state,
      startedAt: kit.data.build.startedAt,
      finishedAt: kit.data.build.finishedAt,
      error: kit.data.build.error,
    },
    leads: kit.data.leads.map((l) => ({
      ...l,
      accessText: l.status === 'active' || l.status === 'expired' ? accessText(l) : null,
    })),
    log: recentLog().slice(-80),
  };
}

const ACTIONS = {
  approve: (id, body) => kit.approve(id, Number(body.days) || undefined),
  reject: (id) => kit.reject(id),
  extend: (id, body) => kit.extend(id, Number(body.days) || undefined),
  revoke: (id) => kit.revoke(id),
  retry: (id) => kit.retry(id),
  note: async (id, body) => {
    const lead = kit.mustGet(id);
    lead.note = clean(body.note, 1000);
    await kit.store.save();
    return lead;
  },
  delete: (id) => kit.remove(id),
};

async function handlePanel(req, res, url) {
  if (!panelAuthorized(req)) {
    return send(res, 401, 'نیاز به ورود', { 'www-authenticate': 'Basic realm="rasa-demo-panel", charset="UTF-8"' });
  }
  if (url.pathname === '/panel' || url.pathname === '/panel/') {
    return send(res, 200, await readFile(PANEL_HTML, 'utf8'));
  }
  if (url.pathname === '/panel/api/state' && req.method === 'GET') return send(res, 200, panelState());
  // درخواست‌های تغییر فقط با سرآیند سفارشی (جلوگیری از ارسال از سایت دیگر)
  if (req.method !== 'POST' || req.headers['x-panel'] !== '1') return send(res, 404, { message: 'یافت نشد' });
  const body = await readBody(req);
  if (url.pathname === '/panel/api/rebuild') {
    if (kit.busy) return send(res, 409, { message: `کار دیگری در حال اجراست: ${kit.busy.label}` });
    kit.enqueue('بازسازی کامل', () => kit.rebuild()).catch(() => {});
    return send(res, 202, { ok: true });
  }
  const m = url.pathname.match(/^\/panel\/api\/leads\/([a-f0-9]+)\/([a-z]+)$/);
  if (m && ACTIONS[m[2]]) {
    await ACTIONS[m[2]](m[1], body);
    return send(res, 200, { ok: true });
  }
  send(res, 404, { message: 'یافت نشد' });
}

// ---------------------------------------------------------------- سرور

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://kit');
  try {
    if (url.pathname === '/health') return send(res, 200, { ok: true, build: kit.data.build?.state ?? null, busy: kit.busy?.label ?? null });
    if (url.pathname === '/api/demo-requests') {
      const cors = { 'access-control-allow-origin': config.siteOrigin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' };
      if (req.method === 'OPTIONS') return send(res, 204, '', cors);
      if (req.method !== 'POST') return send(res, 405, { message: 'روش نامعتبر' }, cors);
      Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
      return await handleRequest(req, res);
    }
    if (url.pathname === '/panel' || url.pathname.startsWith('/panel/')) return await handlePanel(req, res, url);
    send(res, 404, { message: 'یافت نشد' });
  } catch (e) {
    const status = e.status && e.status < 500 ? e.status : 500;
    if (status === 500) log('server error:', e.stack ?? e.message);
    if (!res.headersSent) send(res, status, { ok: false, message: e.message });
  }
});

server.listen(config.port, () => log(`kit listening on :${config.port}`));

// ---------------------------------------------------------------- زمان‌بندی

let lastAttemptAt = 0;
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
let lastResetDay = null;
async function tick() {
  const today = todayIn(config.timeZone);
  // فقط در بازه سه ساعته بعد از زمان تعیین‌شده (اگر کیت آن ساعت خاموش بود، وسط روز بازسازی نمی‌شود)
  const since = minutes(timeIn(config.timeZone)) - minutes(config.resetAt);
  if (since >= 0 && since < 180 && lastResetDay !== today && !kit.busy && kit.data.build?.lastNightly !== today) {
    lastResetDay = today;
    log('nightly rebuild');
    kit
      .enqueue('بازسازی شبانه', async () => {
        await kit.rebuild();
        kit.data.build.lastNightly = today;
        await kit.store.save();
      })
      .catch(() => {});
  }
  // ساخت ناموفق (مثلا API هنوز آماده نبود): هر ۱۰ دقیقه دوباره
  else if (kit.data.build?.state === 'error' && !kit.busy && Date.now() - lastAttemptAt > 10 * 60_000) {
    lastAttemptAt = Date.now();
    log('retrying failed build');
    kit.enqueue('ساخت دوباره', () => kit.rebuild()).catch(() => {});
  }
  kit.expireLeads().catch((e) => log('expire failed:', e.message));
}

// اولین اجرا: اگر مدرسه هنوز ساخته نشده یا ساخت قبلی ناتمام مانده
if (process.env.BUILD_ON_START !== '0' && kit.data.build?.state !== 'ok') {
  // بازسازی امروز انجام شده حساب می‌شود تا بلافاصله تکرار نشود
  lastResetDay = todayIn(config.timeZone);
  lastAttemptAt = Date.now();
  kit.enqueue('ساخت اولیه', () => kit.rebuild()).catch(() => {});
}
setInterval(tick, 60_000).unref();
setTimeout(tick, 5_000).unref();

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log(`${sig} received, shutting down`);
    server.close();
    kit.store.save().finally(() => process.exit(0));
  });
}
