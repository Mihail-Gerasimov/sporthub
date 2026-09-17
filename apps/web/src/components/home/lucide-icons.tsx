/**
 * Иконки макета — lucide, инлайновыми SVG (шаг 38.117, Э14).
 *
 * Макет главной берёт значки из `lucide-react` 0.487; библиотеки иконок у нас нет (девять
 * зависимостей `apps/web` — решение заказчика 11), поэтому нужные контуры лежат здесь
 * буквально — из `prosport/node_modules/lucide-react/dist/esm/icons/*.js` той же версии,
 * с атрибутами lucide (`stroke-width` 2, скруглённые концы). Один файл
 * на все значки главной: шаги и плитки «Возможности» берут по ключу, а не рисуют своё.
 * Цвет — `currentColor`: тон задаёт обёртка.
 */
import type { ReactNode } from 'react';

/** Общие атрибуты lucide: контур толщиной 2, без заливки, скруглённые концы. */
function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Контуры lucide по имени — те же имена, что в макете. */
export const LUCIDE = {
  search: (
    <Icon>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  ),
  calendar: (
    <Icon>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </Icon>
  ),
  'bar-chart-2': (
    <Icon>
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </Icon>
  ),
  'credit-card': (
    <Icon>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </Icon>
  ),
  'book-open': (
    <Icon>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </Icon>
  ),
  apple: (
    <Icon>
      <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" />
      <path d="M10 2c1 .5 2 2 2 5" />
    </Icon>
  ),
  'trending-up': (
    <Icon>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </Icon>
  ),
  package: (
    <Icon>
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
      <path d="M12 22V12" />
      <path d="m7.5 4.27 9 5.15" />
    </Icon>
  ),
  flame: (
    <Icon>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </Icon>
  ),
  'log-in': (
    <Icon size={14}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" x2="3" y1="12" y2="12" />
    </Icon>
  ),
} as const;

export type LucideName = keyof typeof LUCIDE;
