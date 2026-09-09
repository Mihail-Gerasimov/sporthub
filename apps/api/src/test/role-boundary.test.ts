// Сторож отсутствия роли.
//
// Фаза 35, шаг 35.24: колонка `users.role` и всё, что на ней держалось, удалены.
// Роль больше не принимала ни одного решения — права считаются по виду учётной
// записи (`account_kind`), «тренер» и «владелец клуба» выводятся из владения
// лицами услуг, «атлет» перестал означать что-либо, кроме «человек вошёл».
//
// Зачем сторож, если компилятор и так уронит сборку на удалённом типе. Потому что
// вернуть роль — это НЕ ошибка компиляции: достаточно завести новый союз строк
// с тем же смыслом и снова начать спрашивать «кем человек является». Код соберётся,
// тесты пройдут, а модель молча вернётся к той, от которой фаза уходила: человек
// снова станет кем-то ОДНИМ, хотя он и на йогу ходит, и свой зал держит.
//
// Под запретом три имени, и каждое — не совпадение, а именно та развилка:
// `UserRole` / `USER_ROLES` — сама роль, `accountType` — «тип учётной записи»,
// признак «атлет или провайдер», на котором держались пятнадцать гейтов кабинета.
//
// ⚠️ Что сторож НЕ трогает. Слово `role` вообще: это ARIA-атрибут разметки
// и `getByRole` в тестах — к личности они отношения не имеют, и запрет по слову
// стерёг бы совпадение имён. `actorRole` в журнале — исторический снимок, он
// обязан остаться: журнал хранит и старые значения ролей, и новые виды учётной
// записи, и переписывать прошлое ради чистоты словаря нельзя.
//
// ⚠️ Тесты не сканируются — они вправе называть удалённое по имени, чтобы
// доказать его отсутствие («в теле запроса поля `accountType` нет»). Документы,
// файлы фаз и чек-листы не сканируются по той же причине: там роль — история.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.join(process.cwd(), '..', '..');
const SCHEMA_PATH = path.join(ROOT, 'apps', 'api', 'prisma', 'schema.prisma');

/** Имена, возврат которых означает возврат роли. */
const FORBIDDEN = [
  { pattern: /\bUserRole\b/, why: 'тип роли' },
  { pattern: /\bUSER_ROLES\b/, why: 'словарь ролей' },
  { pattern: /\baccountType\b/, why: 'тип учётной записи («атлет или провайдер»)' },
];

/**
 * Каталоги вне осмотра.
 *
 * `prisma-client` — сгенерированный клиент базы: он пересобирается из схемы
 * и своей правке не подлежит. `test` — наборы проверок: см. оговорку выше.
 */
const SKIPPED_DIRECTORIES = new Set(['prisma-client', 'node_modules', 'dist', '.next', 'test']);

/** Все исходники под корнем: только рабочий код, без сгенерированного и тестов. */
async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;

      found.push(...(await collectSources(full)));

      continue;
    }

    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }

  return found;
}

/** Корни сканирования: оба приложения и все общие пакеты. */
async function collectRoots(): Promise<string[]> {
  const packages = await readdir(path.join(ROOT, 'packages'), { withFileTypes: true });
  const roots = [path.join(ROOT, 'apps', 'api', 'src'), path.join(ROOT, 'apps', 'web', 'src')];

  for (const entry of packages) {
    if (!entry.isDirectory()) continue;

    roots.push(path.join(ROOT, 'packages', entry.name, 'src'));
  }

  return roots;
}

describe('Роли в коде не осталось', () => {
  it('ни один исходник приложений и пакетов не объявляет роль', async () => {
    const roots = await collectRoots();
    const offenders: string[] = [];

    for (const root of roots) {
      let files: string[];

      try {
        files = await collectSources(root);
      } catch {
        // Пакет без каталога исходников — не нарушение, просто нечего смотреть.
        continue;
      }

      for (const file of files) {
        const text = await readFile(path.join(ROOT, file), 'utf8');

        for (const { pattern, why } of FORBIDDEN) {
          if (pattern.test(text)) offenders.push(`${file} — ${why}`);
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('на смену роли пришёл вид учётной записи, и он на месте', async () => {
    // Обратная сторона сторожа: «убрать роль» не должно однажды превратиться
    // в «убрать заодно и различие администратора» — оно из владения не выводится.
    const domain = await import('@sporthub/domain');

    expect(domain.ACCOUNT_KINDS).toEqual(['person', 'admin']);
    expect(domain.isAdminKind('admin')).toBe(true);
    expect(domain.isAdminKind('person')).toBe(false);
  });
});

describe('Роли в схеме базы не осталось', () => {
  it('модель User не объявляет колонку role и индекс по ней', async () => {
    const text = await readFile(SCHEMA_PATH, 'utf8');
    const model = /model User \{[\s\S]*?\n\}/.exec(text);

    expect(model, 'модель User не найдена в схеме').not.toBeNull();

    const body = model?.[0] ?? '';

    // Точечно по объявлению колонки, а не по слову: `actorRole` в журнале
    // и индексы других моделей сюда не попадают — осматривается только User.
    expect(body).not.toMatch(/@map\("role"\)/);
    expect(body).not.toMatch(/@@index\(\[role\]\)/);
    // Обратная сторона: то, что пришло на смену, обязано остаться на месте.
    expect(body).toMatch(/@map\("account_kind"\)/);
  });

  it('вид учётной записи закреплён ограничением базы', async () => {
    // Роль ушла в том числе потому, что база принимала в неё любую строку:
    // словарь держал только TypeScript, CHECK не было вовсе. Замена обязана
    // быть закреплена в базе, иначе обмен вышел бы на то же самое.
    const text = await readFile(path.join(ROOT, 'scripts', 'db-constraints.mjs'), 'utf8');

    expect(text).toMatch(/users_account_kind/);
  });
});
