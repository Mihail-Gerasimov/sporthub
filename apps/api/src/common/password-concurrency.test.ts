// Сторож ограничителя одновременных расчётов пароля (Phase 34, шаг 34.8).
//
// Что именно тут защищается. argon2id выделяет 19 МБ на КАЖДЫЙ расчёт и держит
// их всё время работы. Без ограничителя сотня одновременных входов — это сотня
// расчётов и почти два гигабайта разом, то есть форма входа превращается
// в способ выесть память боевой машины. Ослабить параметры хеша нельзя — в них
// и есть стойкость, поэтому ограничивается число одновременных расчётов.
//
// Проверяются четыре свойства, каждое закрывает свой способ сломать это молча:
// 1) внутрь пускается не больше разрешённого — иначе ограничителя просто нет;
// 2) лишние ЖДУТ и все доезжают — отказ вместо ожидания сломал бы вход честному
//    пользователю в час пик (перебором занимается ограничение частоты, не это);
// 3) обслуживание по порядку обращения — иначе под нагрузкой чей-то вход
//    может ждать сколь угодно долго;
// 4) ошибка внутри операции освобождает место — иначе несколько испорченных
//    строк хеша навсегда заклинили бы вход всему сайту.
//
// Реальный путь (`hashPassword` / `verifyPassword`) меряется не по внутренним
// счётчикам очереди, а обёрткой вокруг самой библиотеки: считается, сколько
// расчётов argon2 идёт одновременно. Снятая обёртка очереди красит этот набор.

import { describe, expect, it, vi } from 'vitest';

/**
 * Счётчик одновременных расчётов внутри библиотеки. Поднимается через
 * `vi.hoisted`, потому что фабрика `vi.mock` выполняется раньше остального файла.
 */
const argon2Probe = vi.hoisted(() => {
  const state = { inFlight: 0, peak: 0 };

  return {
    state,
    reset(): void {
      state.inFlight = 0;
      state.peak = 0;
    },
    async track<T>(work: () => Promise<T>): Promise<T> {
      state.inFlight += 1;
      state.peak = Math.max(state.peak, state.inFlight);

      try {
        return await work();
      } finally {
        state.inFlight -= 1;
      }
    },
  };
});

// Библиотека остаётся настоящей: считается настоящий argon2id, обёртка только
// ведёт счёт одновременных расчётов.
vi.mock('@node-rs/argon2', async () => {
  const actual = await vi.importActual<typeof import('@node-rs/argon2')>('@node-rs/argon2');

  return {
    ...actual,
    hash: (...args: Parameters<typeof actual.hash>) =>
      argon2Probe.track(() => actual.hash(...args)),
    verify: (...args: Parameters<typeof actual.verify>) =>
      argon2Probe.track(() => actual.verify(...args)),
  };
});

import {
  ConcurrencyQueue,
  DEFAULT_PASSWORD_CONCURRENCY,
  PASSWORD_CONCURRENCY_ENV_NAME,
  hashPassword,
  passwordQueue,
  resolvePasswordConcurrency,
  verifyPassword,
} from './password';

