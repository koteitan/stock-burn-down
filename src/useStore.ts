import { useCallback, useEffect, useRef, useState } from 'react';
import { dayOfTime } from './chart';
import { todayIso } from './date';
import { isEmptyLists, mergeLists, touchChanged, upsertTarget } from './lists';
import { NostrSync } from './nostr/sync';
import { newId } from './sanitize';
import { loadPersisted, savePersisted } from './storage';
import {
  EMPTY_LISTS,
  type ConsumeRecord,
  type Lists,
  type NostrStatus,
  type Settings,
  type StockItem,
  type TargetItem,
} from './types';

export type StockInput = Pick<StockItem, 'category' | 'content' | 'count' | 'expiry'>;
export type TargetInput = Pick<TargetItem, 'category' | 'count'>;
export type RecordInput = Pick<ConsumeRecord, 'at' | 'category' | 'content' | 'count' | 'expiry'>;

export function useStore() {
  const [initial] = useState(loadPersisted);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [lists, setLists] = useState<Lists>(initial.lists ?? EMPTY_LISTS);
  const [pending, setPending] = useState<Lists | null>(initial.pendingUpload);
  const [nostrStatus, setNostrStatus] = useState<NostrStatus | null>(null);
  const [nostrReady, setNostrReady] = useState(false);
  const syncRef = useRef<NostrSync | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    savePersisted({ settings, lists, pendingUpload: pending });
  }, [settings, lists, pending]);

  useEffect(() => {
    if (settings.storage !== 'nostr') return;
    const sync = new NostrSync({
      onStatus: setNostrStatus,
      onRemoteLists: setLists,
      onReady: () => {
        const p = pendingRef.current;
        if (p) setLists((cur) => mergeLists(cur, p));
        setNostrReady(true);
      },
      onSynced: () => setPending(null),
    });
    syncRef.current = sync;
    void sync.start();
    return () => {
      sync.stop();
      syncRef.current = null;
    };
  }, [settings.storage]);

  useEffect(() => {
    if (settings.storage === 'nostr' && nostrReady) syncRef.current?.update(lists);
  }, [settings.storage, nostrReady, lists]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (syncRef.current?.hasUnsaved()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      if (next.storage !== settings.storage) {
        setNostrReady(false);
        setNostrStatus(null);
        if (next.storage === 'nostr') {
          const carried = pending ? mergeLists(lists, pending) : lists;
          setPending(isEmptyLists(carried) ? null : carried);
          setLists(EMPTY_LISTS);
        } else {
          setLists(pending ? mergeLists(lists, pending) : lists);
          setPending(null);
        }
      }
      setSettings(next);
    },
    [settings, lists, pending],
  );

  const editable = settings.storage === 'browser' || nostrReady;

  const edit = useCallback(
    (fn: (cur: Lists) => Lists) => {
      if (editable) setLists((cur) => touchChanged(cur, fn(cur), Date.now()));
    },
    [editable],
  );

  const actions = {
    addStock: (input: StockInput) =>
      edit((cur) => ({
        ...cur,
        stocks: [...cur.stocks, { ...input, id: newId(), addedDate: todayIso() }],
      })),
    consumeOne: (id: string) => {
      const record = { id: newId(), at: Date.now(), count: 1 };
      edit((cur) => {
        const item = cur.stocks.find((s) => s.id === id);
        if (!item) return cur;
        const { category, content, expiry } = item;
        return {
          ...cur,
          stocks: cur.stocks.flatMap((s) =>
            s.id !== id ? [s] : s.count > 1 ? [{ ...s, count: s.count - 1 }] : [],
          ),
          history: [...cur.history, { ...record, category, content, expiry }],
        };
      });
    },
    updateStock: (id: string, input: StockInput) =>
      edit((cur) => ({
        ...cur,
        stocks: cur.stocks.map((s) => (s.id === id ? { ...s, ...input } : s)),
      })),
    deleteStock: (id: string) =>
      edit((cur) => ({ ...cur, stocks: cur.stocks.filter((s) => s.id !== id) })),
    addTarget: (input: TargetInput) =>
      edit((cur) => ({
        ...cur,
        targets: upsertTarget(cur.targets, { ...input, id: newId(), addedDate: todayIso() }),
      })),
    updateTarget: (id: string, input: TargetInput) =>
      edit((cur) => ({
        ...cur,
        targets: cur.targets
          .filter((t) => t.id === id || t.category !== input.category)
          .map((t) => (t.id === id ? { ...t, ...input } : t)),
      })),
    deleteTarget: (id: string) =>
      edit((cur) => ({ ...cur, targets: cur.targets.filter((t) => t.id !== id) })),
    updateRecord: (id: string, input: RecordInput) =>
      edit((cur) => ({
        ...cur,
        history: cur.history.map((h) => (h.id === id ? { ...h, ...input } : h)),
      })),
    deleteRecord: (id: string) =>
      edit((cur) => ({ ...cur, history: cur.history.filter((h) => h.id !== id) })),
    /** Deletes the consumption records made before the start day (fractional day < start). */
    deleteRecordsBefore: (start: number) =>
      edit((cur) => ({ ...cur, history: cur.history.filter((h) => dayOfTime(h.at) >= start) })),
  };

  return { settings, updateSettings, lists, nostrStatus, editable, actions };
}
