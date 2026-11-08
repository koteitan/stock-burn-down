const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDay(toDay(s)) === s;
}

/** Days since 1970-01-01 for a YYYY-MM-DD calendar date, independent of time zone. */
export function toDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDay(day: number): string {
  const dt = new Date(day * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function formatDate(iso: string): string {
  return iso.replaceAll('-', '/');
}

/** Value for <input type="datetime-local"> in local time. */
export function toDateTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${todayIso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Unix ms of a datetime-local value, or null when it is not one. */
export function fromDateTimeInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function formatDateTime(ms: number): string {
  return toDateTimeInput(ms).replace('T', ' ').replaceAll('-', '/');
}
