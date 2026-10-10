#!/usr/bin/env bash
# به‌روزرسانی اپ نسخه نمایشی به نسخه جدید رسا
#   ./update-demo.sh                  آخرین نسخه منتشرشده در GitHub (اگر جدیدتر باشد)
#   ./update-demo.sh 1.5.0            نسخه مشخص
#   ./update-demo.sh --file school-app-1.5.0.tar.gz   از فایل بسته انتشار (بدون اینترنت)
#
# مراحل: دریافت بسته و بررسی sha256 ← docker load ← تنظیم APP_VERSION در .env ← docker compose up
# کیت دمو با دیدن نسخه جدید، مدرسه نمونه و حساب متقاضیان فعال را روی نسخه جدید از نو می‌سازد.
#
# به‌روزرسانی خودکار هر شب (قبل از بازسازی ۳:۳۰)، با crontab -e:
#   0 3 * * * /path/to/rasa-demo/deploy/update-demo.sh >> /var/log/rasa-demo-update.log 2>&1
set -Eeuo pipefail
DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$DIR/.env"
RELEASES="$DIR/releases"
die() { echo "[update] خطا: $*" >&2; exit 1; }
log() { echo "[update $(date '+%F %T')] $*"; }
[ -f "$ENV_FILE" ] || die ".env یافت نشد"

env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' || true; }
env_set() {
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"; fi
}

REPO=$(env_get APP_REPO); REPO=${REPO:-farazfallah/school_app}
RELEASE_BASE=$(env_get APP_RELEASE_BASE); RELEASE_BASE=${RELEASE_BASE:-https://github.com}
API_BASE=$(env_get APP_API_BASE); API_BASE=${API_BASE:-https://api.github.com}
CURRENT=$(env_get APP_VERSION)
# مخزن خصوصی: توکن GitHub (Contents: read-only) در .env
TOKEN=$(env_get GITHUB_TOKEN)
AUTH=(); [ -n "$TOKEN" ] && AUTH=(-H "Authorization: Bearer $TOKEN")
gh_api() { curl -fsSL --max-time 30 "${AUTH[@]}" -H "Accept: application/vnd.github+json" "$API_BASE$1"; }

# دریافت یک فایل از انتشار؛ با توکن از API (لینک مستقیم برای مخزن خصوصی کار نمی‌کند)
fetch_asset() { # version name dest
  if [ -z "$TOKEN" ]; then
    curl -fsSL --retry 3 -o "$3" "$RELEASE_BASE/$REPO/releases/download/v$1/$2"
    return
  fi
  local rel id
  rel=$(gh_api "/repos/$REPO/releases/tags/v$1") \
    || die "انتشار v$1 در $REPO دیده نشد؛ GITHUB_TOKEN نامعتبر است یا به این مخزن دسترسی ندارد (Contents: Read-only روی $REPO)"
  id=$(printf '%s' "$rel" | python3 -c 'import json,sys; n=sys.argv[1]; print(next((a["id"] for a in json.load(sys.stdin)["assets"] if a["name"]==n),""))' "$2")
  [ -n "$id" ] || die "فایل $2 در انتشار v$1 پیدا نشد"
  curl -fsSL --retry 3 -L "${AUTH[@]}" -H "Accept: application/octet-stream" -o "$3" "$API_BASE/repos/$REPO/releases/assets/$id"
}

# پیش از دریافت بسته، تنظیمات ضروری .env
for k in SITE_DOMAIN DEMO_DOMAIN POSTGRES_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET DEMO_ROOT_PASSWORD PANEL_PASSWORD; do
  [ -n "$(env_get "$k")" ] || die "$k در .env خالی است"
done

# فقط یک به‌روزرسانی هم‌زمان
exec 9>"$DIR/.update.lock"
flock -n 9 || die "به‌روزرسانی دیگری در حال اجراست"

FILE=""; VERSION=""
case "${1:-}" in
  --file) FILE=${2:?مسیر فایل را بدهید}; VERSION=$(basename "$FILE" | sed -n 's/^school-app-\(.*\)\.tar\.gz$/\1/p'); [ -n "$VERSION" ] || die "نام فایل باید school-app-X.Y.Z.tar.gz باشد" ;;
  "" | latest)
    [ -n "$TOKEN" ] || log "GITHUB_TOKEN خالی است؛ برای مخزن خصوصی لازم است"
    VERSION=$(gh_api "/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)
    [ -n "$VERSION" ] || die "آخرین نسخه از GitHub دریافت نشد (مخزن خصوصی؟ GITHUB_TOKEN را در .env بگذارید)" ;;
  *) VERSION=${1#v} ;;
esac
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.]+)?$ ]] || die "نسخه نامعتبر: $VERSION"

if [ "$VERSION" = "$CURRENT" ] && [ -z "$FILE" ]; then
  log "نسخه $VERSION از قبل نصب است"
  exit 0
fi

if ! docker image inspect "madreseh-api:$VERSION" >/dev/null 2>&1 || ! docker image inspect "madreseh-web:$VERSION" >/dev/null 2>&1; then
  mkdir -p "$RELEASES"
  if [ -z "$FILE" ]; then
    FILE="$RELEASES/school-app-$VERSION.tar.gz"
    log "دریافت نسخه $VERSION"
    fetch_asset "$VERSION" "school-app-$VERSION.tar.gz" "$FILE.part"
    fetch_asset "$VERSION" "school-app-$VERSION.tar.gz.sha256" "$FILE.sha256"
    mv "$FILE.part" "$FILE"
    (cd "$RELEASES" && sha256sum -c "$(basename "$FILE").sha256") || die "sha256 بسته نادرست است"
  fi
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  tar -xzf "$FILE" -C "$TMP"
  log "بارگذاری ایمیج‌ها"
  docker load -i "$TMP/school-app-$VERSION/images.tar"
fi

log "نسخه $CURRENT ← $VERSION"
env_set APP_VERSION "$VERSION"
FILES=(-f "$DIR/docker-compose.yml")
[ -f "$DIR/docker-compose.override.yml" ] && FILES+=(-f "$DIR/docker-compose.override.yml")
docker compose --project-directory "$DIR" "${FILES[@]}" --env-file "$ENV_FILE" up -d --build --remove-orphans

# بسته‌های قدیمی (فقط دو نسخه آخر می‌ماند)
ls -1t "$RELEASES"/school-app-*.tar.gz 2>/dev/null | tail -n +3 | while read -r old; do rm -f "$old" "$old.sha256"; done
log "انجام شد؛ کیت دمو مدرسه نمونه را روی نسخه $VERSION از نو می‌سازد (چند دقیقه). وضعیت: پنل /panel"
