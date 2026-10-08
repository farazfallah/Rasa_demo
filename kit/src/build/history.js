// سابقه مدرسه: حضور و غیاب، نمره، انضباط، دفتر کلاسی، تکالیف، مالی، کتابخانه، آزمون و اطلاعیه‌ها
import { parallel, Session } from '../lib/api.js';
import { log } from '../lib/log.js';
import { addDays, localDateTime, weekday, faDigits } from '../lib/jalali.js';
import { schoolDays, yearDate } from './timeline.js';
import { ANNOUNCEMENTS, BOOKS, DISCIPLINE_NEGATIVE, DISCIPLINE_POSITIVE, TOPICS } from './data.js';

const round = (v, step = 0.25) => Math.round(v / step) * step;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** حضور و غیاب روزانه همه روزهای درسی گذشته */
export async function attendance(ctx, classes) {
  const { rnd } = ctx;
  const jobs = [];
  for (const cls of classes) {
    const days = schoolDays(cls.plan.start, cls.plan.historyEnd, ctx.holidays);
    for (const date of days) {
      const records = cls.students.map((s) => {
        const r = rnd.next();
        if (r < s.absence) return { studentId: s.id, status: rnd.chance(0.25) ? 'excused' : 'absent', note: null };
        if (r < s.absence + s.lateness) return { studentId: s.id, status: 'late', note: null };
        return { studentId: s.id, status: 'present' };
      });
      jobs.push({ cls, date, records });
    }
  }
  await parallel(jobs, ctx.concurrency, (j) => ctx.pool.next().put(`/attendance/classrooms/${j.cls.id}`, { date: j.date, records: j.records }));
  return jobs.length;
}

/** موارد ارزشیابی هر نوبت؛ فقط مواردی که تاریخشان گذشته ساخته می‌شوند */
function gradePlan(plan) {
  const [t1, t2] = plan.terms;
  return [
    { term: t1, title: 'پرسش کلاسی', category: 'oral', weight: 1, date: yearDate(plan, 7, 9) },
    { term: t1, title: 'کوییز ۱', category: 'quiz', weight: 1, date: yearDate(plan, 7, 28) },
    { term: t1, title: 'کوییز ۲', category: 'quiz', weight: 1, date: yearDate(plan, 8, 22) },
    { term: t1, title: 'فعالیت کلاسی', category: 'activity', weight: 1, date: yearDate(plan, 9, 25) },
    { term: t1, title: 'امتحان نوبت اول', category: 'final', weight: 2, date: yearDate(plan, 10, 12) },
    { term: t2, title: 'پرسش کلاسی', category: 'oral', weight: 1, date: yearDate(plan, 11, 12) },
    { term: t2, title: 'کوییز ۱', category: 'quiz', weight: 1, date: yearDate(plan, 11, 25) },
    { term: t2, title: 'کوییز ۲', category: 'quiz', weight: 1, date: yearDate(plan, 12, 18) },
    { term: t2, title: 'فعالیت کلاسی', category: 'activity', weight: 1, date: yearDate(plan, 2, 20) },
    { term: t2, title: 'امتحان نوبت دوم', category: 'final', weight: 2, date: yearDate(plan, 3, 12) },
  ];
}

export function scoreFor(rnd, student, course, category) {
  const spread = category === 'final' ? 1.8 : 1.4;
  return clamp(round(student.ability + course.level - 0.8 + rnd.normal(0, spread)), 2, 20);
}

