/**
 * Селектор города (шаг 38.78) — переключает город фильтров: каталог и карта
 * обновляются клиентски, бейджи главной читают тот же `selectedCity`.
 * При монтировании синхронизирует город из auth-профиля (`useSyncCityFromAuth`);
 * список городов — `GET /api/cities`, один раз.
 *
 * Вид — поле фильтра эталона (`App.tsx:1329-1335`): подложка холста, тонкая
 * обводка, подпись «Город» капителью над значением, значок булавки, сам `select`
 * без собственной рамки. Текущий город стоит в списке всегда — и до ответа сети,
 * и при её отказе: поле не должно пустеть, пока каталог отобран по этому городу.
 *
 * Почему не `ui/Select`: тот — поле формы (высота 48, рамка, подпись сверху
 * отдельной строкой), а здесь компактный фильтр в ряду переключателей.
 */
'use client';

import { useEffect, useState } from 'react';

import type { City } from '@sporthub/types';
import { useSyncCityFromAuth } from '@/hooks/useSyncCityFromAuth';
import { useFilterStore } from '@/stores/useFilterStore';

/** Булавка эталона (`MapPin` из lucide) — значок перед городом. */
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 shrink-0 text-muted">
      <path
        d="M12 21c-1.6-2-6-7.3-6-11a6 6 0 1 1 12 0c0 3.7-4.4 9-6 11Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** Шеврон вниз — `select` со снятым системным видом рисует стрелку сам. */
function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-0 size-3 -translate-y-1/2 text-muted"
    >
      <path
        d="m4 6 4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

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
        // Фоллбэк: список пуст, в поле остаётся текущий город стора
      });
  }, []);

  // Текущий город — в списке всегда: пока города не приехали (или сеть отказала),
  // `select` без такого пункта показал бы пустую строку.
  const names = cities.map((city) => city.name);
  const options = names.includes(selectedCity) ? names : [selectedCity, ...names];

  return (
    <label className="inline-flex min-w-[180px] flex-col gap-0.5 rounded-[8px] border border-line bg-bg px-[10px] py-[6px]">
      <span className="text-[9px] font-bold tracking-[0.07em] text-muted uppercase">Город</span>
      <span className="relative flex items-center gap-1.5">
        <PinIcon />
        <select
          aria-label="Выбор города"
          value={selectedCity}
          className="w-full cursor-pointer appearance-none bg-transparent pr-5 text-[12px] font-semibold text-ink outline-none"
          onChange={(e) => {
            setSelectedCity(e.target.value);
          }}
        >
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <ChevronIcon />
      </span>
    </label>
  );
}
