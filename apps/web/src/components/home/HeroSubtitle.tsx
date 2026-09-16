/**
 * Подзаголовок героя с городом (шаг 38.107): город — из стора фильтров, той же записи,
 * что пишет селектор в каталоге; текст — из словаря `HERO.subtitle(city)`. Прежний чип
 * города (38.78) снят: в макете его нет, селектор живёт в каталоге.
 *
 * Клиентский островок в серверном герое: стор — единственная причина `'use client'`.
 *
 * Почему не `ui/*`: абзац текста, у `ui/*` для него компонента нет и не нужно.
 */
'use client';

import { HERO } from '@/lib/home-copy';
import { useFilterStore } from '@/stores/useFilterStore';

export function HeroSubtitle() {
  const selectedCity = useFilterStore((state) => state.selectedCity);

  return (
    <p className="mb-8 max-w-[480px] font-body text-[15px] leading-[1.7] text-plate-muted">
      {HERO.subtitle(selectedCity)}
    </p>
  );
}
