// Лица услуг в ответе «кто я» (шаги 35.21, 35.31, 35.33).
//
// Список лиц — это то, из чего кабинет узнаёт, какие адреса человеку открыты,
// а переключатель лица — что показать. Ошибиться здесь можно в две стороны,
// и обе тихие: пустой список запирает владельца в его же кабинете, а список
// всех лиц площадки открывает чужие.
//
// ⚠️ Своего дома у этого контракта до сих пор не было: список лиц проверялся
// косвенно, через каталог. Такой тест краснеет не всегда и объясняет плохо.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from '../test/harness';

/** Владелец лиц: у него и клубы, и карточки тренера. */
const OWNER_ID = 2;
/** Человек без единого лица. */
const ATHLETE_ID = 1;

type Face = { kind: string; id: number; name: string; status?: string };

/**
 * Лица человека из ответа «кто я».
 *
 * Объявлен на модуль, а не внутри набора: тем же вопросом пользуются оба набора
 * ниже, и вторая копия разошлась бы с первой на первой же правке контракта.
 */
async function facesOfIn(harness: TestHarness, userId: number): Promise<Face[]> {
  const response = await request(harness.app.getHttpServer())
    .get('/api/auth/me')
    .set('Cookie', await harness.as(userId));

  expect(response.status).toBe(200);

  return ((response.body as { data?: { faces?: Face[] } }).data?.faces ?? []) as Face[];
}

describe('Лица услуг в ответе «кто я»', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('auth-service-faces');
  });

  beforeEach(async () => {
    await harness.writeMany(fixtureCollections);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('владелец получает свои лица, и обоих видов', async () => {
    const faces = await facesOfIn(harness, OWNER_ID);

    expect(faces.length, 'список лиц владельца пуст — кабинет лица не откроется').toBeGreaterThan(
      0,
    );
    expect(
      faces.some((face) => face.kind === 'club'),
      'клубов в списке нет',
    ).toBe(true);
    expect(
      faces.some((face) => face.kind === 'trainer'),
      'карточек тренера в списке нет',
    ).toBe(true);
  });

  it('каждое названное лицо принадлежит именно ему', async () => {
    // ⚠️ Главная половина проверки. Список, в который попали чужие лица, открывает
    // их кабинеты: адрес сверяется с этим же списком.
    const faces = await facesOfIn(harness, OWNER_ID);

    const clubs = await harness.read<{ id: number; managedByUserId?: number }[]>('clubs');
    const trainers = await harness.read<{ id: number; managedByUserId?: number }[]>('trainers');

    for (const face of faces) {
      const rows = face.kind === 'club' ? clubs : trainers;
      const row = rows.find((item) => item.id === face.id);

      expect(row, `лицо ${face.kind}:${face.id} в базе не найдено`).toBeDefined();
      expect(
        row?.managedByUserId,
        `в списке лиц человека ${OWNER_ID} оказалось чужое ${face.kind}:${face.id}`,
      ).toBe(OWNER_ID);
    }
  });

  it('в списке ВСЕ его лица, а не первое попавшееся', async () => {
    // Отбор, потерявший половину лиц, выглядит рабочим: кабинет открывается,
    // просто одного клуба в переключателе нет. Считаем по базе.
    const clubs = await harness.read<{ id: number; managedByUserId?: number }[]>('clubs');
    const trainers = await harness.read<{ id: number; managedByUserId?: number }[]>('trainers');
    const expected =
      clubs.filter((row) => row.managedByUserId === OWNER_ID).length +
      trainers.filter((row) => row.managedByUserId === OWNER_ID).length;

    const faces = await facesOfIn(harness, OWNER_ID);

    expect(faces.length, 'число лиц в ответе разошлось с базой').toBe(expected);
  });

  it('у человека без лиц список пуст', async () => {
    expect(await facesOfIn(harness, ATHLETE_ID)).toEqual([]);
  });

  it('у лица есть имя — переключателю нечего показать без него', async () => {
    const faces = await facesOfIn(harness, OWNER_ID);

    for (const face of faces) {
      expect(String(face.name ?? ''), `у лица ${face.kind}:${face.id} пустое имя`).not.toBe('');
    }
  });
});

describe('Статус лица в ответе «кто я»', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('auth-face-status');
  });

  beforeEach(async () => {
    await harness.writeMany(fixtureCollections);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('лицо несёт свой статус — иначе архив от живого не отличить', async () => {
    // ⚠️ Найдено полным браузерным прогоном (35.44a). Владелец, убравший своё лицо,
    // не удаляет его: публикация уходит из каталога, а записи, отзывы и связи
    // остаются. Значит лицо обязано остаться и в списке — вернуть его иначе неоткуда.
    // Но остаться МОЛЧА оно не должно: кабинет архивированного клуба выглядел ровно
    // как живой, и человек не понимал, почему клуба нигде не видно.
    const clubs = await harness.read<{ id: number; managedByUserId?: number }[]>('clubs');
    const own = clubs.find((club) => club.managedByUserId === OWNER_ID);

    expect(own, 'в фикстурах нет клуба владельца').toBeDefined();

    const response = await request(harness.app.getHttpServer())
      .delete(`/api/clubs/${own?.id}`)
      .set('Cookie', await harness.as(OWNER_ID));

    expect([200, 204], `архивирование ответило ${response.status}`).toContain(response.status);

    const faces = await facesOfIn(harness, OWNER_ID);
    const archived = faces.find((face) => face.kind === 'club' && face.id === own?.id);

    expect(archived, 'архивированное лицо пропало из списка').toBeDefined();
    expect(
      (archived as { status?: string })?.status,
      'архивированное лицо не помечено убранным из каталога',
    ).toBe('hidden');
  });

  it('живое лицо архивным не помечается', async () => {
    // Контрольная группа: без неё «помечено» неотличимо от «помечены все».
    const faces = await facesOfIn(harness, OWNER_ID);

    expect(
      faces.filter((face) => (face as { status?: string }).status === 'hidden'),
      'живые лица помечены архивными',
    ).toEqual([]);
  });
});
