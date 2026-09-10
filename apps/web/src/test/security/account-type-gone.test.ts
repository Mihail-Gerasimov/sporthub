// Сторож: интерфейс не решает по «типу учётной записи».
//
// ⚠️ Фаза 35, шаг 35.34. Тип кабинета (`athlete` / `provider`) отвечал на вопрос
// «кем человек является», и на этом ответе держались пятнадцать гейтов кабинета,
// семнадцать плашек «Доступ ограничен», право записываться и адрес кабинета
// в шапке. Человек не является кем-то одним: у него есть свой зал И он сам ходит
// на йогу — поэтому признак ушёл, а вместо него появились факты (`accountKind`
// и `faces`).
//
// Обычные тесты возврат этого признака не поймают. Вернуть его — значит добавить
// в стор одно поле и одно сравнение; экраны при этом продолжат работать, а модель
// снова начнёт расходиться с жизнью, причём молча. Поэтому запрет стережёт
// проверка по исходникам.
//
// ⚠️ Под запрет попадает ЛИЧНОСТЬ из стора, а не слово `accountType` вообще.
// Одноимённое свойство-параметр у настроек уведомлений и у ленты — про другое:
// оно говорит, КАКОЙ НАБОР ГРУПП показать на этой странице, приходит сверху
// и личность не определяет. Запрещать его здесь значило бы стеречь совпадение
// имён, а не устройство.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT as ROOT_FROM_SIGN } from '../web-root';

// Корень ищется по признаку, а не берётся из каталога запуска.
const WEB_ROOT = ROOT_FROM_SIGN;

/** Обход исходников. Тесты пропускаются: они вправе описывать и прежнее устройство. */
async function collectFiles(directory: string, skipPrefix: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(WEB_ROOT, full);

    if (relative.startsWith(skipPrefix)) continue;

    if (entry.isDirectory()) {
      found.push(...(await collectFiles(full, skipPrefix)));
      continue;
    }

    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(relative);
    }
  }

  return found;
}

async function readProductionSources(): Promise<{ file: string; text: string }[]> {
  const files = await collectFiles(path.join(WEB_ROOT, 'src'), 'src/test');

  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(path.join(WEB_ROOT, file), 'utf8') })),
  );
}

/**
 * Способы прочитать тип учётной записи ИЗ СОСТОЯНИЯ.
 *
 * `state.accountType` / `s.accountType` — подписка на стор; `PERSONAL_CABINET_CONFIG`
 * и `userRoleToAccountType` — два места, где из типа считались адрес кабинета
 * и подпись; `AuthAccountType` — сам тип, который их связывал.
 */
const FORBIDDEN = [
  /\bstate\.accountType\b/,
  /\bs\.accountType\b/,
  /\bAuthAccountType\b/,
  /\buserRoleToAccountType\b/,
  /\bPERSONAL_CABINET_CONFIG\b/,
  /\bAUTH_ACCOUNT_TYPE_(?:LABELS|OPTIONS)\b/,
  /\bAccessDeniedCard\b/,
];

describe('Сторож: тип учётной записи из интерфейса убран', () => {
  it('ни один файл не читает тип учётной записи из состояния', async () => {
    const sources = await readProductionSources();
    const offenders = sources.flatMap(({ file, text }) =>
      FORBIDDEN.filter((pattern) => pattern.test(text)).map(
        (pattern) => `${file}: ${pattern.source}`,
      ),
    );

    expect(offenders).toEqual([]);
  });

  it('стор личности не хранит тип учётной записи', async () => {
    // Точечно и отдельно: именно отсюда признак расходился по всему интерфейсу.
    const store = await readFile(path.join(WEB_ROOT, 'src/stores/useAuthStore.ts'), 'utf8');

    expect(store).not.toMatch(/\baccountType\b/);
    // А это то, что пришло ему на смену, — факты вместо признака.
    expect(store).toMatch(/\baccountKind\b/);
    expect(store).toMatch(/\bfaces\b/);
  });
});
