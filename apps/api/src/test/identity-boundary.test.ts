// Сторож личности: она приходит из сессии и ниоткуда больше.
//
// До фазы 34 контроллеры брали, кто их вызвал, из тела запроса — 31 маршрут — или
// из строки запроса — ещё 5. Подставил чужой номер и действуешь от его имени.
// Дыру закрывает guard, но закрытая дыра легко открывается обратно: достаточно
// дописать `userId` в схему разбора тела «чтобы фронту было проще».
//
// Сторож смотрит на схемы разбора и на объявления параметров. Он не заменяет тесты
// прав — он ловит возврат самой возможности принять личность снаружи.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { API_ROOT as ROOT_OF_API } from './repo-root';

// Корень пакета выводится из корня репозитория, а не из места запуска.
const API_ROOT = ROOT_OF_API;
const SOURCE_ROOT = path.join(API_ROOT, 'src');

/** Имена, которыми в проекте называли личность вызывающего. */
const IDENTITY_FIELDS = [
  'userId',
  'actorId',
  'actorRole',
  'adminUserId',
  'moderatorId',
  'providerUserId',
];

/**
 * Файлы, которым такие имена положены по делу.
 *
 * ⚠️ Список намеренно короткий и объяснённый. Каждая новая строка здесь — это
 * ослабление сторожа, и она обязана быть решением, а не способом успокоить тест.
 */
const ALLOWED = new Set([
  // Слой данных: `userId` — обычная колонка, а не личность вызывающего.
  'src/repositories/',
  'src/storage/',
  'src/dictionaries/',
  // Проверки прав: сюда номер уже приходит из сессии.
  'src/access/access.service.ts',
  // Сессии: здесь `userId` — владелец сессии.
  'src/auth/session.service.ts',
]);

/**
 * Разобрать файл на объявления схем `const имяSchema = z.object({ ... })`.
 *
 * Нужно именно объявлениями, а не поиском по всему тексту: одно и то же имя поля
 * в схеме тела — дыра, а в схеме строки запроса — обычный фильтр.
 */
function collectSchemas(text: string): { name: string; body: string }[] {
  const schemas: { name: string; body: string }[] = [];
  const declaration = /const\s+(\w+)\s*=\s*z\s*\r?\n?\s*\.?\s*object\(\{/g;
  let match = declaration.exec(text);

  while (match !== null) {
    // Тело схемы — до закрывающей скобки объекта. Считаем вложенность, потому что
    // внутри встречаются и объекты, и вызовы.
    let depth = 1;
    let index = declaration.lastIndex;

    while (index < text.length && depth > 0) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}') depth -= 1;

      index += 1;
    }

    schemas.push({ name: match[1] ?? '', body: text.slice(declaration.lastIndex, index) });
    match = declaration.exec(text);
  }

  return schemas;
}

async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'prisma-client' || entry.name === 'node_modules') continue;

      found.push(...(await collectSources(full)));
      continue;
    }

    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;

    found.push(path.relative(API_ROOT, full));
  }

  return found;
}

