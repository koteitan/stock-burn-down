import type { ConsumeRecord, Lists, StockItem, StockSort, StockSortKey, TargetItem } from './types';

/**
 * Sorts by `sort.order`, each key ascending or descending. 'added' is the added date and then
 * the array order, which is the order the items were added in.
 */
export function sortStocks(stocks: StockItem[], sort: StockSort): StockItem[] {
  const index = new Map(stocks.map((s, i) => [s.id, i]));
  const pos = (s: StockItem) => index.get(s.id) ?? 0;
  const compare: Record<StockSortKey, (a: StockItem, b: StockItem) => number> = {
    expiry: (a, b) => a.expiry.localeCompare(b.expiry),
    category: (a, b) => a.category.localeCompare(b.category),
    added: (a, b) => a.addedDate.localeCompare(b.addedDate) || pos(a) - pos(b),
  };
  return [...stocks].sort((a, b) => {
    for (const key of sort.order) {
      const c = compare[key](a, b);
      if (c !== 0) return sort.desc[key] ? -c : c;
    }
    return pos(a) - pos(b);
  });
}

/** A header click: the key becomes the top priority, or flips direction if it already is. */
export function clickSort(sort: StockSort, key: StockSortKey): StockSort {
  if (sort.order[0] === key) return { ...sort, desc: { ...sort.desc, [key]: !sort.desc[key] } };
  return { ...sort, order: [key, ...sort.order.filter((k) => k !== key)] };
}

export function compareRecord(a: ConsumeRecord, b: ConsumeRecord): number {
  return a.at - b.at || a.id.localeCompare(b.id);
}

export function updatedAtOf(lists: Lists, category: string): number {
  return Object.hasOwn(lists.updatedAt, category) ? lists.updatedAt[category] : 0;
}

/** Categories that have at least one stock, target or consumption record, in name order. */
export function categoriesOf(lists: Lists): string[] {
  const set = new Set<string>();
  for (const s of lists.stocks) set.add(s.category);
  for (const t of lists.targets) set.add(t.category);
  for (const h of lists.history) set.add(h.category);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Most recently updated first. */
export function categoriesByUpdate(lists: Lists): string[] {
  return categoriesOf(lists).sort((a, b) => updatedAtOf(lists, b) - updatedAtOf(lists, a));
}

export function listsOfCategory(lists: Lists, category: string): Lists {
  return {
    stocks: lists.stocks.filter((s) => s.category === category),
    targets: lists.targets.filter((t) => t.category === category),
    history: lists.history.filter((h) => h.category === category),
    updatedAt: Object.hasOwn(lists.updatedAt, category)
      ? Object.fromEntries([[category, lists.updatedAt[category]]])
      : {},
  };
}

/** The items of one category in a canonical order, without the category field. */
export function categoryPayload(lists: Lists, category: string) {
  return {
    // Stocks keep their array order, which is the order they were added in.
    stocks: lists.stocks
      .filter((s) => s.category === category)
      .map(({ id, addedDate, content, count, expiry }) => ({
        id,
        addedDate,
        content,
        count,
        expiry,
      })),
    targets: lists.targets
      .filter((t) => t.category === category)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, addedDate, count }) => ({ id, addedDate, count })),
    history: lists.history
      .filter((h) => h.category === category)
      .sort(compareRecord)
      .map(({ id, at, content, count, expiry }) => ({ id, at, content, count, expiry })),
  };
}

/** Sets the update time of every category whose items differ between `prev` and `next`. */
export function touchChanged(prev: Lists, next: Lists, now: number): Lists {
  const cats = new Set([...categoriesOf(prev), ...categoriesOf(next)]);
  const changed = [...cats].filter(
    (c) => JSON.stringify(categoryPayload(prev, c)) !== JSON.stringify(categoryPayload(next, c)),
  );
  if (changed.length === 0) return next;
  return {
    ...next,
    updatedAt: Object.fromEntries([
      ...Object.entries(next.updatedAt),
      ...changed.map((c) => [c, now] as const),
    ]),
  };
}

/** Adds the pending items that `current` does not have yet; `current` wins on conflict. */
export function mergeLists(current: Lists, pending: Lists): Lists {
  const stockIds = new Set(current.stocks.map((s) => s.id));
  const targetCats = new Set(current.targets.map((t) => t.category));
  const targets = [...current.targets];
  for (const t of pending.targets) {
    if (!targetCats.has(t.category)) {
      targets.push(t);
      targetCats.add(t.category);
    }
  }
  const recordIds = new Set(current.history.map((h) => h.id));
  const updatedAt = new Map(Object.entries(current.updatedAt));
  for (const [cat, time] of Object.entries(pending.updatedAt)) {
    updatedAt.set(cat, Math.max(updatedAt.get(cat) ?? 0, time));
  }
  return {
    stocks: [...current.stocks, ...pending.stocks.filter((s) => !stockIds.has(s.id))],
    targets,
    history: [...current.history, ...pending.history.filter((h) => !recordIds.has(h.id))],
    updatedAt: Object.fromEntries(updatedAt),
  };
}

export function isEmptyLists(lists: Lists): boolean {
  return lists.stocks.length === 0 && lists.targets.length === 0 && lists.history.length === 0;
}

/** One target per category: adding an existing category overwrites its count. */
export function upsertTarget(targets: TargetItem[], item: TargetItem): TargetItem[] {
  const i = targets.findIndex((t) => t.category === item.category);
  if (i < 0) return [...targets, item];
  return targets.map((t, j) => (j === i ? { ...t, count: item.count } : t));
}

/** Empty or invalid input counts as 1. */
export function parseCount(text: string): number {
  const n = Math.floor(Number(text));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