/** Пауза, чтобы операции очереди реально накладывались во времени. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Обещание, которым управляет сам тест: нужен точный момент завершения операции. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

describe('Очередь расчётов: сколько пускает внутрь', () => {
  it('одновременно внутри не больше разрешённого, и ни один вызов не потерян', async () => {
    const queue = new ConcurrencyQueue(3);
    let inside = 0;
    let peak = 0;

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        queue.run(async () => {
          inside += 1;
          peak = Math.max(peak, inside);
          await delay(4);
          inside -= 1;

          return index;
        }),
      ),
    );

    expect(peak).toBe(3);
    // Все двенадцать доехали, и результат каждого лежит на месте своего вызова.
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // Очередь вернулась в исходное состояние — места не утекли.
    expect(queue.inFlight).toBe(0);
    expect(queue.queued).toBe(0);
  });

  it('вызовы, пришедшие в разгар работы, не пролезают сверх предела', async () => {
    // Одной волны мало: предел легко удержать на старте и потерять потом, когда
    // очередь уже разбирает хвост, а сверху досыпают новые вызовы.
    const queue = new ConcurrencyQueue(2);
    let inside = 0;
    let peak = 0;

    const work = () =>
      queue.run(async () => {
        inside += 1;
        peak = Math.max(peak, inside);
        await delay(3);
        inside -= 1;
      });

    const first = Array.from({ length: 6 }, work);
    await delay(4);
    // Вторая волна приходит, когда очередь уже разбирает первую.
    const second = Array.from({ length: 6 }, work);

    await Promise.all([...first, ...second]);

    expect(peak).toBe(2);
    expect(queue.inFlight).toBe(0);
  });

  it('вызов, пришедший вплотную к освобождению места, ждёт своей очереди', async () => {
    // Момент передачи места — самое узкое место очереди: одна операция уже
    // закончилась, ждущий ещё не продолжился. Вызов, попавший ровно сюда, не
    // должен ни начаться раньше ждущего, ни оказаться внутри вместе с ним.
    // Моменты задаются обещаниями, а не паузами: на паузе такой зазор не поймать.
    const queue = new ConcurrencyQueue(1);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    let inside = 0;
    let peak = 0;

    const start = (index: number) =>
      queue.run(async () => {
        started.push(index);
        inside += 1;
        peak = Math.max(peak, inside);
        await gates[index].promise;
        inside -= 1;
      });

    const first = start(0); // занял единственное место
    const second = start(1); // встал в очередь
    let third: Promise<void> | undefined;

    // Третий приходит не из отдельной паузы, а подпиской на то же обещание,
    // которым заканчивается первая операция.
    void gates[0].promise.then(() => {
      third = start(2);
    });

    gates[0].resolve();
    await first;
    await delay(0);

    // Внутри по-прежнему одна операция, третий — в очереди, а не рядом со вторым.
    expect(peak).toBe(1);
    expect(queue.inFlight).toBe(1);
    expect(queue.queued).toBe(1);

    gates[1].resolve();
    gates[2].resolve();
    await Promise.all([second, third]);

    expect(peak).toBe(1);
    expect(started).toEqual([0, 1, 2]);
    expect(queue.inFlight).toBe(0);
    expect(queue.queued).toBe(0);
  });

  it('лишние вызовы ждут в очереди, а не получают отказ', async () => {
    const queue = new ConcurrencyQueue(2);

    const running = Array.from({ length: 6 }, (_, index) =>
      queue.run(async () => {
        await delay(5);

        return index;
      }),
    );

    // Пока первые два считаются, остальные четверо стоят в очереди —
    // именно стоят, а не отбиты ошибкой.
    await delay(1);
    expect(queue.inFlight).toBe(2);
    expect(queue.queued).toBe(4);

    const outcomes = await Promise.allSettled(running);

    expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(true);
    expect(outcomes.map((outcome) => (outcome as PromiseFulfilledResult<number>).value)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });
});

describe('Очередь расчётов: порядок обслуживания', () => {
  it('операции начинаются в порядке обращения, а не как сложится', async () => {
    const queue = new ConcurrencyQueue(1);
    const started: number[] = [];

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        queue.run(async () => {
          started.push(index);
          // Длительности убывают: если бы очередь была не честной, порядок
          // старта поехал бы вслед за ними.
          await delay(6 - index);
        }),
      ),
    );

    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('Очередь расчётов: живучесть', () => {
  it('ошибка внутри операции не заклинивает очередь', async () => {
    const queue = new ConcurrencyQueue(2);

    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        queue.run(async () => {
          await delay(2);

          if (index % 2 === 0) throw new Error(`операция ${index} сломалась`);

          return index;
        }),
      ),
    );

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'rejected',
      'fulfilled',
      'rejected',
      'fulfilled',
      'rejected',
      'fulfilled',
    ]);
    // Главное: места вернулись, и очередь продолжает работать.
    expect(queue.inFlight).toBe(0);
    expect(queue.queued).toBe(0);
    await expect(queue.run(async () => 'жива')).resolves.toBe('жива');
  });

  it('исключение до первого ожидания тоже освобождает место', async () => {
    const queue = new ConcurrencyQueue(1);

    await expect(
      queue.run((): Promise<never> => {
        throw new Error('сломалась сразу');
      }),
    ).rejects.toThrow('сломалась сразу');

    expect(queue.inFlight).toBe(0);
    await expect(queue.run(async () => 'жива')).resolves.toBe('жива');
  });
});

describe('Предел одновременных расчётов берётся из окружения', () => {
  it('по умолчанию — четыре расчёта', () => {
    expect(DEFAULT_PASSWORD_CONCURRENCY).toBe(4);
    expect(resolvePasswordConcurrency(undefined)).toBe(4);
  });

  it('заданное число применяется как есть — поднять предел можно без пересборки', () => {
    expect(resolvePasswordConcurrency('2')).toBe(2);
    expect(resolvePasswordConcurrency('16')).toBe(16);
  });

  it('мусорное значение не снимает ограничитель', () => {
    // Опечатка в окружении не должна ни отключать защиту, ни запирать вход
    // насовсем: `0` и `-1` означали бы «не пускать никого».
    for (const raw of ['', ' ', '0', '-1', '2.5', 'много', 'NaN']) {
      expect(resolvePasswordConcurrency(raw), raw).toBe(DEFAULT_PASSWORD_CONCURRENCY);
    }
  });

  it('общая очередь собрана по этой переменной', () => {
    expect(PASSWORD_CONCURRENCY_ENV_NAME).toBe('SPORT_HUB_PASSWORD_HASH_CONCURRENCY');
    expect(passwordQueue.limit).toBe(
      resolvePasswordConcurrency(process.env[PASSWORD_CONCURRENCY_ENV_NAME]),
    );
  });
});

describe('Хеширование и сверка идут через очередь', () => {
  // Расчёты настоящие и медленные — десяти хватает, чтобы предел (по умолчанию
  // четыре) заведомо был превышен без ограничителя.
  const CALLS = 10;

  it('десять одновременных хеширований дают не больше разрешённого расчётов разом', async () => {
    argon2Probe.reset();

    const hashes = await Promise.all(
      Array.from({ length: CALLS }, (_, index) => hashPassword(`пароль-${index}`)),
    );

    expect(hashes).toHaveLength(CALLS);
    expect(new Set(hashes).size).toBe(CALLS);
    // Без ограничителя тут было бы CALLS.
    expect(argon2Probe.state.peak).toBeLessThanOrEqual(passwordQueue.limit);
    // Очередь при этом реально загружена, а не считает по одному.
    expect(argon2Probe.state.peak).toBe(passwordQueue.limit);
    expect(passwordQueue.inFlight).toBe(0);
  }, 30_000);

  it('сверка тоже стоит в общей очереди — память ест и она', async () => {
    const stored = await hashPassword('общий-пароль');

    argon2Probe.reset();

    const answers = await Promise.all(
      Array.from({ length: CALLS }, (_, index) =>
        verifyPassword(stored, index % 2 === 0 ? 'общий-пароль' : 'не-он'),
      ),
    );

    expect(answers).toEqual([true, false, true, false, true, false, true, false, true, false]);
    expect(argon2Probe.state.peak).toBeLessThanOrEqual(passwordQueue.limit);
    expect(argon2Probe.state.peak).toBe(passwordQueue.limit);
    expect(passwordQueue.inFlight).toBe(0);
    expect(passwordQueue.queued).toBe(0);
  }, 30_000);

  it('испорченный хеш не отнимает место в очереди у следующих проверок', async () => {
    // Пустая строка отбивается до очереди, а исключение библиотеки на мусоре
    // ловится внутри — в обоих случаях очередь должна остаться чистой.
    expect(await verifyPassword('', 'что угодно')).toBe(false);
    expect(await verifyPassword('не-хеш-вовсе', 'что угодно')).toBe(false);
    expect(await verifyPassword('$argon2id$сломано', 'что угодно')).toBe(false);

    expect(passwordQueue.inFlight).toBe(0);
    expect(passwordQueue.queued).toBe(0);

    const stored = await hashPassword('всё-ещё-работает');
    expect(await verifyPassword(stored, 'всё-ещё-работает')).toBe(true);
  });
});
