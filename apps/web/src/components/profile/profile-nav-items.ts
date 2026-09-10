// Разделы кабинета: какие показывать и куда они ведут.
//
// ⚠️ Фаза 35, шаги 35.33–35.34. Раздел показывается по ВЛАДЕНИЮ, и только по нему.
// Фаза 34 добавляла сюда права роли вторым условием («право И наличие публикаций»);
// прав `manage_own_clubs` и `manage_own_trainer_profile` больше нет — они исчезли
// вместе с ролями.
//
// ⚠️ Шаг 35.31. Кабинет теперь принадлежит ОДНОМУ лицу, и это меняет здесь две
// вещи. Первая: адреса разделов собираются от адреса кабинета, а не пишутся
// строками, — у клуба 3 и клуба 7 разделы одинаковые, а адреса разные. Вторая:
// «чем человек владеет» больше не список, а одно лицо: у кого зал и своя карточка
// тренера, у того ДВА кабинета, а не один со смешанными разделами. Живой случай
// заказчика («свой зал плюс персоналки») выражается двумя адресами, и каждый
// из них можно дать ссылкой отдельно.
import {
  cabinetSectionPath,
  faceCabinetPath,
  PERSONAL_CABINET_PATH,
  type CabinetTarget,
  type ServiceFace,
  type ServiceFaceKind,
} from '@/lib/service-faces';

/** Один пункт сайдбар-навигации внутри кабинета. */
export interface ProfileNavItem {
  /** Стабильный ключ для рендера и тестов. */
  key: string;
  /** Человекочитаемое название раздела. */
  label: string;
  /** Абсолютный путь внутри `/profile/*`. */
  href: string;
}

/** Раздел до того, как к нему приделали адрес кабинета. */
type NavSection = { key: string; label: string; section: string };

/** Собрать пункт: адрес — это адрес кабинета плюс имя раздела. */
function navItem(cabinetPath: string, section: NavSection): ProfileNavItem {
  return {
    key: section.key,
    label: section.label,
    href: cabinetSectionPath(cabinetPath, section.section),
  };
}

const PERSONAL_SECTIONS: NavSection[] = [
  { key: 'dashboard', label: 'Обзор', section: 'dashboard' },
  { key: 'schedule', label: 'Расписание', section: 'schedule' },
  { key: 'stats', label: 'Статистика', section: 'stats' },
  { key: 'favorites', label: 'Избранное', section: 'favorites' },
  { key: 'reviews', label: 'Отзывы', section: 'reviews' },
  { key: 'notifications', label: 'Уведомления', section: 'notifications' },
  { key: 'settings', label: 'Настройки', section: 'settings' },
];

/** Набор разделов человека фиксированный — одинаков у всех вошедших. */
export function getPersonalNavItems(): ProfileNavItem[] {
  return PERSONAL_SECTIONS.map((section) => navItem(PERSONAL_CABINET_PATH, section));
}

/**
 * Раздел публикации у каждого вида лица свой: клуб ведёт список залов, тренер —
 * одну свою карточку. Адрес раздела при этом общий: страница одна.
 *
 * Словарь, а не цепочка условий, ровно по главному правилу: третий вид лица
 * (площадка, мероприятие) добавляется СТРОКОЙ здесь, а не правкой условия,
 * потом подписи, потом порядка.
 */
const FACE_PUBLICATION_SECTION: Record<ServiceFaceKind, NavSection> = {
  club: { key: 'publications', label: 'Публикации', section: 'publications' },
  trainer: { key: 'trainer-profile', label: 'Моя карточка', section: 'publications' },
};

/** Разделы, которые появляются только когда у лица есть записи. */
const FACE_BOOKING_SECTIONS: NavSection[] = [
  { key: 'bookings', label: 'Бронирования', section: 'bookings' },
  { key: 'clients', label: 'Клиенты', section: 'clients' },
  { key: 'stats', label: 'Статистика', section: 'stats' },
];

/** Разделы, которые есть у лица всегда. */
const FACE_ALWAYS_SECTIONS: NavSection[] = [
  { key: 'links', label: 'Связи', section: 'links' },
  { key: 'reviews', label: 'Отзывы', section: 'reviews' },
  { key: 'finance', label: 'Финансы', section: 'finance' },
  { key: 'notifications', label: 'Уведомления', section: 'notifications' },
  { key: 'settings', label: 'Настройки', section: 'settings' },
];

export interface FaceNavInput {
  /** Лицо, чей это кабинет. Оно есть всегда: без него адреса кабинета не существует. */
  face: ServiceFace;
  /** Есть ли у лица записи. Пока их нет, разделам про них показывать нечего. */
  hasBookings: boolean;
}

/**
 * Набор разделов кабинета лица.
 *
 * ⚠️ Проверки «а есть ли публикация» здесь больше нет, и это не упрощение,
 * а следствие адресного маршрута: в кабинет лица нельзя попасть, не владея этим
 * лицом, — `requireOwner` в лейауте уводит раньше. Публикация существует
 * по построению, и условие про неё было бы недостижимой веткой.
 */
export function getFaceNavItems({ face, hasBookings }: FaceNavInput): ProfileNavItem[] {
  const cabinetPath = faceCabinetPath(face);
  const sections: NavSection[] = [
    { key: 'dashboard', label: 'Обзор', section: 'dashboard' },
    FACE_PUBLICATION_SECTION[face.kind],
    ...(hasBookings ? FACE_BOOKING_SECTIONS : []),
    ...FACE_ALWAYS_SECTIONS,
  ];

  return sections.map((section) => navItem(cabinetPath, section));
}

/**
 * Разделы открытого кабинета — по нему самому.
 *
 * Одна точка входа для макета: он не должен знать, какой кабинет открыт, — это
 * знает сам кабинет (`face === null` — личный, иначе кабинет лица).
 */
export function getCabinetNavItems(cabinet: CabinetTarget, hasBookings: boolean): ProfileNavItem[] {
  return cabinet.face === null
    ? getPersonalNavItems()
    : getFaceNavItems({ face: cabinet.face, hasBookings });
}
