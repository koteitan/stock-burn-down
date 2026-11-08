import { createRxBackwardReq } from 'rx-nostr';
import { rxNostr } from './client';

/** display_name, else name, from a kind:0 content; null when it has neither. */
export function profileName(content: string): string | null {
  try {
    const p = JSON.parse(content) as Record<string, unknown>;
    const name = [p.display_name, p.displayName, p.name].find(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    return name ? name.trim().slice(0, 50) : null;
  } catch {
    return null;
  }
}

/** Fetches the kind:0 of `pubkey`, reporting every named profile as it arrives. */
export function fetchProfile(
  pubkey: string,
  relays: string[],
  onProfile: (name: string, createdAt: number) => void,
): () => void {
  const req = createRxBackwardReq();
  const sub = rxNostr()
    .use(req, { on: { relays } })
    .subscribe(({ event }) => {
      if (event.kind !== 0 || event.pubkey !== pubkey) return;
      const name = profileName(event.content);
      if (name) onProfile(name, event.created_at);
    });
  req.emit({ kinds: [0], authors: [pubkey], limit: 1 });
  req.over();
  return () => sub.unsubscribe();
}
