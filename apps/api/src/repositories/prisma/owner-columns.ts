// Владелец услуги, слота и записи: перевод между парой колонок базы и парой полей контракта.
//
// В файловом хранилище владелец лежал двумя полями — `ownerType` и `ownerId`. В базе это
// пара взаимоисключающих внешних ключей `ownerClubId` / `ownerTrainerId`, ровно один
// из которых заполнен (CHECK-ограничение в миграции). Перевод между этими двумя
// представлениями нужен трём таблицам сразу (услуги, расписание, записи), поэтому
// объявлен один раз здесь, а не переписан в каждом репозитории: разъехавшийся перевод
// отдал бы чужие услуги не тому провайдеру — молча и с кодом 200.
//
// Площадка (`venueClubId`) сюда НЕ входит намеренно. «Владелец» и «площадка» — разные
// сведения: тренерское занятие в зале клуба принадлежит тренеру, а проходит у клуба.
// Каждая таблица собирает площадку по-своему, общего правила у них нет.

import type { CatalogOwnerType, EntityId } from '@sporthub/types';

/** Колонки владельца в базе. Ровно одна из двух заполнена. */
export type OwnerColumns = {
  ownerClubId: number | null;
  ownerTrainerId: number | null;
};

/** Пара полей контракта. */
export type OwnerRef = {
  ownerType: CatalogOwnerType;
  ownerId: EntityId;
};

/** Колонки базы → поля контракта. */
export function toOwnerRef(row: OwnerColumns): OwnerRef {
  if (row.ownerTrainerId !== null) {
    return { ownerType: 'trainer', ownerId: row.ownerTrainerId };
  }

  if (row.ownerClubId !== null) {
    return { ownerType: 'club', ownerId: row.ownerClubId };
  }

  // Недостижимо, пока живо CHECK-ограничение. Но молчать здесь нельзя: строка без
  // владельца неинтерпретируема, а умолчание «считаем клубной» отдало бы её чужому
  // провайдеру — то есть превратило бы дефект данных в дыру в правах.
  throw new Error('Строка без владельца: не заполнены ни клуб, ни тренер');
}

/** Поля контракта → колонки базы. */
export function fromOwnerRef(ownerType: CatalogOwnerType, ownerId: EntityId): OwnerColumns {
  return ownerType === 'club'
    ? { ownerClubId: ownerId, ownerTrainerId: null }
    : { ownerClubId: null, ownerTrainerId: ownerId };
}

/**
 * Условие отбора по типу владельца.
 *
 * После разделения на две колонки «клубный» — это «владелец-тренер пуст», а не
 * «тип равен club». Условие одно на расписание и услуги, поэтому и оно живёт здесь.
 */
export function ownerTypeWhere(ownerType: CatalogOwnerType): {
  ownerClubId?: { not: null };
  ownerTrainerId?: { not: null };
} {
  return ownerType === 'club' ? { ownerClubId: { not: null } } : { ownerTrainerId: { not: null } };
}
