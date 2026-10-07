// تقویم سال تحصیلی نمونه بر اساس امروز: سال جاری از ۱ مهر و سال قبل (برای سابقه و کارنامه)
import { addDays, isoToJalali, jalaliToIso, weekday, faDigits } from '../lib/jalali.js';

/** سال تحصیلی‌ای که امروز در آن هستیم (در تابستان، سالی که تازه تمام شده) */
export function academicYearOf(today) {
  const { jy, jm } = isoToJalali(today);
  return jm >= 7 ? jy : jy - 1;
}

export function yearPlan(jy, today, key) {
  const start = jalaliToIso(jy, 7, 1);
  const end = jalaliToIso(jy + 1, 3, 31);
  const yesterday = addDays(today, -1);
  return {
    key,
    jy,
    title: faDigits(`${jy}-${jy + 1}`),
    start,
    end,
    /** آخرین روزی که سابقه آن ساخته می‌شود (امروز خالی می‌ماند تا کاربر دمو خودش ثبت کند) */
    historyEnd: yesterday < end ? yesterday : end,
    terms: [
      { title: 'نوبت اول', start, end: jalaliToIso(jy, 10, 30), sortOrder: 1, finalsFrom: jalaliToIso(jy, 10, 1), finalsTo: jalaliToIso(jy, 10, 20) },
      { title: 'نوبت دوم', start: jalaliToIso(jy, 11, 1), end, sortOrder: 2, finalsFrom: jalaliToIso(jy + 1, 3, 1), finalsTo: jalaliToIso(jy + 1, 3, 20) },
    ],
  };
}

/** روز مشخصی از سال تحصیلی: (ماه شمسی، روز) */
export function yearDate(plan, jm, jd) {
  return jalaliToIso(jm >= 7 ? plan.jy : plan.jy + 1, jm, jd);
}

/** روزهای درسی (شنبه تا چهارشنبه، بدون تعطیلات) در بازه */
export function schoolDays(from, to, holidays) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (weekday(d) <= 4 && !holidays.has(d)) out.push(d);
  }
  return out;
}

/** تعطیلات نوروز مدارس (۱ تا ۱۳ فروردین) */
export function nowruz(plan) {
  return { start: jalaliToIso(plan.jy + 1, 1, 1), end: jalaliToIso(plan.jy + 1, 1, 13) };
}
