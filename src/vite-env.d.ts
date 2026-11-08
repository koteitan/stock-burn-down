import type * as Nostr from 'nostr-typedef';

declare global {
  const __APP_VERSION__: string;
  interface Window {
    nostr?: Nostr.Nip07.Nostr;
  }
}