export async function grades(ctx, classes) {
  const { rnd } = ctx;
  const jobs = [];
  for (const cls of classes) {
    const items = gradePlan(cls.plan).filter((i) => i.date <= cls.plan.historyEnd);
    for (const cc of cls.courses) for (const item of items) jobs.push({ cls, cc, item });
  }
  await parallel(jobs, ctx.concurrency, async ({ cls, cc, item }) => {
    const session = ctx.pool.next();
    const { id } = await session.post(`/grading/class-courses/${cc.ccId}/items`, {
      title: item.title,
      category: item.category,
      maxScore: 20,
      weight: item.weight,
      dueDate: item.date,
      termId: item.term.id,
    });
    const scores = cls.students.map((s) => ({
      studentId: s.id,
      // چند نمره ثبت‌نشده (غایب در کوییز) برای واقعی‌تر شدن کارنامه
      score: item.category === 'quiz' && rnd.chance(0.02) ? null : scoreFor(rnd, s, cc.course, item.category),
    }));
    await session.put(`/grading/items/${id}/scores`, { scores });
  });
  return jobs.length;
}

export async function discipline(ctx, classes, perClass) {
  const { rnd } = ctx;
  const jobs = [];
  for (const cls of classes) {
    const days = schoolDays(cls.plan.start, cls.plan.historyEnd, ctx.holidays);
    if (!days.length) continue;
    const count = Math.max(1, Math.round((perClass * days.length) / 160));
    for (let i = 0; i < count; i++) {
      const s = rnd.pick(cls.students);
      const positive = s.ability > 15 ? rnd.chance(0.75) : rnd.chance(0.35);
      const [title, points] = rnd.pick(positive ? DISCIPLINE_POSITIVE : DISCIPLINE_NEGATIVE);
      jobs.push({ studentId: s.id, type: positive ? 'positive' : 'negative', title, points, date: rnd.pick(days), description: null });
    }
  }
  await parallel(jobs, ctx.concurrency, (body) => ctx.pool.next().post('/discipline', body));
  return jobs.length;
}

/** دفتر کلاسی چند هفته اخیر (موضوع تدریس هر زنگ) */
export async function diary(ctx, classes, days = 12) {
  const { rnd } = ctx;
  const jobs = [];
  for (const cls of classes) {
    if (!cls.schedule?.length) continue;
    const recent = schoolDays(cls.plan.start, cls.plan.historyEnd, ctx.holidays).slice(-days);
    const progress = new Map();
    for (const date of recent) {
      for (const slot of cls.schedule.filter((s) => s.dayOfWeek === weekday(date))) {
        const cc = cls.courses.find((c) => c.ccId === slot.classCourseId);
        if (!cc) continue;
        // یک زنگ ثبت‌نشده هم بماند تا گزارش «دفترهای ثبت‌نشده» خالی نباشد
        if (rnd.chance(0.05)) continue;
        const topics = TOPICS[cc.course.title] ?? ['مرور درس'];
        const step = progress.get(cc.ccId) ?? 0;
        progress.set(cc.ccId, step + 1);
        const topic = topics[Math.min(Math.floor(step / 2), topics.length - 1)];
        jobs.push({
          classCourseId: cc.ccId,
          date,
          slot: slot.slot,
          topic: step % 2 ? `${topic} (ادامه و حل تمرین)` : topic,
          homework: rnd.chance(0.4) ? `تمرین‌های پایان درس «${topic}»` : null,
          notes: null,
        });
      }
    }
  }
  await parallel(jobs, ctx.concurrency, (body) => ctx.pool.next().put('/diary/entries', body));
  return jobs.length;
}

/** تکالیف: دو تکلیف گذشته و یک تکلیف باز برای درس‌های اصلی */
export async function homework(ctx, classes) {
  const created = [];
  const main = ['ریاضی', 'علوم تجربی', 'زبان انگلیسی', 'ادبیات فارسی'];
  const jobs = [];
  for (const cls of classes) {
    for (const cc of cls.courses.filter((c) => main.includes(c.course.title))) {
      const topics = TOPICS[cc.course.title];
      const today = ctx.today;
      for (const [i, offset] of [-12, -5, 4].entries()) {
        const due = addDays(today, offset);
        if (due < cls.plan.start) continue;
        jobs.push({ cls, cc, i, body: {
          title: `تکلیف ${faDigits(i + 1)}: ${topics[i] ?? topics[0]}`,
          description: `تمرین‌های مربوط به «${topics[i] ?? topics[0]}» را حل کنید و تصویر برگه یا متن پاسخ را ارسال کنید.`,
          dueAt: localDateTime(due, '20:00'),
          maxScore: 20,
          allowLate: i === 0,
        } });
      }
    }
  }
  await parallel(jobs, ctx.concurrency, async (j) => {
    const { id } = await ctx.pool.next().post(`/homework/class-courses/${j.cc.ccId}/assignments`, j.body);
    created.push({ id, cls: j.cls, cc: j.cc, due: j.body.dueAt, index: j.i });
  });
  return created;
}

