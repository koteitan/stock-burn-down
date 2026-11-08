// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import '../i18n';
import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never {
  throw new TypeError('crypto.randomUUID is not a function');
}

it('shows the error and a reload button instead of a blank page', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    ),
  );
  expect(container.querySelector('[role=alert] pre')?.textContent).toBe(
    'TypeError: crypto.randomUUID is not a function',
  );
  expect(container.querySelector('[role=alert] button')?.textContent).toBe('再読み込み');
  spy.mockRestore();
});
