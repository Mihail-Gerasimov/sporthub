// Сторож вырезанной надёжности (фаза 38, шаг 38.22).
//
// Решение заказчика 15.09.2026: рейтинг надёжности в нынешнем виде никто
// не понимает, механизм вырезается ЦЕЛИКОМ — и провайдерский (бейдж на карточке,
// отсев `excludeDanger`, сортировка `sort=reliability`), и надёжность спортсмена
// (секция кабинета, фильтр клиентов у лица, колонка и «Пересчитать» в панели).
// Придумывается заново отдельной работой — долг Д-25.
//
// Зачем сторож, если компилятор и так уронит сборку на удалённом типе. Потому что
// вернуть надёжность — это НЕ ошибка компиляции: достаточно завести новую функцию
// с тем же смыслом и снова посчитать долю доведённых записей. Код соберётся,
// тесты пройдут, а механизм, который заказчик велел убрать, молча вернётся
// под другим именем.
//
// ⚠️ Что сторож НЕ трогает — и почему это названо, а не подразумевается.
//
// 1. `reliability_recompute` — значение журнала. Строки с ним ЖИВЫ в базе,
//    и прошлое не переписывается (правило 37.29). Значение остаётся историческим,
//    с подписью в `LogsPage`. Исключено ПОИМЁННО: не «всё со словом recompute»,
//    а ровно этот токен, и ничего рядом с ним.
// 2. `computeCancelReason` — правило «отмена вовремя или поздно». Оно жило
//    в `reliability.ts`, но принадлежит машине состояний записи: без него отмена
//    спортсменом не получит `cancelReason`. Переезжает в `booking-fsm.ts`, а не
//    снимается — обратная половина сторожа ниже это и стережёт.
// 3. Комментарии. Сторож смотрит на КОД: объяснить в комментарии, почему механизма
//    больше нет, обязано быть можно — иначе сторож заставлял бы писать хуже
//    комментарии (урок `quarantine-boundary`).
// 4. Тесты. Наборы проверок вправе называть удалённое по имени, чтобы доказать
//    его отсутствие («маршрута пересчёта больше нет — 404»).
//
// ⚠️ Список `PENDING` — файлы, из которых надёжность ЕЩЁ не вырезана, с шагом,
// который это делает. Он существует потому, что вырезание идёт четырьмя шагами
// (бэкенд 38.23, фронт 38.25, домен и типы 38.26) и разными руками, а сторож
// обязан быть зелёным на каждом из них — иначе он не сторож, а обещание.
// Список ТОЛЬКО УБЫВАЕТ: запись, чей файл уже вычищен, — красная. Без этого
// правила «пока не вырезано» превратилось бы в «никогда не вырезано».
// На закрытии этапа Э3 список пуст.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './repo-root';

const ROOT = REPO_ROOT;

/**
 * Что ищем. Оба написания: идентификаторы и тексты интерфейса.
 *
 * Русское слово ловит то, чего английский корень не видит: подпись «снизит ваш
 * рейтинг надёжности» в предупреждении об отмене живёт в файле, где нет
 * ни одного `reliab`, — и обещала бы рейтинг, которого больше нет.
 */
const FORBIDDEN = [
  { pattern: /reliab/i, why: 'надёжность в коде' },
  // Ровно «надёжность» (и падежи), а не корень: «надёжный пароль» в форме входа —
  // законный текст, к рейтингу отношения не имеет и под сторож попадать не должен.
  { pattern: /над[её]жност/i, why: 'надёжность в тексте интерфейса' },
  // ⚠️ Дыра, найденная диверсией д-40 на месте: параметр `excludeDanger`, возвращённый
  // в контроллер без самого расчёта, слова `reliab` не содержит — и сторож оставался
  // зелёным. Механизм узнаваем не только по имени, но и по своим частям: отсев
  // «опасных», доля доведённых, порог «новичка» и пороги бейджа. Каждая часть —
  // отдельная строка, чтобы отказ называл, что именно вернулось.
  { pattern: /excludeDanger/, why: 'отсев по надёжности' },
  { pattern: /completionRate/, why: 'доля доведённых записей — формула надёжности' },
  { pattern: /isNewUser/, why: 'порог «новичка» — часть бейджа надёжности' },
  { pattern: /minCompletedForBadge|dangerThreshold|warningThreshold/, why: 'пороги бейджа' },
];

/**
 * Единственное исключение — историческое значение журнала, см. шапку.
 * С границами слова: `reliability_recomputeFor()` — не исключение, а возврат.
 */
const HISTORICAL_LOG_ACTION = /\breliability_recompute\b/g;

/**
 * Файлы, из которых надёжность ещё не вырезана → шаг, который это делает.
 *
 * ⚠️ Только убывает. Новых записей здесь взяться неоткуда: файл, куда надёжность
 * вернулась, — это не «ещё не вырезано», а «вернулось», и он краснит сторож.
 */
