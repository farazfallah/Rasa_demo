// فایل‌های راهنمای سامانه (PDF یا Word) که از پنل بارگذاری و در صفحه «راهنمای کامل» سایت دانلود می‌شوند
import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export const DOC_TYPES = {
  pdf: { mime: 'application/pdf', magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: (b) => b[0] === 0x50 && b[1] === 0x4b,
  },
};
export const DOC_MAX_BYTES = 60 * 1024 * 1024;
const MAX_DOCS = 20;

export class Docs {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'docs');
    this.indexFile = path.join(this.dir, 'index.json');
    this.items = [];
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    try {
      this.items = JSON.parse(await readFile(this.indexFile, 'utf8'));
    } catch {
      this.items = [];
    }
    return this;
  }

  async save() {
    const tmp = `${this.indexFile}.tmp`;
    await writeFile(tmp, JSON.stringify(this.items, null, 2));
    await rename(tmp, this.indexFile);
  }

  /** فهرست عمومی (جدیدترین اول، به ترتیب دلخواه پنل) */
  list() {
    return this.items.map(({ id, title, filename, type, size, uploadedAt }) => ({
      id,
      title,
      filename,
      type,
      size,
      uploadedAt,
      url: `/docs/${id}/${encodeURIComponent(filename)}`,
    }));
  }

  get(id) {
    return this.items.find((d) => d.id === id) ?? null;
  }

  async add({ title, filename, buffer }) {
    if (this.items.length >= MAX_DOCS) throw Object.assign(new Error(`حداکثر ${MAX_DOCS} فایل؛ اول یکی را حذف کنید`), { status: 400 });
    const ext = path.extname(filename).slice(1).toLowerCase();
    const kind = DOC_TYPES[ext];
    if (!kind) throw Object.assign(new Error('فقط فایل PDF یا Word (docx) پذیرفته می‌شود'), { status: 400 });
    if (!kind.magic(buffer)) throw Object.assign(new Error('محتوای فایل با نوع آن جور نیست'), { status: 400 });
    const id = randomBytes(8).toString('hex');
    await writeFile(path.join(this.dir, `${id}.${ext}`), buffer);
    const doc = { id, title, filename, type: ext, size: buffer.length, uploadedAt: new Date().toISOString() };
    this.items.unshift(doc);
    await this.save();
    return doc;
  }

  async remove(id) {
    const doc = this.get(id);
    if (!doc) throw Object.assign(new Error('فایل پیدا نشد'), { status: 404 });
    this.items = this.items.filter((d) => d.id !== id);
    await this.save();
    await rm(path.join(this.dir, `${id}.${doc.type}`), { force: true });
  }

  /** جابه‌جایی در فهرست (برای اینکه فایل اصلی بالای صفحه باشد) */
  async move(id, delta) {
    const i = this.items.findIndex((d) => d.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.items.length) return;
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
    await this.save();
  }

  async rename(id, title) {
    const doc = this.get(id);
    if (!doc) throw Object.assign(new Error('فایل پیدا نشد'), { status: 404 });
    doc.title = title;
    await this.save();
  }

  filePath(doc) {
    return path.join(this.dir, `${doc.id}.${doc.type}`);
  }
}
