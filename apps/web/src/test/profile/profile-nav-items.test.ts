// Разделы кабинета: какие показываются и куда ведут.
//
// ⚠️ Фаза 35 переписала этот набор целиком, и не косметически. Раньше проверялось
// «какие разделы у роли»: набор атлета, набор провайдера, добавка разделов при
// наличии публикаций. Ролей нет, а кабинет теперь принадлежит ОДНОМУ лицу — значит
// вопросов стало два, и оба другие: что видит человек в личном кабинете и что
// видит ОДНО лицо в своём.
//
// Живой случай заказчика — свой зал плюс персональные тренировки — здесь и
// проверяется: это ДВА кабинета с разными адресами, а не один со смешанными
// разделами.

import { describe, expect, it } from 'vitest';

import {
  getCabinetNavItems,
  getFaceNavItems,
  getPersonalNavItems,
} from '@/components/profile/profile-nav-items';
import { PERSONAL_CABINET, faceCabinet, type ServiceFace } from '@/lib/service-faces';

const club: ServiceFace = { kind: 'club', id: 3, name: 'CrossFit Волга' };
const otherClub: ServiceFace = { kind: 'club', id: 7, name: 'Второй зал' };
const trainer: ServiceFace = { kind: 'trainer', id: 2, name: 'Марина Крылова' };

describe('Разделы личного кабинета', () => {
  it('набор одинаков у всех вошедших и не зависит от владения', () => {
    // Личный кабинет есть у каждого: он про человека, а не про то, чем он владеет.
    const keys = getPersonalNavItems().map((item) => item.key);

    expect(keys).toEqual([
      'dashboard',
      'schedule',
      'stats',
      'favorites',
      'reviews',
      'notifications',
      'settings',
    ]);
  });

  it('все адреса ведут в личный кабинет', () => {
    for (const item of getPersonalNavItems()) {
      expect(item.href, `раздел ${item.key} ушёл из личного кабинета`).toMatch(
        /^\/profile\/me(\/|$)/,
      );
    }
  });
});

describe('Разделы кабинета лица', () => {
  it('адреса собираются от адреса ЭТОГО лица, а не пишутся строками', () => {
    // ⚠️ Главное следствие адресного маршрута: у клуба 3 и клуба 7 разделы
    // одинаковые, а адреса разные. Раньше адрес был один на всех — `/profile/provider/*`, —
    // и человек с двумя залами не мог дать ссылку на кабинет одного из них.
    const first = getFaceNavItems({ face: club, hasBookings: true });
    const second = getFaceNavItems({ face: otherClub, hasBookings: true });

    expect(first.map((item) => item.key)).toEqual(second.map((item) => item.key));
    expect(first.every((item) => item.href.startsWith('/profile/club/3/'))).toBe(true);
    expect(second.every((item) => item.href.startsWith('/profile/club/7/'))).toBe(true);
  });

  it('раздел публикаций у клуба и у карточки тренера называется по-разному', () => {
    // Клуб ведёт список залов, тренер — одну свою карточку. Подпись обязана
    // это отражать, иначе тренер ищет в «Публикациях» то, чего у него нет.
    const clubItems = getFaceNavItems({ face: club, hasBookings: false });
    const trainerItems = getFaceNavItems({ face: trainer, hasBookings: false });

    expect(clubItems.some((item) => item.key === 'publications')).toBe(true);
    expect(trainerItems.some((item) => item.key === 'trainer-profile')).toBe(true);
    expect(trainerItems.some((item) => item.key === 'publications')).toBe(false);
  });

  it('без записей разделы про записи не показываются', () => {
    const keys = getFaceNavItems({ face: club, hasBookings: false }).map((item) => item.key);

    expect(keys).not.toContain('bookings');
    expect(keys).not.toContain('clients');
  });

  it('с записями они появляются в устойчивом порядке', () => {
    const keys = getFaceNavItems({ face: club, hasBookings: true }).map((item) => item.key);

    expect(keys).toEqual([
      'dashboard',
      'publications',
      'bookings',
      'clients',
      'stats',
      'links',
      'reviews',
      'finance',
      'notifications',
      'settings',
    ]);
  });

  it('свой зал и свои персоналки — это ДВА кабинета, а не один смешанный', () => {
    // Случай заказчика целиком. Разделы не складываются в кучу: у каждого лица
    // свой адрес, и по ссылке открывается ровно одно из них.
    const gym = getFaceNavItems({ face: club, hasBookings: true });
    const personal = getFaceNavItems({ face: trainer, hasBookings: true });

    const gymPaths = new Set(gym.map((item) => item.href));

    expect(
      personal.some((item) => gymPaths.has(item.href)),
      'адреса кабинетов зала и карточки тренера пересеклись',
    ).toBe(false);
  });
});

describe('Разделы открытого кабинета', () => {
  it('личный кабинет отдаёт личный набор', () => {
    expect(getCabinetNavItems(PERSONAL_CABINET, true).map((item) => item.key)).toEqual(
      getPersonalNavItems().map((item) => item.key),
    );
  });

  it('кабинет лица отдаёт набор этого лица', () => {
    expect(getCabinetNavItems(faceCabinet(trainer), false)).toEqual(
      getFaceNavItems({ face: trainer, hasBookings: false }),
    );
  });
});
