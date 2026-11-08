export const BOOTSTRAP_RELAYS = [
  'wss://directory.yabu.me',
  'wss://purplepag.es',
  'wss://relay.nostr.band',
  'wss://indexer.coracle.social',
];

const FALLBACK_JA = [
  'wss://yabu.me',
  'wss://nostr.compile-error.net',
  'wss://r.kojira.io',
  'wss://relay-jp.nostr.wirednet.jp',
  'wss://nrelay-jp.c-stellar.net',
  'wss://nostream.ocha.one',
  'wss://snowflare.cc',
];

const FALLBACK_OTHER = [
  'wss://relay.damus.io',
  'wss://nostr-pub.wellorder.net',
  'wss://offchain.pub',
  'wss://relay.snort.social',
];

export function fallbackRelays(): string[] {
  return navigator.language.toLowerCase().startsWith('ja') ? FALLBACK_JA : FALLBACK_OTHER;
}

export function normalizeRelayUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'wss:' && u.protocol !== 'ws:') return null;
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return null;
  }
}
