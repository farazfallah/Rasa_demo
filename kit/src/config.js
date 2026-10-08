// تنظیمات کیت دمو از متغیرهای محیطی
import { createHash } from 'node:crypto';
import path from 'node:path';

const env = process.env;
const required = (key) => {
  if (!env[key]) throw new Error(`متغیر ${key} تنظیم نشده است`);
  return env[key];
};

export function loadConfig() {
  const rootPassword = required('DEMO_ROOT_PASSWORD');
  return {
    apiBase: env.API_URL ?? 'http://api:3000/api',
    databaseUrl: required('DATABASE_URL'),
    redisUrl: env.REDIS_URL ?? 'redis://redis:6379',
    uploadsDir: env.UPLOADS_DIR || null,
    seedCommand: env.SEED_COMMAND ?? 'node /app/apps/api/dist/db/seed.js',
    rootPassword,
    // رمز حساب‌های کمکی از رمز اصلی مشتق می‌شود تا بعد از راه‌اندازی دوباره کیت هم معتبر بماند
    workerPassword: createHash('sha256').update(`workers:${rootPassword}`).digest('base64url').slice(0, 20),
    workers: Number(env.KIT_WORKERS ?? 3),
    concurrency: Number(env.KIT_CONCURRENCY ?? 8),
    timeZone: env.SCHOOL_TIMEZONE ?? 'Asia/Tehran',
    resetAt: env.RESET_AT ?? '03:30',
    previousYear: env.PREVIOUS_YEAR !== '0',
    studentsPerClass: Number(env.STUDENTS_PER_CLASS ?? 30),
    leadStudents: Number(env.LEAD_STUDENTS ?? 12),
    leadDays: Number(env.LEAD_DAYS ?? 7),
    /** نسخه اپ؛ با تغییر آن، کیت پس از راه‌اندازی دوباره مدرسه نمونه را از نو می‌سازد */
    appVersion: env.APP_VERSION || null,
    zarinpalMerchant: env.ZARINPAL_SANDBOX_MERCHANT || null,
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    maintenanceFile: env.MAINTENANCE_FILE || null,
    port: Number(env.PORT ?? 8090),
    panelUser: env.PANEL_USER ?? 'admin',
    panelPassword: required('PANEL_PASSWORD'),
    demoUrl: env.DEMO_URL ?? 'https://demo.example.com',
    siteOrigin: env.SITE_ORIGIN ?? '*',
    trustProxy: env.TRUST_PROXY !== '0',
  };
}
