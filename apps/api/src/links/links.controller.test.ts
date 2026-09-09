// Тесты связей тренер↔клуб. Главное здесь — симметрия прав: подтверждает всегда
// сторона, противоположная инициатору, и разрыв делает услуги частными.
//
// Фаза 34: личность больше не приходит в теле — каждый запрос идёт с cookie
// сессии. Поэтому набор проверяет ещё и то, чего проверить раньше было нечем:
// анонимный вызов, чужую сторону связи и сужение списка до своих связей.

import request from 'supertest';
import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest';

import {
  fixtureCollections,
  fixtureConfirmedLinkCollections,
  fixtureDictionaryCollections,
} from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from '../test/harness';

const user = (id: number, accountKind: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  accountKind,
  // Состояние обязательно: сессия неактивного пользователя не разбирается вовсе.
  status: 'active',
  name: `Пользователь ${id}`,
  email: `u${id}@test.local`,
  phone: '+7 (900) 000-00-00',
  passwordHash: 'demo123',
  favoriteClubIds: [],
});

const club = (id: number, name: string, slug: string, managedByUserId: number) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  name,
  slug,
  description: 'Описание',
  shortDescription: 'Кратко',
  city: 'Самара',
  address: 'ул. Ленина, 1',
  phone: '+7 900 000-00-00',
  coordinates: { lat: 53.2, lng: 50.1 },
  priceFrom: 500,
  distanceKm: 1,
  managedByUserId,
  sportIds: [3],
  tagIds: [],
  amenityIds: [],
  imageUrls: [],
  rating: 4,
  reviewCount: 0,
  status: 'published',
});

const trainer = (id: number, name: string, slug: string, managedByUserId: number) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  name,
  slug,
  bio: 'Биография',
  avatarUrl: '',
  experienceYears: 5,
  priceFrom: 900,
  managedByUserId,
  sportIds: [3],
  specialtyIds: [],
  workFormatIds: [],
  rating: 4,
  reviewCount: 0,
  status: 'published',
});

