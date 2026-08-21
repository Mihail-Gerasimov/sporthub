// Сторож словарей журнала.
//
// Проверяет, что валидация журнала принимает РОВНО тот набор значений, который
// объявлен в общих словарях @sporthub/types. Если кто-то снова заведёт рядом
// урезанную копию списка действий, типов сущностей или ролей — эти тесты
// покраснеют на первом же значении, которого в копии не хватает.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureUsers } from '@sporthub/fixtures';
import { LOG_ACTIONS, LOG_ENTITY_TYPES, USER_ROLES } from '@sporthub/types';

import { createTestHarness, type TestHarness } from '../test/harness';

describe('Словари журнала не расходятся с валидацией', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('logs-dictionaries');
  });

  beforeEach(async () => {
    // Запись журнала ссылается на пользователя-исполнителя — здесь это админ с номером 3.
    await harness.writeMany({ users: fixtureUsers, logs: [] });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('запись принимается для каждого действия из общего словаря', async () => {
    // Отказ запоминается ВМЕСТЕ с кодом и телом ответа: «действие отклонено» без
    // причины заставляет воспроизводить падение руками, а оно может и не повториться.
    const rejected: string[] = [];

    for (const action of LOG_ACTIONS) {
      const response = await request(harness.app.getHttpServer()).post('/api/logs').send({
        action,
        actorId: 3,
        actorRole: 'admin',
        entityType: 'user',
        entityId: 3,
      });

      if (response.status !== 201) {
        rejected.push(`${action}: ${response.status} ${JSON.stringify(response.body)}`);
      }
    }

    expect(rejected).toEqual([]);
  });

  it('фильтр выдачи принимает каждое действие из общего словаря', async () => {
    const rejected: string[] = [];

    for (const action of LOG_ACTIONS) {
      const response = await request(harness.app.getHttpServer()).get(`/api/logs?action=${action}`);

      if (response.status !== 200) rejected.push(action);
    }

    expect(rejected).toEqual([]);
  });

  it('запись принимается для каждого типа сущности из общего словаря', async () => {
    const rejected: string[] = [];

    for (const entityType of LOG_ENTITY_TYPES) {
      const response = await request(harness.app.getHttpServer()).post('/api/logs').send({
        action: 'admin_login',
        actorId: 3,
        actorRole: 'admin',
        entityType,
        entityId: 3,
      });

      if (response.status !== 201) rejected.push(entityType);
    }

    expect(rejected).toEqual([]);
  });

  it('запись принимается для каждой роли из общего словаря', async () => {
    const rejected: string[] = [];

    for (const actorRole of USER_ROLES) {
      const response = await request(harness.app.getHttpServer()).post('/api/logs').send({
        action: 'admin_login',
        actorId: 3,
        actorRole,
        entityType: 'user',
        entityId: 3,
      });

      if (response.status !== 201) rejected.push(actorRole);
    }

    expect(rejected).toEqual([]);
  });

  // Обратная сторона: словарь не должен превратиться в «принимаем что угодно».
  it('значения вне словарей по-прежнему отклоняются', async () => {
    const server = harness.app.getHttpServer();
    const base = { actorId: 3, actorRole: 'admin', entityType: 'user', entityId: 3 };

    const badAction = await request(server)
      .post('/api/logs')
      .send({ ...base, action: 'нет такого действия' });
    expect(badAction.status).toBe(400);

    const badEntity = await request(server)
      .post('/api/logs')
      .send({ ...base, action: 'admin_login', entityType: 'offering' });
    expect(badEntity.status).toBe(400);

    const badRole = await request(server)
      .post('/api/logs')
      .send({ ...base, action: 'admin_login', actorRole: 'moderator' });
    expect(badRole.status).toBe(400);

    const badFilter = await request(server).get('/api/logs?action=нет-такого');
    expect(badFilter.status).toBe(400);
  });
});
