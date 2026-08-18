// Тесты YandexMapProvider (Step 19.5)
// Покрывают: React Context, lazy-загрузку API, fallback без ключа
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { YandexMapProvider, useYandexMap } from '@/components/map/YandexMapProvider';

/* --- Mock next/script — эмулируем загрузку скрипта --- */
vi.mock('next/script', () => ({
  __esModule: true,
  default: ({ onReady, onError, ...props }: Record<string, unknown>) => {
    // Сохраняем колбэки для вызова из тестов
    (globalThis as Record<string, unknown>).__nextScriptOnReady = onReady;
    (globalThis as Record<string, unknown>).__nextScriptOnError = onError;
    return <script data-testid="yandex-script" {...props} />;
  },
}));

/* --- Хелпер-потребитель контекста --- */
function MapConsumer() {
  const { isLoaded, error } = useYandexMap();
  return (
    <div>
      <span data-testid="is-loaded">{String(isLoaded)}</span>
      <span data-testid="error">{error ?? 'null'}</span>
    </div>
  );
}

describe('YandexMapProvider (Step 19.5)', () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = 'test-api-key';
    delete (globalThis as Record<string, unknown>).__nextScriptOnReady;
    delete (globalThis as Record<string, unknown>).__nextScriptOnError;
  });

  afterEach(() => {
    if (ORIGINAL_ENV !== undefined) {
      process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = ORIGINAL_ENV;
    } else {
      delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
    }
  });

  it('рендерит children при наличии API-ключа', () => {
    render(
      <YandexMapProvider>
        <span>Карта</span>
      </YandexMapProvider>,
    );

    expect(screen.getByText('Карта')).toBeInTheDocument();
  });

  it('показывает fallback при отсутствии API-ключа', () => {
    delete process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;

    render(
      <YandexMapProvider>
        <span>Карта</span>
      </YandexMapProvider>,
    );

    expect(screen.getByText(/не указан API-ключ/i)).toBeInTheDocument();
    expect(screen.queryByText('Карта')).not.toBeInTheDocument();
  });

  it('показывает fallback при пустом API-ключе', () => {
    process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY = '';

    render(
      <YandexMapProvider>
        <span>Карта</span>
      </YandexMapProvider>,
    );

    expect(screen.getByText(/не указан API-ключ/i)).toBeInTheDocument();
  });

  it('контекст isLoaded = false до загрузки скрипта', () => {
    render(
      <YandexMapProvider>
        <MapConsumer />
      </YandexMapProvider>,
    );

    expect(screen.getByTestId('is-loaded').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('null');
  });

  it('контекст isLoaded = true после onReady', async () => {
    render(
      <YandexMapProvider>
        <MapConsumer />
      </YandexMapProvider>,
    );

    // Эмулируем загрузку скрипта
    const { act } = await import('@testing-library/react');
    const onReady = (globalThis as Record<string, unknown>).__nextScriptOnReady as () => void;
    await act(() => {
      onReady();
    });

    expect(screen.getByTestId('is-loaded').textContent).toBe('true');
  });

  it('контекст error заполняется при ошибке загрузки', async () => {
    render(
      <YandexMapProvider>
        <MapConsumer />
      </YandexMapProvider>,
    );

    const { act } = await import('@testing-library/react');
    const onError = (globalThis as Record<string, unknown>).__nextScriptOnError as () => void;
    await act(() => {
      onError();
    });

    expect(screen.getByTestId('error').textContent).not.toBe('null');
    expect(screen.getByTestId('is-loaded').textContent).toBe('false');
  });

  it('useYandexMap выбрасывает ошибку вне провайдера', () => {
    // Подавляем console.error от React error boundary
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<MapConsumer />)).toThrow();

    consoleSpy.mockRestore();
  });
});
