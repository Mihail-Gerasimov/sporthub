/**
 * Провайдер Яндекс Maps JS API 3.0.
 * Загружает API через CDN (next/script, strategy lazyOnload).
 * Предоставляет React Context с состоянием загрузки для дочерних компонентов карты.
 * Монтируется ТОЛЬКО на главной странице, НЕ в AppShell.
 */
'use client';

import Script from 'next/script';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type YandexMapContextValue = {
  /** API загружен и готов к использованию */
  isLoaded: boolean;
  /** Ошибка загрузки, если есть */
  error: string | null;
};

const YandexMapContext = createContext<YandexMapContextValue | null>(null);

/** Хук для доступа к состоянию Яндекс Maps API — использовать только внутри YandexMapProvider */
export function useYandexMap(): YandexMapContextValue {
  const context = useContext(YandexMapContext);
  if (context === null) {
    throw new Error('useYandexMap должен использоваться внутри YandexMapProvider');
  }
  return context;
}

type YandexMapProviderProps = {
  children: ReactNode;
};

export function YandexMapProvider({ children }: YandexMapProviderProps) {
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReady = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setError('Не удалось загрузить Яндекс Карты');
  }, []);

  const contextValue = useMemo<YandexMapContextValue>(
    () => ({ isLoaded, error }),
    [isLoaded, error],
  );

  // Без ключа — fallback-заглушка
  if (!apiKey) {
    return (
      <div className="flex min-h-[20rem] items-center justify-center rounded-card border border-dashed border-line bg-canvas p-6">
        <p className="text-sm text-muted">Карта недоступна: не указан API-ключ</p>
      </div>
    );
  }

  return (
    <YandexMapContext.Provider value={contextValue}>
      <Script
        src={`https://api-maps.yandex.ru/v3/?apikey=${apiKey}&lang=ru_RU`}
        strategy="lazyOnload"
        onReady={handleReady}
        onError={handleError}
      />
      {children}
    </YandexMapContext.Provider>
  );
}
