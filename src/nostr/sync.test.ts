import type { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lists, NostrStatus, NostrUser, StockItem } from '../types';
import { D_PREFIX, NostrSync, parseCategory } from './sync';

const PK = 'a'.repeat(64);

const h = vi.hoisted(() => ({
  subjects: [] as Subject<unknown>[],
  sent: [] as { kind: number; tags: string[][]; content: string; created_at: number }[],
  sendOk: true,
  onProfile: null as ((name: string, createdAt: number) => void) | null,
}));

vi.mock('./client', async () => {
  const { Subject, of } = await import('rxjs');
  return {
    rxNostr: () => ({
      use: () => {
        const s = new Subject<unknown>();
        h.subjects.push(s);
        return s.asObservable();
      },
      send: (params: (typeof h.sent)[number]) => {
        h.sent.push(params);
        return of({ ok: h.sendOk, from: 'wss://r', eventId: 'x', done: true });
      },
    }),
  };
});
vi.mock('./discovery', () => ({ fetchWriteRelays: async () => ['wss://r'] }));
vi.mock('./profile', () => ({
  fetchProfile: (_pk: string, _relays: string[], onProfile: (n: string, at: number) => void) => {
    h.onProfile = onProfile;
    return () => {};
  },
}));
// Mock ciphertexts are "enc:<plaintext>", plus "?iv=x" for NIP-04.
vi.mock('./nip07', () => ({
  waitForNip07: async () => true,
  encryptToSelf: async (_pk: string, text: string) => `enc:${text}?iv=x`,
  decryptFromSelf: async (_pk: string, ct: string) => {
    if (ct.startsWith('bad:')) throw new Error('decrypt denied');
    return plain(ct);
  },
  isNip04: (ct: string) => ct.includes('?iv='),
}));

function plain(ct: string): string {
  return ct.slice(4).replace(/\?iv=.*$/, '');
}

const stock = (id: string, category: string, count = 1): StockItem => ({
  id,
  addedDate: '2026-11-01',
  category,
  content: id,
  count,
  expiry: '2027-01-01',
});

const packet = (id: string, d: string, payload: unknown, createdAt = 100, nip04 = true) => ({
  event: {
    id,
    kind: 30078,
    pubkey: PK,
    created_at: createdAt,
    tags: [['d', d]],
    content: `enc:${JSON.stringify(payload)}${nip04 ? '?iv=x' : ''}`,
    sig: '',
  },
});

async function load(packets: unknown[]) {
  const calls = {
    status: [] as NostrStatus[],
    remote: [] as Lists[],
    users: [] as NostrUser[],
    ready: 0,
    synced: 0,
  };
  const sync = new NostrSync({
    onStatus: (s) => calls.status.push(s),
    onUser: (u) => calls.users.push(u),
    onRemoteLists: (l) => calls.remote.push(l),
    onReady: () => calls.ready++,
    onSynced: () => calls.synced++,
  });
  await sync.start();
  const subject = h.subjects[h.subjects.length - 1];
  for (const p of packets) subject.next(p);
  subject.complete();
  await vi.waitFor(() => expect(calls.status.length).toBeGreaterThan(1));
  return { sync, calls };
}

const lastStatus = (calls: { status: NostrStatus[] }) => calls.status[calls.status.length - 1];

beforeEach(() => {
  h.subjects.length = 0;
  h.sent.length = 0;
  h.sendOk = true;
  vi.stubGlobal('window', { nostr: { getPublicKey: async () => PK } });
});
afterEach(() => vi.unstubAllGlobals());

describe('NostrSync loading', () => {
  it('reports no events', async () => {
    const { calls } = await load([]);
    expect(calls.status).toEqual(['loading', 'no-events']);
  });

  it('reports no stock list when only other apps have kind:30078 events', async () => {
    const { calls } = await load([packet('e1', 'other-app/settings', {})]);
    expect(lastStatus(calls)).toBe('no-stock');
  });

  it('shows decrypted events as they arrive and keeps the newest per d tag', async () => {
    const d = `${D_PREFIX}1`;
    const { calls } = await load([
      packet('old', d, { v: 1, category: '缶詰', stocks: [stock('a', '缶詰')], targets: [] }, 100),
      packet(
        'new',
        d,
        { v: 1, category: '缶詰', stocks: [stock('b', '缶詰', 2)], targets: [] },
        200,
      ),
      packet('new', d, { v: 1, category: '缶詰', stocks: [], targets: [] }, 200),
      packet('water', `${D_PREFIX}2`, {
        v: 1,
        category: '水',
        updatedAt: 777,
        stocks: [stock('w', '水')],
        targets: [],
      }),
      packet('other', 'other-app/x', {}),
    ]);
    expect(lastStatus(calls)).toBe('received');
    expect(calls.remote).toHaveLength(3);
    const final = calls.remote[2];
    expect(final.stocks.map((s) => [s.id, s.category, s.count])).toEqual([
      ['b', '缶詰', 2],
      ['w', '水', 1],
    ]);
    // Without updatedAt in the content, the event's created_at stands in for it.
    expect(final.updatedAt).toEqual({ 缶詰: 200_000, 水: 777 });
  });
});

