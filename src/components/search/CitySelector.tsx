/**
 * Селектор города для главной страницы.
 * Позволяет переключать город — фильтрация каталога и карты обновляется клиентски.
 * При монтировании синхронизирует город из auth-профиля через useSyncCityFromAuth.
 * Список городов загружается из GET /api/cities (динамический, включая runtime-добавленные).
 */
'use client';

import { useEffect, useState } from 'react';

import type { City } from '@/types';
import { Select } from '@/components/ui';
import { useSyncCityFromAuth } from '@/hooks/useSyncCityFromAuth';
import { useFilterStore } from '@/stores/useFilterStore';

export function CitySelector() {
  // Синхронизация города из auth-профиля при логине/reload/impersonation
  useSyncCityFromAuth();

  const selectedCity = useFilterStore((state) => state.selectedCity);
  const setSelectedCity = useFilterStore((state) => state.setSelectedCity);
  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    fetch('/api/cities')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setCities(json.data);
      })
      .catch(() => {
        // Фоллбэк: оставляем пустой список, город из auth-профиля останется
      });
  }, []);

  return (
    <Select
      aria-label="Выбор города"
      value={selectedCity}
      onChange={(e) => {
        setSelectedCity(e.target.value);
      }}
    >
      {cities.map((city) => (
        <option key={city.id} value={city.name}>
          {city.name}
        </option>
      ))}
    </Select>
  );
}
