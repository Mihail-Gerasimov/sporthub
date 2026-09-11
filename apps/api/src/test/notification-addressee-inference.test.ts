// Сторож: вид адресата НЕ выводится из пустоты колонок (шаг 37.12).
//
// ⚠️ Почему сторож, а не обычный тест. Диверсия «вернуть правило „обе колонки лица
// пусты — значит личный“» прогоняется в фазе 37 и НЕ КРАСНЕЕТ ни одним тестом
// поведения — и это не дыра в наборах, а свойство самого правила:
//
//   запрос личного ящика всегда несёт ещё и `userId = X`, а у надзорной строки
//   владельца нет вовсе. `= X` не совпадает с NULL никогда, поэтому строка
//   не попадает в ОТВЕТ при любой из двух формулировок.
//
// Разница в другом, и она не видна в ответе:
//
//   1. Частичный индекс личного ящика заведён по `addressee_kind = 'personal'`.
//      Запрос, спрашивающий вместо этого пустоту колонок, индексом
//      не воспользуется — ответ останется верным, а цена вырастет молча.
//   2. Как только путь чтения перестаёт передавать `userId` — а надзорный обязан, —
//      «пустота колонок» описывает и личный ящик, и очередь надзора СРАЗУ.
//      Тогда это уже не цена, а чужие письма в личной ленте.
//
// Поймать это тестом ответа нельзя. Поэтому проверяется сама формулировка условия.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './repo-root';

/** Файл, где живёт отбор уведомлений. */
const REPOSITORY = 'apps/api/src/repositories/prisma/catalog.repository.ts';

/**
 * Признак вывода «по пустоте»: обе колонки лица приравнены к NULL в одном условии.
 *
 * Пробел после двоеточия и порядок колонок не фиксируются — сравнивается текст
 * без пробелов, иначе сторож обходился бы переносом строки.
 */
const INFERENCE = 'addresseeClubId:null,addresseeTrainerId:null';

function withoutSpaces(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * Тело строителя условия ящика.
 *
 * ⚠️ Смотреть на весь файл нельзя: ту же пару колонок ЗАКОННО пишет строитель
 * колонок при записи личной строки — там обе ссылки на лицо действительно пусты.
 * Запрет касается только ОТБОРА: вывод вида адресата из пустоты — это про чтение.
 */
function mailboxWhereBody(source: string): string {
  const start = source.indexOf('private static mailboxWhere(');

  if (start === -1) return '';

  const end = source.indexOf('\n  }', start);

  return source.slice(start, end === -1 ? undefined : end);
}

/** Текст файла без комментариев: пояснение про прежнее правило запрещать нельзя. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('вид адресата не выводится из пустоты колонок (37.12)', () => {
  it('отбор ящика не приравнивает обе колонки лица к NULL', async () => {
    const source = codeOnly(await readFile(path.join(REPO_ROOT, REPOSITORY), 'utf8'));

    expect(
      withoutSpaces(mailboxWhereBody(source)).includes(INFERENCE),
      `${REPOSITORY} выводит вид адресата из пустоты колонок — верните отбор по addresseeKind`,
    ).toBe(false);
  });

  it('отбор личного ящика называет вид адресата явно', async () => {
    // Обратная сторона. Без неё сторож зеленел бы и тогда, когда отбора ящика
    // не осталось вовсе: «нарушения нет» и «проверять нечего» выглядят одинаково.
    const source = codeOnly(await readFile(path.join(REPO_ROOT, REPOSITORY), 'utf8'));

    expect(mailboxWhereBody(source)).toContain("addresseeKind: 'personal'");
  });

  it('сторож читает настоящий файл, а не пустоту', async () => {
    // ⚠️ Девять текстовых сторожей этого проекта однажды считали корень от каталога
    // запуска и вне своего каталога читали ничего, оставаясь зелёными.
    const source = await readFile(path.join(REPO_ROOT, REPOSITORY), 'utf8');

    expect(source.length).toBeGreaterThan(1000);
    expect(source).toContain('mailboxWhere');
  });

  it('сторож видит нарушение на подставном тексте', async () => {
    // Проверка самого сторожа: без неё «нарушений нет» может означать
    // «условие написано так, что сторож его не узнаёт».
    const broken = [
      '  private static mailboxWhere(mailbox: NotificationMailbox) {',
      '    return { addresseeClubId: null, addresseeTrainerId: null };',
      '  }',
    ].join('\n');

    expect(withoutSpaces(mailboxWhereBody(codeOnly(broken))).includes(INFERENCE)).toBe(true);
  });
});