/** پاسخ دانش‌آموزان به تکالیف (با ورود خود دانش‌آموز) و نمره معلم */
export async function homeworkSubmissions(ctx, assignments, students) {
  const { rnd } = ctx;
  let count = 0;
  await parallel(students, 4, async (s) => {
    const session = new Session(ctx.base, s.username ?? s.nationalId, s.password ?? s.nationalId);
    for (const a of assignments) {
      if (!rnd.chance(a.index === 2 ? 0.4 : 0.85)) continue;
      try {
        await session.put(`/homework/assignments/${a.id}/submission`, { text: 'پاسخ تمرین‌ها در فایل پیوست و خلاصه آن: همه تمرین‌ها حل شد؛ در تمرین آخر سؤال داشتم.' });
        count++;
      } catch (e) {
        // مهلت تکلیف گذشته و ارسال دیرهنگام مجاز نیست
        if (e.status !== 400) throw e;
      }
    }
  });
  // نمره تکالیف گذشته
  for (const a of assignments.filter((x) => x.index < 2)) {
    const { students: rows } = await ctx.admin.get(`/homework/assignments/${a.id}/submissions`);
    for (const row of rows.filter((x) => x.submission && x.submission.score === null)) {
      const sub = row.submission;
      const student = students.find((s) => s.id === row.studentId);
      if (!student || !rnd.chance(0.8)) continue;
      await ctx.pool.next().put(`/homework/submissions/${sub.id}/grade`, {
        score: clamp(round(student.ability + rnd.normal(0.5, 1.5), 0.5), 5, 20),
        feedback: student.ability > 16 ? 'عالی بود، آفرین.' : 'خوب است؛ به تمرین آخر دقت بیشتری کن.',
      });
    }
  }
  return count;
}

/** شهریه چهار قسطی و پرداخت قسط‌های سررسیدشده */
export async function finance(ctx, classes) {
  const { rnd } = ctx;
  const fees = { 7: 48_000_000, 8: 50_000_000, 9: 52_000_000 };
  for (const cls of classes) {
    const plan = cls.plan;
    await ctx.admin.post('/finance/invoices', {
      title: `شهریه سال تحصیلی ${plan.title}`,
      amount: fees[cls.grade.sortOrder] ?? 50_000_000,
      classroomId: cls.id,
      installments: 4,
      intervalMonths: 2,
      dueDate: yearDate(plan, 7, 1),
    });
  }
  // صورتحساب‌های سررسیدشده
  const due = [];
  for (const cls of classes) {
    for (let page = 1; ; page++) {
      const res = await ctx.admin.get(`/finance/invoices?classroomId=${cls.id}&limit=100&page=${page}`);
      for (const inv of res.items) if (inv.dueDate && inv.dueDate <= cls.plan.historyEnd) due.push({ inv, cls });
      if (res.items.length < 100) break;
    }
  }
  const payer = new Map();
  const jobs = [];
  for (const { inv, cls } of due) {
    // هر خانواده رفتار پرداخت ثابتی دارد
    if (!payer.has(inv.studentId)) payer.set(inv.studentId, rnd.next());
    const p = payer.get(inv.studentId);
    if (p < 0.08) continue;
    const latest = cls.plan.historyEnd;
    const paidAt = [addDays(inv.dueDate, rnd.int(-10, p < 0.2 ? 25 : 5))].map((d) => (d > latest ? latest : d))[0];
    const amount = p < 0.14 ? Math.round(inv.amount / 2 / 1000) * 1000 : inv.amount;
    jobs.push({ id: inv.id, body: { amount, paidAt, method: rnd.pick(['card', 'card', 'transfer', 'online', 'cash', 'cheque']), reference: String(rnd.int(100000, 999999)), note: null } });
  }
  await parallel(jobs, ctx.concurrency, (j) => ctx.pool.next().post(`/finance/invoices/${j.id}/payments`, j.body));
  return jobs.length;
}

