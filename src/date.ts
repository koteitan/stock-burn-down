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

/** 2023-12-31 → 23/12/31 */
export function formatShortDate(iso: string): string {
  return iso.slice(2).replaceAll('-', '/');
}

/** Parses YY/MM/DD (also YYYY/MM/DD, '-' or '.' separators, or YYMMDD); a 2-digit year is 20YY. */
export function parseShortDate(text: string): string | null {
  const t = text.trim();
  const m =
    t.match(/^(\d{2}|\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/) ?? t.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const year = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  const iso = `${year}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}
