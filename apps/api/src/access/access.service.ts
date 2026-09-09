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
import type { Booking, Club, ServiceFaceRef, Trainer } from '@sporthub/types';

import { ForbiddenError } from '../common/domain-error';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';
import type { OwnerIdFilter, UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

/**
 * Предмет проверки «сам себе» — размеченное объединение.
 *
 * Объединение, а не шесть перегрузок: у вызывающего всегда есть ровно один предмет,
 * и тип не даёт перепутать поля. Новый вид предмета добавляется веткой, а компилятор
 * покажет все места, где её забыли обработать.
 */
export type SelfDealingTarget =
  | { kind: 'club'; clubId: number }
  | { kind: 'trainer'; trainerId: number }
  | { kind: 'booking'; booking: Booking }
  | { kind: 'client'; clientUserId: number }
  | { kind: 'user'; targetUserId: number };

@Injectable()
export class AccessService {
  constructor(
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingsRepository,
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

  /**
   * Одно названное лицо как ограничение по публикациям — с проверкой владения
   * (шаг 35.27a).
   *
   * ⚠️ Лицо приезжает СНАРУЖИ, строкой запроса, поэтому владение сверяется здесь,
   * а не подразумевается. Отказ обязан остаться отказом: пустая выдача вместо 403
   * читалась бы как «клиентов пока нет» и прятала бы то, что спрашивать это лицо
   * было нечем, — ровно тот вид тихой поломки, ради которого фаза завела «тихие»
   * диверсии.
   *
   * Возвращает тот же вид ограничения, что и `getManagedPublicationIds`, — один
   * набор понимают все потребители (записи публикаций, клиенты, заметки), и
   * разойтись в понимании владения им негде.
   */
  async requireOwnedFace(userId: number, face: ServiceFaceRef): Promise<OwnerIdFilter> {
    if (!(await this.isManagerOfFace(face, userId))) {
      throw new ForbiddenError('Недостаточно прав');
    }

    return face.type === 'club'
      ? { clubIds: [face.id], trainerIds: [] }
      : { clubIds: [], trainerIds: [face.id] };
  }

  /**
   * Лица человека, к которым этот клиент действительно ходил (шаг 35.27a).
   *
   * Нужно там, где лицо не назвали: заметка обязана лечь при лице, а гадать
   * нельзя. Считает база — группировкой по публикациям, а не чтением записей:
   * наружу приезжает по строке на лицо, а не по строке на занятие.
   *
   * ⚠️ Пересечение с владениями делается ЗДЕСЬ и обязательно. Группировка
   * возвращает и клуб-площадку тренерского занятия, а он бывает чужим: без
   * пересечения в ответе оказалось бы лицо, которым спрашивающий не владеет.
   * Строк тут единицы — это разбор ответа, а не отбор данных в памяти.
   */
  async facesVisitedBy(clientUserId: number, owners: OwnerIdFilter): Promise<ServiceFaceRef[]> {
    if (owners.clubIds.length + owners.trainerIds.length === 0) {
      return [];
    }

    const rows = await this.bookings.countByOwner({ userId: clientUserId, owners });
    const allowed = {
      club: new Set(owners.clubIds),
      trainer: new Set(owners.trainerIds),
    };

    return rows
      .filter((row) => allowed[row.type].has(row.id))
      .map((row) => ({ type: row.type, id: row.id }));
  }

  /**
   * Управляет ли человек этим лицом — один вопрос вместо развилки по видам.
   *
   * Развилка `club`/`trainer` живёт здесь и только здесь: разложенная по местам
   * вызова, она обязала бы править каждое из них при появлении третьего вида лица.
   */
  async isManagerOfFace(face: ServiceFaceRef, userId: number): Promise<boolean> {
    return face.type === 'club'
      ? this.isManagerOfClub(face.id, userId)
      : this.isManagerOfTrainer(face.id, userId);
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
   * Одно ли лицо по обе стороны действия (шаг 35.9).
   *
   * Фаза 35 убирает роли, и вместе с ними исчезают случайные преграды: сегодня
   * владелец клуба не может записаться к себе только потому, что записываться
   * умеет лишь роль атлета. Как только роли не станет, человек сможет оказаться
   * обеими сторонами сделки — записаться к себе, подтвердить собственную заявку,
   * отметить себе посещение и написать себе отзыв. Это и есть накрутка рейтинга
   * стоимостью в три запроса.
   *
   * ⚠️ Правило живёт ЗДЕСЬ, а не россыпью `if` по контроллерам. Владение уже
   * спрашивают у этого сервиса; спроси «сам себе» в другом месте — и две правды
   * о владении разойдутся при первой же правке.
   *
   * ⚠️ Своего чтения владельца метод НЕ заводит: он собран поверх `isManagerOfClub`,
   * `isManagerOfTrainer` и `isProviderOfBooking`. Копия логики владения разошлась бы
   * с оригиналом ровно так же, как расходились три копии `isClientOfProvider` до фазы 33.
   *
   * Метод отвечает на вопрос «одно ли это лицо», а решение — запрет или разрешение —
   * принимает вызывающий: решения заказчика 16 и 22 две такие ситуации прямо разрешают.
   */
  async isSelfDealing(userId: number, target: SelfDealingTarget): Promise<boolean> {
    switch (target.kind) {
      case 'club':
        return this.isManagerOfClub(target.clubId, userId);
      case 'trainer':
        return this.isManagerOfTrainer(target.trainerId, userId);
      case 'booking':
        // Обе стороны записи: клиент — это `booking.userId`, сторона услуг —
        // владелец слота. Совпали — значит человек по обе стороны.
        return target.booking.userId === userId
          ? this.isProviderOfBooking(target.booking, userId)
          : false;
      case 'client':
        // Заметка о самом себе и собственная строка в списке клиентов.
        return target.clientUserId === userId;
      case 'user':
        // Работа от лица самого себя.
        return target.targetUserId === userId;
      default:
        return false;
    }
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