export async function library(ctx, students) {
  const { rnd, admin } = ctx;
  const books = [];
  for (const [i, [title, author, category]] of BOOKS.entries()) {
    const { id } = await admin.post('/library/books', {
      title,
      author,
      category,
      shelf: `${'ABCDE'[i % 5]}${1 + (i % 4)}`,
      totalCopies: rnd.int(1, 4),
      publisher: null,
      isbn: null,
    });
    books.push(id);
  }
  let loans = 0;
  for (const bookId of rnd.shuffle(books).slice(0, 18)) {
    const s = rnd.pick(students);
    try {
      const { id } = await admin.post('/library/loans', { bookId, borrowerId: s.id, dueDate: addDays(ctx.today, rnd.int(3, 14)), note: null });
      loans++;
      if (rnd.chance(0.3)) await admin.post(`/library/loans/${id}/return`);
    } catch (e) {
      log('loan skipped:', e.message);
    }
  }
  return loans;
}

export async function announcements(ctx, classes) {
  for (const a of ANNOUNCEMENTS) await ctx.admin.post('/announcements', a);
  const cls = classes.find((c) => c.grade.sortOrder === 8) ?? classes[0];
  await ctx.admin.post('/announcements', {
    title: `برنامه کلاس جبرانی ${cls.title}`,
    body: 'کلاس جبرانی ریاضی این هفته روز سه‌شنبه زنگ آخر برگزار می‌شود.',
    audience: 'classroom',
    audienceClassroomId: cls.id,
  });
}

/** گزارش کارنامه نوبت‌ها و سال‌های تمام‌شده */
export async function publishReports(ctx) {
  for (const plan of ctx.years) {
    for (const term of plan.terms) {
      if (term.end <= plan.historyEnd) await ctx.admin.post(`/report-cards/publish/term/${term.id}`, { published: true });
    }
    if (plan.end <= plan.historyEnd) await ctx.admin.post(`/report-cards/publish/year/${plan.id}`, { published: true });
  }
}

// ---------------------------------------------------------------- آزمون آنلاین

const MATH_QUESTIONS = [
  { type: 'mcq', text: 'حاصل $(-3) \\times (-4) + 2$ کدام است؟', score: 2, options: [{ key: 'a', text: '۱۴' }, { key: 'b', text: '-۱۰' }, { key: 'c', text: '۱۰' }, { key: 'd', text: '-۱۴' }], correctKey: 'a' },
  { type: 'mcq', text: 'کدام عدد اول است؟', score: 2, options: [{ key: 'a', text: '۲۱' }, { key: 'b', text: '۲۷' }, { key: 'c', text: '۲۹' }, { key: 'd', text: '۳۳' }], correctKey: 'c' },
  { type: 'tf', text: 'مجموع زوایای داخلی هر مثلث ۱۸۰ درجه است.', score: 1, correctKey: 'true' },
  { type: 'tf', text: 'هر عدد زوج، بر ۴ بخش‌پذیر است.', score: 1, correctKey: 'false' },
  { type: 'blank', text: 'جواب معادله $2x + 6 = 14$ برابر [[4|۴]] است.', score: 2 },
  { type: 'short', text: 'بزرگ‌ترین شمارنده مشترک ۱۲ و ۱۸ را بنویسید.', score: 2, spec: { answers: ['6', '۶'] } },
  { type: 'mcq', text: 'محیط مربعی به ضلع ۵ سانتی‌متر چند سانتی‌متر است؟', score: 2, options: [{ key: 'a', text: '۱۰' }, { key: 'b', text: '۲۰' }, { key: 'c', text: '۲۵' }, { key: 'd', text: '۱۵' }], correctKey: 'b' },
  { type: 'match', text: 'هر عبارت را به حاصل آن وصل کنید.', score: 3, spec: { pairs: [{ left: '$2^3$', right: '۸' }, { left: '$\\sqrt{49}$', right: '۷' }, { left: '$3^2$', right: '۹' }], distractors: ['۶'], partial: true } },
  { type: 'desc', text: 'نشان دهید که مجموع دو عدد فرد همیشه زوج است.', score: 5, guide: 'نوشتن دو عدد فرد به شکل $2k+1$ و $2m+1$ (۲ نمره)، جمع و فاکتورگیری (۲ نمره)، نتیجه‌گیری (۱ نمره)' },
];

