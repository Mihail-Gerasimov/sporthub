// Проверки прав.
//
// До Phase 32 часть проверок жила в хелперах, часть была вписана прямо в роуты,
// а проверка владения публикацией пряталась внутри операции записи и сообщала
// о себе текстом исключения. Здесь всё сведено в один сервис поверх репозиториев.
//
// ⚠️ Личность вызывающего по-прежнему приходит параметром от клиента — сервер
// её не проверяет. Это дыра, перенесённая сознательно: фаза обязана сохранить
// контракты, а настоящая авторизация делается отдельной фазой.

import { Inject, Injectable } from '@nestjs/common';
// Правило «клиент ли атлет у провайдера» импортируется под другим именем:
// одноимённый метод сервиса ниже делегирует ему, и без псевдонима строка
// читалась бы как рекурсия.
import {
  getBookingClubId,
  getBookingTrainerId,
  isClientOfProvider as isClientOfProviderRule,
} from '@sporthub/domain';
import type { Booking, Club, Trainer } from '@sporthub/types';

import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';
import type { OwnerIdFilter, UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

@Injectable()
export class AccessService {
  constructor(
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  /** Роль администратора. Отсутствующий пользователь администратором не считается. */
  async isAdmin(userId: number): Promise<boolean> {
    const user = await this.users.findById(userId);

    return user?.role === 'admin';
  }

  /**
   * Управляет ли пользователь сущностью, к которой относится запись.
   * Учитывает и явные поля записи, и вывод владельца из `ownerType`/`ownerId`
   * для старого формата данных.
   */
  async isProviderOfBooking(booking: Booking, userId: number): Promise<boolean> {
    const clubId = getBookingClubId(booking);
    const trainerId = getBookingTrainerId(booking);

    if (clubId !== null && (await this.isManagerOfClub(clubId, userId))) {
      return true;
    }

    if (trainerId !== null && (await this.isManagerOfTrainer(trainerId, userId))) {
      return true;
    }

    return false;
  }

  /**
   * Номера публикаций, которыми управляет пользователь, — клубы и тренеры вместе.
   *
   * Один ответ на вопрос «что вообще принадлежит этому провайдеру», а не по паре
   * запросов в каждом маршруте, которому это понадобилось. Потребителей уже двое —
   * разбор «клиент ли мне этот человек» в заметках и срез записей клиентов, — и оба
   * обязаны понимать владение одинаково: разойдясь, они начнут считать клиентом
   * разных людей.
   *
   * Отбор идёт по индексам `clubs_managed_by_user_id_idx` и
   * `trainers_managed_by_user_id_idx`; скрытые публикации НЕ отбрасываются —
   * записи на них остаются записями провайдера, и терять их кабинет не должен.
   *
   * Пустые наборы означают ровно «публикаций нет»: фильтры записей понимают это
   * как «не подходит никто», а не как «отбора нет».
   */
  async getManagedPublicationIds(userId: number): Promise<OwnerIdFilter> {
    const [clubs, trainers] = await Promise.all([
      this.clubs.findAll({ managedByUserId: userId }),
      this.trainers.findAll({ managedByUserId: userId }),
    ]);

    return {
      clubIds: clubs.map((club) => club.id),
      trainerIds: trainers.map((trainer) => trainer.id),
    };
  }

  async isManagerOfClub(clubId: number, userId: number): Promise<boolean> {
    const club = await this.clubs.findById(clubId);

    return club?.managedByUserId === userId;
  }

  async isManagerOfTrainer(trainerId: number, userId: number): Promise<boolean> {
    const trainer = await this.trainers.findById(trainerId);

    return trainer?.managedByUserId === userId;
  }

  /**
   * Клиент ли атлет у провайдера. Сам критерий чистый и одинаков для фронта и
   * бэкенда, поэтому живёт в `@sporthub/domain`; здесь метод остаётся ради
   * единой точки входа во все проверки прав.
   */
  isClientOfProvider(
    clientUserId: number,
    providerUserId: number,
    bookings: Booking[],
    clubs: Club[],
    trainers: Trainer[],
  ): boolean {
    return isClientOfProviderRule(clientUserId, providerUserId, bookings, clubs, trainers);
  }
}
