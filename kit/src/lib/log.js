// گزارش ساده با زمان؛ آخرین خطوط برای نمایش در پنل نگه داشته می‌شوند
const recent = [];

export function log(...parts) {
  const line = `[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${parts.join(' ')}`;
  console.log(line);
  recent.push(line);
  if (recent.length > 300) recent.shift();
}

export function recentLog() {
  return recent.slice();
}
