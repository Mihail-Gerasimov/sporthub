// Тесты CRM-заметок.
//
// Проверяется две вещи разом. Первая — прежняя: право завести заметку выводится
// из записей клиента, а не из отдельного поля. Вторая — новая (34.25): провайдер
// берётся из сессии, и подставить чужой номер больше негде. Раздел был самой
// тяжёлой дырой площадки — приватные заметки о людях отдавались анонимно, —
// поэтому здесь есть и контрольные группы «а гостю?», без которых зелёные
// проверки ничего не доказывали бы.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  fixtureClub,
  fixtureClubOffering,
  fixtureClubSlot1,
  fixtureDictionaryCollections,
  fixtureTrainer,
  fixtureUsers,
} from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

/** Провайдер без единой публикации: у него не может быть клиентов вовсе. */
const OTHER_PROVIDER = {
  id: 4,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'club_owner',
  status: 'active',
  name: 'Чужой провайдер',
  email: 'other-provider@test.local',
  phone: '+7 (900) 000-00-04',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
};

/** Заметка чужого провайдера — то, что не должно попасть ни в чью чужую выдачу. */
const FOREIGN_NOTE = {
  id: 100,
  createdAt: '2026-02-02T00:00:00.000Z',
  updatedAt: '2026-02-02T00:00:00.000Z',
  providerUserId: 4,
  clientUserId: 1,
  note: 'Чужая заметка о клиенте',
};

