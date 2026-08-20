// Состояния связи тренера с клубом, при которых связь считается действующей.
//
// Набор объявлен отдельно, потому что у него два потребителя, живущих далеко друг
// от друга: проверка «активная связь уже есть» в сервисе связей и предикат частичного
// уникального индекса в базе. Пока пара «pending, confirmed» была вписана литералом,
// добавление нового действующего состояния означало правку в двух местах — причём
// про второе легко забыть, и база молча перестала бы держать уникальность.

import type { TrainerClubLinkStatus } from '@sporthub/types';

export const ACTIVE_LINK_STATUSES: readonly TrainerClubLinkStatus[] = ['pending', 'confirmed'];

/** Действует ли связь прямо сейчас. */
export function isActiveLinkStatus(status: TrainerClubLinkStatus): boolean {
  return ACTIVE_LINK_STATUSES.includes(status);
}
