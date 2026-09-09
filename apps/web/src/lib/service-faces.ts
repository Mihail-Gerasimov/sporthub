// Лица услуг и кабинеты, которые им соответствуют.
//
// ⚠️ Фаза 35 убрала «тип кабинета». Раньше человек был ЛИБО спортсменом, ЛИБО
// представителем услуг, и весь фронт спрашивал `accountType`. В жизни это один
// и тот же человек: у него есть свой зал И он сам ходит на йогу. Поэтому вместо
// признака — список фактов: какими лицами услуг он управляет.
//
// Модуль намеренно НЕ серверный (в отличие от `session.ts`): типом лица и
// адресами кабинетов пользуются и страницы, и браузерный стор. Одно объявление
// на всех — иначе адрес кабинета разъехался бы между шапкой и лейаутом молча.

/** Вид лица услуг. Третий вид (площадка, мероприятие) добавляется сюда строкой. */
export type ServiceFaceKind = 'club' | 'trainer';

/** Лицо услуг: карточка тренера или клуб, которым человек управляет. */
export type ServiceFace = {
  kind: ServiceFaceKind;
  id: number;
  name: string;
};

/**
 * Адрес личного кабинета человека — записи, отзывы, избранное.
 *
 * ⚠️ Шаг 35.31 переименует его в `/profile/me`. Адрес объявлен здесь ровно
 * затем, чтобы это была правка одной строки, а не тринадцати ссылок.
 */
export const PERSONAL_CABINET_PATH = '/profile/athlete';

/**
 * Адрес кабинета лица услуг.
 *
 * ⚠️ Шаг 35.31 сделает его адресным (`/profile/club/[id]`,
 * `/profile/trainer/[id]`), и тогда эта константа станет функцией от лица.
 * Пока кабинет один на все лица человека, и текущее лицо задаёт переключатель.
 */
export const FACE_CABINET_PATH = '/profile/provider';

/** Подпись личного кабинета. */
export const PERSONAL_CABINET_TITLE = 'Кабинет спортсмена';

/** Подпись кабинета лица, когда имя лица ещё неизвестно. */
export const FACE_CABINET_TITLE = 'Кабинет представителя спортивных услуг';

/**
 * Куда ведёт кабинет и как он подписан.
 *
 * `face === null` — личный кабинет человека; иначе кабинет конкретного лица.
 */
export type CabinetTarget = {
  /** Устойчивый ключ: `me` либо `club:3` / `trainer:7`. */
  key: string;
  title: string;
  href: string;
  face: ServiceFace | null;
};

/** Ключ лица: им лицо опознаётся в разметке, в состоянии и в тестах. */
export function faceKey(face: ServiceFace): string {
  return `${face.kind}:${face.id}`;
}

/** Найти лицо по ключу. `null` — такого лица у человека нет. */
export function findFace(faces: readonly ServiceFace[], key: string | null): ServiceFace | null {
  if (key === null) return null;

  return faces.find((face) => faceKey(face) === key) ?? null;
}

/** Кабинет одного лица услуг. */
export function faceCabinet(face: ServiceFace): CabinetTarget {
  return { key: faceKey(face), title: face.name, href: FACE_CABINET_PATH, face };
}

/** Личный кабинет человека — один на всех и от лиц не зависит. */
export const PERSONAL_CABINET: CabinetTarget = {
  key: 'me',
  title: PERSONAL_CABINET_TITLE,
  href: PERSONAL_CABINET_PATH,
  face: null,
};
