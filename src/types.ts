export interface StockItem {
  id: string;
  addedDate: string;
  category: string;
  content: string;
  count: number;
  expiry: string;
}

export interface TargetItem {
  id: string;
  addedDate: string;
  category: string;
  count: number;
}

/** One press of [1つ消費] (or an edited record). */
export interface ConsumeRecord {
  id: string;
  /** Consumed at, Unix ms. */
  at: number;
  category: string;
  content: string;
  count: number;
  /** Best-before date of the consumed item, kept so the expiry line does not move. */
  expiry: string;
}

/** Last update time (Unix ms) per category. */
export type UpdatedAt = Record<string, number>;

export interface Lists {
  stocks: StockItem[];
  targets: TargetItem[];
  history: ConsumeRecord[];
  updatedAt: UpdatedAt;
}

export type Theme = 'dark' | 'light' | 'system';
export type Lang = 'ja' | 'en';
export type StorageMode = 'browser' | 'nostr';

export type StockSortKey = 'expiry' | 'category' | 'added';

export interface StockSort {
  /** Keys from the highest priority down; always all three. */
  order: StockSortKey[];
  desc: Record<StockSortKey, boolean>;
}

export const DEFAULT_STOCK_SORT: StockSort = {
  order: ['expiry', 'category', 'added'],
  desc: { expiry: false, category: false, added: false },
};

export interface Settings {
  theme: Theme;
  lang: Lang;
  storage: StorageMode;
  /** Chart range (YYYY-MM-DD), shared by all charts; an empty end means the last best-before. */
  chartStart: string;
  chartEnd: string;
  stockSort: StockSort;
}

export const DEFAULT_SETTINGS: Omit<Settings, 'chartStart'> = {
  chartEnd: '',
  theme: 'dark',
  lang: 'ja',
  storage: 'browser',
  stockSort: DEFAULT_STOCK_SORT,
};

export const EMPTY_LISTS: Lists = { stocks: [], targets: [], history: [], updatedAt: {} };

/** The signed-in nostr user as shown in the status. */
export interface NostrUser {
  npub: string;
  /** Profile name (kind:0), or null until one arrives. */
  name: string | null;
  /** Events of this site received so far. */
  received: number;
  /** Events of this site that could not be decrypted or parsed. */
  unreadable: number;
  /** The first decrypt/parse error, for the status. */
  error: string | null;
}

export type NostrStatus =
  | 'no-nip07'
  | 'loading'
  | 'no-events'
  | 'no-stock'
  | 'received'
  | 'undecryptable'
  | 'saving'
  | 'saved'
  | 'save-error';