describe('Маршруты CRM-заметок', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('notes-http');
  });

  beforeEach(async () => {
    // Право завести заметку выводится из записей клиента, поэтому набору нужны
    // и запись, и всё, на что она ссылается: пользователь, слот, услуга, клуб,
    // справочник видов спорта. Раньше здесь были только клуб и запись — файлы
    // принимали ссылку в пустоту, база нет.
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [...fixtureUsers, OTHER_PROVIDER],
      clubs: [fixtureClub],
      // Слот ведёт тренер: у клубного занятия «кто ведёт» — отдельная ссылка.
      trainers: [fixtureTrainer],
      offerings: [fixtureClubOffering],
      schedule: [fixtureClubSlot1],
      bookings: [
        {
          id: 1,
          createdAt: '2026-02-01T00:00:00.000Z',
          userId: 1,
          scheduleId: 1,
          offeringId: 1,
          clubId: 1,
          ownerType: 'club',
          ownerId: 1,
          sportId: 3,
          status: 'confirmed',
          date: '2026-03-18',
          totalPrice: 1100,
          statusHistory: [],
        },
      ],
      'provider-client-notes': [FOREIGN_NOTE],
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('гостю раздел не отвечает вовсе — 401', async () => {
    // Контрольная группа. Ровно этим запросом раньше выгружались все заметки
    // всех провайдеров обо всех клиентах, без единого признака входа.
    const response = await request(harness.app.getHttpServer()).get('/api/provider-client-notes');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('гость не заводит заметку — 401', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .send({ clientUserId: 1, note: 'Гостевая' });

    expect(response.status).toBe(401);
  });

  it('человеку без лиц услуг выдача пуста — чужих заметок в ней нет', async () => {
    // ⚠️ Прежде здесь стоял отказ по праву `manage_own_clients`: раздел считался
    // привилегией провайдерской роли. Фаза 35 сняла декоратор, и выдачу сужает
    // не право, а АВТОР: маршрут отдаёт заметки спрашивающего, а у пользователя 1
    // их нет. Смысл проверки не изменился и держится тем же местом — приватная
    // заметка чужого провайдера в ответ не попадает.
    //
    // ⚠️ Ответ отличается от срезов записей (`?scope=owner`), где такой же человек
    // получает 403, и это не расхождение. Там режим спрашивают ЯВНО — «дай записи
    // моих публикаций», — и пустой список соврал бы про причину. Здесь спрашивают
    // свои заметки, и «своих нет» — правдивый ответ, а не замаскированный отказ.
    const response = await request(harness.app.getHttpServer())
      .get('/api/provider-client-notes')
      .set('Cookie', await harness.as(1));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);

    // Заметка чужого провайдера написана именно о пользователе 1: съедь выдача
    // с автора на клиента — она оказалась бы здесь, и проверка это увидит.
    const stored = await harness.read<{ id: number }[]>('provider-client-notes');
    expect(stored.map((item) => item.id)).toEqual([FOREIGN_NOTE.id]);
  });

  it('человек без лиц услуг заметку о ком-то не заводит — 403', async () => {
    // Вторая половина прежней проверки: читать раздел человеку без публикаций
    // не запрещено, потому что читать там нечего, а вот ПИСАТЬ — запрещено,
    // и держится запрет не ролью, а отсутствием клиентов: клиенты выводятся
    // из записей на свои публикации, а публикаций у пользователя 1 нет вовсе.
    const response = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .set('Cookie', await harness.as(1))
      .send({ clientUserId: 2, note: 'О постороннем' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Этот пользователь не является вашим клиентом');

    const stored = await harness.read<{ id: number }[]>('provider-client-notes');
    expect(stored.map((item) => item.id)).toEqual([FOREIGN_NOTE.id]);
  });

  it('провайдер видит только свои заметки, а не всю площадку', async () => {
    const cookie = await harness.as(2);

    await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .set('Cookie', cookie)
      .send({ clientUserId: 1, note: 'Своя заметка' });

    const response = await request(harness.app.getHttpServer())
      .get('/api/provider-client-notes')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].providerUserId).toBe(2);
    expect(response.body.data[0].note).toBe('Своя заметка');
  });

  it('чужой провайдер получает свои заметки, а не заметки соседа', async () => {
    // Обратная сторона той же проверки: выдача действительно зависит от того,
    // КТО спрашивает, а не от того, что вернулось первым.
    const response = await request(harness.app.getHttpServer())
      .get('/api/provider-client-notes')
      .set('Cookie', await harness.as(4));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(FOREIGN_NOTE.id);
  });

  it('режима ?scope=all больше нет: он не открывает чужие заметки', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/provider-client-notes?scope=all')
      .set('Cookie', await harness.as(2));

    expect(response.status).toBe(200);
    // Заметка чужого провайдера в базе есть, но в этой выдаче её быть не должно.
    expect(response.body.data).toEqual([]);
  });

  it('чужой номер провайдера в строке запроса ничего не меняет', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/provider-client-notes?providerUserId=4')
      .set('Cookie', await harness.as(2));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('провайдер заводит заметку про своего клиента, автор — из сессии', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .set('Cookie', await harness.as(2))
      .send({ clientUserId: 1, note: 'Любит утренние тренировки' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ providerUserId: 2, clientUserId: 1 });
    expect(response.body.data.updatedAt).toBe(response.body.data.createdAt);
  });

  it('номер провайдера в теле не принимается вовсе — 400', async () => {
    // Поле убрано из схемы: подсунуть автора заметки снаружи негде.
    const response = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .set('Cookie', await harness.as(2))
      .send({ providerUserId: 4, clientUserId: 1, note: 'От чужого имени' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные данные запроса');
  });

  it('про чужого клиента заметку завести нельзя — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .set('Cookie', await harness.as(4))
      .send({ clientUserId: 1, note: 'Чужой клиент' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Этот пользователь не является вашим клиентом');
  });

  it('выдача сужается по клиенту', async () => {
    const cookie = await harness.as(2);

    await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .set('Cookie', cookie)
      .send({ clientUserId: 1, note: 'Заметка' });

    const found = await request(harness.app.getHttpServer())
      .get('/api/provider-client-notes?clientUserId=1')
      .set('Cookie', cookie);

    expect(found.status).toBe(200);
    expect(found.body.data).toHaveLength(1);

    const empty = await request(harness.app.getHttpServer())
      .get('/api/provider-client-notes?clientUserId=3')
      .set('Cookie', cookie);

    expect(empty.body.data).toEqual([]);
  });

  it('нечисловой клиент в строке запроса отклоняется — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/provider-client-notes?clientUserId=abc')
      .set('Cookie', await harness.as(2));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные параметры запроса');
  });

  it('автор правит свою заметку', async () => {
    const cookie = await harness.as(2);
    const created = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .set('Cookie', cookie)
      .send({ clientUserId: 1, note: 'Старый текст' });

    const response = await request(harness.app.getHttpServer())
      .patch(`/api/provider-client-notes/${created.body.data.id}`)
      .set('Cookie', cookie)
      .send({ note: 'Новый текст' });

    expect(response.status).toBe(200);
    expect(response.body.data.note).toBe('Новый текст');
  });

  it('чужую заметку править нельзя — 403, текст не меняется', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch(`/api/provider-client-notes/${FOREIGN_NOTE.id}`)
      .set('Cookie', await harness.as(2))
      .send({ note: 'Взлом' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав для редактирования заметки');

    const stored = await harness.read<{ id: number; note: string }[]>('provider-client-notes');
    expect(stored.find((item) => item.id === FOREIGN_NOTE.id)?.note).toBe(FOREIGN_NOTE.note);
  });

  it('гость чужую заметку не правит — 401', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch(`/api/provider-client-notes/${FOREIGN_NOTE.id}`)
      .send({ note: 'Взлом' });

    expect(response.status).toBe(401);
  });

  it('автор удаляет заметку', async () => {
    const cookie = await harness.as(2);
    const created = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .set('Cookie', cookie)
      .send({ clientUserId: 1, note: 'На удаление' });

    const response = await request(harness.app.getHttpServer())
      .delete(`/api/provider-client-notes/${created.body.data.id}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const stored = await harness.read<{ id: number }[]>('provider-client-notes');
    expect(stored.map((item) => item.id)).toEqual([FOREIGN_NOTE.id]);
  });

  it('чужую заметку удалить нельзя — она остаётся на месте', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete(`/api/provider-client-notes/${FOREIGN_NOTE.id}`)
      .set('Cookie', await harness.as(2));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав для удаления заметки');

    const stored = await harness.read<{ id: number }[]>('provider-client-notes');
    expect(stored.map((item) => item.id)).toEqual([FOREIGN_NOTE.id]);
  });

  it('несуществующая заметка — 404', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/provider-client-notes/999')
      .set('Cookie', await harness.as(2));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Заметка не найдена');
  });

  it('правка несуществующей заметки — не найдено', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/provider-client-notes/999')
      .set('Cookie', await harness.as(2))
      .send({ note: 'Нет такой' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Заметка не найдена');
  });

  it('нечисловой идентификатор заметки отклоняется', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/api/provider-client-notes/abc')
      .set('Cookie', await harness.as(2))
      .send({ note: 'Текст' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректный id');
  });
});
