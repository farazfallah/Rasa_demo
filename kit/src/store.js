// ذخیره درخواست‌ها و وضعیت کیت در یک فایل JSON (حجم کم؛ نیازی به پایگاه داده جدا نیست)
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EMPTY = { seq: 100, leads: [], build: null };

export class Store {
  constructor(dir) {
    this.file = path.join(dir, 'kit.json');
    this.dir = dir;
    this.data = null;
    this.writing = Promise.resolve();
  }

  async load() {
    await mkdir(this.dir, { recursive: true });
    try {
      this.data = { ...EMPTY, ...JSON.parse(await readFile(this.file, 'utf8')) };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      this.data = structuredClone(EMPTY);
    }
    return this.data;
  }

  /** نوشتن اتمی (فایل موقت و جابه‌جایی) و پشت سر هم */
  save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, snapshot);
      await rename(tmp, this.file);
    });
    return this.writing;
  }

  lead(id) {
    return this.data.leads.find((l) => l.id === id);
  }
}
