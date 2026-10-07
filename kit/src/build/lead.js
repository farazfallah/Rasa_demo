// دسترسی هر متقاضی: یک کلاس اختصاصی پایه هشتم با سابقه کامل و چهار حساب (مدیر، معلم، ولی، دانش‌آموز)
import { log } from '../lib/log.js';
import { createRandom } from '../lib/random.js';
import { faDigits, todayIn } from '../lib/jalali.js';
import { yearPlan } from './timeline.js';
import { makeStudent, registrationBody } from './setup.js';
import * as history from './history.js';

/** نام کاربری حساب‌ها: m=مدیر، t=معلم، p=ولی، s=دانش‌آموز (فقط حروف لاتین، رقم، نقطه و _ مجاز است) */
export function leadUsernames(code) {
  return { admin: `m${code}`, teacher: `t${code}`, parent: `p${code}`, student: `s${code}` };
}

/** اگر ساخت قبلی نیمه‌کاره مانده، نام‌های کاربری را آزاد و حساب‌های قبلی را غیرفعال می‌کند */
async function releaseUsernames(admin, names) {
  for (const username of Object.values(names)) {
    const res = await admin.get(`/users?search=${encodeURIComponent(username)}&limit=100`);
    for (const u of (res.items ?? res).filter((x) => x.username === username)) {
      await admin.patch(`/users/${u.id}`, { username: `${username}_old${Date.now() % 1_000_000}`, isActive: false });
    }
  }
}

const TEACHER_NAMES = [['سارا', 'رحیمی'], ['نیلوفر', 'کاظمی'], ['حمید', 'شجاعی'], ['مهدی', 'ایزدی'], ['الهام', 'نادری'], ['امید', 'ملکی']];

/** چیدن ۲۰ زنگ هفتگی: هر درس در روزهای متفاوت */
function weeklySlots(courses) {
  const list = courses.flatMap((c) => Array.from({ length: c.course.weekly }, () => c));
  return list.map((c, i) => ({ classCourseId: c.ccId, dayOfWeek: i % 5, slot: Math.floor(i / 5) + 1 })).filter((s) => s.slot <= 4);
}

/**
 * @param ctx  { base, admin, pool, concurrency, build, timeZone, leadStudents }
 * @param lead { code, name, password }
 */
export async function provisionLead(ctx, lead) {
  const { admin, build } = ctx;
  const today = todayIn(ctx.timeZone);
  const rnd = createRandom(10_000 + lead.code);
  const names = leadUsernames(lead.code);
  const plan = yearPlan(build.plan.jy, today, 'cur');
  plan.id = build.yearId;
  plan.terms.forEach((t, i) => (t.id = build.termIds[i]));
  const hctx = { ...ctx, rnd, today, holidays: new Set(build.holidays) };

  await releaseUsernames(admin, names);

  // کلاس و معلم اختصاصی (کلاس نیمه‌کاره ساخت قبلی حذف می‌شود)
  const title = `هشتم (دمو ${faDigits(lead.code)})`;
  const rooms = await admin.get(`/classrooms?yearId=${build.yearId}`);
  for (const room of (rooms.items ?? rooms).filter((r) => r.title === title)) {
    await admin.del(`/classrooms/${room.id}`).catch((e) => log(`old class ${room.id} kept: ${e.message}`));
  }
  const { id: classroomId } = await admin.post('/classrooms', { title, gradeId: build.gradeId8, academicYearId: build.yearId });
  const [tFirst, tLast] = TEACHER_NAMES[lead.code % TEACHER_NAMES.length];
  const { id: teacherId } = await admin.post('/users', {
    username: names.teacher,
    password: lead.password,
    firstName: tFirst,
    lastName: tLast,
    roleId: build.roles.teacher,
  });
  const cls = { id: classroomId, title, plan, grade: { sortOrder: 8, courses: build.courses8 }, students: [], courses: [] };
  for (const course of build.courses8) {
    const { id } = await admin.post(`/classrooms/${classroomId}/courses`, { courseId: course.id, teacherId });
    cls.courses.push({ ccId: id, course, teacherId });
  }
  for (const slot of weeklySlots(cls.courses)) await admin.put(`/classrooms/${classroomId}/schedule`, slot);
  cls.schedule = await admin.get(`/classrooms/${classroomId}/schedule`);

  // دانش‌آموزان با پرونده و والدین
  for (let i = 0; i < ctx.leadStudents; i++) {
    const s = makeStudent(rnd);
    // دانش‌آموزِ حساب متقاضی کمی بالاتر از میانگین باشد تا کارنامه‌اش خواندنی باشد
    if (i === 0) s.ability = 16.5;
    const body = registrationBody(rnd, s, 8, classroomId);
    const { id } = await admin.post('/students', body);
    cls.students.push({ ...s, id, nationalId: body.nationalId });
  }

  // حساب‌های متقاضی
  const student = cls.students[0];
  await admin.patch(`/users/${student.id}`, { username: names.student, password: lead.password });
  student.username = names.student;
  student.password = lead.password;
  const { parents } = await admin.get(`/users/${student.id}/guardians`);
  const father = parents[0];
  await admin.patch(`/users/${father.userId}`, { username: names.parent, password: lead.password });
  const [first, ...rest] = lead.name.trim().split(/\s+/);
  const { id: adminId } = await admin.post('/users', {
    username: names.admin,
    password: lead.password,
    firstName: first.slice(0, 64),
    lastName: (rest.join(' ') || 'مدیر').slice(0, 64),
    roleId: build.roles.demo_admin,
  });

  // سابقه کلاس
  const classes = [cls];
  await history.attendance(hctx, classes);
  await history.grades(hctx, classes);
  await history.discipline(hctx, classes, 6);
  await history.diary(hctx, classes);
  const assignments = await history.homework(hctx, classes);
  await history.homeworkSubmissions(hctx, assignments, cls.students);
  await history.finance(hctx, classes);
  await history.onlineExams(hctx, cls, [student.id]);
  await history.forms(hctx, cls);
  await admin.post('/announcements', {
    title: `خوش آمدید به ${title}`,
    body: 'این کلاس مخصوص شماست. هر تغییری بدهید فقط روی همین نسخه نمایشی اثر دارد و شب‌ها همه‌چیز به حالت اول برمی‌گردد.',
    audience: 'classroom',
    audienceClassroomId: classroomId,
  });

  log(`lead ${lead.code}: provisioned class ${classroomId}`);
  return {
    classroomId,
    userIds: { admin: adminId, teacher: teacherId, parent: father.userId, student: student.id },
  };
}

export async function setLeadActive(ctx, lead, isActive) {
  const ids = Object.values(lead.provision?.userIds ?? {});
  for (const id of ids) {
    try {
      await ctx.admin.patch(`/users/${id}`, { isActive });
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
}
