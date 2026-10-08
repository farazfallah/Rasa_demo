// سایت معرفی رسا: زبانه‌های امکانات، سربرگ، نمایش هنگام اسکرول و فرم درخواست دمو
(() => {
  // ---------- سربرگ هنگام اسکرول
  const top = document.querySelector('.top');
  const onScroll = () => top?.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- زبانه‌های امکانات (با کلیدهای جهت)
  const tabs = [...document.querySelectorAll('[role=tab]')];
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };
  tabs.forEach((tab, i) => {
    tab.tabIndex = i === 0 ? 0 : -1;
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      // راست‌به‌چپ: جهت چپ یعنی زبانه بعدی
      const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      select(tabs[(i + step + tabs.length) % tabs.length], true);
    });
  });

  // ---------- نمایش تدریجی بخش‌ها
  const targets = document.querySelectorAll('.head, .compare-col, .module, .role, .trust-item, .form-card, .steps li, .faq details, .band-text, .phones');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(i % 5) * 60}ms`;
      io.observe(el);
    });
  }

  // ---------- فرم درخواست دمو (ارسال به کیت در مسیر /api/demo-requests)
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
    const label = button.textContent;
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
      button.textContent = label;
    }
  });
})();
