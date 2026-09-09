// Тесты журнала. Набор допустимых значений фильтра совпадает с общим словарём
// действий — полнота словарей отдельно закреплена в logs-dictionaries.test.ts.
//
// Фаза 34 переписала здесь оба конца маршрута:
//
// 1. **Записи снаружи больше нет.** `POST /api/logs` принимал исполнителя и его роль
//    прямо в теле — кто угодно мог оставить в журнале запись от имени администратора.
//    Маршрут удалён совсем, поэтому подделать запись нечем, и проверять теперь надо
//    отсутствие маршрута, а не отказ на нём.
// 2. **Чтение закрыто правом `view_platform_logs`.** Журнал платформы отдавался
//    анонимно и постранично, вместе с номерами исполнителей.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureUsers } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from '../test/harness';

const entry = (id: number, over: Record<string, unknown>) => ({
  id,
  createdAt: `2026-02-0${id}T10:00:00.000Z`,
  action: 'publish_create',
  actorId: 2,
  actorRole: 'club_owner',
  entityType: 'club',
  entityId: 1,
  ...over,
});

describe('Маршруты журнала', () => {
  let harness: TestHarness;
  // ⚠️ Сессии выдаются после засева: перенос среза пересобирает базу, а сессии
  // лежат в ней же. Выданная раньше cookie дала бы 401 без связи с проверкой.
  let adminCookie: string;
  let athleteCookie: string;
  let providerCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('logs-http');
  });

  beforeEach(async () => {
    // Исполнитель записи журнала — существующий пользователь. Файлы принимали любой
    // номер, база — только настоящий: журнал ссылается на пользователя.
    await harness.writeMany({
      users: fixtureUsers,
      logs: [
        entry(1, {}),
        entry(2, {
          action: 'booking_create',
          actorId: 1,
          actorRole: 'athlete',
          entityType: 'booking',
        }),
        entry(3, { action: 'moderation_hide', actorId: 3, actorRole: 'admin' }),
        entry(4, { action: 'link_approve', actorId: 2, entityType: 'trainer' }),
      ],
    });

    // Роли фикстур: 1 — атлет, 2 — владелец клуба, 3 — администратор.
    adminCookie = await harness.as(3);
    athleteCookie = await harness.as(1);
    providerCookie = await harness.as(2);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('без фильтров отдаёт всё, свежие сверху, счётчики рядом с data', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/logs')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([4, 3, 2, 1]);
    expect(response.body.total).toBe(4);
    expect(response.body.offset).toBe(0);
    expect(response.body.limit).toBe(50);
  });

  it('фильтрует по действию и по исполнителю', async () => {
    const byAction = await request(harness.app.getHttpServer())
      .get('/api/logs?action=booking_create')
      .set('Cookie', adminCookie);
    expect(byAction.body.data).toHaveLength(1);

    const byActor = await request(harness.app.getHttpServer())
      .get('/api/logs?actorId=3')
      .set('Cookie', adminCookie);
    expect(byActor.body.data).toHaveLength(1);
  });

  it('фильтрует по диапазону дат', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/logs?from=2026-02-02T00:00:00.000Z&to=2026-02-03T23:59:59.000Z')
      .set('Cookie', adminCookie);

    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([3, 2]);
  });

  it('пагинация режет выдачу, но не общее число', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/logs?offset=2&limit=1')
      .set('Cookie', adminCookie);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.total).toBe(4);
    expect(response.body.offset).toBe(2);
  });

  it('фильтр отбирает действие, которое система пишет сама', async () => {
    // Раньше здесь был отказ: фильтр держал свою урезанную копию списка
    // действий и не знал про link_approve, хотя запись в журнале есть.
    const response = await request(harness.app.getHttpServer())
      .get('/api/logs?action=link_approve')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([4]);
  });

  it('несуществующее действие в фильтре — по-прежнему 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/logs?action=выдумка')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные параметры запроса');
  });

  it('гость журнал не читает', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/logs');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Требуется вход');
    // Ни строчки журнала наружу: отказ обязан быть вместо данных, а не вместе с ними.
    expect(response.body.data).toBeUndefined();
  });

  it('атлет и владелец клуба журнал не читают', async () => {
    // Журнал платформы — это чужие действия, номера исполнителей и служебные
    // подробности. Право на него есть только у администратора.
    const athlete = await request(harness.app.getHttpServer())
      .get('/api/logs')
      .set('Cookie', athleteCookie);

    expect(athlete.status).toBe(403);
    expect(athlete.body.error).toBe('Недостаточно прав');
    expect(athlete.body.data).toBeUndefined();

    const provider = await request(harness.app.getHttpServer())
      .get('/api/logs')
      .set('Cookie', providerCookie);

    expect(provider.status).toBe(403);
  });

  it('своих записей в журнале атлет тоже не видит — раздел закрыт целиком', async () => {
    // Соблазн «ну свои-то пусть смотрит» здесь не реализован: право одно на весь
    // раздел, и фильтр по исполнителю его не обходит.
    const response = await request(harness.app.getHttpServer())
      .get('/api/logs?actorId=1')
      .set('Cookie', athleteCookie);

    expect(response.status).toBe(403);
  });

  it('маршрута записи в журнал больше нет', async () => {
    // Он и был дырой: `actorId` и `actorRole` приходили в теле, а значит любой
    // мог оставить след от чужого имени. Проверяется отсутствие маршрута, а не
    // отказ на нём: отказ означал бы, что маршрут жив и ждёт нужной роли.
    const response = await request(harness.app.getHttpServer()).post('/api/logs').send({
      action: 'admin_login',
      actorId: 3,
      actorRole: 'admin',
      entityType: 'user',
      entityId: 3,
    });

    // 404 или 405 — оба означают «такого маршрута нет»; какой именно вернёт
    // фреймворк, решать не тесту.
    expect([404, 405]).toContain(response.status);

    const stored = await harness.read<unknown[]>('logs');
    expect(stored).toHaveLength(4);
  });

  it('маршрута записи нет и у администратора', async () => {
    // Важное уточнение к предыдущей проверке: маршрут именно УДАЛЁН, а не закрыт
    // правом. Будь он закрыт, админская сессия его бы открыла — и журнал снова
    // можно было бы наполнять снаружи, просто с более высокой планкой входа.
    const response = await request(harness.app.getHttpServer())
      .post('/api/logs')
      .set('Cookie', adminCookie)
      .send({
        action: 'admin_login',
        actorId: 3,
        actorRole: 'admin',
        entityType: 'user',
        entityId: 3,
      });

    expect([404, 405]).toContain(response.status);

    const stored = await harness.read<unknown[]>('logs');
    expect(stored).toHaveLength(4);
  });
});
