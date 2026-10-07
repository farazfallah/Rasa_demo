// ساخت کامل مدرسه نمونه از صفر
import { log } from '../lib/log.js';
import { createRandom } from '../lib/random.js';
import { todayIn } from '../lib/jalali.js';
import { academicYearOf, yearPlan } from './timeline.js';
import * as setup from './setup.js';
import * as history from './history.js';

export async function buildSchool(config) {
  const started = Date.now();
  const today = config.today ?? todayIn(config.timeZone);
  const jy = academicYearOf(today);
  const years = [...(config.previousYear ? [yearPlan(jy - 1, today, 'prev')] : []), yearPlan(jy, today, 'cur')];
  const admin = await setup.rootSession(config.apiBase, config.rootPassword);
  const ctx = {
    base: config.apiBase,
    today,
    years,
    admin,
    rnd: createRandom(config.seed ?? 1405),
    concurrency: config.concurrency ?? 8,
    zarinpalMerchant: config.zarinpalMerchant,
  };
  const step = async (name, fn) => {
    const t = Date.now();
    const r = await fn();
    log(`build: ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)${r !== undefined && typeof r !== 'object' ? ` → ${r}` : ''}`);
    return r;
  };

  await step('roles', () => setup.loadRoles(ctx));
  await step('workers', () => setup.setupWorkers(ctx, config.workers ?? 3, config.workerPassword));
  await step('settings', () => setup.setupSettings(ctx));
  await step('years', () => setup.setupYears(ctx));
  await step('holidays', () => setup.setupHolidays(ctx));
  await step('structure', () => setup.setupStructure(ctx));
  await step('staff', () => setup.setupStaff(ctx));
  await step('classes', () => setup.setupClasses(ctx, config.studentsPerClass ?? 30));
  await step('timetable', () => setup.setupTimetable(ctx));

  const cur = ctx.classes.filter((c) => c.plan.key === 'cur');
  const all = ctx.classes;
  await step('attendance', () => history.attendance(ctx, all));
  await step('grades', () => history.grades(ctx, all));
  await step('discipline', () => history.discipline(ctx, all, 8));
  await step('diary', () => history.diary(ctx, cur));
  const examClass = cur.find((c) => c.grade.sortOrder === 8) ?? cur[0];
  const assignments = await step('homework', () => history.homework(ctx, cur));
  await step('finance', () => history.finance(ctx, cur));
  await step('library', () => history.library(ctx, cur.flatMap((c) => c.students)));
  await step('announcements', () => history.announcements(ctx, cur));
  await step('reports', () => history.publishReports(ctx));
  await step('submissions', () => history.homeworkSubmissions(ctx, assignments.filter((a) => a.cls === examClass), examClass.students));
  await step('exams', async () => (await history.onlineExams(ctx, examClass)).takers);
  await step('forms', () => history.forms(ctx, examClass));

  log(`build: done in ${Math.round((Date.now() - started) / 1000)}s, ${ctx.pool.requests} requests`);
  return {
    builtAt: new Date().toISOString(),
    today,
    yearId: years.at(-1).id,
    termIds: years.at(-1).terms.map((t) => t.id),
    plan: years.at(-1),
    holidays: [...ctx.holidays],
    gradeId8: ctx.grades.find((g) => g.sortOrder === 8)?.id,
    courses8: ctx.grades.find((g) => g.sortOrder === 8)?.courses,
    roles: ctx.roles,
  };
}
