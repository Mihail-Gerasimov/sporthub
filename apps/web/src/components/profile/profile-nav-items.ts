// Data-driven пункты навигации ЛК (Step 25.2).
// Набор разделов зависит от фактических данных: у провайдера может не быть ни одной
// публикации и ни одной записи, и показывать ему пустые разделы незачем.
//
// ⚠️ Фаза 35, шаги 35.33–35.34. Раздел показывается по ВЛАДЕНИЮ, и только по нему.
// Фаза 34 добавляла сюда права роли вторым условием («право И наличие публикаций»);
// прав `manage_own_clubs` и `manage_own_trainer_profile` больше нет — они исчезли
// вместе с ролями. Осталось одно условие, и оно единственное осмысленное: у кого
// есть клубы, тому нужен раздел клубов; у кого карточка — раздел карточки;
// у кого оба — оба. Это и есть живой случай заказчика: свой зал плюс персоналки.
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
 * Виды лиц услуг: свой раздел кабинета и свой список сущностей.
 *
 * Таблица, а не цепочка условий, ровно по главному правилу: третий вид публикации
 * (площадка, мероприятие — что угодно) добавляется СТРОКОЙ здесь, а не правкой
 * условия, потом подписи, потом порядка. Адрес у разделов пока общий: страница
 * одна и показывает то, чем человек управляет.
 */
const PUBLICATION_SECTIONS: {
  item: ProfileNavItem;
  own: (input: ProviderNavInput) => readonly unknown[];
}[] = [
  {
    item: { key: 'publications', label: 'Публикации', href: '/profile/provider/publications' },
    own: (input) => input.providerClubs,
  },
  {
    item: { key: 'trainer-profile', label: 'Моя карточка', href: '/profile/provider/publications' },
    own: (input) => input.providerTrainers,
  },
];

/**
 * Набор разделов провайдера условный:
 * раздел публикаций своего вида появляется при наличии таких публикаций,
 * Links/Reviews — вместе с ним, Bookings/Clients/Stats — при наличии bookings
 * (с защитой: без публикаций booking невозможен).
 */
export function getProviderNavItems(input: ProviderNavInput): ProfileNavItem[] {
  const ownSections = PUBLICATION_SECTIONS.filter((section) => section.own(input).length > 0);
  const hasPublications = ownSections.length > 0;
  const showBookingSections = hasPublications && input.hasProviderBookings;

  const items: ProfileNavItem[] = [
    { key: 'dashboard', label: 'Обзор', href: '/profile/provider/dashboard' },
  ];

  items.push(...ownSections.map((section) => section.item));

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
