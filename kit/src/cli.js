// دستورهای دستی کیت:
//   node src/cli.js rebuild          پاک‌سازی و ساخت دوباره مدرسه نمونه و حساب متقاضیان فعال
//   node src/cli.js build            فقط ساخت (روی پایگاه داده تازه)
//   node src/cli.js expire           غیرفعال کردن حساب‌های منقضی
import { loadConfig } from './config.js';
import { Kit } from './kit.js';

const config = loadConfig();
const kit = await new Kit(config).init();
const cmd = process.argv[2];
try {
  if (cmd === 'rebuild') await kit.rebuild();
  else if (cmd === 'build') await kit.rebuild({ skipReset: true });
  else if (cmd === 'expire') await kit.expireLeads();
  else {
    console.log('usage: node src/cli.js rebuild|build|expire');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