describe('NostrSync user', () => {
  it('reports the npub, the received count of this site and the newest profile name', async () => {
    const { calls } = await load([
      packet('e1', `${D_PREFIX}1`, { v: 1, category: '缶詰', stocks: [], targets: [] }),
      packet('e2', `${D_PREFIX}2`, { v: 1, category: '水', stocks: [], targets: [] }),
      packet('other', 'other-app/x', {}),
    ]);
    const last = () => calls.users[calls.users.length - 1];
    expect(last()).toEqual({
      npub: expect.stringMatching(/^npub1/),
      name: null,
      received: 2,
      unreadable: 0,
      error: null,
    });
    h.onProfile!('new name', 200);
    h.onProfile!('old name', 100);
    expect(last().name).toBe('new name');
  });
});

describe('NostrSync unreadable events (A)', () => {
  it('reports them and stays read-only so they are not overwritten', async () => {
    const good = packet('e1', `${D_PREFIX}1`, {
      v: 1,
      category: '缶詰',
      stocks: [stock('a', '缶詰')],
      targets: [],
    });
    const bad = { event: { ...packet('e2', `${D_PREFIX}2`, {}).event, content: 'bad:xxx' } };
    const { sync, calls } = await load([good, bad]);
    expect(lastStatus(calls)).toBe('undecryptable');
    expect(calls.ready).toBe(0);
    const user = calls.users[calls.users.length - 1];
    expect(user).toMatchObject({ received: 2, unreadable: 1, error: 'decrypt denied' });
    expect(calls.remote[calls.remote.length - 1].stocks.map((s) => s.id)).toEqual(['a']);

    sync.update({ stocks: [stock('b', '水')], targets: [], history: [], updatedAt: { 水: 1 } });
    await new Promise((r) => setTimeout(r, 1300));
    expect(h.sent).toHaveLength(0);
  });
});

