import { createRxBackwardReq, nip07Signer } from 'rx-nostr';
import type { Subscription } from 'rxjs';
import type * as Nostr from 'nostr-typedef';
import {
  categoriesOf,
  categoryPayload,
  isEmptyLists,
  listsOfCategory,
  updatedAtOf,
} from '../lists';
import { newId, sanitizeLists } from '../sanitize';
import { EMPTY_LISTS, type Lists, type NostrStatus, type NostrUser } from '../types';
import { npubEncode } from './bech32';
import { rxNostr } from './client';
import { fetchWriteRelays } from './discovery';
import { fetchProfile } from './profile';
import { BOOTSTRAP_RELAYS } from './relays';
import { decryptFromSelf, encryptToSelf, isNip04, waitForNip07 } from './nip07';

export const APP_KIND = 30078;
export const D_PREFIX = 'stock-burn-down/';

interface RemoteCategory {
  d: string;
  createdAt: number;
  category: string;
  lists: Lists;
}

/** One category as merged from every event that decrypts to it. */
interface MergedCategory extends RemoteCategory {
  /** Other d tags of the same category that still hold items; emptied on the next save. */
  others: string[];
}

/**
 * Merges events of the same category (C): items are united by id, newer events first;
 * the target of the newest event that has one wins; the newest event is the primary.
 */
export function mergeCategory(events: RemoteCategory[]): MergedCategory {
  const sorted = [...events].sort((a, b) => b.createdAt - a.createdAt);
  const [primary] = sorted;
  const lists: Lists = { stocks: [], targets: [], history: [], updatedAt: {} };
  const stockIds = new Set<string>();
  const recordIds = new Set<string>();
  let time = 0;
  for (const e of sorted) {
    for (const s of e.lists.stocks) {
      if (stockIds.has(s.id)) continue;
      stockIds.add(s.id);
      lists.stocks.push(s);
    }
    for (const h of e.lists.history) {
      if (recordIds.has(h.id)) continue;
      recordIds.add(h.id);
      lists.history.push(h);
    }
    if (lists.targets.length === 0) lists.targets.push(...e.lists.targets.slice(0, 1));
    time = Math.max(time, updatedAtOf(e.lists, e.category));
  }
  lists.updatedAt = Object.fromEntries([[primary.category, time]]);
  return {
    ...primary,
    lists,
    others: sorted
      .slice(1)
      .filter((e) => !isEmptyLists(e.lists))
      .map((e) => e.d),
  };
}

export interface NostrSyncCallbacks {
  onStatus(status: NostrStatus): void;
  onUser(user: NostrUser): void;
  /** Called while loading, every time a decrypted event changes what is on the relays. */
  onRemoteLists(lists: Lists): void;
  /** Loading finished; from now on `update()` publishes. */
  onReady(): void;
  /** Everything passed to `update()` is on the relays. */
  onSynced(): void;
}

/** Canonical plaintext of one kind:30078 event: equal JSON means equal content. */
export function serializeCategory(category: string, lists: Lists): string {
  return JSON.stringify({
    v: 1,
    category,
    updatedAt: updatedAtOf(lists, category),
    ...categoryPayload(lists, category),
  });
}

/** `fallbackUpdatedAt` is used when the content has no update time. */
export function parseCategory(
  json: string,
  fallbackUpdatedAt = 0,
): { category: string; lists: Lists } | null {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.category !== 'string') return null;
  const lists = sanitizeLists(
    { stocks: r.stocks, targets: r.targets, history: r.history },
    r.category,
  );
  const time =
    typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) && r.updatedAt > 0
      ? r.updatedAt
      : fallbackUpdatedAt;
  lists.updatedAt = Object.fromEntries([[r.category, time]]);
  return { category: r.category, lists };
}

function sendEvent(params: Nostr.EventParameters, relays: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    rxNostr()
      .send(params, { signer: nip07Signer(), on: { relays } })
      .subscribe({
        next: (packet) => {
          if (packet.ok && !ok) {
            ok = true;
            resolve(true);
          }
        },
        error: () => resolve(ok),
        complete: () => resolve(ok),
      });
  });
}

