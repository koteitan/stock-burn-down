import { isIsoDate, todayIso } from './date';
import { categoriesOf } from './lists';
import { sanitizeLists } from './sanitize';
import { DEFAULT_SETTINGS, type Lists, type Settings } from './types';

export const STORAGE_KEY = 'stock-burn-down';

export interface Persisted {
  settings: Settings;
  /** Lists stored in the browser (storage == 'browser'). */
  lists: Lists | null;
  /** Browser lists not yet merged into nostr after switching storage to nostr. */
  pendingUpload: Lists | null;
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function loadPersisted(): Persisted {
  let raw: unknown = null;
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  if (typeof raw !== 'object' || raw === null) {
    return {
      settings: { ...DEFAULT_SETTINGS, chartStart: todayIso() },
      lists: null,
      pendingUpload: null,
    };
  }
  const r = raw as Record<string, unknown>;
  const s = (typeof r.settings === 'object' && r.settings !== null ? r.settings : {}) as Record<
    string,
    unknown
  >;
  const settings: Settings = {
    theme: pick(s.theme, ['dark', 'light', 'system'], DEFAULT_SETTINGS.theme),
    lang: pick(s.lang, ['ja', 'en'], DEFAULT_SETTINGS.lang),
    storage: pick(s.storage, ['browser', 'nostr'], DEFAULT_SETTINGS.storage),
    chartStart: isIsoDate(s.chartStart) ? s.chartStart : todayIso(),
  };
  return {
    settings,
    lists: settings.storage === 'browser' ? sanitizeLists(r) : null,
    pendingUpload: r.pendingUpload ? sanitizeLists(r.pendingUpload) : null,
  };
}

/** Drops update times of categories that no longer have any item. */
function pruneUpdatedAt(lists: Lists): Lists {
  const live = new Set(categoriesOf(lists));
  return {
    ...lists,
    updatedAt: Object.fromEntries(Object.entries(lists.updatedAt).filter(([cat]) => live.has(cat))),
  };
}

export function savePersisted(data: Persisted): void {
  const out: Record<string, unknown> = { version: 1, settings: data.settings };
  if (data.settings.storage === 'browser' && data.lists) {
    Object.assign(out, pruneUpdatedAt(data.lists));
  }
  if (data.settings.storage === 'nostr' && data.pendingUpload) {
    out.pendingUpload = pruneUpdatedAt(data.pendingUpload);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    /* storage may be unavailable (private mode, quota) */
  }
}
