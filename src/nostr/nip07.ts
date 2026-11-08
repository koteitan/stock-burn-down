/** Extensions inject window.nostr some time after page load, so poll for a while. */
export async function waitForNip07(timeoutMs = 3000): Promise<boolean> {
  const start = Date.now();
  while (!window.nostr) {
    if (Date.now() - start >= timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

export async function encryptToSelf(pubkey: string, plaintext: string): Promise<string> {
  const n = window.nostr;
  if (n?.nip44) return n.nip44.encrypt(pubkey, plaintext);
  if (n?.nip04) return n.nip04.encrypt(pubkey, plaintext);
  throw new Error('The NIP-07 extension supports neither NIP-44 nor NIP-04 encryption');
}

export async function decryptFromSelf(pubkey: string, ciphertext: string): Promise<string> {
  const n = window.nostr;
  // NIP-04 payloads are "<base64>?iv=<base64>"; NIP-44 payloads are plain base64.
  if (ciphertext.includes('?iv=')) {
    if (!n?.nip04) throw new Error('NIP-04 decryption is not available');
    return n.nip04.decrypt(pubkey, ciphertext);
  }
  if (!n?.nip44) throw new Error('NIP-44 decryption is not available');
  return n.nip44.decrypt(pubkey, ciphertext);
}
