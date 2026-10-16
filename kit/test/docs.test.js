import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Docs } from '../src/docs.js';

test('docs: stores, lists, orders and removes guide files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kit-docs-'));
  const docs = await new Docs(dir).init();
  const pdf = Buffer.from('%PDF-1.7\n%%EOF\n');
  const a = await docs.add({ title: 'راهنمای کامل', filename: 'راهنما.pdf', buffer: pdf });
  const b = await docs.add({ title: 'معرفی', filename: 'intro.docx', buffer: Buffer.from([0x50, 0x4b, 3, 4, 0]) });
  assert.deepEqual(docs.list().map((d) => d.id), [b.id, a.id]);
  assert.equal(docs.list()[1].url, `/docs/${a.id}/${encodeURIComponent('راهنما.pdf')}`);
  await docs.move(a.id, -1);
  assert.equal(docs.list()[0].id, a.id);
  assert.deepEqual(await readFile(docs.filePath(a)), pdf);
  // پس از راه‌اندازی دوباره هم فهرست می‌ماند
  const again = await new Docs(dir).init();
  assert.equal(again.list().length, 2);
  await assert.rejects(docs.add({ title: 'x', filename: 'x.exe', buffer: pdf }), /PDF یا Word/);
  await assert.rejects(docs.add({ title: 'x', filename: 'x.pdf', buffer: Buffer.from('hello') }), /جور نیست/);
  await docs.remove(b.id);
  assert.equal(docs.list().length, 1);
});
