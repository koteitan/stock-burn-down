import { describe, expect, it } from 'vitest';
import { actualPoints, countTicks, dateTicks, dayOfTime, expiryPoints, expiryUnits } from './chart';
import { fromDay, toDay } from './date';
import type { ConsumeRecord, StockItem } from './types';

const stock = (p: Partial<StockItem> & Pick<StockItem, 'expiry'>): StockItem => ({
  id: p.id ?? p.expiry + (p.content ?? ''),
  addedDate: '2026-11-01',
  category: '缶詰',
  content: '',
  count: 1,
  ...p,
});

const record = (id: string, local: string, p: Partial<ConsumeRecord> = {}): ConsumeRecord => ({
  id,
  at: new Date(local).getTime(),
  category: '缶詰',
  content: '',
  count: 1,
  expiry: '2027-01-01',
  ...p,
});

const start = toDay('2026-11-01');

describe('actualPoints', () => {
  it('falls from (start, N) by each consumption since the start and ends at now', () => {
    const history = [
      record('h2', '2026-11-05T12:00', { count: 2 }),
      record('h1', '2026-11-03T06:00'),
      record('before-start', '2026-10-20T09:00', { count: 5 }),
      record('other', '2026-11-04T09:00', { category: '水' }),
    ];
    const now = dayOfTime(new Date('2026-11-08T18:00').getTime());
    const pts = actualPoints(history, '缶詰', start, now, 10);
    expect(pts.map((p) => [fromDay(Math.floor(p.x)), p.value])).toEqual([
      ['2026-11-01', 10],
      ['2026-11-03', 9],
      ['2026-11-05', 7],
      ['2026-11-08', 7],
    ]);
    expect(pts[1].x - toDay('2026-11-03')).toBeCloseTo(0.25);
    expect(pts[3].x - toDay('2026-11-08')).toBeCloseTo(0.75);
  });

  it('is the single point (start, N) when nothing was consumed and now is the start', () => {
    expect(actualPoints([], '缶詰', start, start, 3)).toEqual([
      { x: start, value: 3, label: null },
    ]);
  });
});

describe('expiryPoints', () => {
  it('falls by one at each best-before date of the stock at the start', () => {
    const stocks = [
      stock({ id: 's1', expiry: '2027-01-10', content: 'サバ', count: 2 }),
      stock({ id: 's2', expiry: '2026-10-01', content: '缶詰' }),
      stock({ id: 's3', expiry: '2027-02-01', category: '水', content: '2L' }),
    ];
    const history = [
      record('h1', '2026-11-03T06:00', { content: 'シーチキン', expiry: '2026-12-01' }),
      record('h0', '2026-10-15T06:00', { content: '焼き鳥', expiry: '2026-11-20' }),
    ];
    const units = expiryUnits(stocks, history, '缶詰', start);
    const pts = expiryPoints(units, start);
    expect(pts.map((p) => [fromDay(p.x), p.value, p.label])).toEqual([
      // N = current stock (3) + consumed since the start (1)
      ['2026-11-01', 4, null],
      // expired before the start: placed at the start; content equals the category
      ['2026-11-01', 3, null],
      ['2026-12-01', 2, 'シーチキン'],
      ['2027-01-10', 1, 'サバ'],
      ['2027-01-10', 0, null],
    ]);
  });

  it('labels every non-empty content for the empty category', () => {
    const units = expiryUnits(
      [stock({ id: 'a', expiry: '2027-01-01', category: '', content: '水' })],
      [],
      '',
      start,
    );
    expect(expiryPoints(units, start).map((p) => p.label)).toEqual([null, '水']);
  });
});

describe('all categories (overall chart)', () => {
  it('combines every category and labels by the category of each unit', () => {
    const stocks = [
      stock({ id: 'a', expiry: '2027-01-01', category: '缶詰', content: 'サバ', count: 2 }),
      stock({ id: 'b', expiry: '2027-02-01', category: '水', content: '水' }),
    ];
    const history = [
      record('h1', '2026-11-03T06:00', { category: '水', content: '2L', expiry: '2026-12-01' }),
      record('h2', '2026-11-04T06:00', { category: '缶詰', content: 'サバ' }),
    ];
    const units = expiryUnits(stocks, history, null, start);
    expect(units.map((u) => [u.category, u.content])).toEqual([
      ['水', '2L'],
      ['缶詰', 'サバ'],
      ['缶詰', 'サバ'],
      ['缶詰', 'サバ'],
      ['水', '水'],
    ]);
    expect(expiryPoints(units, start).map((p) => [p.value, p.label])).toEqual([
      [5, null],
      [4, '2L'],
      [3, 'サバ'],
      [2, null],
      [1, null],
      [0, null],
    ]);
    const now = dayOfTime(new Date('2026-11-08T00:00').getTime());
    expect(actualPoints(history, null, start, now, units.length).map((p) => p.value)).toEqual([
      5, 4, 3, 3,
    ]);
  });
});

describe('countTicks', () => {
  it('uses 1/2/5 steps and covers the maximum', () => {
    expect(countTicks(3)).toEqual([0, 1, 2, 3]);
    expect(countTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(countTicks(23)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(countTicks(0)).toEqual([0, 1]);
  });
});

describe('dateTicks', () => {
  it('uses month ticks for a span of months', () => {
    const ticks = dateTicks(toDay('2026-11-08'), toDay('2027-04-20'), 7);
    expect(ticks.map((t) => t.label)).toEqual(['2026/12', '2027/1', '2027/2', '2027/3', '2027/4']);
  });

  it('puts weekly ticks on Mondays', () => {
    const ticks = dateTicks(toDay('2026-11-08'), toDay('2026-12-10'), 6);
    expect(ticks.map((t) => fromDay(t.day))).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
      '2026-12-07',
    ]);
  });

  it('uses year ticks for long spans and stays within the requested count', () => {
    const ticks = dateTicks(toDay('2026-11-08'), toDay('2036-01-01'), 6);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks.every((t) => /^\d{4}$/.test(t.label))).toBe(true);
  });
});
