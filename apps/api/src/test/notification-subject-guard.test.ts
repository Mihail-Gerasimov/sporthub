// Сторож: предмет уведомления называется ОДНОЙ формой (шаг 36.51).
//
// ⚠️ Зачем сторож. К этому шагу предмет уведомления назывался в `payload`
// ЧЕТЫРЬМЯ разными формами, и каждую завела своя фаза: прямой номер
// (`clubId` / `trainerId`), пара `entityType` + `entityId`, пара
// `publicationType` + `publicationId` (шаг 36.21) и косвенная ссылка через
// `bookingId` / `reviewId` / `linkId`. Ни одна из них не была «неправильной» —
// неправильным было то, что их четыре.
//
// Цена уже заплачена: уборка публикаций (`scripts/cleanup-publications.mjs`)
// вынуждена разбирать все формы сразу, и четвёртую она сначала ПРОПУСТИЛА —
// каждый прогон оставлял в базе уведомление, ссылающееся на удалённую
// публикацию. Пятую форму заведёт тот, кто добавит следующий тип.
//
// ⚠️ Почему сторож ТЕКСТОВЫЙ, а не рантаймовый. Проверяемое свойство —
// синтаксическое: какими ключами место отправки называет предмет. Рантаймовая
// проверка доказывала бы это ровно для тех сценариев, которые кто-то не забыл
// написать, — то есть новый тип под неё НЕ попадал бы. Здесь список мест
// отправки берётся из самих исходников: новый `.notify(` попадает под сторожа
// сам, без правки теста.
//
// ⚠️ Сторож обходит и словарь: вид предмета, добавленный в
// `NOTIFICATION_SUBJECT_TYPES`, обязан быть разобран уборкой. Иначе повторится
// ровно та история, с которой шаг и начался: форма есть, уборка о ней не знает.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { NOTIFICATION_TYPE_GROUP, NOTIFICATION_TYPE_SUBJECT } from '@sporthub/domain';
import { NOTIFICATION_SUBJECT_TYPES } from '@sporthub/types';

import { API_ROOT, REPO_ROOT } from './repo-root';

/** Ключи прежних четырёх форм ссылки на предмет. Ни один не должен уцелеть. */
const LEGACY_SUBJECT_KEYS = [
  'clubId',
  'trainerId',
  'entityType',
  'entityId',
  'publicationType',
  'publicationId',
  'bookingId',
  'reviewId',
  'linkId',
] as const;

/** Место отправки уведомления: файл, строка и третий аргумент — сам `payload`. */
type SendSite = { file: string; line: number; payload: string };

/** Все исходники бэкенда, кроме тестов и сгенерированного клиента базы. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) {
      // `test` — сами тесты, `prisma-client` — сгенерированный код.
      if (entry === 'test' || entry === 'prisma-client') continue;

      found.push(...sourceFiles(full));
      continue;
    }

    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }

  return found;
}

/**
 * Текст вызова от открывающей скобки до парной закрывающей.
 *
 * Считаются скобки всех видов и пропускаются строковые литералы: без этого
 * запятая внутри строки резала бы аргументы не там, и сторож проверял бы
 * не то, что написано.
 */