function answerFor(rnd, q, student) {
  const knows = rnd.next() < clamp((student.ability - 6) / 14, 0.15, 0.97);
  switch (q.type) {
    case 'mcq':
      return { answerKey: knows ? q.correctKey : rnd.pick(q.options.filter((o) => o.key !== q.correctKey)).key };
    case 'tf':
      return { answerKey: knows ? q.correctKey : q.correctKey === 'true' ? 'false' : 'true' };
    case 'blank':
      return { data: { list: [knows ? '4' : rnd.pick(['3', '8', '10'])] } };
    case 'short':
      return { answerText: knows ? '6' : rnd.pick(['3', '12', '2']) };
    case 'match':
      return null; // ترتیب ستون دوم در هر نسخه فرق دارد؛ بدون پاسخ می‌ماند
    case 'desc':
      return { answerText: knows ? 'دو عدد فرد را 2k+1 و 2m+1 می‌نویسیم. مجموع آن‌ها 2k+2m+2 = 2(k+m+1) است که زوج است.' : 'چون فرد به‌علاوه فرد می‌شود زوج، مثلا ۳+۵=۸.' };
  }
  return null;
}

/**
 * آزمون آنلاین ریاضی: یک آزمون باز (با شرکت بخشی از کلاس) و یک آزمون هفته آینده.
 * skipStudentIds: دانش‌آموزانی که نباید در آزمون شرکت داده شوند (حساب متقاضی، تا خودش امتحان کند)
 */
export async function onlineExams(ctx, cls, skipStudentIds = []) {
  const { rnd } = ctx;
  const cc = cls.courses.find((c) => c.course.title === 'ریاضی');
  const teacher = ctx.admin;
  const now = new Date();
  const { id } = await teacher.post(`/exams/class-courses/${cc.ccId}`, {
    title: 'آزمونک ریاضی: فصل اول و دوم',
    description: 'آزمون آنلاین تمرینی؛ نتیجه پس از تصحیح سؤال تشریحی اعلام می‌شود.',
    startsAt: new Date(now.getTime() - 60 * 60_000).toISOString(),
    endsAt: new Date(now.getTime() + 3 * 24 * 3600_000).toISOString(),
    durationMin: 40,
    attemptLimit: 1,
    shuffleQuestions: true,
    shuffleOptions: true,
    showResults: true,
    antiCheat: true,
  });
  const qids = new Map();
  for (const q of MATH_QUESTIONS) {
    const r = await teacher.post(`/exams/${id}/questions`, q);
    qids.set(r.id, q);
  }
  await teacher.post(`/exams/${id}/publish`);

  const takers = cls.students.filter((s) => !skipStudentIds.includes(s.id) && rnd.chance(0.8));
  await parallel(takers, 4, async (s) => {
    const session = new Session(ctx.base, s.username ?? s.nationalId, s.password ?? s.nationalId);
    const { attemptId } = await session.post(`/exams/${id}/start`);
    const answers = [];
    for (const [questionId, q] of qids) {
      const a = answerFor(rnd, q, s);
      if (a) answers.push({ questionId, ...a });
    }
    await session.post(`/exams/attempts/${attemptId}/submit`, { answers });
  });

  // آزمون هفته آینده (منتشرشده، هنوز شروع نشده)
  const next = addDays(ctx.today, 7);
  const { id: upcoming } = await teacher.post(`/exams/class-courses/${cc.ccId}`, {
    title: 'آزمون ریاضی: فصل سوم',
    description: null,
    startsAt: localDateTime(next, '09:00'),
    endsAt: localDateTime(next, '10:00'),
    durationMin: 30,
    attemptLimit: 1,
    shuffleQuestions: true,
    shuffleOptions: true,
    showResults: false,
    antiCheat: true,
  });
  for (const q of MATH_QUESTIONS.slice(0, 6)) await teacher.post(`/exams/${upcoming}/questions`, q);
  await teacher.post(`/exams/${upcoming}/publish`);
  return { examId: id, takers: takers.length };
}

