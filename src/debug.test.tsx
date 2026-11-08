// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: true,
    media,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
  vi.unstubAllGlobals();
});

describe('debug URL parameters', () => {
  it('?today= shifts today and ?lang= forces the language without saving it', async () => {
    window.history.replaceState({}, '', '/?today=261201&lang=en');
    const debug = await import('./debug');
    expect(debug.forcedToday).toBe('2026-12-01');
    expect(debug.todayNow()).toBe('2026-12-01');
    expect(debug.forcedLang).toBe('en');

    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    await import('./i18n');
    const { App } = await import('./App');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<App />));

    expect(container.querySelector('h1')?.textContent).toBe('Stockpile Burn-down Chart');
    const stored = () => JSON.parse(localStorage.getItem('stock-burn-down') ?? '{}');
    expect(stored().settings.lang).toBe('ja');
    expect(stored().settings.chartStart).toBe('2026-12-01');

    const form = container.querySelectorAll('form.inline-form')[0];
    const inputs = form.querySelectorAll('input');
    await act(async () => type(inputs[3], '26/11/30'));
    await act(async () => (form.querySelector('button[type=submit]') as HTMLElement).click());
    expect(stored().stocks[0].addedDate).toBe('2026-12-01');
    expect(container.querySelector('.badge.critical')?.textContent).toBe('expired');

    await act(async () => (container.querySelector('.menu-button') as HTMLElement).click());
    const langRadio = container.querySelector('input[name=lang][value=ja]') as HTMLInputElement;
    expect(langRadio.closest('fieldset')?.disabled).toBe(true);
    expect(container.querySelector('.menu-panel')?.textContent).toContain(
      'debug: today=26/12/01 lang=en',
    );

    await act(async () => root.unmount());
    container.remove();
  });

  it('ignores invalid values', async () => {
    window.history.replaceState({}, '', '/?today=261301&lang=fr');
    const debug = await import('./debug');
    expect(debug.forcedToday).toBeNull();
    expect(debug.forcedLang).toBeNull();
    expect(Math.abs(debug.nowMs() - Date.now())).toBeLessThan(1000);
  });
});