describe('Граница личности', () => {
  it('схемы разбора тела не принимают личность вызывающего', async () => {
    const files = await collectSources(SOURCE_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const relative = file.split(path.sep).join('/');

      if ([...ALLOWED].some((allowed) => relative.startsWith(allowed))) continue;

      const text = await readFile(path.join(API_ROOT, file), 'utf8');

      // ⚠️ Личность может вернуться не только схемой тела. Прогон диверсий (34.57)
      // показал дыру: `@Headers('x-user-id')` в контроллере не ловился ничем, то есть
      // номер снова принимался снаружи — просто другим входом.
      //
      // `@Headers()` запрещён везде: своих заголовков у платформы нет, а чужие
      // читать незачем. `@Req()` разрешён единственному файлу — входу: он берёт
      // из запроса адрес и вид браузера, чтобы записать их в сессию. Личность
      // оттуда не берётся, и это стережёт проверка схем ниже.
      const readsRequestDirectly = relative !== 'src/auth/auth.controller.ts';

      for (const decorator of text.matchAll(/@(Headers|Req|Request)\(([^)]*)\)/g)) {
        const kind = decorator[1] ?? '';

        if (kind !== 'Headers' && !readsRequestDirectly) continue;

        offenders.push(`${relative} — контроллер читает запрос напрямую: @${kind}()`);
      }

      for (const query of text.matchAll(/@Query\('(\w+)'\)/g)) {
        const parameter = query[1] ?? '';

        if (IDENTITY_FIELDS.includes(parameter)) {
          offenders.push(`${relative} — личность из строки запроса: @Query('${parameter}')`);
        }
      }

      for (const { name, body } of collectSchemas(text)) {
        // Схемы строки запроса пропускаем: там `actorId` — это ФИЛЬТР журнала
        // («покажи действия такого-то»), а не заявление «я такой-то». Разница
        // принципиальная: фильтр ничего не разрешает, он только сужает выдачу.
        if (/query/i.test(name)) continue;

        for (const field of IDENTITY_FIELDS) {
          if (new RegExp(`\\b${field}\\s*:`).test(body)) {
            offenders.push(`${relative} — поле «${field}» в схеме «${name}»`);
          }
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('Изменяющие маршруты', () => {
  /** Глаголы, с которых начинаются методы, меняющие состояние. */
  const MUTATING = [
    'create',
    'update',
    'patch',
    'delete',
    'remove',
    'mark',
    'revoke',
    'approve',
    'reject',
    'confirm',
    'cancel',
    'hide',
    'unhide',
    'moderate',
    'lift',
    'recompute',
    'change',
    'issue',
  ];

  it('чтение не меняет состояние', async () => {
    // ⚠️ Это не придирка к стилю. `SameSite=Lax` — первая линия против подделки
    // межсайтовых запросов — пропускает переходы верхнего уровня, то есть
    // изменяющий `GET` выполняется по обычной ссылке с чужого сайта. Проверка
    // источника такие запросы не видит: браузер помечает их как переход, а не
    // как межсайтовый запрос.
    const files = await collectSources(SOURCE_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      if (!file.endsWith('.controller.ts')) continue;

      const text = await readFile(path.join(API_ROOT, file), 'utf8');
      const relative = file.split(path.sep).join('/');
      // Ищем `@Get(...)`, за которым идёт метод с глаголом действия в имени.
      const routes = text.matchAll(/@Get\([^)]*\)[\s\S]{0,200}?async\s+(\w+)\s*\(/g);

      for (const route of routes) {
        const method = route[1] ?? '';

        if (MUTATING.some((verb) => method.toLowerCase().startsWith(verb))) {
          offenders.push(`${relative} — GET-маршрут «${method}» похож на изменяющий`);
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('Ключи внешних служб', () => {
  it('серверный код не читает переменные с префиксом NEXT_PUBLIC_', async () => {
    // ⚠️ Префикс `NEXT_PUBLIC_` заставляет Next вшить значение прямо в браузерный
    // бандл. Пока серверный ключ геокодера читался под тем же именем, что и ключ
    // карты в браузере, развести их было нельзя: либо серверный уезжал наружу,
    // либо ломался один из двух.
    //
    // Прежнее имя остаётся ЗАПАСНЫМ значением на время переноса — сторож ловит
    // только чтение как основного источника.
    const files = await collectSources(SOURCE_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const relative = file.split(path.sep).join('/');
      const text = await readFile(path.join(API_ROOT, file), 'utf8');

      for (const match of text.matchAll(/process\.env\.(NEXT_PUBLIC_\w+)/g)) {
        // Запасное значение после `??` разрешено: основной источник — своё имя.
        const before = text.slice(Math.max(0, match.index - 40), match.index);

        if (before.includes('??')) continue;

        offenders.push(`${relative} — читает ${match[1]} как основной источник`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('Журнал аудита', () => {
  /**
   * Разобрать файл на тела вызовов `logs.record({ ... })`.
   *
   * Именно вызовами, а не поиском по всему тексту: `actorRole` встречается ещё
   * и в объявлении типа записи журнала, и там это поле, а не значение.
   */
  function collectLogRecords(text: string): string[] {
    const records: string[] = [];
    const call = /logs\s*\.\s*record\(\{/g;
    let match = call.exec(text);

    while (match !== null) {
      let depth = 1;
      let index = call.lastIndex;

      while (index < text.length && depth > 0) {
        if (text[index] === '{') depth += 1;
        else if (text[index] === '}') depth -= 1;

        index += 1;
      }

      records.push(text.slice(call.lastIndex, index));
      match = call.exec(text);
    }

    return records;
  }

  it('вид исполнителя берётся из сессии, а не пишется литералом', async () => {
    // ⚠️ Найдено прогоном через браузер: подтверждение записи писало в журнал
    // `actorRole: 'club_owner'` константой, кем бы исполнитель ни был. Номер при
    // этом брался верный — из сессии. То есть пара «номер + роль» указывала на
    // РАЗНЫХ людей: действие администратора выглядело действием владельца клуба,
    // а действие тренера — тоже его.
    //
    // Сторож смотрит на все вызовы записи в журнал сразу: чинить такое поштучно
    // бессмысленно, литерал вернётся в первом же новом маршруте.
    const files = await collectSources(SOURCE_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const relative = file.split(path.sep).join('/');
      const text = await readFile(path.join(API_ROOT, file), 'utf8');

      for (const record of collectLogRecords(text)) {
        const role = /\bactorRole\s*:\s*([^\n,]+)/.exec(record);

        if (role === null) {
          offenders.push(`${relative} — запись в журнал без роли исполнителя`);
          continue;
        }

        const value = (role[1] ?? '').trim();

        // Единственный допустимый источник — тот же, что и у номера: настоящий
        // исполнитель из сессии. Под имперсонизацией это администратор.
        //
        // ⚠️ Фаза 35 сменила форму: ролей больше нет, пишется вид учётной записи
        // настоящего исполнителя — `accountKindOf(session.actor)`. Суть сторожа
        // прежняя: значение обязано приходить ОТ ИСПОЛНИТЕЛЯ, а не быть литералом.
        if (!/accountKindOf\((?:session|context)\.actor\)$/.test(value)) {
          offenders.push(`${relative} — вид исполнителя записан как «${value}»`);
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
