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
import type { Booking, Club, Trainer } from '@sporthub/types';

import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';
import type { UsersRepository } from '../repositories/crud.repository';
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
    const clubId = booking.clubId ?? (booking.ownerType === 'club' ? booking.ownerId : undefined);
    const trainerId =
      booking.trainerId ?? (booking.ownerType === 'trainer' ? booking.ownerId : undefined);

    if (clubId !== undefined && (await this.isManagerOfClub(clubId, userId))) {
      return true;
    }

    if (trainerId !== undefined && (await this.isManagerOfTrainer(trainerId, userId))) {
      return true;
    }

    return false;
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
   * Клиент ли атлет у провайдера. Критерий — существование записи на сущность,
   * которой провайдер управляет. Отменённые и прошедшие записи тоже считаются:
   * заметка о клиенте остаётся актуальной и после окончания занятий.
   */
  isClientOfProvider(
    clientUserId: number,
    providerUserId: number,
    bookings: Booking[],
    clubs: Club[],
    trainers: Trainer[],
  ): boolean {
    const providerClubIds = new Set(
      clubs.filter((club) => club.managedByUserId === providerUserId).map((club) => club.id),
    );
    const providerTrainerIds = new Set(
      trainers
        .filter((trainer) => trainer.managedByUserId === providerUserId)
        .map((trainer) => trainer.id),
    );

    if (providerClubIds.size === 0 && providerTrainerIds.size === 0) {
      return false;
    }

    return bookings.some((booking) => {
      if (booking.userId !== clientUserId) return false;

      const clubId = booking.clubId ?? (booking.ownerType === 'club' ? booking.ownerId : undefined);
      if (clubId !== undefined && providerClubIds.has(clubId)) return true;

      const trainerId =
        booking.trainerId ?? (booking.ownerType === 'trainer' ? booking.ownerId : undefined);
      if (trainerId !== undefined && providerTrainerIds.has(trainerId)) return true;

      return false;
    });
  }
}
