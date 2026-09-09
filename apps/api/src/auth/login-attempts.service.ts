// Нарастающая блокировка входа (шаг 34.51a).
//
// РЕШЕНИЕ ЗАКАЗЧИКА от 08.09.2026: пять неверных попыток — минута ожидания,
// следующие пять — две, дальше по минуте за каждые пять; потолок — тридцать минут;
// верный пароль обнуляет счёт.
//
// ПОЧЕМУ НЕ ОДНО ОБЩЕЕ ОГРАНИЧЕНИЕ ЧАСТОТЫ. Ограничитель из `rate-limit.ts` считает
// ВСЕ обращения к маршруту и отбивает их одинаково. Здесь нужно другое: честный
// человек, промахнувшийся паролем дважды, не должен ощутить ничего, а подбор обязан
// упереться в растущее ожидание. Поэтому считаются только НЕУДАЧИ, и счёт обнуляет
// верный пароль.
//
// ⚠️ ПОЧЕМУ СЧЁТЧИКА ДВА И ПОЧЕМУ ПОРОГИ У НИХ РАЗНЫЕ. Один счётчик по почте
// означал бы, что, зная чужой адрес, вход её владельцу можно держать закрытым
// (заказчик про это знает и выбрал блокировать; смягчение — потолок в полчаса).
// Один счётчик по адресу обращения означал бы обратную беду: за общим выходом
// в сеть сидит целый офис, и пять промахов одного человека закрыли бы вход всем.
// Поэтому счётчика два, и порог у адреса заметно выше: он ловит не подбор ОДНОГО
// пароля, а перебор ПО МНОГИМ учётным записям с одного места, где каждой почте
// достаётся по одной-две попытки и её собственный счётчик молчит.
//
// ⚠️ СЧЁТЧИКИ ЖИВУТ В ПАМЯТИ ПРОЦЕССА — как и у ограничителя частоты. Про хранилище
// знает только этот класс: переезд на общее (Redis) не заденет ни контроллер, ни
// формат ответа. Сделать это придётся вместе со вторым процессом бэкенда: сейчас
// перезапуск обнуляет счёт, а два процесса дадут два независимых счёта.

import { Injectable } from '@nestjs/common';

import { TooManyRequestsError } from '../common/domain-error';

/** Начало текста отказа. Срок ожидания дописывается к нему числом. */
export const LOGIN_BLOCKED_PREFIX = 'Слишком много неудачных попыток входа. Повторите через ';

/** Чем опознаётся попытка входа: почтой из формы и адресом обращения. */
export type LoginAttemptKeys = {
  /** Почта из тела запроса — как её ввели, приведение делает сам сервис. */
  email: string;
  /** Адрес обращения; за прокси его даёт `trust proxy`. Может отсутствовать. */
  ip: string | undefined;
};

/** Настройки лестницы ожидания. Значения по умолчанию — решение заказчика. */
export type LoginLockoutSettings = {
  /** Неудач по одной почте на ступень ожидания. */
  attempts: number;
  /** Неудач с одного адреса на ступень ожидания. */
  ipAttempts: number;
  /** Длина одной ступени. */
  stepMs: number;
  /** Потолок ожидания: дальше ступени не растут. */
  maxMs: number;
  /** Через сколько после последней неудачи счёт забывается сам. */
  memoryMs: number;
};

/** Настройки из окружения. Пределы — решение выкатки, а не запроса. */
export function readLoginLockoutSettings(
  env: NodeJS.ProcessEnv = process.env,
): LoginLockoutSettings {
  return {
    attempts: readPositiveInt(env.SPORT_HUB_LOGIN_LOCKOUT_ATTEMPTS, 5),
    // Вчетверо выше почтового: см. пояснение про общий выход в сеть в шапке файла.
    ipAttempts: readPositiveInt(env.SPORT_HUB_LOGIN_LOCKOUT_IP_ATTEMPTS, 20),
    stepMs: readPositiveInt(env.SPORT_HUB_LOGIN_LOCKOUT_STEP_MS, 60_000),
    maxMs: readPositiveInt(env.SPORT_HUB_LOGIN_LOCKOUT_MAX_MS, 30 * 60_000),
    memoryMs: readPositiveInt(env.SPORT_HUB_LOGIN_LOCKOUT_MEMORY_MS, 60 * 60_000),
  };
}

/**
 * Разбор значения окружения: всё, что не целое положительное число, считается
 * не заданным. Опечатка не должна тихо снимать защиту или запирать вход навсегда.
 */
function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return parsed;
}

/** Счёт по одному ключу. */
type AttemptRecord = {
  /** Неудач подряд с последнего успеха. */
  failures: number;
  /** До какого времени вход по этому ключу закрыт (метка времени). */
  blockedUntil: number;
  /** Когда счёт трогали в последний раз — по нему запись забывается. */
  touchedAt: number;
};

