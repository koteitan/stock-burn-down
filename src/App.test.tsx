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
    expect(container.querySelector('.chart-start input[type=date]')).not.toBeNull();
  });

  it('adds, consumes, edits and deletes stock', async () => {
    const form = container.querySelectorAll('form.inline-form')[0];
    const inputs = form.querySelectorAll('input');
    await act(async () => {
      type(inputs[0], '缶詰');
      type(inputs[1], 'シーチキン');
      type(inputs[3], '2027-06-01');
    });
    await click(form.querySelector('button[type=submit]'));

    expect(stored().stocks).toMatchObject([{ category: '缶詰', content: 'シーチキン', count: 1 }]);
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
    const historyRows = container.querySelectorAll('.history-table tbody tr');
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0].textContent).toContain('シーチキン');
    expect(container.querySelectorAll('.chart-plot path')).toHaveLength(2);

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

  it('deletes consumption records made before the chart start', async () => {
    const form = container.querySelectorAll('form.inline-form')[0];
    const inputs = form.querySelectorAll('input');
    await act(async () => {
      type(inputs[1], 'サバ');
      type(inputs[2], '2');
      type(inputs[3], '2027-01-01');
    });
    await click(form.querySelector('button[type=submit]'));
    await click(button('１つ消費'));
    expect(stored().history).toHaveLength(1);
    const deleteOld = button('チャート開始日前の消費履歴を消す');
    expect(deleteOld?.disabled).toBe(true);

    await act(async () => type(container.querySelector('.chart-start input'), '2099-01-01'));
    expect(deleteOld?.disabled).toBe(false);
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await click(deleteOld);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 件'));
    expect(stored().history).toEqual([]);
    expect(stored().stocks[0].count).toBe(1);
  });

  it('stores the chart start date', async () => {
    const input = container.querySelector('.chart-start input');
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
