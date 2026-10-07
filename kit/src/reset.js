// پاک‌سازی کامل داده‌های نسخه نمایشی: جدول‌ها، کش Redis و فایل‌های بارگذاری‌شده
// ساختار جدول‌ها (migrationها) دست نمی‌خورد؛ سپس seed پایه خود اپ اجرا می‌شود.
import net from 'node:net';
import { spawn } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { log } from './lib/log.js';

export async function truncateAll(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(`select tablename from pg_tables where schemaname = 'public'`);
    if (!rows.length) throw new Error('جدولی یافت نشد؛ آیا migrationهای اپ اجرا شده‌اند؟');
    const list = rows.map((r) => `"public"."${r.tablename.replace(/"/g, '""')}"`).join(', ');
    await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    return rows.length;
  } finally {
    await client.end();
  }
}

/** FLUSHDB با پروتکل ساده Redis (بدون وابستگی اضافه) */
export function flushRedis(redisUrl) {
  const url = new URL(redisUrl);
  const db = Number(url.pathname.replace('/', '') || 0);
  const cmd = (...args) => `*${args.length}\r\n${args.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join('')}`;
  const commands = [];
  if (url.password) commands.push(url.username ? cmd('AUTH', decodeURIComponent(url.username), decodeURIComponent(url.password)) : cmd('AUTH', decodeURIComponent(url.password)));
  commands.push(cmd('SELECT', db), cmd('FLUSHDB'));
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(url.port || 6379), url.hostname);
    let buf = '';
    socket.setTimeout(10_000, () => socket.destroy(new Error('Redis timeout')));
    socket.on('connect', () => socket.write(commands.join('')));
    socket.on('data', (d) => {
      buf += d.toString();
      if (buf.startsWith('-')) return socket.destroy(new Error(`Redis: ${buf.trim()}`));
      if ((buf.match(/\r\n/g) ?? []).length >= commands.length) {
        socket.end();
        resolve();
      }
    });
    socket.on('error', reject);
  });
}

export async function clearUploads(dir) {
  if (!dir) return 0;
  let n = 0;
  for (const name of await readdir(dir).catch(() => [])) {
    if (name.startsWith('.')) continue;
    await rm(path.join(dir, name), { recursive: true, force: true });
    n++;
  }
  return n;
}

/** seed پایه خود اپ (نقش‌ها، ماژول‌ها، تنظیمات پیش‌فرض و کاربر admin) */
export function runBaseSeed(command, databaseUrl) {
  return new Promise((resolve, reject) => {
    const [bin, ...args] = command.split(' ').filter(Boolean);
    const child = spawn(bin, args, { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`seed failed (${code}): ${out.slice(-500)}`))));
  });
}

export async function resetAll(config) {
  const tables = await truncateAll(config.databaseUrl);
  await flushRedis(config.redisUrl);
  const files = await clearUploads(config.uploadsDir);
  await runBaseSeed(config.seedCommand, config.databaseUrl);
  log(`reset: ${tables} tables truncated, ${files} uploads removed, base seed done`);
}
