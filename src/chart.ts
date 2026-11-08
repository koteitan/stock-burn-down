import { fromDay, toDay, todayIso } from './date';
import { compareRecord } from './lists';
import type { ConsumeRecord, StockItem } from './types';

/** x is a (fractional) day number; see `dayOfTime`. */
export interface ChartPoint {
  x: number;
  value: number;
  /** Content written next to the point, or null when it adds nothing. */
  label: string | null;
}

/** Local-time day number with the time of day as the fraction. */
export function dayOfTime(ms: number): number {
  const d = new Date(ms);
  return toDay(todayIso(d)) + (d.getHours() * 60 + d.getMinutes()) / 1440;
}

const contentLabel = (content: string, category: string) => {
  const c = content.trim();
  return c !== '' && c !== category ? c : null;
};

/** Records of `category` consumed on or after the start day, oldest first. */
/** A category, or null for all categories together. */
export type CategoryFilter = string | null;

const inCategory = (item: { category: string }, category: CategoryFilter) =>
  category === null || item.category === category;

export function recordsSince(history: ConsumeRecord[], category: CategoryFilter, start: number) {
  return history
    .filter((h) => inCategory(h, category) && dayOfTime(h.at) >= start)
    .sort(compareRecord);
}

/**
 * Stock as actually consumed: (start,N) -- (t1,N-c1) -- (t2,N-c1-c2) -- ... -- (now,N-C),
 * where N is the stock at the start (see `expiryUnits`).
 */
export function actualPoints(
  history: ConsumeRecord[],
  category: CategoryFilter,
  start: number,
  now: number,
  n: number,
): ChartPoint[] {
  const points: ChartPoint[] = [{ x: start, value: n, label: null }];
  let c = 0;
  for (const h of recordsSince(history, category, start)) {
    c += h.count;
    points.push({ x: dayOfTime(h.at), value: n - c, label: null });
  }
  const last = points[points.length - 1].x;
  if (now > last) points.push({ x: now, value: n - c, label: null });
  return points;
}

export interface ExpiryUnit {
  day: number;
  category: string;
  content: string;
}

/**
 * The stock at the start: units of the current stock plus units consumed since the start,
 * in expiry order.
 */
export function expiryUnits(
  stocks: StockItem[],
  history: ConsumeRecord[],
  category: CategoryFilter,
  start: number,
): ExpiryUnit[] {
  const units: ExpiryUnit[] = [];
  const add = (item: { expiry: string; category: string; content: string; count: number }) => {
    const day = Math.max(start, toDay(item.expiry));
    for (let j = 0; j < item.count; j++) {
      units.push({ day, category: item.category, content: item.content });
    }
  };
  for (const s of stocks) if (inCategory(s, category)) add(s);
  for (const h of recordsSince(history, category, start)) add(h);
  return units.sort(
    (a, b) =>
      a.day - b.day || a.category.localeCompare(b.category) || a.content.localeCompare(b.content),
  );
}

/**
 * Stock if every unit is consumed on its best-before date:
 * (start,N) -- (e(sort(1)),N-1) -- ... -- (e(sort(N)),0); expiries before the start sit at the start.
 * A run of units with the same expiry, category and content is labelled once.
 */
export function expiryPoints(units: ExpiryUnit[], start: number): ChartPoint[] {
  const n = units.length;
  const points: ChartPoint[] = [{ x: start, value: n, label: null }];
  units.forEach((u, k) => {
    const prev = units[k - 1];
    const repeat =
      prev && prev.day === u.day && prev.category === u.category && prev.content === u.content;
    points.push({
      x: u.day,
      value: n - (k + 1),
      label: repeat ? null : contentLabel(u.content, u.category),
    });
  });
  return points;
}

/**
 * Last day shown in a chart: the last best-before date, or `end` when that is earlier.
 * An `end` before the start is ignored. Without any best-before date it is today.
 */
export function chartEnd(
  start: number,
  end: number | null,
  units: ExpiryUnit[],
  today: number,
): number {
  const lastExpiry = units.length > 0 ? units[units.length - 1].day : Math.max(start, today);
  const to = end !== null && end >= start ? Math.min(end, lastExpiry) : lastExpiry;
  return Math.max(to, start);
}

export function countTicks(max: number, maxTicks = 5): number[] {
  const top = Math.max(1, max);
  const steps = [1, 2, 5];
  let step = 1;
  for (let mag = 1; ; mag *= 10) {
    const found = steps.map((s) => s * mag).find((s) => Math.ceil(top / s) <= maxTicks);
    if (found !== undefined) {
      step = found;
      break;
    }
  }
  const ticks: number[] = [];
  for (let v = 0; v < top + step; v += step) {
    ticks.push(v);
    if (v >= top) break;
  }
  return ticks;
}

export interface DateTick {
  day: number;
  label: string;
}

type Interval = { unit: 'day' | 'month' | 'year'; n: number };

const INTERVALS: Interval[] = [
  { unit: 'day', n: 1 },
  { unit: 'day', n: 2 },
  { unit: 'day', n: 7 },
  { unit: 'day', n: 14 },
  { unit: 'month', n: 1 },
  { unit: 'month', n: 2 },
  { unit: 'month', n: 3 },
  { unit: 'month', n: 6 },
  { unit: 'year', n: 1 },
  { unit: 'year', n: 2 },
  { unit: 'year', n: 5 },
  { unit: 'year', n: 10 },
  { unit: 'year', n: 20 },
  { unit: 'year', n: 50 },
];

const APPROX_DAYS = { day: 1, month: 30.44, year: 365.25 } as const;

function ymd(day: number) {
  const [y, m, d] = fromDay(day).split('-').map(Number);
  return { y, m, d };
}

function tickLabel(day: number, unit: Interval['unit']): string {
  const { y, m, d } = ymd(day);
  if (unit === 'day') return `${m}/${d}`;
  if (unit === 'month') return `${y}/${m}`;
  return String(y);
}

function ticksFor(interval: Interval, minDay: number, maxDay: number): DateTick[] {
  const ticks: DateTick[] = [];
  const push = (day: number) => {
    if (day >= minDay && day <= maxDay) ticks.push({ day, label: tickLabel(day, interval.unit) });
  };
  if (interval.unit === 'day') {
    // Weekly ticks land on Mondays; 1970-01-01 (day 0) was a Thursday.
    const offset = interval.n === 7 || interval.n === 14 ? 4 : 0;
    const first = Math.ceil((minDay - offset) / interval.n) * interval.n + offset;
    for (let day = first; day <= maxDay; day += interval.n) push(day);
    return ticks;
  }
  const start = ymd(minDay);
  const monthsPerTick = interval.unit === 'month' ? interval.n : interval.n * 12;
  let index = start.y * 12 + (start.m - 1);
  index = Math.ceil(index / monthsPerTick) * monthsPerTick;
  for (; ; index += monthsPerTick) {
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    const day = toDay(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`);
    if (day > maxDay) break;
    push(day);
  }
  return ticks;
}

/** The finest interval whose ticks fit in `maxTicks`. */
export function dateTicks(minDay: number, maxDay: number, maxTicks: number): DateTick[] {
  const span = Math.max(1, maxDay - minDay);
  let ticks: DateTick[] = [];
  for (const iv of INTERVALS) {
    if (span / (iv.n * APPROX_DAYS[iv.unit]) > maxTicks * 2) continue;
    ticks = ticksFor(iv, minDay, maxDay);
    if (ticks.length <= maxTicks) return ticks;
  }
  return ticks;
}
