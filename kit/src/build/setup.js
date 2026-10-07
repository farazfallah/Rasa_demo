// پایه مدرسه نمونه: تنظیمات، نقش‌ها، سال و نوبت، پایه و درس، کادر، کلاس‌ها و دانش‌آموزان
import { Session, Pool, parallel } from '../lib/api.js';
import { log } from '../lib/log.js';
import { addDays, jalaliToIso } from '../lib/jalali.js';
import { COURSES, GRADES, SECTIONS, STAFF, TEACHERS, SCHOOL, BOY_NAMES, MALE_NAMES, FEMALE_NAMES, LAST_NAMES, JOBS, EDUCATIONS, DISTRICTS } from './data.js';
import { nowruz } from './timeline.js';

export const DEMO_ROLE_NAME = 'مدیر (نسخه نمایشی)';
/** دسترسی‌هایی که حساب مدیرِ متقاضیان ندارد تا نتوانند حساب دیگران یا تنظیمات کلی را تغییر دهند */
const DEMO_ROLE_DENY = ['users.create', 'users.update', 'users.delete', 'roles.manage', 'settings.manage', 'sms.manage', 'biometric.manage'];

/** ورود با رمز پیش‌فرض اولیه و تعویض آن با رمز اصلی مدیر دمو */
export async function rootSession(base, rootPassword) {
  const root = new Session(base, 'admin', rootPassword);
  try {
    await root.login();
    return root;
  } catch (e) {
    if (e.status !== 401 && e.status !== 400) throw e;
  }
  const first = new Session(base, 'admin', 'admin123');
  await first.login();
  await first.patch('/auth/password', { currentPassword: 'admin123', newPassword: rootPassword });
  await root.login();
  return root;
}

export async function setupSettings(ctx) {
  const { admin } = ctx;
  await admin.patch('/settings', {
    school_name: SCHOOL.name,
    school_phone: SCHOOL.phone,
    school_address: SCHOOL.address,
    force_password_change: 'false',
    attendance_mode: 'daily',
    // درگاه آزمایشی اپ در نسخه production غیرفعال است؛ در صورت تنظیم، حالت sandbox زرین‌پال
    ...(ctx.zarinpalMerchant ? { payment_gateway: 'zarinpal', zarinpal_merchant_id: ctx.zarinpalMerchant, zarinpal_sandbox: 'true' } : {}),
    academic_year_title: ctx.years.at(-1).title,
    site_hero_title: SCHOOL.name,
    site_hero_subtitle: 'آموزش باکیفیت، پرورش مهارت‌های زندگی',
    site_about: 'دبیرستان نمونه رسا یک مدرسه نمونه برای نمایش امکانات سامانه رساست. همه نام‌ها و اطلاعات این مدرسه ساختگی است.',
  });
}

/** حساب‌های کمکی برای پخش درخواست‌ها (سقف درخواست هر حساب در دقیقه) */
export async function setupWorkers(ctx, count, password) {
  const sessions = [ctx.admin];
  for (let i = 1; i <= count; i++) {
    const username = `kit_worker${i}`;
    await ctx.admin.post('/users', { username, password, firstName: 'سامانه', lastName: `پشتیبان ${i}`, roleId: ctx.roles.super_admin });
    sessions.push(new Session(ctx.base, username, password));
  }
  ctx.pool = new Pool(sessions);
}

export async function loadRoles(ctx) {
  const roles = await ctx.admin.get('/roles');
  ctx.roles = Object.fromEntries(roles.filter((r) => r.slug).map((r) => [r.slug, r.id]));
  const manager = roles.find((r) => r.slug === 'manager');
  const permissions = manager.permissions.filter((p) => !DEMO_ROLE_DENY.includes(p));
  const { id } = await ctx.admin.post('/roles', {
    name: DEMO_ROLE_NAME,
    description: 'حساب مدیر متقاضیان دمو: همه امکانات به جز مدیریت کاربران، نقش‌ها و تنظیمات',
    permissions,
  });
  ctx.roles.demo_admin = id;
}

export async function setupYears(ctx) {
  const { admin } = ctx;
  for (const plan of ctx.years) {
    const { id } = await admin.post('/academic/years', { title: plan.title, startDate: plan.start, endDate: plan.end });
    plan.id = id;
    for (const term of plan.terms) {
      const r = await admin.post('/academic/terms', { academicYearId: id, title: term.title, startDate: term.start, endDate: term.end, sortOrder: term.sortOrder });
      term.id = r.id;
    }
  }
  await admin.post(`/academic/years/${ctx.years.at(-1).id}/activate`);
}

