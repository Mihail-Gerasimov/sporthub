/**
 * Секция геокодирования адреса для publish-модалок.
 * Автокомплит адреса через Yandex Geosuggest + кнопка «Проверить адрес» (fallback).
 * Город вынесен в CitySuggestInput (Phase 23, Step 23.3).
 * Подсказки ограничены bounding box города (Step 23.5).
 */
'use client';

import { useRef, useState } from 'react';

import type { Coordinates } from '@sporthub/types';
import { Button, Input } from '@/components/ui';
import { useSuggest } from '@/hooks/useSuggest';
import { getCityBoundingBox } from '@/lib/utils';

/** Статус проверки адреса */
type GeocodeStatus = 'idle' | 'loading' | 'success' | 'error';

type AddressGeocoderProps = {
  /** Город из form-state (нужен для геокодирования и ограничения подсказок) */
  city: string;
  /** Координаты центра города (для bounding box подсказок) */
  cityCoordinates?: Coordinates;
  address: string;
  onAddressChange: (address: string) => void;
  onCoordinatesChange: (coords: { lat: number; lng: number } | undefined) => void;
  addressError?: string;
};

export function AddressGeocoder({
  city,
  cityCoordinates,
  address,
  onAddressChange,
  onCoordinatesChange,
  addressError,
}: AddressGeocoderProps) {
  const [geocodeStatus, setGeocodeStatus] = useState<GeocodeStatus>('idle');
  const [geocodeMessage, setGeocodeMessage] = useState('');

  // Управление dropdown подсказок
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Bounding box для подсказок: если есть координаты города — ограничиваем ~15 км
  const boundedBy = cityCoordinates ? getCityBoundingBox(cityCoordinates) : undefined;

  // Автокомплит адреса через Yandex Geosuggest
  const { suggestions, loading, error, hasSearched } = useSuggest({
    text: address,
    types: 'geo',
    boundedBy,
    enabled: showDropdown && address.trim().length >= 2,
  });

  // Видимость dropdown-панели — показываем любое состояние (loading/error/empty/list)
  const dropdownOpen = showDropdown && address.trim().length >= 2;
  const hasNoResults = hasSearched && !loading && !error && suggestions.length === 0;

  /** Сброс состояния геокодирования */
  function resetGeocode() {
    setGeocodeStatus('idle');
    setGeocodeMessage('');
    onCoordinatesChange(undefined);
  }

  /** Геокодирование адреса через POST /api/geocode */
  async function geocodeAddress(targetCity: string, targetAddress: string) {
    setGeocodeStatus('loading');
    setGeocodeMessage('');

    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: targetCity, address: targetAddress }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setGeocodeStatus('success');
        setGeocodeMessage(data.data.formattedAddress);
        onCoordinatesChange(data.data.coordinates);
      } else {
        setGeocodeStatus('error');
        setGeocodeMessage(data.error ?? 'Адрес не найден');
        onCoordinatesChange(undefined);
      }
    } catch {
      setGeocodeStatus('error');
      setGeocodeMessage('Ошибка при проверке адреса');
      onCoordinatesChange(undefined);
    }
  }

  /** Проверка адреса кнопкой */
  async function handleCheckAddress() {
    const trimmedCity = city.trim();
    const trimmedAddress = address.trim();

    if (!trimmedCity || !trimmedAddress) {
      setGeocodeStatus('error');
      setGeocodeMessage('Укажите город и адрес');
      return;
    }

    await geocodeAddress(trimmedCity, trimmedAddress);
  }

  /** Выбор подсказки из dropdown */
  function handleSelectSuggestion(title: string) {
    onAddressChange(title);
    setShowDropdown(false);

    // Автоматическое геокодирование при выборе подсказки
    const trimmedCity = city.trim();
    if (trimmedCity) {
      geocodeAddress(trimmedCity, title);
    }
  }

  /** Обработка blur: закрываем dropdown с задержкой (чтобы клик по опции успел сработать) */
  function handleBlur(e: React.FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setTimeout(() => setShowDropdown(false), 150);
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4" onBlur={handleBlur}>
      {/* Адрес — поле с автокомплитом */}
      <div className="relative">
        <Input
          label="Адрес"
          placeholder="ул. Ленина, 15"
          value={address}
          error={addressError}
          autoComplete="off"
          onFocus={() => setShowDropdown(true)}
          onChange={(e) => {
            onAddressChange(e.target.value);
            setShowDropdown(true);
            resetGeocode();
          }}
        />

        {/* Dropdown подсказок с видимыми состояниями loading/error/empty */}
        {dropdownOpen && (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-card border border-line bg-panel shadow-card"
          >
            {loading && suggestions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">Поиск...</p>
            ) : null}

            {error ? <p className="px-3 py-2 text-sm text-red">{error}</p> : null}

            {hasNoResults ? (
              <p className="px-3 py-2 text-sm text-muted">Ничего не найдено</p>
            ) : null}

            {suggestions.length > 0 ? (
              <ul>
                {suggestions.map((item) => (
                  <li
                    key={item.value}
                    role="option"
                    aria-selected={false}
                    className="cursor-pointer px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectSuggestion(item.title)}
                  >
                    <span className="font-medium">{item.title}</span>
                    {item.subtitle && <span className="ml-1 text-muted">{item.subtitle}</span>}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      {/* Кнопка проверки + статус */}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={geocodeStatus === 'loading' || !city.trim() || !address.trim()}
          onClick={handleCheckAddress}
        >
          {geocodeStatus === 'loading' ? 'Проверяем...' : 'Проверить адрес'}
        </Button>

        {geocodeStatus === 'success' && geocodeMessage ? (
          <p className="text-sm text-lime-hov">
            <span className="font-semibold">Адрес найден:</span> {geocodeMessage}
          </p>
        ) : null}

        {geocodeStatus === 'error' && geocodeMessage ? (
          <p className="text-sm text-red">{geocodeMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