describe('Маршруты связей тренер↔клуб', () => {
  let harness: TestHarness;

  // Cookie выдаются в `beforeEach` и только ПОСЛЕ засева: запись коллекции
  // пересобирает базу целиком, а сессии живут в ней же.
  let asOwner: string; // пользователь 2 — клуб 1 и тренер 1
  let asTrainer: string; // пользователь 5 — тренер 3
  let asOutsider: string; // пользователь 6 — клуб 2 и тренер 4
  let asAthlete: string; // пользователь 1 — ни клуба, ни карточки: сторон у него нет
  let asAdmin: string; // пользователь 3

  beforeAll(async () => {
    harness = await createTestHarness('links-http');
  });

  beforeEach(async () => {
    // Один перенос на весь срез: публикация ссылается на справочник видов спорта
    // и на управляющего пользователя.
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      // Пользователь 2 управляет и клубом 1, и тренером 1 — это позволяет
      // проверить обе стороны. Пользователь 5 — посторонний владелец тренера 3.
      // Пользователь 6 — чужая пара публикаций со своей связью: на ней видно,
      // что список сужается до своих.
      users: [
        user(1, 'person'),
        user(2, 'person'),
        user(3, 'admin'),
        user(5, 'person'),
        user(6, 'person'),
      ],
      clubs: [club(1, 'Волна', 'volna', 2), club(2, 'Чужой клуб', 'chuzhoy', 6)],
      trainers: [
        trainer(1, 'Марина', 'marina', 2),
        trainer(3, 'Алексей', 'alexey', 5),
        trainer(4, 'Пётр', 'petr', 6),
      ],
      // Связь чужой пары: её не должен видеть никто, кроме владельца и админа.
      'trainer-club-links': [
        {
          id: 900,
          createdAt: '2026-01-01T00:00:00.000Z',
          trainerId: 4,
          clubId: 2,
          status: 'pending',
          initiatedBy: 'trainer',
        },
      ],
      offerings: [],
      notifications: [],
      logs: [],
    });

    [asAthlete, asOwner, asAdmin, asTrainer, asOutsider] = await Promise.all([
      harness.as(1),
      harness.as(2),
      harness.as(3),
      harness.as(5),
      harness.as(6),
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  // Локальные помощники добавляют общий префикс адресов и cookie сессии —
  // тест говорит, ОТ ЧЬЕГО ЛИЦА идёт запрос, а не каким заголовком это переносится.
  const post = (path: string, cookie: string, body: object = {}) =>
    request(harness.app.getHttpServer()).post(`/api${path}`).set('Cookie', cookie).send(body);

  const get = (path: string, cookie?: string) => {
    const call = request(harness.app.getHttpServer()).get(`/api${path}`);

    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  describe('Вход и права', () => {
    it('анонимный список связей отдаёт только подтверждённые', async () => {
      // Проверка изменила смысл в фазе 34: маршрут открыт гостю, но узко.
      // Закрытым целиком он ронял главную страницу — витрина читает привязки.
      const response = await get('/trainer-club-links');

      expect(response.status).toBe(200);
      expect(
        response.body.data.some((link: { status: string }) => link.status !== 'confirmed'),
      ).toBe(false);
    });

    it('анонимная заявка — 401, и в хранилище ничего не появляется', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/api/trainer-club-links')
        .send({ trainerId: 3, clubId: 1 });

      expect(response.status).toBe(401);

      const links = await harness.read<{ id: number }[]>('trainer-club-links');
      expect(links.map((link) => link.id)).toEqual([900]);
    });

    it('анонимное подтверждение — 401', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/api/trainer-club-links/900/approve')
        .send({ userId: 6 });

      expect(response.status).toBe(401);
    });

    it('человек без лиц услуг заявку не создаёт — 403, в хранилище пусто', async () => {
      // ⚠️ Прежде отказ давал декоратор `@Requires('manage_own_links')`: связи
      // считались правом провайдерских ролей, и текст был общий — «Недостаточно
      // прав». Фаза 35 сняла декоратор, и это ничего не открыло: сторона связи
      // определяется ВЛАДЕНИЕМ, а пользователь 1 не управляет ни тренером 3,
      // ни клубом 1. Изменились место отказа и его текст, но не то, кому можно.
      const response = await post('/trainer-club-links', asAthlete, { trainerId: 3, clubId: 1 });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для отправки запроса');

      // Кода ответа мало: новой связи в хранилище появиться не должно.
      const links = await harness.read<{ id: number }[]>('trainer-club-links');
      expect(links.map((link) => link.id)).toEqual([900]);
    });

    it('номер в теле запроса ни на что не влияет — сторона берётся из сессии', async () => {
      // Тело просит завести заявку от лица пользователя 2, а cookie — от лица 5.
      // Заявка обязана получиться тренерской, то есть по сессии.
      const response = await post('/trainer-club-links', asTrainer, {
        trainerId: 3,
        clubId: 1,
        userId: 2,
      });

      expect(response.status).toBe(201);
      expect(response.body.data.initiatedBy).toBe('trainer');

      const notifications = await harness.read<{ userId: number }[]>('notifications');
      expect(notifications).toEqual([expect.objectContaining({ userId: 2 })]);
    });
  });

  it('создаёт заявку и уведомляет противоположную сторону', async () => {
    const response = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'pending', initiatedBy: 'trainer' });

    const notifications = await harness.read<{ userId: number; type: string }[]>('notifications');
    expect(notifications).toEqual([expect.objectContaining({ userId: 2, type: 'link_requested' })]);
  });

  it('сторона с обеими ролями без initiatedBy считается тренером', async () => {
    const response = await post('/trainer-club-links', asOwner, { trainerId: 1, clubId: 1 });

    expect(response.body.data.initiatedBy).toBe('trainer');
  });

  // ⚠️ Шаг 35.10, решение заказчика 22. Единственное исключение из общего потока:
  // когда обе стороны принадлежат одному человеку, признавать связь нечем и
  // спрашивать некого. Живой случай — у человека свой зал, и он же ведёт там
  // персоналки помимо своих сотрудников.
  describe('обе стороны у одной учётной записи', () => {
    it('связь встаёт сразу подтверждённой, без ожидания', async () => {
      // Пользователь 2 управляет и клубом 1, и тренером 1.
      const response = await post('/trainer-club-links', asOwner, { trainerId: 1, clubId: 1 });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('confirmed');
      expect(response.body.data.approvedAt, 'подтверждение не отмечено временем').toBeDefined();
    });

    it('уведомления самому себе не уходит', async () => {
      await post('/trainer-club-links', asOwner, { trainerId: 1, clubId: 1 });

      const notifications = await harness.read<{ userId: number; type: string }[]>('notifications');

      expect(
        notifications.filter((item) => item.type === 'link_requested'),
        'человек получил заявку от самого себя',
      ).toHaveLength(0);
    });

    it('строки в ожидании не остаётся вовсе', async () => {
      // ⚠️ Кода ответа мало: важно, что промежуточного состояния не было.
      await post('/trainer-club-links', asOwner, { trainerId: 1, clubId: 1 });

      const links =
        await harness.read<{ trainerId: number; clubId: number; status: string }[]>(
          'trainer-club-links',
        );
      // Считаем связи ИМЕННО этой пары: в наборе есть и засеянные ожидающие связи
      // других пар, и они к делу не относятся.
      const ownPair = links.filter((link) => link.trainerId === 1 && link.clubId === 1);

      expect(ownPair.filter((link) => link.status === 'pending')).toHaveLength(0);
      expect(ownPair.filter((link) => link.status === 'confirmed')).toHaveLength(1);
    });

    it('связь с ЧУЖОЙ стороной по-прежнему ждёт подтверждения', async () => {
      // Контрольная группа: без неё «сразу подтверждено» неотличимо от
      // «подтверждается вообще всё».
      const response = await post('/trainer-club-links', asOwner, {
        trainerId: 3,
        clubId: 1,
        initiatedBy: 'club',
      });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('pending');

      const notifications = await harness.read<{ userId: number }[]>('notifications');
      expect(notifications, 'чужую сторону не уведомили').toEqual([
        expect.objectContaining({ userId: 5 }),
      ]);
    });
  });

  it('клуб приглашает стороннего тренера — initiatedBy=club', async () => {
    const response = await post('/trainer-club-links', asOwner, {
      trainerId: 3,
      clubId: 1,
      initiatedBy: 'club',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.initiatedBy).toBe('club');

    const notifications = await harness.read<{ userId: number }[]>('notifications');
    expect(notifications).toEqual([expect.objectContaining({ userId: 5 })]);
  });

  it('посторонний не может создать заявку — 403', async () => {
    // Контрольная группа к проверке выше: у пользователя 6 свои клуб и карточка
    // ЕСТЬ, но ни тренер 3, ни клуб 1 ему не принадлежат — сторон в этой паре
    // у него нет. Значит отказ приходит за владение, а не за «нет публикаций».
    const response = await post('/trainer-club-links', asOutsider, { trainerId: 3, clubId: 1 });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав для отправки запроса');

    const links = await harness.read<{ id: number }[]>('trainer-club-links');
    expect(links.map((link) => link.id)).toEqual([900]);
  });

  // Этап Э8a: сторона заявки — это владение, а не слово клиента.
  it('названная сторона обязана быть своей: тренер не выдаёт себя за клуб', async () => {
    // Дыра до этого этапа: `initiatedBy` приходил из тела и ни с чем не сверялся.
    // Назвавшись противоположной стороной, инициатор ставил связь в состояние,
    // где решение принимает ОН ЖЕ, — и подтверждал её за того, кого не спросили.
    const response = await post('/trainer-club-links', asTrainer, {
      trainerId: 3,
      clubId: 1,
      initiatedBy: 'club',
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав для отправки запроса');

    const links = await harness.read<{ id: number }[]>('trainer-club-links');
    expect(links.map((link) => link.id)).toEqual([900]);
  });

  it('и клуб не выдаёт себя за тренера — иначе он одобрит приглашение сам себе', async () => {
    const response = await post('/trainer-club-links', asOwner, {
      trainerId: 3,
      clubId: 1,
      initiatedBy: 'trainer',
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав для отправки запроса');
  });

  it('несуществующий тренер — 404', async () => {
    const response = await post('/trainer-club-links', asOwner, { trainerId: 99, clubId: 1 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Тренер не найден');
  });

  it('повторная заявка при активной связи — 409', async () => {
    await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
    const response = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Для этой пары уже существует активная связь');
  });

  it('заявку тренера подтверждает клуб', async () => {
    const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
    const response = await post(`/trainer-club-links/${created.body.data.id}/approve`, asOwner);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('confirmed');
    expect(response.body.data.approvedByUserId).toBe(2);
  });

  it('приглашение клуба подтверждает тренер, а сам клуб получает 403', async () => {
    const created = await post('/trainer-club-links', asOwner, {
      trainerId: 3,
      clubId: 1,
      initiatedBy: 'club',
    });
    const linkId = created.body.data.id;

    const selfApprove = await post(`/trainer-club-links/${linkId}/approve`, asOwner);
    expect(selfApprove.status).toBe(403);

    const trainerApprove = await post(`/trainer-club-links/${linkId}/approve`, asTrainer);
    expect(trainerApprove.status).toBe(200);
    expect(trainerApprove.body.data.status).toBe('confirmed');
  });

  it('чужая сторона не подтверждает и не отклоняет заявку', async () => {
    const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
    const linkId = created.body.data.id;

    // Пользователь 6 — сторона совсем другой пары публикаций.
    const approve = await post(`/trainer-club-links/${linkId}/approve`, asOutsider);
    expect(approve.status).toBe(403);
    expect(approve.body.error).toBe('Недостаточно прав для подтверждения связи');

    const reject = await post(`/trainer-club-links/${linkId}/reject`, asOutsider, {
      reason: 'Не хочу',
    });
    expect(reject.status).toBe(403);
    expect(reject.body.error).toBe('Недостаточно прав для отказа');

    // Состояние связи от чужих попыток не изменилось.
    const links = await harness.read<{ id: number; status: string }[]>('trainer-club-links');
    expect(links.find((link) => link.id === linkId)?.status).toBe('pending');
  });

  it('подтверждение не-pending связи — 409', async () => {
    const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
    await post(`/trainer-club-links/${created.body.data.id}/approve`, asOwner);
    const response = await post(`/trainer-club-links/${created.body.data.id}/approve`, asOwner);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Связь не в состоянии pending');
  });

  it('отказ пишет причину и уведомляет инициатора', async () => {
    const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
    const response = await post(`/trainer-club-links/${created.body.data.id}/reject`, asOwner, {
      reason: 'Нет мест',
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'rejected', rejectionReason: 'Нет мест' });

    const notifications = await harness.read<{ userId: number; type: string }[]>('notifications');
    expect(notifications.some((item) => item.type === 'link_rejected' && item.userId === 5)).toBe(
      true,
    );
  });

  it('после отказа можно подать заявку заново', async () => {
    const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
    await post(`/trainer-club-links/${created.body.data.id}/reject`, asOwner);
    const response = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });

    expect(response.status).toBe(201);
  });

  it('разрыв связи делает услуги тренера частными', async () => {
    const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
    const linkId = created.body.data.id;
    await post(`/trainer-club-links/${linkId}/approve`, asOwner);
    await harness.write('offerings', [
      {
        id: 1001,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'trainer',
        ownerId: 3,
        sportId: 3,
        title: 'Персональная',
        description: 'Описание',
        format: 'personal',
        price: 800,
        durationMinutes: 60,
        capacity: 1,
        address: 'ул. Ленина, 1',
        coordinates: { lat: 53.2, lng: 50.1 },
        trainerClubLinkId: linkId,
      },
    ]);
    // Запись коллекции пересобирает базу целиком, и выданные сессии гибнут вместе
    // с ней — cookie нужна новая.
    asTrainer = await harness.as(5);

    const response = await post(`/trainer-club-links/${linkId}/revoke`, asTrainer);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'revoked', revokedBy: 'trainer' });

    const offerings = await harness.read<{ trainerClubLinkId?: number }[]>('offerings');
    expect(offerings[0].trainerClubLinkId).toBeUndefined();
  });

  it('тренер отзывает собственную ещё не одобренную заявку', async () => {
    const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
    const response = await post(`/trainer-club-links/${created.body.data.id}/revoke`, asTrainer);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('revoked');
  });

  it('разрыв посторонним — 403, повторный разрыв — 409', async () => {
    const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
    const linkId = created.body.data.id;

    const stranger = await post(`/trainer-club-links/${linkId}/revoke`, asOutsider);
    expect(stranger.status).toBe(403);

    await post(`/trainer-club-links/${linkId}/revoke`, asTrainer);
    const again = await post(`/trainer-club-links/${linkId}/revoke`, asTrainer);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Связь уже завершена (rejected/revoked)');
  });

  describe('Список связей', () => {
    it('GET фильтрует по тренеру и статусу', async () => {
      await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
      const response = await get('/trainer-club-links?trainerId=3&status=pending', asTrainer);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });

    it('тренер видит только свои связи, чужая пара ему не видна', async () => {
      const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
      const response = await get('/trainer-club-links', asTrainer);

      expect(response.status).toBe(200);
      expect(response.body.data.map((link: { id: number }) => link.id)).toEqual([
        created.body.data.id,
      ]);
    });

    it('владелец клуба видит связь своего клуба, заведённую другой стороной', async () => {
      const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
      const response = await get('/trainer-club-links', asOwner);

      expect(response.body.data.map((link: { id: number }) => link.id)).toEqual([
        created.body.data.id,
      ]);
    });

    it('связь, где обе стороны свои, приходит один раз', async () => {
      const created = await post('/trainer-club-links', asOwner, { trainerId: 1, clubId: 1 });
      const response = await get('/trainer-club-links', asOwner);

      expect(response.body.data.map((link: { id: number }) => link.id)).toEqual([
        created.body.data.id,
      ]);
    });

    it('фильтр по чужому тренеру не открывает чужих связей', async () => {
      // Пользователь 2 просит связи тренера 4 — тренер не его. В выдаче могут
      // остаться только пары «тренер 4 + мой клуб», а таких нет.
      const response = await get('/trainer-club-links?trainerId=4', asOwner);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('обе стороны фильтра чужие — пустая выдача', async () => {
      const response = await get('/trainer-club-links?trainerId=4&clubId=2', asOwner);

      expect(response.body.data).toEqual([]);
    });

    it('спортсмену связи не принадлежат — список пуст', async () => {
      await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
      const response = await get('/trainer-club-links', asAthlete);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('администратор видит все связи платформы', async () => {
      const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
      const response = await get('/trainer-club-links', asAdmin);

      expect(response.status).toBe(200);
      expect(response.body.data.map((link: { id: number }) => link.id).sort()).toEqual(
        [900, created.body.data.id].sort(),
      );
    });

    it('свежие связи идут первыми', async () => {
      const first = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
      const second = await post('/trainer-club-links', asOwner, { trainerId: 1, clubId: 1 });

      // Обе связи принадлежат пользователю 2 разными сторонами — порядок склейки
      // обязан совпасть с порядком одного запроса: свежие первыми.
      const response = await get('/trainer-club-links', asOwner);

      expect(response.body.data.map((link: { id: number }) => link.id)).toEqual([
        second.body.data.id,
        first.body.data.id,
      ]);
    });
  });

  it('нечисловой идентификатор связи отклоняется', async () => {
    const response = await post('/trainer-club-links/abc/approve', asOwner);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректный id связи');
  });

  it('подтверждение без тела проходит — личность в теле больше не нужна', async () => {
    const created = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 1 });
    const response = await request(harness.app.getHttpServer())
      .post(`/api/trainer-club-links/${created.body.data.id}/approve`)
      .set('Cookie', asOwner);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('confirmed');
  });

  it('неизвестное состояние в фильтре отклоняется', async () => {
    const response = await get('/trainer-club-links?status=broken', asOwner);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные параметры запроса');
  });

  it('заявка на несуществующий клуб — не найдено', async () => {
    const response = await post('/trainer-club-links', asTrainer, { trainerId: 3, clubId: 99 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Клуб не найден');
  });
});

/**
 * Ради этой проверки маршрут и открыт гостю.
 *
 * ⚠️ Закрытый целиком, он уронил публичную витрину: главная страница отдавала 500,
 * потому что карточки тренеров показывают привязку к клубу. Ни один тест этого
 * не поймал — нашлось только на поднятом приложении. Проверка живёт отдельным
 * набором, чтобы падение было видно по имени.
 */
describe('Витрина без входа', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('links-public');
  });

  beforeEach(async () => {
    // Общий набор плюс срез с подтверждённой связью: второй дополняет первый,
    // а не заменяет — иначе не хватит справочников и публикаций.
    await harness.writeMany({ ...fixtureCollections, ...fixtureConfirmedLinkCollections });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('гость получает подтверждённые связи и ничего сверх', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/api/trainer-club-links?status=confirmed',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(
      response.body.data.every((link: { status: string }) => link.status === 'confirmed'),
    ).toBe(true);
  });
});