/** تعطیلات رسمی از خود سامانه (منابع آنلاین یا نسخه داخلی) و تعطیلات نوروز */
export async function setupHolidays(ctx) {
  const { admin } = ctx;
  ctx.holidays = new Set();
  for (const plan of ctx.years) {
    try {
      const preview = await admin.get(`/calendar/official-holidays?year=${plan.jy}`);
      const items = preview.items.map((i) => ({ date: i.date, title: i.title.slice(0, 128) }));
      if (items.length) await admin.post('/calendar/official-holidays', { items });
      for (const i of items) ctx.holidays.add(i.date);
    } catch (e) {
      log('holidays failed:', e.message);
    }
    const nr = nowruz(plan);
    await admin.post('/calendar', { title: 'تعطیلات نوروز', type: 'holiday', startDate: nr.start, endDate: nr.end });
    for (let d = nr.start; d <= nr.end; d = addDays(d, 1)) ctx.holidays.add(d);
    for (const term of plan.terms) {
      await admin.post('/calendar', { title: `امتحانات ${term.title}`, type: 'exam', startDate: term.finalsFrom, endDate: term.finalsTo });
    }
    await admin.post('/calendar', {
      title: 'جلسه انجمن اولیا و مربیان',
      type: 'meeting',
      startDate: jalaliToIso(plan.jy, 7, 24),
      endDate: jalaliToIso(plan.jy, 7, 24),
    });
    await admin.post('/calendar', {
      title: 'جشن دهه فجر',
      type: 'event',
      startDate: jalaliToIso(plan.jy + 1, 11, 19),
      endDate: jalaliToIso(plan.jy + 1, 11, 19),
    });
  }
}

export async function setupStructure(ctx) {
  const { admin } = ctx;
  ctx.grades = [];
  for (const g of GRADES) {
    const { id } = await admin.post('/academic/grades', g);
    const courses = [];
    for (const c of COURSES) {
      const r = await admin.post('/academic/courses', { title: c.title, gradeId: id, units: c.weekly });
      courses.push({ ...c, id: r.id });
    }
    ctx.grades.push({ ...g, id, courses });
  }
}

let nidSeen = new Set();
function uniqueNid(rnd) {
  for (;;) {
    const id = rnd.nationalId();
    if (!nidSeen.has(id)) {
      nidSeen.add(id);
      return id;
    }
  }
}

export async function setupStaff(ctx) {
  const { admin, rnd } = ctx;
  nidSeen = new Set();
  ctx.staff = {};
  for (const s of STAFF) {
    const nationalId = uniqueNid(rnd);
    const { id } = await admin.post('/users', {
      username: s.username,
      password: nationalId,
      firstName: s.first,
      lastName: s.last,
      mobile: rnd.mobile(),
      nationalId,
      roleId: ctx.roles[s.role],
    });
    ctx.staff[s.role] = { id, ...s };
  }
  ctx.teachers = [];
  for (const [i, t] of TEACHERS.entries()) {
    const nationalId = uniqueNid(rnd);
    const { id } = await admin.post('/users', {
      username: t.username ?? `t${String(i + 1).padStart(2, '0')}`,
      password: nationalId,
      firstName: t.first,
      lastName: t.last,
      mobile: rnd.mobile(),
      nationalId,
      roleId: ctx.roles.teacher,
    });
    ctx.teachers.push({ ...t, id });
  }
}

/** دانش‌آموز با پدر و مادر (پرونده کامل) */
export function makeStudent(rnd, lastNames = LAST_NAMES) {
  const last = rnd.pick(lastNames);
  const father = rnd.pick(MALE_NAMES);
  const district = rnd.pick(DISTRICTS);
  const ability = Math.max(7, Math.min(19.8, rnd.normal(15.8, 2.4)));
  return {
    first: rnd.pick(BOY_NAMES),
    last,
    father,
    ability,
    /** احتمال غیبت هر روز */
    absence: rnd.chance(0.12) ? 0.06 + rnd.next() * 0.06 : rnd.next() * 0.025,
    lateness: rnd.chance(0.15) ? 0.04 : 0.008,
    district,
  };
}

export function registrationBody(rnd, s, gradeOrder, classroomId) {
  const nationalId = uniqueNid(rnd);
  const birthYear = 2026 - (gradeOrder + 6) - 1;
  return {
    firstName: s.first,
    lastName: s.last,
    nationalId,
    gender: 'male',
    birthDate: `${birthYear}-${String(rnd.int(1, 12)).padStart(2, '0')}-${String(rnd.int(1, 28)).padStart(2, '0')}`,
    birthPlace: 'تهران',
    studentCode: null,
    homePhone: `021${rnd.int(40000000, 89999999)}`,
    province: 'تهران',
    city: 'تهران',
    address: `تهران، ${s.district}، خیابان ${rnd.pick(['گلستان', 'بهار', 'لاله', 'نرگس', 'یاس', 'شقایق'])}، پلاک ${rnd.int(1, 120)}`,
    livesWith: 'both',
    previousSchool: gradeOrder === 7 ? `دبستان ${rnd.pick(['فردوسی', 'سعدی', 'حافظ', 'شهید باهنر', 'امام رضا'])}` : null,
    father: {
      firstName: s.father,
      lastName: s.last,
      nationalId: uniqueNid(rnd),
      mobile: rnd.mobile(),
      job: rnd.pick(JOBS.filter((j) => j !== 'خانه‌دار')),
      education: rnd.pick(EDUCATIONS),
    },
    mother: {
      firstName: rnd.pick(FEMALE_NAMES),
      lastName: rnd.pick(LAST_NAMES),
      nationalId: uniqueNid(rnd),
      mobile: rnd.mobile(),
      job: rnd.pick(JOBS),
      education: rnd.pick(EDUCATIONS),
    },
    classroomId: classroomId ?? null,
  };
}