export class NostrSync {
  private pubkey: string | null = null;
  private relays: string[] = [];
  private seenIds = new Set<string>();
  /** Newest decrypted event per d tag. */
  private remote = new Map<string, RemoteCategory>();
  /** Newest created_at per d tag, including events that were not (yet) decrypted. */
  private maxCreatedAt = new Map<string, number>();
  /** d tags given to categories that are not on the relays yet, kept so a retry reuses them. */
  private newD = new Map<string, string>();
  private sub: Subscription | null = null;
  private decrypting: Promise<void> = Promise.resolve();
  private stopped = false;
  private ready = false;
  private desired: Lists | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private flushAgain = false;
  private cb: NostrSyncCallbacks;
  private user: NostrUser | null = null;
  private profileAt = 0;
  private stopProfile: (() => void)[] = [];
  /** d tag → error, for events of this site that could not be read. */
  private unreadable = new Map<string, string>();
  /** d tags whose newest event is NIP-44; rewritten in NIP-04 so every device can read them. */
  private nip44 = new Set<string>();

  constructor(callbacks: NostrSyncCallbacks) {
    this.cb = callbacks;
  }

  async start(): Promise<void> {
    this.cb.onStatus('loading');
    if (!(await waitForNip07()) || this.stopped) {
      if (!this.stopped) this.cb.onStatus('no-nip07');
      return;
    }
    let pubkey: string;
    try {
      pubkey = await window.nostr!.getPublicKey();
    } catch {
      if (!this.stopped) this.cb.onStatus('no-nip07');
      return;
    }
    if (this.stopped) return;
    this.pubkey = pubkey;
    this.setUser({ npub: npubEncode(pubkey), name: null, received: 0, unreadable: 0, error: null });
    const onProfile = (name: string, createdAt: number) => {
      if (this.stopped || createdAt <= this.profileAt) return;
      this.profileAt = createdAt;
      this.setUser({ name });
    };
    this.stopProfile.push(fetchProfile(pubkey, BOOTSTRAP_RELAYS, onProfile));
    this.relays = await fetchWriteRelays(pubkey);
    if (this.stopped) return;
    this.fetchData(pubkey);
    this.stopProfile.push(fetchProfile(pubkey, this.relays, onProfile));
  }

  stop(): void {
    this.stopped = true;
    this.sub?.unsubscribe();
    for (const stop of this.stopProfile) stop();
    if (this.timer !== null) clearTimeout(this.timer);
  }

