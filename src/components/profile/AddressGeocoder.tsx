/**
 * Секция геокодирования адреса для publish-модалок.
 * Город (select из AVAILABLE_CITIES + ручной ввод) + адрес + кнопка «Проверить адрес».
 * Step 19.3
 */
'use client';

import { useState } from 'react';

import { Button, Input, Select } from '@/components/ui';
import { AVAILABLE_CITIES, DEFAULT_CITY } from '@/lib/constants';

/** Статус проверки адреса */
type GeocodeStatus = 'idle' | 'loading' | 'success' | 'error';

type AddressGeocoderProps = {
  city: string;
  address: string;
  onCityChange: (city: string) => void;
  onAddressChange: (address: string) => void;
  onCoordinatesChange: (coords: { lat: number; lng: number } | undefined) => void;
  cityError?: string;
  addressError?: string;
};

/** Названия городов из AVAILABLE_CITIES для select */
const CITY_OPTIONS = AVAILABLE_CITIES.map((c) => c.name);

export function AddressGeocoder({
  city,
  address,
  onCityChange,
  onAddressChange,
  onCoordinatesChange,
  cityError,
  addressError,
}: AddressGeocoderProps) {
  const [geocodeStatus, setGeocodeStatus] = useState<GeocodeStatus>('idle');
  const [geocodeMessage, setGeocodeMessage] = useState('');
  /** Режим ручного ввода города (не из списка) */
  const [customCity, setCustomCity] = useState(false);

  /** Определяем значение select: если город в списке — его имя, иначе «other» */
  const selectValue = !customCity && CITY_OPTIONS.includes(city) ? city : 'other';

  /** Обработка выбора города из select */
  function handleCitySelect(value: string) {
    if (value === 'other') {
      setCustomCity(true);
      onCityChange('');
    } else {
      setCustomCity(false);
      onCityChange(value);
    }
    // Сброс координат при смене города
    resetGeocode();
  }

  /** Сброс состояния геокодирования */
  function resetGeocode() {
    setGeocodeStatus('idle');
    setGeocodeMessage('');
    onCoordinatesChange(undefined);
  }

  /** Проверка адреса через POST /api/geocode */
  async function handleCheckAddress() {
    const trimmedCity = city.trim();
    const trimmedAddress = address.trim();

    if (!trimmedCity || !trimmedAddress) {
      setGeocodeStatus('error');
      setGeocodeMessage('Укажите город и адрес');
      return;
    }

    setGeocodeStatus('loading');
    setGeocodeMessage('');

    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: trimmedCity, address: trimmedAddress }),
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Город — select или ручной ввод */}
        {customCity ? (
          <div className="flex flex-col gap-2">
            <Input
              label="Город"
              placeholder="Введите название города"
              value={city}
              error={cityError}
              onChange={(e) => {
                onCityChange(e.target.value);
                resetGeocode();
              }}
            />
            <button
              type="button"
              className="self-start text-xs text-accent hover:underline"
              onClick={() => {
                setCustomCity(false);
                onCityChange(DEFAULT_CITY);
                resetGeocode();
              }}
            >
              Выбрать из списка
            </button>
          </div>
        ) : (
          <Select
            label="Город"
            value={selectValue}
            error={cityError}
            onChange={(e) => {
              handleCitySelect(e.target.value);
            }}
          >
            {CITY_OPTIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="other">Другой...</option>
          </Select>
        )}

        {/* Адрес — текстовое поле */}
        <Input
          label="Адрес"
          placeholder="ул. Ленина, 15"
          value={address}
          error={addressError}
          onChange={(e) => {
            onAddressChange(e.target.value);
            resetGeocode();
          }}
        />
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
          <p className="text-sm text-green-600">
            <span className="font-semibold">Адрес найден:</span> {geocodeMessage}
          </p>
        ) : null}

        {geocodeStatus === 'error' && geocodeMessage ? (
          <p className="text-sm text-red-500">{geocodeMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
