#!/usr/bin/env bash
# نصب نسخه نمایشی رسا روی سرور خام (Ubuntu/Debian)، با پرسش‌وپاسخ
#   sudo ./install.sh            نصب کامل: Docker، تنظیم .env، دریافت آخرین نسخه اپ و راه‌اندازی
#   sudo ./install.sh 2.2.0      نسخه مشخص اپ
#   sudo ./install.sh --file school-app-2.2.0.tar.gz   از فایل بسته انتشار (بدون GitHub)
# دوباره اجرا کردن بی‌خطر است: مقدارهای فعلی .env پیش‌فرض پرسش‌ها می‌شوند و رمزها عوض نمی‌شوند.
set -Eeuo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$DIR/.env"
die() { echo -e "\n[install] خطا: $*" >&2; exit 1; }
step() { echo -e "\n==> $*"; }
[ "$(id -u)" = 0 ] || die "با root یا sudo اجرا کنید"

env_get() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"\r' || true; }
env_set() {
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"; fi
}
ask() { # name prompt default
  local v
  read -r -p "$2 [${3}]: " v || true
  v=${v:-$3}
  printf '%s' "$v" | tr -d ' \r'
}
yes_no() { local v; read -r -p "$1 [${2}]: " v || true; v=${v:-$2}; [[ "$v" =~ ^[yY] ]]; }
valid_domain() { [[ "$1" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] && [[ "$1" != *example.com ]]; }

# ---------- ۱. Docker
step "۱. Docker"
IRAN=$(env_get IRAN_MIRRORS)
if [ -z "$IRAN" ]; then
  if yes_no "سرور داخل ایران است؟ (آینه Docker و npm تنظیم می‌شود) y/n" n; then IRAN=1; else IRAN=0; fi
fi
if [ "$IRAN" = 1 ] && ! grep -qs registry-mirrors /etc/docker/daemon.json; then
  mkdir -p /etc/docker
  echo '{"registry-mirrors":["https://docker.arvancloud.ir"]}' > /etc/docker/daemon.json
  echo "آینه docker.arvancloud.ir تنظیم شد"
  RESTART_DOCKER=1
fi
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  apt-get update -q
  apt-get install -y -q docker.io docker-compose-v2 curl openssl python3 \
    || apt-get install -y -q docker.io docker-compose-plugin curl openssl python3 \
    || die "نصب Docker ناموفق بود"
fi
systemctl enable --now docker >/dev/null 2>&1 || true
[ "${RESTART_DOCKER:-0}" = 1 ] && systemctl restart docker
docker compose version >/dev/null || die "docker compose در دسترس نیست"
echo "Docker آماده است: $(docker --version)"

# ---------- ۲. تنظیمات
step "۲. تنظیمات (.env)"
[ -f "$ENV_FILE" ] || cp "$DIR/.env.example" "$ENV_FILE"
sed -i 's/\r$//' "$ENV_FILE"
env_set IRAN_MIRRORS "$IRAN"

cur=$(env_get SITE_DOMAIN); [[ "$cur" == *example.com ]] && cur=""
while :; do
  SITE=$(ask SITE_DOMAIN "دامنه سایت معرفی (مثلا qtpet.ir)" "$cur" | tr 'A-Z' 'a-z')
  valid_domain "$SITE" && break; echo "  دامنه نامعتبر است: «$SITE»"
done
cur=$(env_get DEMO_DOMAIN); [[ -z "$cur" || "$cur" == *example.com ]] && cur="demo.$SITE"
while :; do
  DEMO=$(ask DEMO_DOMAIN "دامنه نسخه نمایشی" "$cur" | tr 'A-Z' 'a-z')
  valid_domain "$DEMO" && [ "$DEMO" != "$SITE" ] && break; echo "  دامنه نامعتبر یا تکراری است: «$DEMO»"
done
env_set SITE_DOMAIN "$SITE"
env_set DEMO_DOMAIN "$DEMO"

cur=$( [ "$(env_get CADDYFILE)" = Caddyfile ] && echo n || echo y )
if yes_no "دامنه‌ها پشت CDN هستند (ابر آروان و مانند آن)؟ y/n" "$cur"; then
  env_set CADDYFILE Caddyfile.cdn; env_set TRUSTED_PROXIES 0.0.0.0/0; env_set TRUST_PROXY 3
else
  env_set CADDYFILE Caddyfile; env_set TRUSTED_PROXIES private_ranges; env_set TRUST_PROXY 2
fi
sed -i '/^SITE_SCHEME=/d' "$ENV_FILE"
[ "$IRAN" = 1 ] && [ "$(env_get NPM_REGISTRY)" = "https://registry.npmjs.org/" ] && env_set NPM_REGISTRY https://mirror-npm.runflare.com/

for k in POSTGRES_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  [ -n "$(env_get $k)" ] || env_set $k "$(openssl rand -hex 32)"
done
[ -n "$(env_get DEMO_ROOT_PASSWORD)" ] || env_set DEMO_ROOT_PASSWORD "Root-$(openssl rand -hex 6)"
[ -n "$(env_get PANEL_USER)" ] || env_set PANEL_USER admin
[ -n "$(env_get PANEL_PASSWORD)" ] || env_set PANEL_PASSWORD "Panel-$(openssl rand -hex 6)"
chmod 600 "$ENV_FILE"

# ---------- ۳. دسترسی به نسخه‌های اپ
REPO=$(env_get APP_REPO); REPO=${REPO:-farazfallah/school_app}
if [ "${1:-}" != "--file" ]; then
  step "۳. دسترسی به مخزن $REPO"
  while :; do
    TOKEN=$(env_get GITHUB_TOKEN)
    if [ -n "$TOKEN" ]; then
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/$REPO" || echo 000)
      [ "$code" = 200 ] && { echo "توکن GitHub معتبر است"; break; }
      [ "$code" = 000 ] && die "GitHub از این سرور در دسترس نیست؛ بسته را دستی بگیرید و با --file نصب کنید"
      echo "  توکن کار نمی‌کند (کد $code). توکن fine-grained با Contents: Read-only روی $REPO لازم است."
    fi
    TOKEN=$(ask GITHUB_TOKEN "توکن GitHub (github_pat_...)" "")
    [ -n "$TOKEN" ] || die "بدون توکن: بسته را دستی بگیرید و ./install.sh --file school-app-X.Y.Z.tar.gz"
    env_set GITHUB_TOKEN "$TOKEN"
  done
fi

# ---------- ۴. دریافت و راه‌اندازی
step "۴. دریافت نسخه اپ و راه‌اندازی سرویس‌ها"
"$DIR/update-demo.sh" --force "$@"

# ---------- ۵. بررسی
step "۵. بررسی"
"$DIR/check.sh" || true

cat <<MSG

==========================================================
 نصب انجام شد. این اطلاعات را جایی امن نگه دارید:
   سایت معرفی:   https://$SITE
   پنل درخواست‌ها: https://$SITE/panel   ($(env_get PANEL_USER) / $(env_get PANEL_PASSWORD))
   نسخه نمایشی:  https://$DEMO          (admin / $(env_get DEMO_ROOT_PASSWORD))
 ساخت مدرسه نمونه چند دقیقه طول می‌کشد:  docker compose logs -f kit
==========================================================
MSG
if [ "$(env_get CADDYFILE)" = Caddyfile.cdn ]; then
  cat <<MSG
 در پنل CDN: رکورد A برای $SITE و $DEMO به IP این سرور با پروکسی روشن،
 گواهی SSL و انتقال HTTP به HTTPS روشن، پروتکل اتصال به مبدأ: HTTP.
MSG
else
  echo " رکورد A برای $SITE و $DEMO باید مستقیم به IP این سرور اشاره کند (گواهی خودکار گرفته می‌شود)."
fi
