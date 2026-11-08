/** Extensions inject window.nostr some time after page load, so poll for a while. */
export async function waitForNip07(timeoutMs = 3000): Promise<boolean> {
  const start = Date.now();
  while (!window.nostr) {
    if (Date.now() - start >= timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

/** Always NIP-04: some extensions (e.g. Nostore) have no NIP-44, and every device must read it. */
export async function encryptToSelf(pubkey: string, plaintext: string): Promise<string> {
  const n = window.nostr;
  if (!n?.nip04) throw new Error('NIP-04 encryption is not available');
  return n.nip04.encrypt(pubkey, plaintext);
}

export function isNip04(ciphertext: string): boolean {
  return ciphertext.includes('?iv=');
}

export async function decryptFromSelf(pubkey: string, ciphertext: string): Promise<string> {
  const n = window.nostr;
  // NIP-04 payloads are "<base64>?iv=<base64>"; NIP-44 payloads are plain base64.
  if (isNip04(ciphertext)) {
    if (!n?.nip04) throw new Error('NIP-04 decryption is not available');
    return n.nip04.decrypt(pubkey, ciphertext);
  }
  if (!n?.nip44) throw new Error('NIP-44 decryption is not available');
  return n.nip44.decrypt(pubkey, ciphertext);
}
