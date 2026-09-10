// Лица услуг человека для тестов кабинета.
//
// ⚠️ Шаг 35.20a. Кабинет отбирает свои публикации по списку ЛИЦ из ответа
// «кто я», а не по полю `managedByUserId` в карточке каталога: это поле из
// публичной выдачи ушло. Значит и в тестах владение обязано приезжать через
// стор, а не выводиться компонентом из каталога.
//
// Хелпер собирает тот же список, что собирает бэкенд (`AuthController.facesOf`):
// клубы и карточки тренера, у которых владелец — этот человек. Одно объявление
// на все наборы: копия в каждом файле разъехалась бы с настоящим ответом молча,
// и тест продолжал бы доказывать поведение, которого нет.

import type { ServiceFace } from '@/lib/service-faces';
import type { Club, Trainer } from '@sporthub/types';

/** Лица человека по срезу каталога — как их считает ответ «кто я». */
export function facesOf(input: {
  userId: number;
  clubs?: Pick<Club, 'id' | 'name' | 'managedByUserId'>[];
  trainers?: Pick<Trainer, 'id' | 'name' | 'managedByUserId'>[];
}): ServiceFace[] {
  const { userId, clubs = [], trainers = [] } = input;

  return [
    ...clubs
      .filter((club) => club.managedByUserId === userId)
      .map((club) => ({ kind: 'club' as const, id: club.id, name: club.name })),
    ...trainers
      .filter((trainer) => trainer.managedByUserId === userId)
      .map((trainer) => ({ kind: 'trainer' as const, id: trainer.id, name: trainer.name })),
  ];
}
