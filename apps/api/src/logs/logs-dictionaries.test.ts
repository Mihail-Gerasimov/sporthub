// Сторож словарей журнала.
//
// Проверяет, что журнал работает РОВНО с тем набором значений, который объявлен
// в общих словарях @sporthub/types. Если кто-то снова заведёт рядом урезанную
// копию списка действий, типов сущностей или ролей — эти тесты покраснеют
// на первом же значении, которого в копии не хватает.
//
// ⚠️ Фаза 34 сменила точку входа сторожа, но не его смысл. Раньше каждое значение
// проверялось записью через `POST /api/logs` — маршрут удалён совсем, потому что
// принимал исполнителя и его роль из тела. Записи снаружи больше нет, поэтому
// значения кладутся в хранилище засевом, а сверяются на выдаче и на фильтре:
// это те же два конца, что и раньше, минус дыра посередине.

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fixtureUsers } from '@sporthub/fixtures';
import { LOG_ACTIONS, LOG_ENTITY_TYPES, USER_ROLES } from '@sporthub/types';

import { createTestHarness, type TestHarness } from '../test/harness';

/** Страница заведомо больше любого из словарей: иначе проверка упёрлась бы в лимит. */
const WHOLE_PAGE = '?limit=100';

describe('Словари журнала не расходятся с валидацией', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('logs-dictionaries');
  });

  afterAll(async () => {
    await harness.close();
  });

  /**
   * Засеять журнал и войти администратором.
   *
   * Порядок обязателен и объясняет сам себя: перенос среза пересобирает базу,
   * а сессии лежат в ней обычной таблицей — выданная раньше cookie умерла бы
   * вместе с данными. Исполнитель записей — админ из фикстур (номер 3):
   * журнал ссылается на пользователя внешним ключом, выдуманный номер база не примет.
   */
  const seedLogs = async (logs: unknown[]): Promise<string> => {
    await harness.writeMany({ users: fixtureUsers, logs });

    return harness.as(3);
  };

  it('каждое действие из общего словаря и хранится, и отбирается фильтром', async () => {
    const cookie = await seedLogs(
      LOG_ACTIONS.map((action, index) => ({
        id: index + 1,
        createdAt: '2026-02-01T10:00:00.000Z',
        action,
        actorId: 3,
        actorRole: 'admin',
        entityType: 'user',
        entityId: 3,
      })),
    );

    // Отказ запоминается ВМЕСТЕ с кодом и телом ответа: «действие отклонено» без
    // причины заставляет воспроизводить падение руками, а оно может и не повториться.
    const rejected: string[] = [];

    for (const action of LOG_ACTIONS) {
      const response = await request(harness.app.getHttpServer())
        .get(`/api/logs?action=${action}`)
        .set('Cookie', cookie);

      if (response.status !== 200 || response.body.total !== 1) {
        rejected.push(`${action}: ${response.status} ${JSON.stringify(response.body)}`);
      }
    }

    expect(rejected).toEqual([]);
  });

  it('каждый тип сущности из общего словаря доезжает до выдачи', async () => {
    const cookie = await seedLogs(
      LOG_ENTITY_TYPES.map((entityType, index) => ({
        id: index + 1,
        createdAt: '2026-02-01T10:00:00.000Z',
        action: 'admin_login',
        actorId: 3,
        actorRole: 'admin',
        entityType,
        entityId: 3,
      })),
    );

    const response = await request(harness.app.getHttpServer())
      .get(`/api/logs${WHOLE_PAGE}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(
      [
        ...new Set(response.body.data.map((item: { entityType: string }) => item.entityType)),
      ].sort(),
    ).toEqual([...LOG_ENTITY_TYPES].sort());
  });

  it('каждая роль из общего словаря доезжает до выдачи', async () => {
    // Роль в записи — снимок на момент действия, а не текущая роль исполнителя,
    // поэтому один и тот же админ вправе стоять в записях с любой ролью.
    const cookie = await seedLogs(
      USER_ROLES.map((actorRole, index) => ({
        id: index + 1,
        createdAt: '2026-02-01T10:00:00.000Z',
        action: 'admin_login',
        actorId: 3,
        actorRole,
        entityType: 'user',
        entityId: 3,
      })),
    );

    const response = await request(harness.app.getHttpServer())
      .get(`/api/logs${WHOLE_PAGE}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(
      [...new Set(response.body.data.map((item: { actorRole: string }) => item.actorRole))].sort(),
    ).toEqual([...USER_ROLES].sort());
  });

  // Обратная сторона: словарь не должен превратиться в «принимаем что угодно».
  it('значения вне словарей по-прежнему отклоняются', async () => {
    const cookie = await seedLogs([]);
    const server = harness.app.getHttpServer();

    const badAction = await request(server)
      .get('/api/logs?action=нет-такого')
      .set('Cookie', cookie);
    expect(badAction.status).toBe(400);

    const badActor = await request(server).get('/api/logs?actorId=админ').set('Cookie', cookie);
    expect(badActor.status).toBe(400);

    const badDate = await request(server).get('/api/logs?from=вчера').set('Cookie', cookie);
    expect(badDate.status).toBe(400);
  });

  it('словари не открывают журнал тому, кому он не положен', async () => {
    // Проверка стоит здесь, а не только в наборе маршрутов: сторож словарей гоняет
    // журнал по всем значениям разом, и соблазн «пустить любого, раз данные
    // справочные» здесь самый сильный.
    await harness.writeMany({ users: fixtureUsers, logs: [] });
    const athleteCookie = await harness.as(1);

    const response = await request(harness.app.getHttpServer())
      .get(`/api/logs?action=${LOG_ACTIONS[0]}`)
      .set('Cookie', athleteCookie);

    expect(response.status).toBe(403);
  });
});