function callText(source: string, openIndex: number): string {
  let depth = 0;
  let quote: string | null = null;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote !== null) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(' || char === '{' || char === '[') depth += 1;

    if (char === ')' || char === '}' || char === ']') {
      depth -= 1;

      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }

  throw new Error('Вызов не закрыт — разбор исходника сломан');
}

/** Аргументы верхнего уровня: запятые внутри скобок и строк не считаются. */
function splitArguments(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quote !== null) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(' || char === '{' || char === '[') depth += 1;
    if (char === ')' || char === '}' || char === ']') depth -= 1;

    if (char === ',' && depth === 0) {
      args.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }

  args.push(text.slice(start).trim());

  return args.filter((arg) => arg.length > 0);
}

/** Все места отправки уведомлений в бэкенде. */
function collectSendSites(): SendSite[] {
  const sites: SendSite[] = [];

  for (const file of sourceFiles(path.join(API_ROOT, 'src'))) {
    const source = readFileSync(file, 'utf8');
    let searchFrom = 0;

    for (;;) {
      const found = source.indexOf('.notify(', searchFrom);

      if (found === -1) break;

      const open = found + '.notify'.length;
      const args = splitArguments(callText(source, open));
      const line = source.slice(0, found).split('\n').length;

      // Третий аргумент — `payload`. Вызов с меньшим числом аргументов
      // означал бы другой `notify`, и пропустить его молча нельзя.
      sites.push({
        file: path.relative(REPO_ROOT, file),
        line,
        payload: args[2] ?? '',
      });

      searchFrom = found + 1;
    }
  }

  return sites;
}

/** Исходник файла места отправки — для разбора косвенной передачи `payload`. */
function readSite(site: SendSite): string {
  return readFileSync(path.join(REPO_ROOT, site.file), 'utf8');
}

type CleanupEntry = { label: string; where: string };
type CleanupModule = {
  publicationCleanupPlan: (options: { clubIds: number[]; trainerIds: number[] }) => CleanupEntry[];
  /** Реестр планов уборки (шаг 37.56): вид предмета разбирает хотя бы один из них. */
  cleanupPlans: (options: {
    clubIds: number[];
    trainerIds: number[];
    userIds: number[];
  }) => CleanupEntry[];
};

describe('Сторож формы ссылки на предмет уведомления (36.51)', () => {
  let sites: SendSite[];

  beforeAll(() => {
    sites = collectSendSites();
  });

  describe('Словарь', () => {
    it('каждый тип уведомления называет вид своего предмета', () => {
      // Список типов берётся у словаря групп: он объявлен как
      // `Record<NotificationType, …>`, то есть новый тип обязан появиться
      // и здесь, и в словаре предметов — иначе сборка не пройдёт.
      for (const type of Object.keys(NOTIFICATION_TYPE_GROUP)) {
        const subjects = NOTIFICATION_TYPE_SUBJECT[type as keyof typeof NOTIFICATION_TYPE_SUBJECT];

        expect(subjects, `тип ${type} не назвал предмет`).toBeDefined();
        expect(subjects.length, `тип ${type} назвал пустой список предметов`).toBeGreaterThan(0);

        for (const subject of subjects) {
          expect(
            NOTIFICATION_SUBJECT_TYPES,
            `тип ${type} назвал предмет «${subject}», которого нет в словаре`,
          ).toContain(subject);
        }
      }
    });
  });

  describe('Отправка', () => {
    it('обход исходников находит все места отправки', () => {
      // Не точное число, а защита от пустого обхода: сторож, который ничего
      // не нашёл, зеленеет молча — ровно эта ловушка стоила фазе 35 девяти
      // текстовых сторожей, считавших корень от каталога запуска.
      expect(sites.length).toBeGreaterThanOrEqual(10);
    });

    it('каждое место отправки называет предмет одной объявленной формой', () => {
      const broken: string[] = [];

      for (const site of sites) {
        if (site.payload.includes('notificationPayload(')) continue;

        // Косвенная передача: `payload` собран выше по файлу тем же
        // построителем и передан переменной. Это законно — но только если
        // построитель действительно назван.
        const name = /^[A-Za-z_$][\w$]*$/.test(site.payload) ? site.payload : null;
        const assigned =
          name !== null &&
          new RegExp(`(const|let)\\s+${name}\\s*=\\s*notificationPayload\\(`).test(readSite(site));

        if (!assigned) broken.push(`${site.file}:${site.line} → ${site.payload.slice(0, 60)}`);
      }

      expect(broken, 'предмет назван не через notificationPayload()').toEqual([]);
    });

    it('ни одно место отправки не называет предмет прежними формами', () => {
      const broken: string[] = [];

      for (const site of sites) {
        for (const key of LEGACY_SUBJECT_KEYS) {
          if (new RegExp(`\\b${key}\\s*:`).test(site.payload)) {
            broken.push(`${site.file}:${site.line} → ${key}`);
          }
        }
      }

      expect(broken, 'в payload уведомления осталась прежняя форма ссылки').toEqual([]);
    });
  });

  describe('Уборка', () => {
    it('разбирает одну форму — и знает про каждый вид предмета', async () => {
      const module = (await import(
        pathToFileURL(path.join(REPO_ROOT, 'scripts', 'cleanup-publications.mjs')).href
      )) as CleanupModule;
      // ⚠️ Шаг 37.56: планов уборки стало НЕСКОЛЬКО, и требование читается иначе —
      // «вид предмета разобран ХОТЯ БЫ ОДНИМ планом». Пока план был один, первый же
      // вид предмета, к публикациям не относящийся (`user` из фазы 37), поставил бы
      // выбор между красным сторожем и его ослаблением. Реестр снимает выбор.
      const plans = module.cleanupPlans({ clubIds: [1], trainerIds: [2], userIds: [3] });
      const notifications = plans.filter((entry) => entry.label === 'notifications');

      expect(notifications.length).toBeGreaterThan(0);

      const where = notifications.map((entry) => entry.where).join('\n');

      // Вид предмета, добавленный в словарь, обязан быть разобран уборкой:
      // иначе повторится история, с которой шаг начался — форма есть,
      // уборка о ней не знает, и после каждого прогона остаётся сирота.
      for (const subject of NOTIFICATION_SUBJECT_TYPES) {
        expect(where, `ни один план уборки не разбирает предмет «${subject}»`).toContain(
          `payload->>'subjectType' = '${subject}'`,
        );
      }

      // И ни одной прежней формы: разбор четырёх форм — это и есть та цена,
      // ради снятия которой шаг делается.
      for (const key of LEGACY_SUBJECT_KEYS) {
        expect(where, `уборка всё ещё разбирает форму ${key}`).not.toContain(`payload->>'${key}'`);
      }
    });
  });
});
