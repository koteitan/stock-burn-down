import { createRxNostr, type RxNostr } from 'rx-nostr';
import { verifier } from 'rx-nostr-crypto';

let instance: RxNostr | null = null;

export function rxNostr(): RxNostr {
  instance ??= createRxNostr({
    verifier,
    eoseTimeout: 30_000,
    okTimeout: 15_000,
    retry: { strategy: 'exponential', maxCount: 3, initialDelay: 1000, polite: true },
  });
  return instance;
}
