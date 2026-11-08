import { describe, expect, it } from 'vitest';
import { npubEncode, shortNpub } from './bech32';
import { profileName } from './profile';

describe('npub', () => {
  it('encodes the NIP-19 example key', () => {
    expect(npubEncode('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d')).toBe(
      'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6',
    );
  });

  it('shortens to the head and tail', () => {
    expect(shortNpub('npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6')).toBe(
      'npub180cv…h6w6',
    );
  });
});

describe('profileName', () => {
  it('prefers display_name, then name', () => {
    expect(profileName('{"display_name":"こてさん","name":"koteitan"}')).toBe('こてさん');
    expect(profileName('{"display_name":"  ","name":"koteitan"}')).toBe('koteitan');
  });

  it('returns null without a usable name', () => {
    expect(profileName('{"about":"x"}')).toBeNull();
    expect(profileName('not json')).toBeNull();
  });
});
