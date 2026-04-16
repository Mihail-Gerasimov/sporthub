/**
 * Секция геокодирования адреса для publish-модалок.
 * Адрес + кнопка «Проверить адрес».
 * Город вынесен в CitySuggestInput (Phase 23, Step 23.3).
 */
'use client';

import { useState } from 'react';

import { Button, Input } from '@/components/ui';

/** Статус проверки адреса */
type GeocodeStatus = 'idle' | 'loading' | 'success' | 'error';

type AddressGeocoderProps = {
  /** Город из form-state (нужен для геокодирования) */
  city: string;
  address: string;
  onAddressChange: (address: string) => void;
  onCoordinatesChange: (coords: { lat: number; lng: number } | undefined) => void;
  addressError?: string;
};

export function AddressGeocoder({
  city,
  address,
  onAddressChange,
  onCoordinatesChange,
  addressError,
}: AddressGeocoderProps) {
  const [geocodeStatus, setGeocodeStatus] = useState<GeocodeStatus>('idle');
  const [geocodeMessage, setGeocodeMessage] = useState('');

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