// ---------------------------------------------------------------- فرم و رضایت‌نامه

export async function forms(ctx, cls) {
  try {
    const { id } = await ctx.admin.post('/forms', {
      title: 'رضایت‌نامه اردوی علمی موزه علوم و فناوری',
      description: 'اردوی یک‌روزه دانش‌آموزان به موزه علوم و فناوری. هزینه شامل ایاب و ذهاب و ناهار است.',
      consentText: 'اینجانب با شرکت فرزندم در اردوی علمی موزه علوم و فناوری موافقم و مسئولیت رعایت مقررات اردو را می‌پذیرم.',
      fields: [
        { id: 'phone', label: 'شماره تماس اضطراری', type: 'text', required: true },
        { id: 'lunch', label: 'نوع غذا', type: 'choice', required: true, options: ['چلوکباب', 'جوجه‌کباب', 'غذای گیاهی'] },
        { id: 'notes', label: 'نکته پزشکی یا توضیحات', type: 'textarea', required: false },
      ],
      fee: 850_000,
      deadline: addDays(ctx.today, 10),
      capacity: null,
      respondent: 'parent',
      classroomIds: [cls.id],
      status: 'open',
    });
    return id;
  } catch (e) {
    log('form skipped:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------- امتحانات نوبت

/** برنامه امتحانات نوبت اول (چیدمان خودکار)، سالن‌ها و چیدمان صندلی‌ها */
export async function termExams(ctx, classes) {
  const plan = classes[0].plan;
  const term = plan.terms[0];
  const written = ['ریاضی', 'علوم تجربی', 'ادبیات فارسی', 'نگارش', 'عربی', 'زبان انگلیسی', 'قرآن', 'پیام‌های آسمان', 'مطالعات اجتماعی'];
  const ccIds = classes.flatMap((c) => c.courses.filter((cc) => written.includes(cc.course.title)).map((cc) => cc.ccId));
  const { id } = await ctx.admin.post('/exam-schedules', { title: `امتحانات ${term.title}`, termId: term.id, startDate: term.finalsFrom, endDate: term.finalsTo });
  const { items } = await ctx.admin.post(`/exam-schedules/${id}/auto`, { classCourseIds: ccIds, startTime: '08:00', durationMin: 90, gapDays: 0, skipWeekdays: [5, 6] });
  await ctx.admin.put(`/exam-schedules/${id}/items`, { items });
  await ctx.admin.put(`/exam-schedules/${id}/rooms`, {
    rooms: [
      { name: 'سالن اجتماعات', rows: 12, cols: 10 },
      { name: 'سالن ورزشی', rows: 14, cols: 10 },
      { name: 'کتابخانه', rows: 6, cols: 8 },
    ],
  });
  await ctx.admin.post(`/exam-schedules/${id}/seating`, { spaced: false });
  await ctx.admin.post(`/exam-schedules/${id}/publish`, { published: true });
  return items.length;
}
