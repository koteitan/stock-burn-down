// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from './i18n';
import { App } from './App';
import { STORAGE_KEY } from './storage';

let container: HTMLDivElement;
let root: Root;

class FakeResizeObserver {
  private cb: (entries: { contentRect: { width: number } }[]) => void;
  constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
    this.cb = cb;
  }
  observe() {
    this.cb([{ contentRect: { width: 600 } }]);
  }
  disconnect() {}
}

function type(input: Element | null, value: string) {
  const el = input as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error('element not found');
  await act(async () => (el as HTMLElement).click());
}

const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label);

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: true,
    media,
    addEventListener() {},
    removeEventListener() {},
  }));
  await i18n.changeLanguage('ja');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('mounts with the default settings', () => {
    expect(container.querySelector('h1')?.textContent).toBe('備蓄バーンダウンチャート');
    expect(document.title).toBe('備蓄バーンダウンチャート');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(container.querySelector('.nostr-status')).toBeNull();
    expect(stored().settings).toMatchObject({ theme: 'dark', lang: 'ja', storage: 'browser' });
    expect(stored().settings.chartStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(container.querySelector('.chart-range input[type=date]')).not.toBeNull();
  });

  it('adds, consumes, edits and deletes stock', async () => {
    const form = container.querySelectorAll('form.inline-form')[0];
    const inputs = form.querySelectorAll('input');
    await act(async () => {
      type(inputs[0], '缶詰');
      type(inputs[1], 'シーチキン');
      type(inputs[3], '27/06/01');
    });
    await click(form.querySelector('button[type=submit]'));

    expect(stored().stocks).toMatchObject([
      { category: '缶詰', content: 'シーチキン', count: 1, expiry: '2027-06-01' },
    ]);
    expect(container.querySelector('.stock-table tbody tr')?.textContent).toContain('27/06/01');
    expect(stored().updatedAt['缶詰']).toBeGreaterThan(0);
    expect(container.querySelector('.chart-card h3')?.textContent).toBe('缶詰');
    expect(container.querySelector('.chart-plot svg')).not.toBeNull();

    await click(button('編集'));
    expect(['完了', 'キャンセル', '削除'].every((l) => button(l))).toBe(true);
    const countInput = container.querySelector('tr.editing input[type=number]');
    await act(async () => type(countInput, '3'));
    await click(button('完了'));
    expect(stored().stocks[0].count).toBe(3);

    await click(button('１つ消費'));
    expect(stored().stocks[0].count).toBe(2);
    expect(stored().history).toMatchObject([
      { category: '缶詰', content: 'シーチキン', count: 1, expiry: '2027-06-01' },
    ]);
    const historyRows = container.querySelectorAll('.history-table tbody tr:not(.group-row)');
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0].textContent).toContain('シーチキン');
    expect(container.querySelector('.history-table .group-row')?.textContent).toContain('缶詰');
    expect(
      container.querySelectorAll('.chart-card:not(.chart-overall) .chart-plot path'),
    ).toHaveLength(2);
    expect(container.querySelector('.chart-overall h3')?.textContent).toBe('全体');

    await click(button('編集'));
    await click(button('削除'));
    expect(stored().stocks).toEqual([]);
    // The category keeps its chart while it has consumption history.
    expect(container.querySelector('.chart-card h3')?.textContent).toBe('缶詰');

    await click(button('編集'));
    await click(button('削除'));
    expect(stored().history).toEqual([]);
    expect(container.querySelector('.chart-card')).toBeNull();
  });

  it('deletes consumption records before the chart start per category', async () => {
    const form = container.querySelectorAll('form.inline-form')[0];
    const inputs = form.querySelectorAll('input');
    for (const category of ['A', 'B']) {
      await act(async () => {
        type(inputs[0], category);
        type(inputs[2], '2');
        type(inputs[3], '27/01/01');
      });
      await click(form.querySelector('button[type=submit]'));
    }
    for (const b of [...container.querySelectorAll('button')].filter(
      (x) => x.textContent === '１つ消費',
    )) {
      await click(b);
    }
    expect(
      stored()
        .history.map((h: { category: string }) => h.category)
        .sort(),
    ).toEqual(['A', 'B']);
    const groupButton = (category: string) =>
      [...container.querySelectorAll('.history-table .group-row')]
        .find((tr) => tr.querySelector('th')?.textContent?.startsWith(category))
        ?.querySelector('button');
    expect(groupButton('A')?.disabled).toBe(true);

    await act(async () => type(container.querySelector('.chart-range input'), '2099-01-01'));
    expect(groupButton('A')?.disabled).toBe(false);
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await click(groupButton('A'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('「A」'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 件'));
    expect(stored().history.map((h: { category: string }) => h.category)).toEqual(['B']);
    expect(stored().stocks.map((x: { count: number }) => x.count)).toEqual([1, 1]);
  });

  it('sorts the stock list by header clicks and keeps the order in localStorage', async () => {
    const form = container.querySelectorAll('form.inline-form')[0];
    const inputs = form.querySelectorAll('input');
    const add = async (category: string, expiry: string) => {
      await act(async () => {
        type(inputs[0], category);
        type(inputs[3], expiry);
      });
      await click(form.querySelector('button[type=submit]'));
    };
    await add('B', '27/01/01');
    await add('A', '27/02/01');
    const categories = () =>
      [...container.querySelectorAll('.stock-table tbody td.col-category')].map(
        (td) => td.textContent,
      );
    expect(categories()).toEqual(['B', 'A']);

    const sortButton = (label: string) =>
      [...container.querySelectorAll('.sort-header')].find((b) => b.textContent?.startsWith(label));
    await click(sortButton('種類'));
    expect(categories()).toEqual(['A', 'B']);
    await click(sortButton('種類'));
    expect(categories()).toEqual(['B', 'A']);
    expect(stored().settings.stockSort).toEqual({
      order: ['category', 'expiry', 'added'],
      desc: { expiry: false, category: true, added: false },
    });

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<App />));
    expect(categories()).toEqual(['B', 'A']);
    expect(container.querySelector('th[aria-sort]')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('rejects a malformed best-before date', async () => {
    const form = container.querySelectorAll('form.inline-form')[0];
    const expiry = form.querySelectorAll('input')[3] as HTMLInputElement;
    expect(expiry.placeholder).toBe('YY/MM/DD');
    await act(async () => type(expiry, '23/13/01'));
    expect(expiry.getAttribute('aria-invalid')).toBe('true');
    await click(form.querySelector('button[type=submit]'));
    expect(stored().stocks ?? []).toEqual([]);
  });

  it('adds an overall chart that totals every category', async () => {
    const [stockForm, targetForm] = container.querySelectorAll('form.inline-form');
    const stockInputs = stockForm.querySelectorAll('input');
    const targetInputs = targetForm.querySelectorAll('input');
    for (const [category, count, goal] of [
      ['A', '2', '3'],
      ['B', '1', '5'],
    ]) {
      await act(async () => {
        type(stockInputs[0], category);
        type(stockInputs[2], count);
        type(stockInputs[3], '27/01/01');
      });
      await click(stockForm.querySelector('button[type=submit]'));
      await act(async () => {
        type(targetInputs[0], category);
        type(targetInputs[1], goal);
      });
      await click(targetForm.querySelector('button[type=submit]'));
    }
    const cards = [...container.querySelectorAll('.chart-card h3')].map((h) => h.textContent);
    expect(cards[cards.length - 1]).toBe('全体');
    const overall = container.querySelector('.chart-overall .chart-sub')?.textContent;
    expect(overall).toContain('在庫 3');
    expect(overall).toContain('目標 8');
    expect(overall).toContain('あと 5');
  });

  it('adds stock on a plain http page without crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const form = container.querySelectorAll('form.inline-form')[0];
    await act(async () => type(form.querySelectorAll('input')[3], '27/01/01'));
    await click(form.querySelector('button[type=submit]'));
    expect(stored().stocks).toHaveLength(1);
    expect(container.querySelector('.stock-table')).not.toBeNull();
  });

  it('stores the chart range end and flags an end before the start', async () => {
    const [startInput, endInput] = container.querySelectorAll('.chart-range input');
    expect((endInput as HTMLInputElement).value).toBe('');
    expect(stored().settings.chartEnd).toBe('');
    await act(async () => {
      type(startInput, '2026-11-01');
      type(endInput, '2027-03-01');
    });
    expect(stored().settings).toMatchObject({ chartStart: '2026-11-01', chartEnd: '2027-03-01' });
    expect(endInput.getAttribute('aria-invalid')).toBe('false');
    await act(async () => type(endInput, '2026-10-01'));
    expect(endInput.getAttribute('aria-invalid')).toBe('true');
    await act(async () => type(endInput, ''));
    expect(stored().settings.chartEnd).toBe('');
  });

  it('links the browser extension guide when no NIP-07 extension is found', async () => {
    await act(async () => root.unmount());
    localStorage.setItem('stock-burn-down', JSON.stringify({ settings: { storage: 'nostr' } }));
    root = createRoot(container);
    await act(async () => root.render(<App />));
    await vi.waitFor(() => expect(container.querySelector('.status-no-nip07')).not.toBeNull(), {
      timeout: 5000,
    });
    const status = container.querySelector('.status-no-nip07')!;
    expect(status.textContent).toBe(
      'nostr 未認証です。ブラウザ拡張機能で nostr に接続してください',
    );
    const link = status.querySelector('a')!;
    expect(link.textContent).toBe('ブラウザ拡張機能');
    expect(link.getAttribute('href')).toBe('https://welcome.nostr-jp.org/tutorial/nip-07.html');
  });

  it('stores the chart start date', async () => {
    const input = container.querySelector('.chart-range input');
    await act(async () => type(input, '2026-10-01'));
    expect(stored().settings.chartStart).toBe('2026-10-01');
  });

  it('switches the language from the menu without looping', async () => {
    await click(container.querySelector('.menu-button'));
    await click(container.querySelector('input[name=lang][value=en]'));
    expect(container.querySelector('h1')?.textContent).toBe('Stockpile Burn-down Chart');
    expect(document.title).toBe('Stockpile Burn-down Chart');
    expect(document.documentElement.lang).toBe('en');
    expect(stored().settings.lang).toBe('en');
  });
});