const PENDING: Record<string, string> = {
  // Бэкенд — шаг 38.23: вычищен, записей нет.
  // Фронт — шаг 38.25.
  'apps/web/src/app/clubs/[slug]/page.tsx': '38.25',
  'apps/web/src/app/page.tsx': '38.25',
  'apps/web/src/app/trainers/[slug]/page.tsx': '38.25',
  'apps/web/src/components/admin/DashboardPage.tsx': '38.25',
  'apps/web/src/components/clubs/ClubCard.tsx': '38.25',
  'apps/web/src/components/clubs/ClubDetailPageClient.tsx': '38.25',
  'apps/web/src/components/clubs/ClubList.tsx': '38.25',
  'apps/web/src/components/clubs/PopularNearby.tsx': '38.25',
  'apps/web/src/components/profile/AthleteUpcomingBookingCard.tsx': '38.25',
  'apps/web/src/components/profile/ProviderBookingsSection.tsx': '38.25',
  'apps/web/src/components/profile/athlete/AthleteDashboard.tsx': '38.25',
  'apps/web/src/components/profile/athlete/AthleteSchedule.tsx': '38.25',
  'apps/web/src/components/profile/athlete/AthleteStats.tsx': '38.25',
  'apps/web/src/components/profile/provider/ProviderBookingsInbox.tsx': '38.25',
  'apps/web/src/components/profile/provider/ProviderClients.tsx': '38.25',
  'apps/web/src/components/profile/provider/ProviderDashboard.tsx': '38.25',
  'apps/web/src/components/profile/provider/ProviderStats.tsx': '38.25',
  'apps/web/src/components/search/CatalogResultsSection.tsx': '38.25',
  'apps/web/src/components/trainers/PopularTrainers.tsx': '38.25',
  'apps/web/src/components/trainers/TrainerCard.tsx': '38.25',
  'apps/web/src/components/trainers/TrainerDetailPageClient.tsx': '38.25',
  'apps/web/src/components/trainers/TrainerList.tsx': '38.25',
  'apps/web/src/components/ui/ReliabilityBadge.tsx': '38.25',
  'apps/web/src/components/ui/index.ts': '38.25',
  'apps/web/src/lib/notification-copy.ts': '38.25',
  'apps/web/src/lib/reliability-map.ts': '38.25',
  // Переезд, а не снятие: набор статусов истории клиента переименовывается — шаг 38.26.
  'apps/web/src/lib/booking-scopes.ts': '38.26',
  'apps/web/src/lib/face-scope.ts': '38.26',
  // Домен и типы — шаг 38.26.
  'packages/domain/src/discipline-config.ts': '38.26',
  'packages/domain/src/index.ts': '38.26',
  'packages/domain/src/reliability.ts': '38.26',
  'packages/types/src/types.ts': '38.26',
};

/**
 * Каталоги вне осмотра.
 *
 * `prisma-client` — сгенерированный клиент базы, пересобирается из схемы.
 * `test` — наборы проверок, см. шапку.
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

/** Текст файла без комментариев и без исторического токена. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(HISTORICAL_LOG_ACTION, '');
}

/** Файлы, в коде которых надёжность есть, с причиной по каждому. */
async function findOffenders(): Promise<Map<string, string>> {
  const offenders = new Map<string, string>();

  for (const root of await collectRoots()) {
    let files: string[];

    try {
      files = await collectSources(root);
    } catch {
      // Пакет без каталога исходников — не нарушение, просто нечего смотреть.
      continue;
    }

    for (const file of files) {
      const text = codeOnly(await readFile(path.join(ROOT, file), 'utf8'));
      const hit = FORBIDDEN.find(({ pattern }) => pattern.test(text));

      if (hit !== undefined) offenders.set(file, hit.why);
    }
  }

  return offenders;
}

describe('Надёжность вырезана', () => {
  it('в исходниках приложений и пакетов надёжности нет — кроме файлов, чей шаг ещё не пришёл', async () => {
    const offenders = await findOffenders();
    const returned = [...offenders]
      .filter(([file]) => PENDING[file] === undefined)
      .map(([file, why]) => `${file} — ${why}`);

    expect(returned, `надёжность вернулась:\n${returned.join('\n')}`).toEqual([]);
  });

  it('список ожидающих только убывает: у каждой записи есть предмет', async () => {
    // Запись без предмета — файл уже вычищен, а строка осталась — означает,
    // что список перестал быть списком работы и стал списком исключений.
    const offenders = await findOffenders();
    const stale = Object.keys(PENDING).filter((file) => !offenders.has(file));

    expect(stale, `файлы уже вычищены, записи лишние:\n${stale.join('\n')}`).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    // Девять текстовых сторожей однажды считали корень от каталога запуска
    // и вне своего каталога обходили ничего, оставаясь зелёными.
    const roots = await collectRoots();
    const files = (await Promise.all(roots.map((root) => collectSources(root)))).flat();

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('apps/api/src/catalog/clubs.controller.ts');
    expect(files).toContain('apps/web/src/app/page.tsx');
    expect(files).toContain('packages/domain/src/booking-fsm.ts');
  });

  it('правило «отмена вовремя или поздно» вырезанию не подлежит и осталось на месте', async () => {
    // Обратная половина. `computeCancelReason` жила в файле надёжности, но
    // принадлежит машине состояний записи: «убрать надёжность» не должно однажды
    // превратиться в «убрать заодно и причину отмены». Без неё отмена спортсменом
    // перестала бы различать «вовремя» и «поздно».
    const domain = await import('@sporthub/domain');

    expect(typeof domain.computeCancelReason).toBe('function');

    const booking = { cancellationPolicySnapshot: 'no_refund' } as never;

    expect(domain.computeCancelReason(booking, null, new Date())).toBe('late');
  });
});
