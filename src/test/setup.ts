import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Phase 28.10: jsdom не имплементирует window.matchMedia с
// addEventListener('change', ...) — CardSlider использует это для
// адаптива visible (1↔2 на 1024+, в 28.12 расширено до 1↔2↔3 через
// два mediaQuery). По умолчанию все query → matches=false (mobile).
//
// Phase 28.12: тесты могут переопределить ответы для конкретных
// query-строк через setMediaQueryMatches() — нужно для проверки
// visibleByBp с двумя брейкпоинтами одновременно.
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

/**
 * Тест-хелпер: задаёт ответы matchMedia для конкретных query-строк.
 * Любые НЕ перечисленные query → matches=false (как и default).
 *
 * Использовать в `beforeEach`/`it` — после теста состояние сохраняется
 * до следующего вызова или ресета мока.
 */
export function setMediaQueryMatches(states: Record<string, boolean>): void {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: states[query] ?? false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  cleanup();
});
