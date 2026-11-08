import { isIsoDate } from './date';
import { todayNow } from './debug';
import type { ConsumeRecord, Lists, StockItem, TargetItem, UpdatedAt } from './types';

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const positiveInt = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : 0;

export function newId(): string {
  return crypto.randomUUID();
}

export function sanitizeStock(v: unknown, category?: string): StockItem | null {
  if (!isObject(v)) return null;
  const count = positiveInt(v.count);
  const cat = category ?? str(v.category).trim();
  if (count === 0 || !isIsoDate(v.expiry)) return null;
  return {
    id: str(v.id) || newId(),
    addedDate: isIsoDate(v.addedDate) ? v.addedDate : todayNow(),
    category: cat,
    content: str(v.content),
    count,
    expiry: v.expiry,
  };
}

export function sanitizeTarget(v: unknown, category?: string): TargetItem | null {
  if (!isObject(v)) return null;
  const count = positiveInt(v.count);
  const cat = category ?? str(v.category).trim();
  if (count === 0) return null;
  return {
    id: str(v.id) || newId(),
    addedDate: isIsoDate(v.addedDate) ? v.addedDate : todayNow(),
    category: cat,
    count,
  };
}

export function sanitizeRecord(v: unknown, category?: string): ConsumeRecord | null {
  if (!isObject(v)) return null;
  const count = positiveInt(v.count);
  const at = typeof v.at === 'number' && Number.isFinite(v.at) && v.at > 0 ? v.at : 0;
  if (count === 0 || at === 0 || !isIsoDate(v.expiry)) return null;
  return {
    id: str(v.id) || newId(),
    at,
    category: category ?? str(v.category).trim(),
    content: str(v.content),
    count,
    expiry: v.expiry,
  };
}

export function sanitizeUpdatedAt(v: unknown): UpdatedAt {
  if (!isObject(v) || Array.isArray(v)) return {};
  return Object.fromEntries(
    Object.entries(v).filter(([, t]) => typeof t === 'number' && Number.isFinite(t) && t >= 0),
  ) as UpdatedAt;
}

/** `raw` is an object holding `stocks`, `targets`, `history` and `updatedAt`, all optional. */
export function sanitizeLists(raw: unknown, category?: string): Lists {
  const r = isObject(raw) ? raw : {};
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    stocks: arr(r.stocks)
      .map((s) => sanitizeStock(s, category))
      .filter((s): s is StockItem => s !== null),
    targets: arr(r.targets)
      .map((t) => sanitizeTarget(t, category))
      .filter((t): t is TargetItem => t !== null),
    history: arr(r.history)
      .map((h) => sanitizeRecord(h, category))
      .filter((h): h is ConsumeRecord => h !== null),
    updatedAt: sanitizeUpdatedAt(r.updatedAt),
  };
}
