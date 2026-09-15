// Сторож: новый или переписанный файл — не длиннее 200 строк кода (шаг 38.10).
//
// ⚠️ Зачем. К фазе 38 файлов длиннее 200 строк — 47 по строкам файла и 32 по строкам
// кода, из них 24 в `components`:
// детальная страница клуба — 800 строк, панель администратора — 600. Такой файл
// не читается целиком, правится «вслепую» и копит дубли: вторая карточка, третья
// карусель и пять копий пагинатора фазы 37 родились именно так.
//
// Считаются СТРОКИ КОДА: пустые строки и строки-комментарии не в счёт — иначе
// сторож наказывал бы за пояснения, которые в этом проекте обязательны.
//
// ⚠️ Граница применения — список старых файлов с ТОЧНЫМИ потолками. Сторож без неё
// был бы красным в день установки. Список только убывает: файл переписан и стал
// короче — потолок опускается до факта; файл ушёл под порог — запись снимается.
// Запись с файлом короче порога — КРАСНАЯ; потолок выше факта — КРАСНЫЙ: иначе
// «только убывает» ничем не проверяется, а в старый файл можно дописывать до потолка.
//
// ⚠️ Дописать хоть строку в файл из списка нельзя — так и задумано. Правка старого
// файла обязана либо не удлинять его, либо укорачивать.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Порог строк кода для нового или переписанного файла. */
export const MAX_CODE_LINES = 200;

/**
 * Старые файлы длиннее порога и точный потолок каждого — строк кода на день
 * установки сторожа. Только убывает.
 */
export const LEGACY_CEILINGS: Record<string, number> = {
  // 38.31: лидеры запросом, сортировка в памяти снята.
  'src/app/page.tsx': 361,
  'src/components/admin/AdminNotificationsPage.tsx': 526,
  'src/components/admin/AdminUpdatePasswordModal.tsx': 240,
  'src/components/admin/DashboardPage.tsx': 477,
  'src/components/admin/LogsPage.tsx': 428,
  'src/components/admin/ModerationPage.tsx': 473,
  'src/components/auth/AuthModal.tsx': 601,
  'src/components/booking/BookingActionBlock.tsx': 255,
  'src/components/clubs/ClubDetailPageClient.tsx': 691,
  'src/components/layout/NotificationBell.tsx': 224,
  'src/components/map/MainMap.tsx': 228,
  'src/components/profile/AccountCredentialsSection.tsx': 358,
  'src/components/profile/PublishClubModal.tsx': 488,
  'src/components/profile/PublishTrainerModal.tsx': 768,
  'src/components/profile/athlete/AthleteDashboard.tsx': 268,
  'src/components/profile/athlete/AthleteSchedule.tsx': 375,
  'src/components/profile/athlete/AthleteStats.tsx': 608,
  'src/components/profile/notifications/NotificationsListPage.tsx': 411,
  'src/components/profile/provider-helpers.ts': 240,
  'src/components/profile/provider/ProviderBookingsInbox.tsx': 482,
  'src/components/profile/provider/ProviderClients.tsx': 595,
  'src/components/profile/provider/ProviderDashboard.tsx': 396,
  'src/components/profile/provider/ProviderLinks.tsx': 670,
  'src/components/profile/provider/ProviderPublications.tsx': 238,
  'src/components/profile/provider/ProviderStats.tsx': 487,
  'src/components/trainers/TrainerCard.tsx': 240,
  'src/components/trainers/TrainerDetailPageClient.tsx': 771,
  'src/components/trainers/trainer-preview.ts': 276,
  'src/components/ui/CardSlider.tsx': 370,
  'src/lib/notification-copy.ts': 224,
  // 38.32: сняты четыре мёртвых экспорта, витринные вызовы получили параметры.
  'src/lib/server-api.ts': 281,
  'src/stores/useAuthStore.ts': 219,
};

// Строки кода: без пустых строк и без комментариев — строчных, блочных и JSX-обёрток.
// ⚠️ Обычным комментарием, а не JSDoc: пример `*/` внутри JSDoc закрыл бы его сам.
export function countCodeLines(text: string): number {
  let count = 0;
  let inBlock = false;

  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();

    if (inBlock) {
      const end = line.indexOf('*/');

      if (end < 0) continue;

      line = line.slice(end + 2).trim();
      inBlock = false;
    }

    // Снимаем блочные комментарии, целиком лежащие в строке.
    line = line.replace(/\/\*[\s\S]*?\*\//g, '').trim();

    const blockStart = line.indexOf('/*');

    if (blockStart >= 0) {
      line = line.slice(0, blockStart).trim();
      inBlock = true;
    }

    // `{}` — остаток JSX-обёртки `{/* ... */}` после снятия комментария.
    if (line === '' || line === '{}' || line.startsWith('//')) continue;

    count += 1;
  }

  return count;
}

/** Путь в единой форме — со слэшами, от корня приложения. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

/** Обход исходников фронта: `.ts`, `.tsx`; тесты не в счёт. */
async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(WEB_ROOT, full);

    if (relative.startsWith(path.join('src', 'test'))) continue;

    if (entry.isDirectory()) {
      found.push(...(await collectSources(full)));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;

    found.push(normalize(relative));
  }

  return found;
}

describe('Сторож: размер файла (38.10)', () => {
  it('ни один файл не длиннее порога, старые — не длиннее своего потолка', async () => {
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      const lines = countCodeLines(await readFile(path.join(WEB_ROOT, file), 'utf8'));
      const ceiling = LEGACY_CEILINGS[file] ?? MAX_CODE_LINES;

      if (lines > ceiling) offenders.push(`${file}: ${lines} строк кода > ${ceiling}`);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('список старых файлов только убывает: потолок равен факту и выше порога', async () => {
    const stale: string[] = [];

    for (const [file, ceiling] of Object.entries(LEGACY_CEILINGS)) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8').catch(() => null);

      if (text === null) {
        stale.push(`${file}: файла нет — запись снять`);
        continue;
      }

      const lines = countCodeLines(text);

      if (lines <= MAX_CODE_LINES)
        stale.push(`${file}: ${lines} ≤ ${MAX_CODE_LINES} — запись снять`);
      else if (lines < ceiling)
        stale.push(`${file}: факт ${lines} < потолок ${ceiling} — опустить`);
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('src/components/ui/CardSlider.tsx');
    expect(files).toContain('src/app/page.tsx');
    expect(files.some((file) => file.startsWith('src/test/'))).toBe(false);
  });

  it('сторож считает строки кода, а не строки файла', () => {
    const text = [
      '// шапка',
      '/**',
      ' * многострочный',
      ' */',
      "import { a } from 'b';",
      '',
      'export function f() {',
      '  return a; // хвостовой комментарий — строка кода',
      '}',
      '{/* JSX-комментарий */}',
    ].join('\n');

    expect(countCodeLines(text)).toBe(4);
    // Файл в 240 строк кода — нарушение (диверсия д-7).
    expect(
      countCodeLines(Array.from({ length: 240 }, (_, i) => `const x${i} = ${i};`).join('\n')),
    ).toBe(240);
  });
});
