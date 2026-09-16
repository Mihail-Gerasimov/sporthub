// Знак «проверено» (фаза 38, шаг 38.52): публикацию — клуб или карточку тренера —
// проверила администрация площадки.
//
// Знак — ТЕКСТ с галочкой и подсказкой, а не одна галочка: значок без подписи был бы
// дефектом дерева доступности того же класса, что нашла фаза 37. Подпись зависит
// от вида лица и берётся из ОДНОГО словаря `Record<CatalogOwnerType, …>`: третий вид
// лица без своей строки не соберётся. Подсказка — через `Hint`: по наведению, фокусу
// и касанию; знак в порядке табуляции, иначе с клавиатуры подсказку не открыть.
//
// ⚠️ Знак рисует только тот, у кого есть `verifiedAt`: решение «показывать или нет»
// принимает потребитель по полю публикации, сам знак о данных не знает.

import { Badge } from '@/components/ui/Badge';
import { Hint } from '@/components/ui/Hint';
import { BRAND_NAME } from '@sporthub/domain';
import type { CatalogOwnerType } from '@sporthub/types';

type VerifiedCopy = { label: string; hint: string };

/** Подписи знака по виду лица — единственное место, где они объявлены. */
const VERIFIED_COPY: Record<CatalogOwnerType, VerifiedCopy> = {
  club: {
    label: 'Клуб проверен',
    hint: `Этот клуб проверила администрация ${BRAND_NAME}`,
  },
  trainer: {
    label: 'Тренер проверен',
    hint: `Карточку этого тренера проверила администрация ${BRAND_NAME}`,
  },
};

type VerifiedBadgeProps = {
  ownerType: CatalogOwnerType;
  /** Классы обёртки подсказки: положение в потоке решает потребитель. */
  className?: string;
};

export function VerifiedBadge({ ownerType, className }: VerifiedBadgeProps) {
  const copy = VERIFIED_COPY[ownerType];

  return (
    <Hint text={copy.hint} className={className}>
      <Badge tone="accent" tabIndex={0} data-testid="verified-badge" className="gap-1.5">
        {/* Галочка декоративная: имя знаку даёт подпись рядом. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8.5l3.2 3.2L13 5" />
        </svg>
        {copy.label}
      </Badge>
    </Hint>
  );
}
