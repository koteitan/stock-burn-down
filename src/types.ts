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

export interface Settings {
  theme: Theme;
  lang: Lang;
  storage: StorageMode;
  /** Chart start date (YYYY-MM-DD), shared by all charts. */
  chartStart: string;
}

export const DEFAULT_SETTINGS: Omit<Settings, 'chartStart'> = {
  theme: 'dark',
  lang: 'ja',
  storage: 'browser',
};

export const EMPTY_LISTS: Lists = { stocks: [], targets: [], history: [], updatedAt: {} };

export type NostrStatus =
  | 'no-nip07'
  | 'loading'
  | 'no-events'
  | 'no-stock'
  | 'received'
  | 'saving'
  | 'saved'
  | 'save-error';
