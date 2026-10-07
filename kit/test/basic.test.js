import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoToJalali, jalaliToIso, addDays, weekday, localDateTime } from '../src/lib/jalali.js';
import { academicYearOf, yearPlan, schoolDays } from '../src/build/timeline.js';
import { createRandom } from '../src/lib/random.js';
import { leadUsernames } from '../src/build/lead.js';
import { makePassword } from '../src/kit.js';

test('jalali matches Intl persian calendar', () => {
  const f = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
  for (let iso = '2020-01-01'; iso < '2032-01-01'; iso = addDays(iso, 3)) {
    const parts = f.formatToParts(new Date(`${iso}T00:00:00Z`));
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    const j = isoToJalali(iso);
    assert.deepEqual([j.jy, j.jm, j.jd], [get('year'), get('month'), get('day')], iso);
    assert.equal(jalaliToIso(j.jy, j.jm, j.jd), iso);
  }
});

test('weekday and tehran time', () => {
  assert.equal(weekday('2026-10-03'), 0); // شنبه
  assert.equal(localDateTime('2026-10-07', '08:00'), '2026-10-07T04:30:00.000Z');
});

test('academic year and plan', () => {
  assert.equal(academicYearOf('2026-10-07'), 1405);
  assert.equal(academicYearOf('2026-07-01'), 1404); // تابستان: سال تمام‌شده
  const plan = yearPlan(1405, '2026-10-07', 'cur');
  assert.equal(plan.start, '2026-09-23');
  assert.equal(plan.historyEnd, '2026-10-06');
  assert.equal(plan.terms.length, 2);
  const past = yearPlan(1404, '2026-10-07', 'prev');
  assert.equal(past.historyEnd, past.end);
});

test('school days skip thursday, friday and holidays', () => {
  const days = schoolDays('2026-10-03', '2026-10-09', new Set(['2026-10-05']));
  assert.deepEqual(days, ['2026-10-03', '2026-10-04', '2026-10-06', '2026-10-07']);
});

test('national ids are valid and repeatable', () => {
  const a = createRandom(7);
  const b = createRandom(7);
  for (let i = 0; i < 200; i++) {
    const id = a.nationalId();
    assert.equal(id, b.nationalId());
    const d = id.split('').map(Number);
    const sum = d.slice(0, 9).reduce((s, x, k) => s + x * (10 - k), 0) % 11;
    assert.equal(d[9], sum < 2 ? sum : 11 - sum);
  }
});

test('lead usernames fit the app rules and passwords are readable', () => {
  for (const name of Object.values(leadUsernames(123))) assert.match(name, /^[a-zA-Z0-9_.]{3,64}$/);
  for (let i = 0; i < 50; i++) assert.match(makePassword(), /^[a-hjkmnp-z]{4}[2-9]{4}$/);
});
