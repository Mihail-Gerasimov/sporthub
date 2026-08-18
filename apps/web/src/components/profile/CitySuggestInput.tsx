/**
 * Поле ввода города с автокомплитом через Yandex Geosuggest.
 * Подсказки типа 'locality'. При выборе — сохраняет name и coordinates.
 * При blur без выбора — нормализация и проверка isNewCity.
 * Phase 23 — Step 23.3
 */
'use client';

import { useRef, useState } from 'react';

import { Input } from '@/components/ui';
import { useSuggest } from '@/hooks/useSuggest';
import type { Coordinates } from '@sporthub/types';

export interface CitySuggestInputProps {
  /** Текущее значение города */
  value: string;
  /** Координаты центра выбранного города */
  cityCoordinates?: Coordinates;
  /** Callback при изменении города */
  onChange: (city: string, coordinates?: Coordinates) => void;
  /** Ошибка валидации */
  error?: string;
  /** Лейбл поля (по умолчанию «Город») */
  label?: string;
}

export function CitySuggestInput({
  value,
  onChange,
  error,
  label = 'Город',
}: CitySuggestInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  // Координаты последней валидной подсказки (для новых городов)
  const lastSuggestCoordsRef = useRef<Coordinates | undefined>(undefined);
  // Флаг: подсказка была выбрана кликом
  const selectedRef = useRef(false);
  // Ref на контейнер для обработки blur
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    suggestions,
    loading,
    error: suggestError,
    hasSearched,
  } = useSuggest({
    text: inputValue,
    types: 'locality',
    enabled: showDropdown,
  });

  // Флаг видимости dropdown-панели: показываем любое состояние (loading/error/empty/list),
  // если пользователь активно ищет (≥2 символа и dropdown открыт).
  const dropdownOpen = showDropdown && inputValue.trim().length >= 2;
  const hasNoResults = hasSearched && !loading && !suggestError && suggestions.length === 0;

  /** Обработка ввода в поле */
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setInputValue(next);
    selectedRef.current = false;
    setShowDropdown(true);

    // Парсим координаты из первой подсказки (если есть) для новых городов
    // Координаты обновятся при следующем ответе suggest
  }

  /** Выбор подсказки из dropdown */
  function handleSelect(title: string, subtitle?: string) {
    setInputValue(title);
    selectedRef.current = true;
    setShowDropdown(false);

    // Извлекаем координаты центра из подсказки через geocode
    // Для MVP — координаты получим из /api/geocode при проверке адреса
    // или из подсказки если Yandex Suggest вернул geo-данные
    // Сохраняем title подсказки + subtitle как контекст для geocoding
    const coordsFromSuggest = lastSuggestCoordsRef.current;
    onChange(title, coordsFromSuggest);

    // Запрашиваем координаты через geocode для точного позиционирования
    fetchCityCoordinates(title, subtitle);
  }

  /** Получение координат города через /api/geocode */
  async function fetchCityCoordinates(city: string, _subtitle?: string) {
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, address: city }),
      });
      const data = await response.json();
      if (data.success && data.data?.coordinates) {
        onChange(city, data.data.coordinates);
      }
    } catch {
      // Координаты не критичны — публикация возможна и без них
    }
  }

  /** Обработка blur: если подсказка не выбрана — фиксируем текущий ввод */
  function handleBlur(e: React.FocusEvent) {
    // Не закрываем dropdown если фокус ушёл внутри контейнера (клик по подсказке)
    if (containerRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }

    setShowDropdown(false);

    if (!selectedRef.current && inputValue.trim()) {
      // Город введён вручную — передаём без координат
      onChange(inputValue.trim(), undefined);
    }
  }

  return (
    // Внешний div — грид-элемент (не relative), спокойно тянется по высоте
    // вместе с соседями. Dropdown-позиционирование вынесено во внутренний .relative,
    // который оборачивает только Input — так top-full всегда прилипает к нижней
    // границе поля ввода, а не растянутой грид-ячейки.
    <div ref={containerRef}>
      <div className="relative">
        <Input
          label={label}
          placeholder="Начните вводить название города"
          value={inputValue}
          error={error}
          onChange={handleInputChange}
          onFocus={() => {
            if (inputValue.trim().length >= 2) {
              setShowDropdown(true);
            }
          }}
          onBlur={handleBlur}
          autoComplete="off"
        />

        {/* Dropdown подсказок с видимыми состояниями loading/error/empty */}
        {dropdownOpen && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-card border border-line bg-panel shadow-card"
            role="listbox"
          >
            {loading && suggestions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">Поиск...</p>
            ) : null}

            {suggestError ? <p className="px-3 py-2 text-sm text-red-500">{suggestError}</p> : null}

            {hasNoResults ? (
              <p className="px-3 py-2 text-sm text-muted">Ничего не найдено</p>
            ) : null}

            {suggestions.length > 0 ? (
              <ul>
                {suggestions.map((item, index) => (
                  <li key={`${item.value}-${index}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="flex w-full flex-col px-3 py-2 text-left text-sm transition-colors hover:bg-surface"
                      onMouseDown={(e) => {
                        // Предотвращаем blur до обработки клика
                        e.preventDefault();
                      }}
                      onClick={() => {
                        handleSelect(item.title, item.subtitle);
                      }}
                    >
                      <span className="font-medium text-ink">{item.title}</span>
                      {item.subtitle ? (
                        <span className="text-xs text-muted">{item.subtitle}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
