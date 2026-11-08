import { parseShortDate, toDay, todayIso } from './date';
import type { Lang } from './types';

/** Testing overrides from the URL: ?today=YYMMDD and ?lang=ja|en. */
function param(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

const DAY_MS = 86_400_000;

/** Forced "today" (YYYY-MM-DD) from ?today=, or null. */
export const forcedToday: string | null = parseShortDate(param('today') ?? '');

const lang = param('lang');
/** Forced UI language from ?lang=, or null. */
export const forcedLang: Lang | null = lang === 'ja' || lang === 'en' ? lang : null;

// The whole clock moves by whole days, so the time of day stays real.
const offsetMs = forcedToday ? (toDay(forcedToday) - toDay(todayIso(new Date()))) * DAY_MS : 0;

/** Current time in Unix ms, shifted by ?today=. */
export function nowMs(): number {
  return Date.now() + offsetMs;
}

/** Today's date (YYYY-MM-DD), shifted by ?today=. */
export function todayNow(): string {
  return todayIso(new Date(nowMs()));
}