/** کلاس‌ها، دانش‌آموزان، دروس کلاس و معلم هر درس */
export async function setupClasses(ctx, perClass) {
  const { admin, rnd } = ctx;
  const cur = ctx.years.at(-1);
  const prev = ctx.years.length > 1 ? ctx.years[0] : null;
  ctx.classes = [];

  const createClass = async (plan, grade, section) => {
    const title = `${grade.title} ${section}`;
    const { id } = await admin.post('/classrooms', { title, gradeId: grade.id, academicYearId: plan.id });
    const cls = { id, title, plan, grade, section, students: [], courses: [] };
    ctx.classes.push(cls);
    return cls;
  };

  // کلاس‌های امسال و دانش‌آموزانشان
  const current = [];
  for (const grade of ctx.grades) {
    for (const section of SECTIONS) current.push(await createClass(cur, grade, section));
  }
  await parallel(current, 3, async (cls) => {
    const session = ctx.pool.next();
    for (let i = 0; i < perClass; i++) {
      const s = makeStudent(rnd);
      const body = registrationBody(rnd, s, cls.grade.sortOrder, cls.id);
      const { id } = await session.post('/students', body);
      cls.students.push({ ...s, id, nationalId: body.nationalId });
    }
  });

  // سال قبل: دانش‌آموزان هشتم و نهمِ امسال، پارسال هفتم و هشتم بودند
  if (prev) {
    for (const [gi, grade] of ctx.grades.entries()) {
      const nextGrade = ctx.grades[gi + 1];
      if (!nextGrade) continue;
      for (const section of SECTIONS) {
        const cls = await createClass(prev, grade, section);
        const later = current.find((c) => c.grade === nextGrade && c.section === section);
        cls.students = later.students;
        await admin.post(`/classrooms/${cls.id}/students/bulk`, { studentIds: cls.students.map((s) => s.id) }).catch(async () => {
          for (const s of cls.students) await admin.post(`/classrooms/${cls.id}/students`, { studentId: s.id });
        });
      }
    }
  }

  // دروس هر کلاس و تقسیم کلاس‌ها بین معلم‌های هر گروه دبیری (هر پایه یک معلم تا جای ممکن)
  for (const cls of ctx.classes) {
    for (const course of cls.grade.courses) {
      const pool = ctx.teachers.filter((t) => t.subject === course.subject);
      const gi = ctx.grades.indexOf(cls.grade);
      const si = SECTIONS.indexOf(cls.section);
      const teacher = pool.length >= 3 ? pool[gi % pool.length] : pool[(gi * SECTIONS.length + si) % pool.length];
      const { id } = await admin.post(`/classrooms/${cls.id}/courses`, { courseId: course.id, teacherId: teacher.id });
      cls.courses.push({ ccId: id, course, teacherId: teacher.id });
    }
  }
}

/** برنامه هفتگی امسال با زمان‌بند خودکار خود سامانه */
export async function setupTimetable(ctx) {
  const { admin } = ctx;
  await admin.put('/timetable/config', {
    days: [0, 1, 2, 3, 4],
    periods: { 0: 4, 1: 4, 2: 4, 3: 4, 4: 4 },
    times: [
      { start: '07:30', end: '08:45' },
      { start: '09:00', end: '10:15' },
      { start: '10:30', end: '11:45' },
      { start: '12:00', end: '13:15' },
    ],
  });
  let best = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await admin.post('/timetable/solve', { keepLocked: false, seconds: 20 });
    const n = (x) => (Array.isArray(x.unplaced) ? x.unplaced.length : (x.unplaced ?? 0));
    if (!best || n(r) < n(best)) best = r;
    if (r.complete) break;
  }
  await admin.post(`/timetable/drafts/${best.draftId}/apply`);
  log(`timetable: complete=${best.complete} unplaced=${Array.isArray(best.unplaced) ? best.unplaced.length : best.unplaced}`);
  // پیش‌نویس‌ها را پاک نمی‌کنیم؛ کاربر دمو می‌تواند نسخه دیگری بسازد
  for (const cls of ctx.classes.filter((c) => c.plan === ctx.years.at(-1))) {
    cls.schedule = await admin.get(`/classrooms/${cls.id}/schedule`);
  }
}
