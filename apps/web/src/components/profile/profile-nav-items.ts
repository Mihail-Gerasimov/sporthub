// Data-driven пункты навигации ЛК (Step 25.2).
// Набор разделов зависит не от роли, а от фактических данных: у провайдера может быть
// одновременно и club-side, и trainer-side, и даже пустой кабинет.
import type { Club, Trainer } from '@sporthub/types';

/** Один пункт сайдбар-навигации внутри кабинета. */
export interface ProfileNavItem {
  /** Стабильный ключ для рендера и тестов. */
  key: string;
  /** Человекочитаемое название раздела. */
  label: string;
  /** Абсолютный путь внутри `/profile/*`. */
  href: string;
}

const ATHLETE_NAV_ITEMS: ProfileNavItem[] = [
  { key: 'dashboard', label: 'Обзор', href: '/profile/athlete/dashboard' },
  { key: 'schedule', label: 'Расписание', href: '/profile/athlete/schedule' },
  { key: 'stats', label: 'Статистика', href: '/profile/athlete/stats' },
  { key: 'favorites', label: 'Избранное', href: '/profile/athlete/favorites' },
  { key: 'reviews', label: 'Отзывы', href: '/profile/athlete/reviews' },
  { key: 'notifications', label: 'Уведомления', href: '/profile/athlete/notifications' },
  { key: 'settings', label: 'Настройки', href: '/profile/athlete/settings' },
];

/** Набор разделов атлета фиксированный — одинаков для всех авторизованных атлетов. */
export function getAthleteNavItems(): ProfileNavItem[] {
  return ATHLETE_NAV_ITEMS.slice();
}

export interface ProviderNavInput {
  providerClubs: Club[];
  providerTrainers: Trainer[];
  hasProviderBookings: boolean;
}

/**
 * Набор разделов провайдера условный:
 * Publications/Links/Reviews появляются при наличии публикаций, Bookings/Clients/Stats —
 * при наличии bookings (с защитой: без публикаций booking невозможен).
 */
export function getProviderNavItems(input: ProviderNavInput): ProfileNavItem[] {
  const hasPublications = input.providerClubs.length > 0 || input.providerTrainers.length > 0;
  const showBookingSections = hasPublications && input.hasProviderBookings;

  const items: ProfileNavItem[] = [
    { key: 'dashboard', label: 'Обзор', href: '/profile/provider/dashboard' },
  ];

  if (hasPublications) {
    items.push({
      key: 'publications',
      label: 'Публикации',
      href: '/profile/provider/publications',
    });
  }

  if (showBookingSections) {
    items.push({ key: 'bookings', label: 'Бронирования', href: '/profile/provider/bookings' });
    items.push({ key: 'clients', label: 'Клиенты', href: '/profile/provider/clients' });
    items.push({ key: 'stats', label: 'Статистика', href: '/profile/provider/stats' });
  }

  if (hasPublications) {
    items.push({ key: 'links', label: 'Связи', href: '/profile/provider/links' });
    items.push({ key: 'reviews', label: 'Отзывы', href: '/profile/provider/reviews' });
  }

  items.push({ key: 'finance', label: 'Финансы', href: '/profile/provider/finance' });
  items.push({
    key: 'notifications',
    label: 'Уведомления',
    href: '/profile/provider/notifications',
  });
  items.push({ key: 'settings', label: 'Настройки', href: '/profile/provider/settings' });

  return items;
}