  update(lists: Lists): void {
    this.desired = lists;
    if (!this.ready || this.stopped) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 1000);
  }

  hasUnsaved(): boolean {
    return this.flushing || this.pendingCategories().length > 0;
  }

  private fetchData(pubkey: string) {
    let total = 0;
    let ours = 0;
    let finished = false;
    const finish = async () => {
      if (finished) return;
      finished = true;
      await this.decrypting;
      if (this.stopped) return;
      if (this.unreadable.size > 0) {
        // Saving now could hide what we cannot read (A), so stay read-only.
        this.cb.onStatus('undecryptable');
        return;
      }
      this.ready = true;
      this.cb.onStatus(total === 0 ? 'no-events' : ours === 0 ? 'no-stock' : 'received');
      this.cb.onReady();
    };
    const req = createRxBackwardReq();
    this.sub = rxNostr()
      .use(req, { on: { relays: this.relays } })
      .subscribe({
        next: ({ event }) => {
          if (event.kind !== APP_KIND || event.pubkey !== pubkey || this.seenIds.has(event.id))
            return;
          this.seenIds.add(event.id);
          total++;
          const d = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
          if (!d.startsWith(D_PREFIX)) return;
          ours++;
          this.setUser({ received: ours });
          this.maxCreatedAt.set(d, Math.max(this.maxCreatedAt.get(d) ?? 0, event.created_at));
          this.decrypting = this.decrypting.then(() => this.absorb(event, d));
        },
        complete: () => void finish(),
        error: () => void finish(),
      });
    req.emit({ kinds: [APP_KIND], authors: [pubkey] });
    req.over();
  }

  private setUser(patch: Partial<NostrUser>) {
    this.user = {
      npub: '',
      name: null,
      received: 0,
      unreadable: 0,
      error: null,
      ...this.user,
      ...patch,
    };
    this.cb.onUser(this.user);
  }

  private async absorb(event: Nostr.Event, d: string) {
    if (this.stopped || !this.pubkey) return;
    const prev = this.remote.get(d);
    if (prev && prev.createdAt >= event.created_at) return;
    try {
      const parsed = parseCategory(
        await decryptFromSelf(this.pubkey, event.content),
        event.created_at * 1000,
      );
      if (!parsed) throw new Error('not a stock-burn-down payload');
      if (this.stopped) return;
      this.remote.set(d, { d, createdAt: event.created_at, ...parsed });
      this.unreadable.delete(d);
      if (isNip04(event.content)) this.nip44.delete(d);
      else this.nip44.add(d);
      this.cb.onRemoteLists(this.remoteLists());
    } catch (e) {
      console.warn('stock-burn-down: cannot read event', d, e);
      const message = (e instanceof Error ? e.message : String(e)).slice(0, 160);
      this.unreadable.set(d, message);
    }
    const errors = [...this.unreadable.values()];
    this.setUser({ unreadable: errors.length, error: errors[0] ?? null });
  }

  private byCategory(): Map<string, MergedCategory> {
    const groups = new Map<string, RemoteCategory[]>();
    for (const r of this.remote.values()) {
      groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
    }
    return new Map([...groups].map(([cat, events]) => [cat, mergeCategory(events)]));
  }

  private remoteLists(): Lists {
    const out: Lists = { stocks: [], targets: [], history: [], updatedAt: {} };
    const times: [string, number][] = [];
    for (const r of this.byCategory().values()) {
      out.stocks.push(...r.lists.stocks);
      out.targets.push(...r.lists.targets);
      out.history.push(...r.lists.history);
      times.push([r.category, updatedAtOf(r.lists, r.category)]);
    }
    out.updatedAt = Object.fromEntries(times);
    return out;
  }

  private pendingCategories(): string[] {
    const desired = this.desired;
    if (!this.ready || !desired) return [];
    const remote = this.byCategory();
    const cats = new Set([...categoriesOf(desired), ...remote.keys()]);
    return [...cats].filter((cat) => {
      if (this.nip44Of(cat).length > 0) return true;
      const want = listsOfCategory(desired, cat);
      const have = remote.get(cat)?.lists ?? EMPTY_LISTS;
      // An emptied category only needs publishing while the relays still hold its items.
      if (isEmptyLists(want) && isEmptyLists(have)) return false;
      return serializeCategory(cat, want) !== serializeCategory(cat, have);
    });
  }

  private async flush() {
    if (!this.ready || this.stopped) return;
    if (this.flushing) {
      this.flushAgain = true;
      return;
    }
    this.flushing = true;
    let failed = false;
    let published = false;
    do {
      this.flushAgain = false;
      for (const cat of this.pendingCategories()) {
        if (this.stopped) return;
        this.cb.onStatus('saving');
        published = true;
        const ok = await this.publish(cat, listsOfCategory(this.desired!, cat)).catch((e) => {
          console.warn('stock-burn-down: cannot publish', cat, e);
          return false;
        });
        if (!ok) failed = true;
      }
    } while (this.flushAgain && !failed && !this.stopped);
    this.flushing = false;
    if (this.stopped) return;
    if (published) this.cb.onStatus(failed ? 'save-error' : 'saved');
    if (!failed && this.pendingCategories().length === 0) this.cb.onSynced();
  }

  /** d tags of the category still held in NIP-44. */
  private nip44Of(category: string): string[] {
    return [...this.remote.values()]
      .filter((r) => r.category === category && this.nip44.has(r.d))
      .map((r) => r.d);
  }

  /**
   * Writes the category to its primary d tag, then empties its other d tags that still hold
   * items (C) or are still NIP-44.
   */
  private async publish(category: string, lists: Lists): Promise<boolean> {
    const merged = this.byCategory().get(category);
    let d = merged?.d ?? this.newD.get(category);
    if (!d) {
      d = D_PREFIX + newId();
      this.newD.set(category, d);
    }
    const others = new Set([...(merged?.others ?? []), ...this.nip44Of(category)]);
    others.delete(d);
    let ok = await this.publishTo(d, category, lists);
    for (const other of others) {
      if (!ok) break;
      ok = await this.publishTo(other, category, EMPTY_LISTS);
    }
    return ok;
  }

  private async publishTo(d: string, category: string, lists: Lists): Promise<boolean> {
    const pubkey = this.pubkey!;
    const json = serializeCategory(category, lists);
    const content = await encryptToSelf(pubkey, json);
    // Replaceable events with equal created_at are resolved by id, so always move forward.
    const createdAt = Math.max(Math.floor(Date.now() / 1000), (this.maxCreatedAt.get(d) ?? 0) + 1);
    const ok = await sendEvent(
      { kind: APP_KIND, tags: [['d', d]], content, created_at: createdAt },
      this.relays,
    );
    if (ok) {
      this.nip44.delete(d);
      this.maxCreatedAt.set(d, createdAt);
      this.remote.set(d, { d, createdAt, ...parseCategory(json)! });
    }
    return ok;
  }
}
