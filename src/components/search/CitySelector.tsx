/**
 * Селектор города для главной страницы.
 * Позволяет переключать город — фильтрация каталога и карты обновляется клиентски.
 * При монтировании синхронизирует город из auth-профиля через useSyncCityFromAuth.
 */
'use client';

import { AVAILABLE_CITIES } from '@/lib/constants';
import { Select } from '@/components/ui';
import { useSyncCityFromAuth } from '@/hooks/useSyncCityFromAuth';
import { useFilterStore } from '@/stores/useFilterStore';

export function CitySelector() {
  // Синхронизация города из auth-профиля при логине/reload/impersonation
  useSyncCityFromAuth();

  const selectedCity = useFilterStore((state) => state.selectedCity);
  const setSelectedCity = useFilterStore((state) => state.setSelectedCity);

  return (
    <Select
      aria-label="Выбор города"
      value={selectedCity}
      onChange={(e) => {
        setSelectedCity(e.target.value);
      }}
    >
      {AVAILABLE_CITIES.map((city) => (
        <option key={city.name} value={city.name}>
          {city.name}
        </option>
      ))}
    </Select>
  );
}
