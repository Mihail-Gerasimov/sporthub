// Вход обязан делать ОДНУ И ТУ ЖЕ работу при известной и неизвестной почте
// (дыра d-22, найденная прогоном диверсий фазы 34).
//
// ЧТО ЛОМАЕТСЯ В БОЮ, ЕСЛИ ПРОВЕРКИ НЕТ. Ответы входа уже сделаны неразличимыми
// по коду и тексту (`auth.controller.test.ts`), но у ответа есть третий признак —
// время. Расчёт argon2id стоит десятки миллисекунд, и если при неизвестной почте
// его не делать, ответ приходит заметно раньше. Тогда вход снова становится
// перечислителем аккаунтов: почты перебираются секундомером, ни одного пароля
// знать не нужно. Ради этого в контроллере и живёт `DUMMY_HASH` — сверка идёт
// всегда, даже когда сверять не с чем.
//
// ⚠️ ПОЧЕМУ НЕ ЗАМЕР ВРЕМЕНИ. Порог вида «разница меньше N мс» на общей машине
// мигает: сборка мусора, соседний прогон и первый холодный вызов argon2 дают
// разброс больше самой измеряемой величины. Такой тест либо краснеет на здоровом
// коде, либо (после подгонки порога) перестаёт краснеть на больном — то есть
// не проверяет ничего.
//
// ПОЭТОМУ ПРОВЕРЯЕТСЯ РАБОТА, А НЕ ЕЁ ДЛИТЕЛЬНОСТЬ: сверка пароля подменяется
// счётчиком поверх настоящей реализации, и набор смотрит, сколько раз она позвана
// и С ЧЕМ. Одинаковое число вызовов и одинаково дорогой аргумент означают
// одинаковую работу — а значит и неотличимое время, но без секундомера в тесте.

import { verify } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PASSWORD_HASH_PREFIX, verifyPassword } from '../common/password';
import {
  DEMO_PASSWORD,
  DEMO_PASSWORD_HASH,
  createTestHarness,
  type TestHarness,
} from '../test/harness';

// Подменяется ровно одна функция, остальной модуль настоящий: сверка обязана
// по-прежнему считать argon2, иначе набор проверял бы поведение заглушки.
vi.mock('../common/password', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../common/password')>();

  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const verifySpy = vi.mocked(verifyPassword);

const user = (id: number, email: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'athlete',
  status: 'active',
  name: `Пользователь ${id}`,
  email,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('Вход не выдаёт заведённые почты временем ответа', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('login-timing');
  });

  beforeEach(async () => {
    await harness.write('users', [user(1, 'athlete@test.local')]);
    verifySpy.mockClear();
  });

  afterAll(async () => {
    await harness.close();
  });

  /** Одна попытка входа. */
  const attempt = (email: string, password: string) =>
    request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, accountType: 'athlete', password });

  it('неизвестная почта всё равно доходит до сверки пароля — ровно один раз', async () => {
    const response = await attempt('nobody@test.local', DEMO_PASSWORD);

    expect(response.status).toBe(401);
    // Ноль вызовов — это и есть утечка: ответ вернулся бы без расчёта argon2,
    // то есть на порядок быстрее ответа по заведённой почте.
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });

  it('при неизвестной почте сверка получает настоящий argon2-хеш, а не пустую строку', async () => {
    await attempt('nobody@test.local', DEMO_PASSWORD);

    const [storedHash, candidate] = verifySpy.mock.calls[0] ?? [];

    // Пустую строку `verifyPassword` отбивает ДО очереди и возвращает `false`
    // мгновенно — вызов был бы, а работы не было бы, и время снова разошлось бы.
    expect(storedHash?.slice(0, PASSWORD_HASH_PREFIX.length)).toBe(PASSWORD_HASH_PREFIX);
    // Пароль передаётся настоящий: сверка с пустым кандидатом тоже стоила бы дешевле.
    expect(candidate).toBe(DEMO_PASSWORD);
  });

  it('фиктивный хеш разбираем библиотекой — иначе сверка отвалится исключением сразу', async () => {
    await attempt('nobody@test.local', DEMO_PASSWORD);

    const [storedHash] = verifySpy.mock.calls[0] ?? [];

    // Испорченный хеш argon2 роняет исключением на разборе заголовка, не считая
    // ничего; `verifyPassword` это исключение проглатывает и отвечает `false`.
    // Снаружи выглядело бы правильно — а по времени всё равно выдавало бы,
    // что почты нет. Поэтому хеш проверяется на пригодность настоящей библиотекой.
    await expect(verify(storedHash as string, 'любой пароль')).resolves.toBe(false);
  });

  it('известная почта с неверным паролем делает ровно ту же работу', async () => {
    await attempt('athlete@test.local', 'не тот пароль');

    const knownEmailCalls = verifySpy.mock.calls.length;

    verifySpy.mockClear();
    await attempt('nobody@test.local', 'не тот пароль');

    // Суть проверки — в совпадении: сколько расчётов стоит промах по заведённой
    // почте, столько же должен стоить промах по незаведённой.
    expect(verifySpy.mock.calls.length).toBe(knownEmailCalls);
  });
});
