// Настройки уведомлений по ящикам (шаг 35.29).
//
// Уведомления переехали на лицо услуг (35.27), а настройки — нет: они оставались
// свойством ЧЕЛОВЕКА. Владелец двух клубов, которому надоел один из них, глушил
// вместе с ним и второй, и личные уведомления заодно.
//
// Здесь проверяется, что ящиков несколько и они не протекают друг в друга:
// у человека личный, у каждого его лица — свой. Отдельно проверяется главное —
// чужой ящик по номеру не открывается ни на чтение, ни на запись.
//
// ⚠️ Проверяется не только ответ маршрута, но и то, что настройки СОСЕДНЕГО ящика
// после записи не изменились. Все наборы лежат в одной таблице, и ошибка отбора
// стёрла бы соседей молча — код ответа об этом не сказал бы ничего.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from '../test/harness';

/** Владелец клуба 1 и карточки тренера 1 — у него три ящика сразу. */
const OWNER_ID = 2;
/** Посторонний: контрольная группа для отказа по чужому лицу. */
const ATHLETE_ID = 1;

type PreferencesResponse = { notificationPreferences?: Record<string, boolean> };

describe('Настройки уведомлений по ящикам', () => {
  let harness: TestHarness;
  let ownerCookie: string;
  let athleteCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('notification-preferences-face');
  });

  beforeEach(async () => {
    await harness.writeMany(fixtureCollections);
    ownerCookie = await harness.as(OWNER_ID);
    athleteCookie = await harness.as(ATHLETE_ID);
  });

  afterAll(async () => {
    await harness.close();
  });

  /** Прочитать один ящик: без лица — личный, с лицом — его. */
  async function read(
    cookie: string,
    userId: number,
    face?: { faceType: string; faceId: number },
  ): Promise<{ status: number; preferences: Record<string, boolean> }> {
    const query = face === undefined ? '' : `?faceType=${face.faceType}&faceId=${face.faceId}`;
    const response = await request(harness.app.getHttpServer())
      .get(`/api/users/${userId}/notification-preferences${query}`)
      .set('Cookie', cookie);

    const body = (response.body as { data?: PreferencesResponse }).data ?? {};

    return { status: response.status, preferences: body.notificationPreferences ?? {} };
  }

  /** Записать один ящик. */
  async function write(
    cookie: string,
    userId: number,
    preferences: Record<string, boolean>,
    face?: { faceType: string; faceId: number },
  ): Promise<number> {
    const response = await request(harness.app.getHttpServer())
      .patch(`/api/users/${userId}/notification-preferences`)
      .set('Cookie', cookie)
      .send({ preferences, ...(face ?? {}) });

    return response.status;
  }

  it('ящик лица отдельный: запись в клуб не задевает личный', async () => {
    expect(await write(ownerCookie, OWNER_ID, { review_created: false })).toBe(200);
    expect(
      await write(ownerCookie, OWNER_ID, { review_created: true }, { faceType: 'club', faceId: 1 }),
    ).toBe(200);

    const personal = await read(ownerCookie, OWNER_ID);
    const club = await read(ownerCookie, OWNER_ID, { faceType: 'club', faceId: 1 });

    expect(personal.preferences.review_created, 'личная настройка уехала вслед за клубом').toBe(
      false,
    );
    expect(club.preferences.review_created, 'настройка клуба не записалась').toBe(true);
  });

  it('два лица одного человека не делят настройки', async () => {
    await write(ownerCookie, OWNER_ID, { review_created: false }, { faceType: 'club', faceId: 1 });
    await write(
      ownerCookie,
      OWNER_ID,
      { review_created: true },
      { faceType: 'trainer', faceId: 1 },
    );

    const club = await read(ownerCookie, OWNER_ID, { faceType: 'club', faceId: 1 });
    const trainer = await read(ownerCookie, OWNER_ID, { faceType: 'trainer', faceId: 1 });

    expect(club.preferences.review_created, 'клуб и карточка тренера делят один ящик').toBe(false);
    expect(trainer.preferences.review_created).toBe(true);
  });

  it('личный ящик не подхватывает настройки лиц', async () => {
    // ⚠️ Ровно та ошибка, которую даёт отбор без лица: все наборы лежат в одной
    // таблице, и `toUser` схлопывает их по типу уведомления — настройка клуба
    // перезаписала бы личную, и человек увидел бы в своих настройках чужой ящик.
    await write(ownerCookie, OWNER_ID, { review_created: false }, { faceType: 'club', faceId: 1 });

    const personal = await read(ownerCookie, OWNER_ID);

    expect(
      personal.preferences.review_created,
      'настройка клуба протекла в личный ящик',
    ).toBeUndefined();
  });

  it('чужое лицо не читается', async () => {
    const response = await read(athleteCookie, ATHLETE_ID, { faceType: 'club', faceId: 1 });

    expect(response.status, 'посторонний прочитал настройки чужого клуба').toBe(403);
  });

  it('чужое лицо не пишется, и настройки владельца остаются прежними', async () => {
    await write(ownerCookie, OWNER_ID, { review_created: true }, { faceType: 'club', faceId: 1 });

    const status = await write(
      athleteCookie,
      ATHLETE_ID,
      { review_created: false },
      { faceType: 'club', faceId: 1 },
    );

    expect(status, 'посторонний заглушил уведомления чужого клуба').toBe(403);

    const club = await read(ownerCookie, OWNER_ID, { faceType: 'club', faceId: 1 });

    expect(club.preferences.review_created, 'настройки чужого клуба изменились').toBe(true);
  });

  it('половина имени ящика отвергается разбором', async () => {
    // Пара «вид + номер» — единое целое: один `faceId` без вида молча означал бы
    // личный ящик, то есть запись ушла бы не туда, куда просили.
    const response = await request(harness.app.getHttpServer())
      .patch(`/api/users/${OWNER_ID}/notification-preferences`)
      .set('Cookie', ownerCookie)
      .send({ preferences: { review_created: false }, faceId: 1 });

    expect(response.status, 'принято имя ящика без вида лица').toBe(400);
  });

  it('старый клиент без лица работает как прежде', async () => {
    // Поле необязательное: клиент, собранный до фазы 35, шлёт только настройки
    // и обязан по-прежнему править личный ящик.
    expect(await write(ownerCookie, OWNER_ID, { review_created: false })).toBe(200);

    const personal = await read(ownerCookie, OWNER_ID);

    expect(personal.preferences.review_created).toBe(false);
  });
});
