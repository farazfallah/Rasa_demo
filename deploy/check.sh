#!/usr/bin/env bash
# بررسی سلامت نصب: تنظیمات .env، سرویس‌ها و پاسخ هر دو دامنه (مستقیم و از بیرون)
DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$DIR/.env"
env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"\r' || true; }
ok() { echo "  [✓] $*"; }
bad() { echo "  [✗] $*"; FAIL=1; }
FAIL=0
[ -f "$ENV_FILE" ] || { echo ".env یافت نشد؛ ./install.sh را اجرا کنید"; exit 1; }
grep -q $'\r' "$ENV_FILE" && bad ".env کاراکتر ویندوزی (\\r) دارد: sed -i 's/\\r\$//' .env"

SITE=$(env_get SITE_DOMAIN); DEMO=$(env_get DEMO_DOMAIN)
for d in "$SITE" "$DEMO"; do
  if [ -z "$d" ] || [[ "$d" == *example.com ]]; then bad "دامنه تنظیم نشده است («$d»)؛ ./install.sh"; fi
done
for k in POSTGRES_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET DEMO_ROOT_PASSWORD PANEL_PASSWORD; do
  [ -n "$(env_get $k)" ] || bad "$k خالی است"
done

cd "$DIR"
running=$(docker compose ps --status running --services 2>/dev/null)
for s in postgres redis api web kit caddy; do
  grep -qx "$s" <<<"$running" && ok "سرویس $s" || bad "سرویس $s اجرا نمی‌شود: docker compose logs --tail=50 $s"
done
caddy_site=$(docker compose exec -T caddy printenv SITE_DOMAIN 2>/dev/null | tr -d '\r')
[ -z "$caddy_site" ] || [ "$caddy_site" = "$SITE" ] || bad "Caddy با دامنه قدیمی ($caddy_site) اجرا شده: docker compose up -d --force-recreate caddy"

# پاسخ مستقیم سرور (بدون DNS و CDN)
for d in "$SITE" "$DEMO"; do
  body=$(curl -s --max-time 10 -H "Host: $d" http://127.0.0.1/)
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: $d" http://127.0.0.1/)
  if [ -z "$body" ] && [ "$code" = 200 ]; then bad "$d روی سرور تعریف نشده (پاسخ خالی)"
  elif [ "$code" = 308 ] || [ "$code" = 301 ]; then
    [ "$(env_get CADDYFILE)" = Caddyfile.cdn ] && bad "$d ریدایرکت می‌شود" || ok "$d روی سرور (ریدایرکت به HTTPS)"
  elif [[ "$code" =~ ^(200|503)$ ]]; then ok "$d روی سرور ($code)"
  else bad "$d روی سرور: کد $code"; fi
done

# از بیرون (DNS و CDN)
for d in "$SITE" "$DEMO"; do
  body=$(curl -s --max-time 15 "https://$d/" | head -c 4000)
  if grep -qi "<html" <<<"$body" && ! grep -q "cdn-cgi" <<<"$body"; then ok "https://$d از بیرون"
  elif grep -q "Unknown host" <<<"$body"; then bad "https://$d: CDN هدر Host را درست نمی‌فرستد"
  elif [ -z "$body" ]; then bad "https://$d از بیرون پاسخی نداد (DNS هنوز منتشر نشده؟ تنظیم CDN؟)"
  else bad "https://$d صفحه CDN برگرداند (پروتکل مبدأ، فایروال یا چالش امنیتی CDN را بررسی کنید)"; fi
done
[ $FAIL = 0 ] && echo "همه‌چیز درست است." || echo "موارد بالا را برطرف کنید و دوباره ./check.sh را اجرا کنید."
exit $FAIL
