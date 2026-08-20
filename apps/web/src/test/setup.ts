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

// Phase 30.8: jsdom не имплементирует IntersectionObserver. ChipMarquee
// использует его для pause/resume rAF при уходе/возврате во viewport.
// Без mock'а тесты падают с ReferenceError. Дефолтная заглушка делает
// observer no-op'ом — компонент сразу считает себя видимым.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class MockIntersectionObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    root: Element | Document | null = null;
    rootMargin = '';
    thresholds: ReadonlyArray<number> = [];
  }
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
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

// Сторож сети: тест не имеет права ходить наружу.
//
// Поймано на живом примере — проверка дизайна главной рендерила страницу без стенда
// ответов и незаметно ходила на ПОДНЯТЫЙ рядом бэкенд. На машине разработчика она
// была зелёной, на чистой упала бы. Умолчание должно быть громким: запрос без
// подмены — это ошибка с адресом в тексте, а не тихий сбой сети.
//
// Тесты, которым `fetch` нужен, подменяют его сами: страницы — через
// `helpers/api-stub`, клиентские компоненты — своим `vi.fn()`.
vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
  const address = typeof input === 'string' ? input : String(input);

  return Promise.reject(
    new Error(
      `Тест сходил в сеть за ${address}. Подмени ответы через installApiStub ` +
        'или замокай fetch в самом тесте.',
    ),
  );
});

afterEach(() => {
  cleanup();
});
