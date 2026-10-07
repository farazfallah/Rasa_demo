// عدد تصادفی تکرارپذیر: مدرسه نمونه هر شب با همان نام‌ها و همان ترکیب ساخته می‌شود
export function createRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rnd = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    /** توزیع نرمال (Box-Muller) */
    normal: (mean, sd) => {
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** کد ملی معتبر (رقم کنترل درست) */
    nationalId: () => {
      for (;;) {
        const digits = Array.from({ length: 9 }, () => Math.floor(next() * 10));
        if (new Set(digits).size === 1) continue;
        const sum = digits.reduce((s, d, i) => s + d * (10 - i), 0) % 11;
        const check = sum < 2 ? sum : 11 - sum;
        return digits.join('') + check;
      }
    },
    mobile: () => `09${rnd.pick(['12', '13', '19', '35', '36', '37', '38', '39', '01', '02', '21', '22'])}${String(Math.floor(next() * 1e7)).padStart(7, '0')}`,
  };
  return rnd;
}