describe('NostrSync duplicate categories (C)', () => {
  it('unites the items and empties the older event on the next save', async () => {
    const target = (id: string, count: number) => ({ id, addedDate: '2026-11-01', count });
    const { sync, calls } = await load([
      packet(
        'old',
        `${D_PREFIX}old`,
        {
          v: 1,
          category: '缶詰',
          updatedAt: 10,
          stocks: [stock('a', '缶詰')],
          targets: [target('t1', 3)],
        },
        100,
      ),
      packet(
        'new',
        `${D_PREFIX}new`,
        {
          v: 1,
          category: '缶詰',
          updatedAt: 20,
          stocks: [stock('b', '缶詰')],
          targets: [target('t2', 5)],
        },
        200,
      ),
    ]);
    const shown = calls.remote[calls.remote.length - 1];
    expect(shown.stocks.map((s) => s.id)).toEqual(['b', 'a']);
    expect(shown.targets.map((t) => [t.id, t.count])).toEqual([['t2', 5]]);
    expect(shown.updatedAt).toEqual({ 缶詰: 20 });
    expect(lastStatus(calls)).toBe('received');

    sync.update({
      ...shown,
      stocks: [...shown.stocks, stock('c', '缶詰')],
      updatedAt: { 缶詰: 30 },
    });
    await vi.waitFor(() => expect(calls.synced).toBe(1), { timeout: 3000 });
    expect(h.sent.map((e) => e.tags[0][1])).toEqual([`${D_PREFIX}new`, `${D_PREFIX}old`]);
    expect(parseCategory(plain(h.sent[0].content))?.lists.stocks.map((s) => s.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(parseCategory(plain(h.sent[1].content))?.lists.stocks).toEqual([]);
  });
});

describe('NostrSync NIP-44 events (Q24)', () => {
  it('rewrites readable NIP-44 events in NIP-04 once loaded, including emptied categories', async () => {
    const { sync, calls } = await load([
      packet(
        'a',
        `${D_PREFIX}can`,
        { v: 1, category: '缶詰', updatedAt: 5, stocks: [stock('a', '缶詰')], targets: [] },
        100,
        false,
      ),
      packet(
        'b',
        `${D_PREFIX}water`,
        { v: 1, category: '水', stocks: [], targets: [] },
        100,
        false,
      ),
      packet('c', `${D_PREFIX}rice`, { v: 1, category: '米', stocks: [], targets: [] }, 100, true),
    ]);
    const shown = calls.remote[calls.remote.length - 1];
    sync.update(shown);
    await vi.waitFor(() => expect(calls.synced).toBe(1), { timeout: 3000 });
    expect(h.sent.map((e) => e.tags[0][1]).sort()).toEqual([`${D_PREFIX}can`, `${D_PREFIX}water`]);
    expect(h.sent.every((e) => e.content.includes('?iv='))).toBe(true);
    const can = h.sent.find((e) => e.tags[0][1] === `${D_PREFIX}can`)!;
    expect(parseCategory(plain(can.content))?.lists.stocks.map((x) => x.id)).toEqual(['a']);

    sync.update(shown);
    await vi.waitFor(() => expect(calls.synced).toBe(2), { timeout: 3000 });
    expect(h.sent).toHaveLength(2);
  });
});

describe('NostrSync saving', () => {
  it('publishes only changed categories, reusing the d tag of existing ones', async () => {
    const d = `${D_PREFIX}can`;
    const { sync, calls } = await load([
      packet('e1', d, { v: 1, category: '缶詰', stocks: [stock('a', '缶詰')], targets: [] }, 100),
    ]);

    sync.update({
      stocks: [stock('a', '缶詰'), stock('w', '水', 6)],
      targets: [],
      history: [],
      updatedAt: { 缶詰: 100_000, 水: 500 },
    });
    await vi.waitFor(() => expect(calls.synced).toBe(1), { timeout: 3000 });
    expect(h.sent).toHaveLength(1);
    const water = h.sent[0];
    expect(water.kind).toBe(30078);
    expect(water.tags[0][1].startsWith(D_PREFIX)).toBe(true);
    expect(water.tags[0][1]).not.toBe(d);
    expect(JSON.parse(plain(water.content))).toMatchObject({ category: '水', updatedAt: 500 });
    expect(parseCategory(plain(water.content))?.lists.stocks.map((s) => s.id)).toEqual(['w']);
    expect(lastStatus(calls)).toBe('saved');

    sync.update({
      stocks: [stock('w', '水', 6)],
      targets: [],
      history: [],
      updatedAt: { 缶詰: 600, 水: 500 },
    });
    await vi.waitFor(() => expect(calls.synced).toBe(2), { timeout: 3000 });
    expect(h.sent).toHaveLength(2);
    const can = h.sent[1];
    expect(can.tags).toEqual([['d', d]]);
    expect(can.created_at).toBeGreaterThan(100);
    expect(parseCategory(plain(can.content))).toEqual({
      category: '缶詰',
      lists: { stocks: [], targets: [], history: [], updatedAt: { 缶詰: 600 } },
    });

    // Dropping the update time of the emptied category does not publish it again.
    sync.update({
      stocks: [stock('w', '水', 6)],
      targets: [],
      history: [],
      updatedAt: { 水: 500 },
    });
    await vi.waitFor(() => expect(calls.synced).toBe(3), { timeout: 3000 });
    expect(h.sent).toHaveLength(2);
    expect(sync.hasUnsaved()).toBe(false);
  });

  it('stores the consumption history in the category event', async () => {
    const { sync, calls } = await load([]);
    const record = {
      id: 'r1',
      at: 1794096000000,
      category: '缶詰',
      content: 'サバ',
      count: 1,
      expiry: '2027-01-01',
    };
    sync.update({ stocks: [], targets: [], history: [record], updatedAt: { 缶詰: 5 } });
    await vi.waitFor(() => expect(calls.synced).toBe(1), { timeout: 3000 });
    const payload = JSON.parse(plain(h.sent[0].content));
    expect(payload.history).toEqual([
      { id: 'r1', at: 1794096000000, content: 'サバ', count: 1, expiry: '2027-01-01' },
    ]);
    expect(parseCategory(plain(h.sent[0].content))?.lists.history).toEqual([record]);
  });

  it('reports a failed save and retries on the next change', async () => {
    const { sync, calls } = await load([]);
    h.sendOk = false;
    sync.update({ stocks: [stock('a', '缶詰')], targets: [], history: [], updatedAt: { 缶詰: 1 } });
    await vi.waitFor(() => expect(lastStatus(calls)).toBe('save-error'), { timeout: 3000 });
    expect(calls.synced).toBe(0);
    expect(sync.hasUnsaved()).toBe(true);

    h.sendOk = true;
    sync.update({
      stocks: [stock('a', '缶詰'), stock('b', '缶詰')],
      targets: [],
      history: [],
      updatedAt: { 缶詰: 2 },
    });
    await vi.waitFor(() => expect(calls.synced).toBe(1), { timeout: 3000 });
    expect(lastStatus(calls)).toBe('saved');
    expect(h.sent[0].tags[0][1]).toBe(h.sent[1].tags[0][1]);
  });
});
