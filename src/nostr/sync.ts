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
import { EMPTY_LISTS, type Lists, type NostrStatus } from '../types';
import { rxNostr } from './client';
import { fetchWriteRelays } from './discovery';
import { decryptFromSelf, encryptToSelf, waitForNip07 } from './nip07';

export const APP_KIND = 30078;
export const D_PREFIX = 'stock-burn-down/';

interface RemoteCategory {
  d: string;
  createdAt: number;
  category: string;
  lists: Lists;
}

export interface NostrSyncCallbacks {
  onStatus(status: NostrStatus): void;
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
    this.relays = await fetchWriteRelays(pubkey);
    if (this.stopped) return;
    this.fetchData(pubkey);
  }

  stop(): void {
    this.stopped = true;
    this.sub?.unsubscribe();
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
          this.maxCreatedAt.set(d, Math.max(this.maxCreatedAt.get(d) ?? 0, event.created_at));
          this.decrypting = this.decrypting.then(() => this.absorb(event, d));
        },
        complete: () => void finish(),
        error: () => void finish(),
      });
    req.emit({ kinds: [APP_KIND], authors: [pubkey] });
    req.over();
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
      if (!parsed || this.stopped) return;
      this.remote.set(d, { d, createdAt: event.created_at, ...parsed });
      this.cb.onRemoteLists(this.remoteLists());
    } catch (e) {
      console.warn('stock-burn-down: cannot read event', d, e);
    }
  }

  /** If two d tags decrypt to the same category, the newer event wins. */
  private byCategory(): Map<string, RemoteCategory> {
    const map = new Map<string, RemoteCategory>();
    for (const r of this.remote.values()) {
      const prev = map.get(r.category);
      if (!prev || prev.createdAt < r.createdAt) map.set(r.category, r);
    }
    return map;
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

  private async publish(category: string, lists: Lists): Promise<boolean> {
    const pubkey = this.pubkey!;
    let d = this.byCategory().get(category)?.d ?? this.newD.get(category);
    if (!d) {
      d = D_PREFIX + newId();
      this.newD.set(category, d);
    }
    const json = serializeCategory(category, lists);
    const content = await encryptToSelf(pubkey, json);
    // Replaceable events with equal created_at are resolved by id, so always move forward.
    const createdAt = Math.max(Math.floor(Date.now() / 1000), (this.maxCreatedAt.get(d) ?? 0) + 1);
    const ok = await sendEvent(
      { kind: APP_KIND, tags: [['d', d]], content, created_at: createdAt },
      this.relays,
    );
    if (ok) {
      this.maxCreatedAt.set(d, createdAt);
      this.remote.set(d, { d, createdAt, ...parseCategory(json)! });
    }
    return ok;
  }
}
