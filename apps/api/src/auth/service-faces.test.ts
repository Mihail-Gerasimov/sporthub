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

type Face = { kind: string; id: number; name: string };

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

  async function facesOf(userId: number): Promise<Face[]> {
    const response = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', await harness.as(userId));

    expect(response.status).toBe(200);

    return ((response.body as { data?: { faces?: Face[] } }).data?.faces ?? []) as Face[];
  }

  it('владелец получает свои лица, и обоих видов', async () => {
    const faces = await facesOf(OWNER_ID);

    expect(faces.length, 'список лиц владельца пуст — кабинет лица не откроется').toBeGreaterThan(
      0,
    );
    expect(faces.some((face) => face.kind === 'club'), 'клубов в списке нет').toBe(true);
    expect(
      faces.some((face) => face.kind === 'trainer'),
      'карточек тренера в списке нет',
    ).toBe(true);
  });

  it('каждое названное лицо принадлежит именно ему', async () => {
    // ⚠️ Главная половина проверки. Список, в который попали чужие лица, открывает
    // их кабинеты: адрес сверяется с этим же списком.
    const faces = await facesOf(OWNER_ID);

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

    const faces = await facesOf(OWNER_ID);

    expect(faces.length, 'число лиц в ответе разошлось с базой').toBe(expected);
  });

  it('у человека без лиц список пуст', async () => {
    expect(await facesOf(ATHLETE_ID)).toEqual([]);
  });

  it('у лица есть имя — переключателю нечего показать без него', async () => {
    const faces = await facesOf(OWNER_ID);

    for (const face of faces) {
      expect(String(face.name ?? ''), `у лица ${face.kind}:${face.id} пустое имя`).not.toBe('');
    }
  });
});
