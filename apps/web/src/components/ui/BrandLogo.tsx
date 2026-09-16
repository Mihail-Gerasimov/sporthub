// Логотип ПРОСПОРТ (шаг 38.34): два бегуна и словомарка двух цветов.
//
// Бегун — трассировка растра из макета (`prosport/src/imports/image-5.png`, 133×142,
// потрейсен в контур: два замкнутых пути — тело и голова). SVG инлайном с `currentColor`,
// поэтому цвет бегуна — обычный класс `text-*`, а не второй экземпляр рисунка.
// Словомарка — половины из `BRAND_WORDMARK`: зелёная «ПРО» и тёмная (на плашке — белая)
// «СПОРТ». Литералом писать нельзя — сторож `brand-single` (б).
//
// Анимация «вбегания» — классами `brand-runner-1/-2` из globals.css, с уважением
// к `prefers-reduced-motion`.

import { BRAND_NAME, BRAND_WORDMARK } from '@sporthub/domain';

import { cn } from '@/lib/utils';

/** Контур бегуна — трассировка растра макета; viewBox совпадает с растром. */
const RUNNER_PATH =
  'M68.5 123.6C65.6 120.7 65.7 120.1 72.4 105.2C74.9 99.6 77 94.5 77 94C77 92.8 66.1 85 64.4 85C63.7 85 61.1 87.9 58.6 91.4C53.2 98.9 54.3 98.7 34.7 98C23 97.6 19.7 97.2 19 96C17.5 93.6 17.8 91.2 20 89C21.8 87.2 23.3 87 34 87L46 87L52.3 77.2C62.6 61.3 72 46.1 72 45.5C72 44.6 65.3 42 62.8 42C61.5 42 56.4 44.1 51.4 46.6C41.8 51.7 39.8 51.8 37.8 47.5C36.2 44 38 42.3 50.3 35.4L60.3 29.8L70.4 33.2C76.1 35 83 38.2 86.4 40.5C92.3 44.4 92.5 44.7 95.2 53.1L98.1 61.8L107.2 64.1C117 66.6 119 67.9 119 71.4C119 76.7 115.6 77.1 102 73.5C91.4 70.6 89.5 69.4 88.3 64.2C87.8 62.3 87 60.5 86.4 60.3C85.5 60 76 74.5 76 76.2C76 76.6 78.7 78.7 81.9 81C88.3 85.3 91 88.3 91 91.3C91 92.9 86.7 103.3 79.9 118.7C76.4 126.4 72.9 127.9 68.5 123.6ZM90 37.1C87.1 36.3 83 30.7 83 27.6C83 24.4 86.7 19.1 89.7 17.9C102 13.3 109.6 31.5 97.5 36.6C93.8 38.1 93.7 38.1 90 37.1Z';

type BrandLogoSize = 'sm' | 'md';

type BrandLogoProps = {
  /** Поверхность: на тёмной плашке хвост словомарки и второй бегун белые. */
  tone?: 'light' | 'plate';
  /** Размер: `md` — шапка (бегун 34px, текст 21px), `sm` — подвал и узкие места (28/18). */
  size?: BrandLogoSize;
  className?: string;
};

/** Размеры из макета (`App.tsx:145`): бегун и кегль словомарки. */
const SIZE_CLASSES: Record<BrandLogoSize, { runner: string; text: string }> = {
  md: { runner: 'h-[34px] w-[30px]', text: 'text-[21px]' },
  sm: { runner: 'h-7 w-6', text: 'text-[18px]' },
};

/** Бегун: ширина ≈ 0,88 высоты — как у растра макета. */
function Runner({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 133 142"
      className={cn('shrink-0 fill-current', className)}
    >
      <path d={RUNNER_PATH} />
    </svg>
  );
}

export function BrandLogo({ tone = 'light', size = 'md', className }: BrandLogoProps) {
  const tailColor = tone === 'plate' ? 'text-plate-ink' : 'text-ink';
  const sizes = SIZE_CLASSES[size];

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 overflow-hidden', className)}
      aria-label={BRAND_NAME}
      role="img"
    >
      <Runner className={cn('brand-runner-1 text-lime', sizes.runner)} />
      <Runner className={cn('brand-runner-2 -ml-0.5', tailColor, sizes.runner)} />
      <span
        className={cn(
          'font-display font-hero leading-none tracking-[0.03em] uppercase whitespace-nowrap',
          sizes.text,
        )}
      >
        <span className="text-lime">{BRAND_WORDMARK.lead}</span>
        <span className={tailColor}>{BRAND_WORDMARK.tail}</span>
      </span>
    </span>
  );
}
