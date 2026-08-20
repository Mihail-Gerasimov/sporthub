// Виды спорта тренера: данные хранят то массив `sportIds`, то устаревшее
// одиночное `sportId`, и формула согласования этих двух представлений
// повторялась в нормализации репозитория и в тестовом двойнике бэкенда.

import type { EntityId, Trainer } from '@sporthub/types';

/** Поля тренера, из которых выводится его набор видов спорта. */
export type TrainerSportsRef = Pick<Trainer, 'sportIds' | 'sportId'>;

/**
 * Полный список видов спорта. Массив главнее: одиночное `sportId` берётся
 * только когда массива нет или он пуст.
 */
export function getTrainerSportIds(trainer: TrainerSportsRef): EntityId[] {
  if (Array.isArray(trainer.sportIds) && trainer.sportIds.length > 0) {
    return trainer.sportIds;
  }

  return trainer.sportId !== undefined ? [trainer.sportId] : [];
}

/**
 * Основной вид спорта. Здесь приоритет обратный: явно записанное `sportId`
 * главнее первого элемента массива — так тренер с исторически заданным
 * основным видом не переезжает на другой при пополнении списка.
 */
export function getTrainerPrimarySportId(trainer: TrainerSportsRef): EntityId | undefined {
  return trainer.sportId ?? getTrainerSportIds(trainer)[0];
}
