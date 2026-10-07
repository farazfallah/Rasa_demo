// هماهنگ‌کننده کیت: بازسازی شبانه، تأیید و ساخت دسترسی متقاضیان، انقضا
import { randomBytes, randomInt } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import { Session, Pool, waitForApi } from './lib/api.js';
import { log } from './lib/log.js';
import { Store } from './store.js';
import { resetAll } from './reset.js';
import { buildSchool } from './build/school.js';
import { provisionLead, setLeadActive, leadUsernames } from './build/lead.js';

/** رمز خوانا: بدون حروف و ارقام شبیه به هم */
export function makePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += letters[randomInt(letters.length)];
  for (let i = 0; i < 4; i++) s += digits[randomInt(digits.length)];
  return s;
}

export class Kit {
  constructor(config) {
    this.config = config;
    this.store = new Store(config.dataDir);
    this.queue = Promise.resolve();
    this.busy = null;
  }

  async init() {
    await this.store.load();
    return this;
  }

  get data() {
    return this.store.data;
  }

  /** همه کارهای سنگین پشت سر هم اجرا می‌شوند */
  enqueue(label, fn) {
    const run = this.queue.then(async () => {
      this.busy = { label, since: new Date().toISOString() };
      try {
        return await fn();
      } finally {
        this.busy = null;
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  sessions() {
    const { apiBase, rootPassword, workerPassword, workers } = this.config;
    const admin = new Session(apiBase, 'admin', rootPassword);
    const list = [admin, ...Array.from({ length: workers }, (_, i) => new Session(apiBase, `kit_worker${i + 1}`, workerPassword))];
    return { admin, pool: new Pool(list) };
  }

  async maintenance(on) {
    if (!this.config.maintenanceFile) return;
    if (on) await writeFile(this.config.maintenanceFile, new Date().toISOString());
    else await rm(this.config.maintenanceFile, { force: true });
  }

  async rebuild({ skipReset = false } = {}) {
    if (!this.data) await this.init();
    const started = new Date().toISOString();
    this.data.build = { ...(this.data.build ?? {}), state: 'running', startedAt: started, error: null };
    await this.store.save();
    await this.maintenance(true);
    try {
      // API هنگام راه‌اندازی migrationها را اجرا می‌کند؛ پیش از پاک‌سازی باید بالا آمده باشد
      await waitForApi(this.config.apiBase, 600_000);
      if (!skipReset) await resetAll(this.config);
      await waitForApi(this.config.apiBase);
      const result = await buildSchool(this.config);
      this.data.build = { state: 'ok', startedAt: started, finishedAt: new Date().toISOString(), error: null, ...result };
      await this.store.save();
      // حساب متقاضیان فعال دوباره با همان نام کاربری و رمز ساخته می‌شود
      for (const lead of this.data.leads.filter((l) => l.status === 'active')) {
        await this.provision(lead);
      }
    } catch (e) {
      log('rebuild failed:', e.stack ?? e.message);
      this.data.build = { ...this.data.build, state: 'error', error: e.message, finishedAt: new Date().toISOString() };
      await this.store.save();
      throw e;
    } finally {
      await this.maintenance(false);
    }
  }

  async provision(lead) {
    const build = this.data.build;
    if (build?.state !== 'ok') throw new Error('مدرسه نمونه هنوز ساخته نشده است');
    lead.provision = { state: 'running', at: new Date().toISOString(), error: null };
    await this.store.save();
    try {
      const { admin, pool } = this.sessions();
      const result = await provisionLead(
        { base: this.config.apiBase, admin, pool, concurrency: this.config.concurrency, build, timeZone: this.config.timeZone, leadStudents: this.config.leadStudents },
        lead,
      );
      lead.provision = { state: 'ok', at: new Date().toISOString(), error: null, buildAt: build.finishedAt, ...result };
    } catch (e) {
      log(`lead ${lead.code} failed:`, e.stack ?? e.message);
      lead.provision = { state: 'error', at: new Date().toISOString(), error: e.message };
    }
    await this.store.save();
    return lead;
  }

  // ---------------------------------------------------------------- درخواست‌ها

  async addRequest(input) {
    const lead = {
      id: randomBytes(6).toString('hex'),
      code: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
      ...input,
    };
    this.data.leads.unshift(lead);
    await this.store.save();
    log(`new demo request from ${input.name} (${input.school})`);
    return lead;
  }

  async approve(id, days = this.config.leadDays) {
    const lead = this.mustGet(id);
    if (lead.status === 'active') return lead;
    if (!lead.code) lead.code = ++this.data.seq;
    lead.password ??= makePassword();
    lead.usernames = leadUsernames(lead.code);
    lead.status = 'active';
    lead.approvedAt = new Date().toISOString();
    lead.expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    await this.store.save();
    const alreadyBuilt = lead.provision?.state === 'ok' && lead.provision.buildAt === this.data.build?.finishedAt;
    if (alreadyBuilt) {
      await this.enqueue(`فعال‌سازی ${lead.code}`, () => setLeadActive(this.sessions(), lead, true));
    } else {
      // اگر در این فاصله بازسازی شبانه حساب را ساخته باشد، دوباره ساخته نمی‌شود
      this.enqueue(`ساخت دسترسی ${lead.code}`, () =>
        lead.provision?.state === 'ok' && lead.provision.buildAt === this.data.build?.finishedAt ? lead : this.provision(lead),
      );
    }
    return lead;
  }

  async reject(id) {
    const lead = this.mustGet(id);
    if (lead.status !== 'pending') throw new Error('فقط درخواست در انتظار رد می‌شود');
    lead.status = 'rejected';
    await this.store.save();
    return lead;
  }

  async extend(id, days = this.config.leadDays) {
    const lead = this.mustGet(id);
    if (lead.status !== 'active' && lead.status !== 'expired') throw new Error('این درخواست دسترسی فعالی ندارد');
    const base = Math.max(Date.now(), Date.parse(lead.expiresAt ?? 0));
    lead.expiresAt = new Date(base + days * 86_400_000).toISOString();
    if (lead.status === 'expired') return this.approve(id, Math.ceil((Date.parse(lead.expiresAt) - Date.now()) / 86_400_000));
    await this.store.save();
    return lead;
  }

  async revoke(id) {
    const lead = this.mustGet(id);
    lead.status = 'expired';
    lead.expiresAt = new Date().toISOString();
    await this.store.save();
    await this.enqueue(`قطع دسترسی ${lead.code}`, () => setLeadActive(this.sessions(), lead, false));
    return lead;
  }

  async remove(id) {
    const lead = this.mustGet(id);
    if (lead.status === 'active') await this.revoke(id);
    this.data.leads = this.data.leads.filter((l) => l.id !== id);
    await this.store.save();
  }

  async retry(id) {
    const lead = this.mustGet(id);
    if (lead.status !== 'active') throw new Error('درخواست فعال نیست');
    this.enqueue(`ساخت دوباره ${lead.code}`, () => this.provision(lead));
    return lead;
  }

  /** غیرفعال کردن حساب متقاضیانی که مهلتشان تمام شده */
  async expireLeads() {
    if (!this.data) await this.init();
    const now = Date.now();
    const due = this.data.leads.filter((l) => l.status === 'active' && Date.parse(l.expiresAt) <= now);
    for (const lead of due) {
      lead.status = 'expired';
      await this.store.save();
      await this.enqueue(`انقضای ${lead.code}`, () => setLeadActive(this.sessions(), lead, false)).catch((e) => log('expire failed:', e.message));
      log(`lead ${lead.code} expired`);
    }
    return due.length;
  }

  mustGet(id) {
    const lead = this.store.lead(id);
    if (!lead) throw Object.assign(new Error('درخواست یافت نشد'), { status: 404 });
    return lead;
  }
}
