// تبدیل تاریخ شمسی و میلادی (الگوریتم jalaali-js)
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;

function jalCal(jy) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

const pad = (n) => String(n).padStart(2, '0');
const isoOf = ({ gy, gm, gd }) => `${gy}-${pad(gm)}-${pad(gd)}`;

/** ۱۴۰۵-۰۷-۰۱ (شمسی) ← ISO میلادی */
export function jalaliToIso(jy, jm, jd) {
  return isoOf(d2g(j2d(jy, jm, jd)));
}

/** ISO میلادی ← { jy, jm, jd } */
export function isoToJalali(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return d2j(g2d(y, m, d));
}

export function addDays(iso, n) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** روز هفته ایرانی: شنبه=0 ... جمعه=6 */
export function weekday(iso) {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 1) % 7;
}

/** امروز در منطقه زمانی مدرسه */
export function todayIn(timeZone = 'Asia/Tehran', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** ساعت و دقیقه فعلی در منطقه زمانی مدرسه به شکل HH:MM */
export function timeIn(timeZone = 'Asia/Tehran', now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

/** زمان محلی مدرسه ← ISO با منطقه زمانی (برای فیلدهای datetime) */
export function localDateTime(iso, hhmm, timeZone = 'Asia/Tehran') {
  // اختلاف ساعت آن روز را از خود Intl می‌گیریم تا تغییر ساعت احتمالی هم درست باشد
  const guess = new Date(`${iso}T${hhmm}:00Z`);
  const shown = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(guess);
  const get = (t) => shown.find((p) => p.type === t).value;
  const asUtc = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`);
  return new Date(guess.getTime() - (asUtc - guess.getTime())).toISOString();
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export function faDigits(v) {
  return String(v).replace(/\d/g, (d) => FA_DIGITS[d]);
}

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

export function formatJalali(iso) {
  const { jy, jm, jd } = isoToJalali(iso);
  return faDigits(`${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`);
}
