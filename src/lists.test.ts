import { describe, expect, it } from 'vitest';
import { isIsoDate } from './date';
import {
  categoriesByUpdate,
  categoriesOf,
  clickSort,
  mergeLists,
  parseCount,
  sortStocks,
  touchChanged,
  upsertTarget,
} from './lists';
import { sanitizeLists } from './sanitize';
import { DEFAULT_STOCK_SORT, type Lists, type StockItem, type TargetItem } from './types';

const s = (id: string, category = '缶詰'): StockItem => ({
  id,
  addedDate: '2026-11-01',
  category,
  content: id,
  count: 1,
  expiry: '2027-01-01',
});
const tg = (id: string, category: string, count = 3): TargetItem => ({
  id,
  addedDate: '2026-11-01',
  category,
  count,
});

describe('lists', () => {
  it('collects categories from stocks and targets, including the empty one', () => {
    const lists: Lists = {
      stocks: [s('a', '缶詰'), s('b', '')],
      targets: [tg('t', '水')],
      history: [],
      updatedAt: {},
    };
    expect(categoriesOf(lists)).toEqual(['', '水', '缶詰'].sort((a, b) => a.localeCompare(b)));
  });

  it('merges pending items without duplicating ids or target categories', () => {
    const current: Lists = {
      stocks: [s('a')],
      targets: [tg('t1', '缶詰', 5)],
      history: [],
      updatedAt: { 缶詰: 10 },
    };
    const pending: Lists = {
      stocks: [s('a'), s('b')],
      targets: [tg('t2', '缶詰', 9), tg('t3', '水')],
      history: [],
      updatedAt: { 缶詰: 5, 水: 7 },
    };
    const merged = mergeLists(current, pending);
    expect(merged.stocks.map((x) => x.id)).toEqual(['a', 'b']);
    expect(merged.targets.map((x) => [x.id, x.count])).toEqual([
      ['t1', 5],
      ['t3', 3],
    ]);
    expect(merged.updatedAt).toEqual({ 缶詰: 10, 水: 7 });
  });

  it('orders categories by last update, newest first', () => {
    const lists: Lists = {
      stocks: [s('a', 'A'), s('b', 'B'), s('c', 'C')],
      targets: [],
      history: [],
      updatedAt: { A: 100, C: 300 },
    };
    expect(categoriesByUpdate(lists)).toEqual(['C', 'A', 'B']);
  });

  it('stamps only the categories whose items changed', () => {
    const prev: Lists = {
      stocks: [s('a', 'A'), s('b', 'B'), s('c', 'C')],
      targets: [],
      history: [],
      updatedAt: { A: 1, B: 1, C: 1 },
    };
    const next: Lists = {
      ...prev,
      stocks: [s('a', 'A'), { ...s('b', 'B'), category: 'D' }, s('c', 'C')],
    };
    expect(touchChanged(prev, next, 99).updatedAt).toEqual({ A: 1, B: 99, C: 1, D: 99 });
    expect(touchChanged(prev, { ...prev }, 99)).toEqual(prev);
  });

  it('keeps a category named __proto__ as a plain key', () => {
    const prev: Lists = { stocks: [], targets: [], history: [], updatedAt: {} };
    const next: Lists = { ...prev, stocks: [s('a', '__proto__')] };
    const touched = touchChanged(prev, next, 5);
    expect(Object.hasOwn(touched.updatedAt, '__proto__')).toBe(true);
    expect(categoriesByUpdate(touched)).toEqual(['__proto__']);
  });

  it('sorts by best-before, category, then added order by default', () => {
    const stocks = [
      { ...s('a', '水'), expiry: '2027-02-01' },
      { ...s('b', '缶詰'), expiry: '2027-01-01', addedDate: '2026-11-05' },
      { ...s('c', '缶詰'), expiry: '2027-01-01', addedDate: '2026-11-02' },
      { ...s('d', '缶詰'), expiry: '2027-01-01', addedDate: '2026-11-02' },
      { ...s('e', 'レトルト'), expiry: '2027-01-01' },
    ];
    expect(sortStocks(stocks, DEFAULT_STOCK_SORT).map((x) => x.id)).toEqual([
      'e',
      'c',
      'd',
      'b',
      'a',
    ]);
  });

  it('moves a clicked key to the top and flips the top key', () => {
    const byCategory = clickSort(DEFAULT_STOCK_SORT, 'category');
    expect(byCategory.order).toEqual(['category', 'expiry', 'added']);
    expect(byCategory.desc.category).toBe(false);
    const flipped = clickSort(byCategory, 'category');
    expect(flipped.order).toEqual(['category', 'expiry', 'added']);
    expect(flipped.desc.category).toBe(true);
    const byAdded = clickSort(flipped, 'added');
    expect(byAdded.order).toEqual(['added', 'category', 'expiry']);
    expect(byAdded.desc).toEqual({ expiry: false, category: true, added: false });

    const stocks = [s('x', 'A'), s('y', 'B'), s('z', 'A')];
    expect(sortStocks(stocks, clickSort(byAdded, 'added')).map((x) => x.id)).toEqual([
      'z',
      'y',
      'x',
    ]);
  });

  it('keeps one target per category', () => {
    const targets = upsertTarget([tg('t1', '缶詰', 5)], tg('t2', '缶詰', 8));
    expect(targets).toEqual([tg('t1', '缶詰', 8)]);
    expect(upsertTarget(targets, tg('t3', '水', 2))).toHaveLength(2);
  });

  it('treats an empty or invalid count as 1', () => {
    expect(parseCount('')).toBe(1);
    expect(parseCount('0')).toBe(1);
    expect(parseCount('abc')).toBe(1);
    expect(parseCount('4')).toBe(4);
    expect(parseCount('2.7')).toBe(2);
  });

  it('drops malformed items when sanitizing', () => {
    const lists = sanitizeLists({
      stocks: [
        { id: 'ok', category: ' 缶詰 ', content: 'x', count: 2, expiry: '2027-01-01' },
        { id: 'bad-date', category: '缶詰', count: 1, expiry: '2027-02-30' },
        { id: 'zero', category: '缶詰', count: 0, expiry: '2027-01-01' },
        'junk',
      ],
      targets: [{ id: 't', category: '', count: 3 }],
      updatedAt: { 缶詰: 12, bad: 'x' },
    });
    expect(lists.stocks.map((x) => [x.id, x.category])).toEqual([['ok', '缶詰']]);
    expect(lists.targets.map((x) => [x.id, x.category])).toEqual([['t', '']]);
    expect(lists.updatedAt).toEqual({ 缶詰: 12 });
    expect(isIsoDate('2027-02-30')).toBe(false);
  });
});