/** Как часто выметать забытые записи. Реже — память, чаще — лишняя работа. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Срок ожидания словами: до минуты — в секундах, дальше — в минутах.
 *
 * Человеку нужно понимать, ждать ему полминуты или полчаса; «429» без срока
 * выглядит как поломка сайта.
 */
export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) return `${seconds} сек`;

  return `${Math.ceil(seconds / 60)} мин`;
}

@Injectable()
export class LoginAttemptsService {
  private readonly settings = readLoginLockoutSettings();

  /** Ключ → счёт. Ключ несёт свой вид: `email:` или `ip:`. */
  private readonly records = new Map<string, AttemptRecord>();

  private lastSweepAt = 0;

  /**
   * Пустить или отказать. Зовётся ДО сверки пароля: смысл блокировки в том числе
   * и в том, чтобы подбор не заставлял сервер считать argon2 (19 МБ на расчёт).
   */
  assertAllowed(keys: LoginAttemptKeys): void {
    const now = Date.now();
    let waitMs = 0;

    for (const { key } of this.keysOf(keys)) {
      const record = this.records.get(key);

      if (record === undefined) continue;

      // Ждать придётся по самому строгому из ключей — иначе отказ называл бы
      // срок меньше настоящего, и человек возвращался бы в закрытую дверь.
      waitMs = Math.max(waitMs, record.blockedUntil - now);
    }

    if (waitMs <= 0) return;

    throw new TooManyRequestsError(
      `${LOGIN_BLOCKED_PREFIX}${formatWait(waitMs)}.`,
      Math.ceil(waitMs / 1000),
    );
  }

  /** Отметить неудачу и, если пора, включить очередную ступень ожидания. */
  registerFailure(keys: LoginAttemptKeys): void {
    const now = Date.now();

    this.sweep(now);

    for (const { key, step } of this.keysOf(keys)) {
      const previous = this.records.get(key);
      // Давняя неудача забывается: иначе один промах в понедельник и четыре
      // в пятницу складывались бы в блокировку на ровном месте.
      const failures =
        previous === undefined || now - previous.touchedAt > this.settings.memoryMs
          ? 1
          : previous.failures + 1;

      const record: AttemptRecord = {
        failures,
        blockedUntil: previous?.blockedUntil ?? 0,
        touchedAt: now,
      };

      // Ступень включается ровно на кратной попытке: пятая, десятая, пятнадцатая.
      // Между ними ждать не нужно — предыдущее ожидание уже отбыто.
      if (failures % step === 0) {
        const stepNumber = failures / step;

        record.blockedUntil =
          now + Math.min(stepNumber * this.settings.stepMs, this.settings.maxMs);
      }

      this.records.set(key, record);
    }
  }

  /**
   * Верный пароль: счёт по обоим ключам обнуляется.
   *
   * ⚠️ Обнуление счёта АДРЕСА по чужому успешному входу — известная слабина: тот,
   * у кого есть своя учётка, может сбрасывать себе счётчик адреса. Это решение
   * заказчика («верный пароль обнуляет счётчик»), и оно осознанно: счётчик почты,
   * который и защищает конкретную учётную запись, при этом не трогается.
   */
  registerSuccess(keys: LoginAttemptKeys): void {
    for (const { key } of this.keysOf(keys)) {
      this.records.delete(key);
    }
  }

  /**
   * Забыть всё. Нужно наборам, которые нарочно переполняют счёт: приложение у них
   * одно на файл, и блокировка одной проверки досталась бы следующей. В рабочем
   * коде не зовётся — там счёт истекает сам.
   */
  reset(): void {
    this.records.clear();
    this.lastSweepAt = 0;
  }

  /**
   * Ключи одной попытки со своим порогом у каждого.
   *
   * Почта приводится к нижнему регистру и без пробелов: иначе `User@mail` и
   * `user@mail ` считались бы порознь, и порог обходился бы регистром букв.
   */
  private keysOf({ email, ip }: LoginAttemptKeys): { key: string; step: number }[] {
    const keys = [{ key: `email:${email.trim().toLowerCase()}`, step: this.settings.attempts }];

    // Адреса может не быть вовсе (внутренний вызов, необычный транспорт) —
    // тогда работает только счётчик почты.
    if (ip) keys.push({ key: `ip:${ip}`, step: this.settings.ipAttempts });

    return keys;
  }

  /**
   * Вымести забытые записи. Без этого карта росла бы на каждую новую почту, то есть
   * перебор по случайным адресам почты стал бы способом выесть память процесса.
   * Проход редкий — раз в минуту, а не на каждую попытку.
   */
  private sweep(now: number): void {
    if (now - this.lastSweepAt < SWEEP_INTERVAL_MS) return;

    this.lastSweepAt = now;

    for (const [key, record] of this.records) {
      if (now - record.touchedAt > this.settings.memoryMs && record.blockedUntil <= now) {
        this.records.delete(key);
      }
    }
  }
}
