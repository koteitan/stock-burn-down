import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './sanitize';

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('makes UUID v4 strings without crypto.randomUUID (plain http pages)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const ids = Array.from({ length: 50 }, newId);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
