import { afterEach, describe, expect, it, vi } from 'vitest';
import { decryptFromSelf, encryptToSelf } from './nip07';

afterEach(() => vi.unstubAllGlobals());

const nostr = (withNip44: boolean) => ({
  nip04: {
    encrypt: vi.fn(async () => 'c04?iv=x'),
    decrypt: vi.fn(async () => 'p04'),
  },
  ...(withNip44
    ? { nip44: { encrypt: vi.fn(async () => 'c44'), decrypt: vi.fn(async () => 'p44') } }
    : {}),
});

describe('NIP-07 encryption', () => {
  it('always encrypts with NIP-04, even when NIP-44 is available', async () => {
    const n = nostr(true);
    vi.stubGlobal('window', { nostr: n });
    expect(await encryptToSelf('pk', 'hello')).toBe('c04?iv=x');
    expect(n.nip44!.encrypt).not.toHaveBeenCalled();
  });

  it('decrypts each payload with the matching NIP', async () => {
    vi.stubGlobal('window', { nostr: nostr(true) });
    expect(await decryptFromSelf('pk', 'abc?iv=def')).toBe('p04');
    expect(await decryptFromSelf('pk', 'abcdef')).toBe('p44');
  });

  it('reports a missing NIP-44 like Nostore', async () => {
    vi.stubGlobal('window', { nostr: nostr(false) });
    await expect(decryptFromSelf('pk', 'abcdef')).rejects.toThrow(
      'NIP-44 decryption is not available',
    );
    expect(await decryptFromSelf('pk', 'abc?iv=def')).toBe('p04');
  });
});
