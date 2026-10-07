// کلاینت API سامانه رسا. همه داده‌های نمایشی از همین مسیر رسمی ساخته می‌شوند (نه با نوشتن مستقیم در پایگاه داده)
// تا با تغییر ساختار جدول‌ها در نسخه‌های بعدی اپ، کیت دمو نشکند.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(status, method, path, body) {
    const message = typeof body?.message === 'string' ? body.message : Array.isArray(body?.message) ? body.message.join('، ') : JSON.stringify(body);
    const issues = Array.isArray(body?.issues) ? ` (${body.issues.map((i) => `${i.path ?? ''}: ${i.message}`).join('؛ ')})` : '';
    super(`${method} ${path} → ${status}: ${message}${issues}`);
    this.status = status;
    this.body = body;
  }
}

export class Session {
  /** @param {string} base نشانی API، مثلا http://api:3000/api */
  constructor(base, username, password) {
    this.base = base.replace(/\/$/, '');
    this.username = username;
    this.password = password;
    this.token = null;
    this.user = null;
    this.requests = 0;
  }

  async login() {
    const res = await this.raw('POST', '/auth/login', { username: this.username, password: this.password }, false);
    this.token = res.accessToken;
    this.user = res.user;
    return res;
  }

  async raw(method, path, body, auth = true, attempt = 0) {
    if (auth && !this.token) await this.login();
    let res;
    try {
      res = await fetch(this.base + path, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(auth ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      // API در حال راه‌اندازی یا قطعی کوتاه
      if (attempt < 8) {
        await sleep(1000 * 2 ** Math.min(attempt, 5));
        return this.raw(method, path, body, auth, attempt + 1);
      }
      throw e;
    }
    this.requests++;
    if (res.status === 401 && auth && attempt < 2) {
      await this.login();
      return this.raw(method, path, body, auth, attempt + 1);
    }
    // سقف درخواست هر حساب در دقیقه
    if ((res.status === 429 || res.status === 502 || res.status === 503) && attempt < 12) {
      const wait = Number(res.headers.get('retry-after')) || 2 ** Math.min(attempt, 4);
      await sleep(wait * 1000);
      return this.raw(method, path, body, auth, attempt + 1);
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) throw new ApiError(res.status, method, path, data);
    return data;
  }

  get(path) {
    return this.raw('GET', path);
  }
  post(path, body = {}) {
    return this.raw('POST', path, body);
  }
  put(path, body = {}) {
    return this.raw('PUT', path, body);
  }
  patch(path, body = {}) {
    return this.raw('PATCH', path, body);
  }
  del(path) {
    return this.raw('DELETE', path);
  }
}

/**
 * چند حساب مدیر هم‌زمان: API برای هر حساب سقف درخواست در دقیقه دارد؛
 * کارهای پرتعداد (حضور و غیاب روزانه، نمره‌ها) بین این حساب‌ها پخش می‌شوند.
 */
export class Pool {
  constructor(sessions) {
    this.sessions = sessions;
    this.i = 0;
  }
  next() {
    return this.sessions[this.i++ % this.sessions.length];
  }
  get requests() {
    return this.sessions.reduce((s, x) => s + x.requests, 0);
  }
}

/** اجرای کارها با حداکثر n کار هم‌زمان */
export async function parallel(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}

export async function waitForApi(base, timeoutMs = 180_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch {
      // هنوز بالا نیامده
    }
    if (Date.now() > end) throw new Error('API در دسترس نیست');
    await sleep(2000);
  }
}
