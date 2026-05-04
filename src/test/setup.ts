import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Phase 28.10: jsdom не имплементирует window.matchMedia с
// addEventListener('change', ...) — наш CardSlider использует это
// для адаптива visible 1↔2 на 1024+. Мокаем глобально (matches=false
// по умолчанию = mobile-режим, visible=1).
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
});
