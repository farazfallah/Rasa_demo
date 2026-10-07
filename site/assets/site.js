// ارسال فرم درخواست دمو به کیت (همان دامنه، مسیر /api/demo-requests)
(() => {
  const form = document.getElementById('request-form');
  const error = document.getElementById('form-error');
  const done = document.getElementById('form-done');
  if (!form) return;

  const toLatin = (s) => s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

  function check(data) {
    const errors = {};
    if (data.name.trim().length < 3) errors.name = 'نام و نام خانوادگی را بنویسید';
    if (data.school.trim().length < 3) errors.school = 'نام مدرسه را بنویسید';
    const mobile = toLatin(data.mobile).replace(/[\s-]/g, '').replace(/^\+98/, '0');
    if (!/^09\d{9}$/.test(mobile)) errors.mobile = 'شماره موبایل معتبر نیست (مثلا ۰۹۱۲۱۲۳۴۵۶۷)';
    return errors;
  }

  function show(errors) {
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    for (const key of Object.keys(errors)) form.elements[key]?.setAttribute('aria-invalid', 'true');
    error.textContent = Object.values(errors)[0] ?? '';
    const first = Object.keys(errors)[0];
    if (first) form.elements[first]?.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errors = check(data);
    show(errors);
    if (Object.keys(errors).length) return;
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    button.textContent = 'در حال ارسال…';
    try {
      const res = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        show(body.errors ?? {});
        error.textContent = body.message ?? 'ثبت درخواست انجام نشد؛ دوباره تلاش کنید';
        return;
      }
      form.hidden = true;
      done.hidden = false;
      done.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      error.textContent = 'ارتباط برقرار نشد؛ اتصال اینترنت را بررسی کنید و دوباره تلاش کنید';
    } finally {
      button.disabled = false;
      button.textContent = 'ثبت درخواست';
    }
  });
})();
