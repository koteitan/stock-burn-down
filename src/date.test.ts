import { describe, expect, it } from 'vitest';
import { formatShortDate, parseShortDate } from './date';

describe('short best-before dates', () => {
  it('formats with a 2-digit year', () => {
    expect(formatShortDate('2023-12-31')).toBe('23/12/31');
  });

  it('parses YY/MM/DD as 20YY', () => {
    expect(parseShortDate('23/12/31')).toBe('2023-12-31');
    expect(parseShortDate(' 27/1/5 ')).toBe('2027-01-05');
    expect(parseShortDate('231231')).toBe('2023-12-31');
    expect(parseShortDate('2027-06-01')).toBe('2027-06-01');
  });

  it('rejects malformed or impossible dates', () => {
    expect(parseShortDate('')).toBeNull();
    expect(parseShortDate('23/13/01')).toBeNull();
    expect(parseShortDate('23/02/30')).toBeNull();
    expect(parseShortDate('2023/12')).toBeNull();
    expect(parseShortDate('abc')).toBeNull();
  });
});
