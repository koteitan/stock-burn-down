import { createRxBackwardReq } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import { rxNostr } from './client';
import { BOOTSTRAP_RELAYS, fallbackRelays, normalizeRelayUrl } from './relays';

interface RelayListEvents {
  relayList?: Nostr.Event;
  contacts?: Nostr.Event;
}

/** 5 s first, one 30 s retry if nothing came; resolves as soon as a kind:10002 arrives. */
function collectRelayLists(pubkey: string): Promise<RelayListEvents> {
  return new Promise((done) => {
    const found: RelayListEvents = {};
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        done(found);
      }
    };

    const run = (timeoutMs: number, isRetry: boolean) => {
      let ended = false;
      const req = createRxBackwardReq();
      const end = () => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        sub.unsubscribe();
        if (found.relayList || found.contacts || isRetry) settle();
        else run(30_000, true);
      };
      const sub = rxNostr()
        .use(req, { on: { relays: BOOTSTRAP_RELAYS } })
        .subscribe({
          next: ({ event }) => {
            const key = event.kind === 10002 ? 'relayList' : event.kind === 3 ? 'contacts' : null;
            if (!key) return;
            const prev = found[key];
            if (!prev || prev.created_at < event.created_at) found[key] = event;
            if (key === 'relayList') queueMicrotask(end);
          },
          complete: () => queueMicrotask(end),
          error: () => queueMicrotask(end),
        });
      const timer = setTimeout(end, timeoutMs);
      req.emit({ kinds: [10002, 3], authors: [pubkey], limit: 2 });
      req.over();
    };

    run(5_000, false);
  });
}

function writeRelaysOf({ relayList, contacts }: RelayListEvents): string[] {
  const urls = new Set<string>();
  const add = (url: unknown) => {
    const u = typeof url === 'string' ? normalizeRelayUrl(url) : null;
    if (u) urls.add(u);
  };
  if (relayList) {
    for (const tag of relayList.tags) {
      if (tag[0] === 'r' && tag[2] !== 'read') add(tag[1]);
    }
  } else if (contacts?.content) {
    try {
      const map = JSON.parse(contacts.content) as Record<string, { write?: boolean } | undefined>;
      for (const [url, perm] of Object.entries(map)) {
        if (perm?.write !== false) add(url);
      }
    } catch {
      /* legacy relay maps in kind:3 are often malformed */
    }
  }
  return [...urls];
}

/** The user's write relays: where their own events live and where new ones go (NIP-65). */
export async function fetchWriteRelays(pubkey: string): Promise<string[]> {
  const relays = writeRelaysOf(await collectRelayLists(pubkey));
  return relays.length > 0 ? relays : fallbackRelays();
}
