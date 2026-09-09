// Сервис публикаций: создание, правка и удаление клубов и тренеров.
//
// Самые тяжёлые операции проекта — до пяти коллекций в одной транзакции.
// Раньше каждая из них собирала полные массивы коллекций вручную и передавала
// их снимками. Здесь то же самое выражено через репозитории внутри транзакции,
// поэтому в фазе базы вызывающий код не меняется вовсе.

import { ACTIVE_BOOKING_STATUSES } from '@sporthub/domain';
import { Inject, Injectable } from '@nestjs/common';
import type { Club, Offering, Schedule, Trainer } from '@sporthub/types';

import { ForbiddenError, NotFoundError, ValidationError } from '../common/domain-error';
import type { TransactionRunner } from '../storage/transaction-runner';
import { TRANSACTION_RUNNER } from '../storage/transaction-runner';
import {
  clubFromForm,
  clubOfferingFromForm,
  clubOfferingPatchFromForm,
  clubPatchFromForm,
  slotsFromForm,
  trainerFromForm,
  trainerOfferingFromForm,
  trainerOfferingPatchFromForm,
  trainerPatchFromForm,
  type ClubForm,
  type TrainerForm,
} from './publication-form';
import type {
  OfferingsRepository,
  TrainerClubLinksRepository,
} from '../repositories/catalog.repository';
import {
  OFFERINGS_REPOSITORY,
  TRAINER_CLUB_LINKS_REPOSITORY,
} from '../repositories/catalog.repository';
import type { ReviewsRepository } from '../repositories/crud.repository';
import { REVIEWS_REPOSITORY } from '../repositories/crud.repository';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type {
  ClubsRepository,
  ScheduleRepository,
  TrainersRepository,
} from '../repositories/entities.repository';
import {
  CLUBS_REPOSITORY,
  SCHEDULE_REPOSITORY,
  TRAINERS_REPOSITORY,
} from '../repositories/entities.repository';
import { BookingService } from '../bookings/booking.service';

/** Слот в запросе на публикацию: без id — новый, с id — правка существующего. */
export type PublicationSlotInput = Omit<Schedule, 'id' | 'createdAt'> & {
  id?: number;
};

export type CreateClubInput = {
  club: Omit<Club, 'id' | 'createdAt'>;
  offering: Omit<Offering, 'id' | 'createdAt' | 'ownerId'>;
  slots: PublicationSlotInput[];
};

export type UpdateClubInput = {
  clubId: number;
  userId: number;
  club: Partial<Club>;
  offering: Partial<Offering>;
  slots: PublicationSlotInput[];
};

export type ClubPublicationResult = {
  club: Club;
  offering: Offering;
  schedules: Schedule[];
};

/**
 * От чьего лица удаляется публикация.
 *
 * Размеченное объединение, а не «номер или ничего»: пропуск проверки владения —
 * это НАМЕРЕНИЕ, и оно обязано быть названо. Прежняя форма `actorUserId?: number`
 * позволяла отключить сверку, просто забыв аргумент.
 */
export type PublicationActor = { kind: 'owner'; userId: number } | { kind: 'moderator' };

@Injectable()
export class PublicationService {
  constructor(
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    @Inject(OFFERINGS_REPOSITORY)
    private readonly offerings: OfferingsRepository,
    @Inject(SCHEDULE_REPOSITORY) private readonly schedule: ScheduleRepository,
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingsRepository,
    @Inject(REVIEWS_REPOSITORY) private readonly reviews: ReviewsRepository,
    @Inject(TRAINER_CLUB_LINKS_REPOSITORY)
    private readonly links: TrainerClubLinksRepository,
    // Отмена записей на удаляемый слот делается сервисом записей: у него
    // правила переходов, история, пересчёт мест и уведомления.
    private readonly bookingService: BookingService,
  ) {}

  // --- Создание ---------------------------------------------------------------

  async createClub(input: CreateClubInput): Promise<ClubPublicationResult> {
    // Клуб, услуга и слоты появляются вместе или не появляются вовсе:
    // клуб без основной услуги нельзя ни показать, ни забронировать.
    return this.transactions.runInTransaction(() => this.createClubInner(input));
  }

  private async createClubInner(input: CreateClubInput): Promise<ClubPublicationResult> {
    const club = await this.clubs.insert(input.club);
    const offering = await this.offerings.insert({
      ...input.offering,
      ownerType: 'club',
      ownerId: club.id,
    } as Omit<Offering, 'id' | 'createdAt'>);
    const schedules = await this.schedule.insertMany(
      input.slots.map((slot) => this.buildSlot(slot, { offeringId: offering.id, clubId: club.id })),
    );

    return { club, offering, schedules };
  }

  async createTrainer(input: {
    trainer: Omit<Trainer, 'id' | 'createdAt'>;
    offering: Omit<Offering, 'id' | 'createdAt' | 'ownerId'>;
    slots: PublicationSlotInput[];
    clubId?: number | null;
    userId: number;
  }): Promise<{ trainer: Trainer; offering: Offering; schedules: Schedule[] }> {
    return this.transactions.runInTransaction(() => this.createTrainerInner(input));
  }

  private async createTrainerInner(input: {
    trainer: Omit<Trainer, 'id' | 'createdAt'>;
    offering: Omit<Offering, 'id' | 'createdAt' | 'ownerId'>;
    slots: PublicationSlotInput[];
    clubId?: number | null;
    userId: number;
  }): Promise<{ trainer: Trainer; offering: Offering; schedules: Schedule[] }> {
    const trainer = await this.trainers.insert(input.trainer);

    // Публикация тренера «в клубе» сразу создаёт подтверждённую связь:
    // одна и та же сторона управляет обеими сущностями, согласовывать не с кем.
    let trainerClubLinkId: number | undefined;
    if (input.clubId !== undefined && input.clubId !== null) {
      const link = await this.links.insert({
        trainerId: trainer.id,
        clubId: input.clubId,
        status: 'confirmed',
        initiatedBy: 'trainer',
        approvedAt: new Date().toISOString(),
        approvedByUserId: input.userId,
      });
      trainerClubLinkId = link.id;
    }

    const offering = await this.offerings.insert({
      ...input.offering,
      ownerType: 'trainer',
      ownerId: trainer.id,
      ...(trainerClubLinkId !== undefined ? { trainerClubLinkId } : {}),
    } as Omit<Offering, 'id' | 'createdAt'>);

    const schedules = await this.schedule.insertMany(
      input.slots.map((slot) =>
        this.buildSlot(slot, {
          offeringId: offering.id,
          trainerId: trainer.id,
        }),
      ),
    );

    return { trainer, offering, schedules };
  }

  // --- Правка -----------------------------------------------------------------

  async updateClub(input: UpdateClubInput): Promise<ClubPublicationResult> {
    return this.transactions.runInTransaction(() => this.updateClubInner(input));
  }

  private async updateClubInner(input: UpdateClubInput): Promise<ClubPublicationResult> {
    const current = await this.clubs.findById(input.clubId);

    if (!current) {
      throw new NotFoundError(`Клуб с id ${input.clubId} не найден`);
    }

    this.ensureManagedBy(current.managedByUserId, input.userId, 'клуба', input.clubId);

    const offering = await this.offerings.findFirst({
      ownerType: 'club',
      ownerId: input.clubId,
    });

    if (!offering) {
      throw new NotFoundError(`Основная услуга клуба с id ${input.clubId} не найдена`);
    }

    this.assertNoDuplicateSlotIds(input.slots, 'клуба');

    // Правка снимает скрытие: модератор прячет публикацию, автор её исправляет.
    const club = await this.clubs.update(input.clubId, {
      ...input.club,
      ...(current.status === 'hidden'
        ? {
            status: 'published',
            hideReason: undefined,
            hiddenByUserId: undefined,
            hiddenAt: undefined,
          }
        : {}),
    });

    const updatedOffering = await this.offerings.update(offering.id, input.offering);
    const schedules = await this.syncSlots(
      input.slots,
      offering.id,
      { clubId: input.clubId },
      input.userId,
    );

    return { club, offering: updatedOffering, schedules };
  }

  async updateTrainer(input: {
    trainerId: number;
    userId: number;
    trainer: Partial<Trainer>;
    offering: Partial<Offering>;
    slots: PublicationSlotInput[];
  }): Promise<{ trainer: Trainer; offering: Offering; schedules: Schedule[] }> {
    return this.transactions.runInTransaction(() => this.updateTrainerInner(input));
  }

  private async updateTrainerInner(input: {
    trainerId: number;
    userId: number;
    trainer: Partial<Trainer>;
    offering: Partial<Offering>;
    slots: PublicationSlotInput[];
  }): Promise<{ trainer: Trainer; offering: Offering; schedules: Schedule[] }> {
    const current = await this.trainers.findById(input.trainerId);

    if (!current) {
      throw new NotFoundError(`Тренер с id ${input.trainerId} не найден`);
    }

    this.ensureManagedBy(current.managedByUserId, input.userId, 'тренера', input.trainerId);

    const offering = await this.offerings.findFirst({
      ownerType: 'trainer',
      ownerId: input.trainerId,
    });

    if (!offering) {
      throw new NotFoundError(`Основная услуга тренера с id ${input.trainerId} не найдена`);
    }

    this.assertNoDuplicateSlotIds(input.slots, 'тренера');

    const trainer = await this.trainers.update(input.trainerId, {
      ...input.trainer,
      ...(current.status === 'hidden'
        ? {
            status: 'published',
            hideReason: undefined,
            hiddenByUserId: undefined,
            hiddenAt: undefined,
          }
        : {}),
    });

    const updatedOffering = await this.offerings.update(offering.id, input.offering);
    const schedules = await this.syncSlots(
      input.slots,
      offering.id,
      { trainerId: input.trainerId },
      input.userId,
    );

    return { trainer, offering: updatedOffering, schedules };
  }

  // --- Удаление ---------------------------------------------------------------

  /**
   * Удалить клуб вместе с услугами, слотами, записями и отзывами.
   *
   * ⚠️ Фаза 34: появилась проверка владельца. До неё удалить публикацию мог кто
   * угодно — маршрут даже не читал тело запроса, — и вместе с ней исчезали все
   * записи людей на занятия. Проверка стоит ЗДЕСЬ, а не в контроллере, по той же
   * причине, что и у правки: владелец известен репозиторию, а выдача каталога
   * это поле наружу не отдаёт вовсе.
   *
   * ⚠️ Шаг 35.25. Раньше «не проверять владельца» кодировалось ОТСУТСТВИЕМ
   * значения: контроллер передавал `undefined`, и сверка молча пропускалась.
   * Это единственное место проекта, где право ОТМЕНЯЛО проверку владения, а не
   * дополняло её, — и любая ошибка в сторону «положено» открывала удаление любой
   * чужой публикации со всеми записями людей, отзывами и связями. Ответ 200,
   * в журнале корректная запись, восстановить нечем.
   *
   * Теперь намерение называется вслух: `{ kind: 'owner' }` или `{ kind: 'moderator' }`.
   * Пропуск проверки нельзя выразить случайно — забытый аргумент не соберётся.
   */
  async deleteClub(clubId: number, actor: PublicationActor): Promise<void> {
    const club = await this.clubs.findById(clubId);

    if (!club) {
      throw new NotFoundError(`Клуб с id ${clubId} не найден`);
    }

    if (actor.kind === 'owner') {
      this.ensureManagedBy(club.managedByUserId, actor.userId, 'клуба', clubId);
    }

    await this.cascadeDelete({ ownerType: 'club', ownerId: clubId });
    await this.clubs.remove(clubId);
  }

  /** Удалить карточку тренера. Правило владения — то же, что у клуба. */
  async deleteTrainer(trainerId: number, actor: PublicationActor): Promise<void> {
    const trainer = await this.trainers.findById(trainerId);

    if (!trainer) {
      throw new NotFoundError(`Тренер с id ${trainerId} не найден`);
    }

    if (actor.kind === 'owner') {
      this.ensureManagedBy(trainer.managedByUserId, actor.userId, 'тренера', trainerId);
    }

    await this.cascadeDelete({ ownerType: 'trainer', ownerId: trainerId });
    await this.trainers.remove(trainerId);
  }

  // --- Вспомогательное --------------------------------------------------------

  /** Проверка владения. Текст ошибки перенесён дословно — роут маппит его в 403. */
  private ensureManagedBy(
    managedByUserId: number | undefined,
    expectedUserId: number,
    label: string,
    entityId: number,
  ): void {
    if (managedByUserId !== expectedUserId) {
      throw new ForbiddenError(`Недостаточно прав для редактирования ${label} с id ${entityId}`);
    }
  }

  private assertNoDuplicateSlotIds(slots: PublicationSlotInput[], label: string): void {
    const ids = slots.map((slot) => slot.id).filter((id): id is number => id !== undefined);

    if (new Set(ids).size !== ids.length) {
      throw new ValidationError(`В payload редактирования ${label} есть повторяющиеся id слотов`);
    }
  }

  private buildSlot(
    slot: PublicationSlotInput,
    owner: { offeringId: number; clubId?: number; trainerId?: number },
  ): Omit<Schedule, 'id' | 'createdAt'> {
    const { id: _ignored, ...rest } = slot;

    return {
      ...rest,
      offeringId: owner.offeringId,
      ownerType: owner.clubId !== undefined ? 'club' : 'trainer',
      ownerId: owner.clubId ?? owner.trainerId,
      ...(owner.clubId !== undefined ? { clubId: owner.clubId } : {}),
      ...(owner.trainerId !== undefined ? { trainerId: owner.trainerId } : {}),
    } as Omit<Schedule, 'id' | 'createdAt'>;
  }

  /**
   * Согласование расписания: слоты с id обновляются, без id — создаются,
   * отсутствующие в запросе — удаляются. Перенос даты слота тянет за собой
   * даты уже созданных записей, иначе они разъедутся с расписанием.
   */
  private async syncSlots(
    slots: PublicationSlotInput[],
    offeringId: number,
    owner: { clubId?: number; trainerId?: number },
    // Кто правит расписание: он же указывается актором отмены записей.
    actorUserId?: number,
  ): Promise<Schedule[]> {
    const existing = await this.schedule.findByOfferingId(offeringId);
    const existingById = new Map(existing.map((slot) => [slot.id, slot]));
    const keptIds = new Set<number>();
    const result: Schedule[] = [];

    for (const input of slots) {
      if (input.id !== undefined) {
        const current = existingById.get(input.id);

        if (!current) {
          const label = owner.clubId !== undefined ? 'клуба' : 'тренера';
          throw new NotFoundError(`Слот ${label} с id ${input.id} не найден`);
        }

        keptIds.add(input.id);
        // Занятые места принадлежат записям, а не форме: правка расписания
        // не имеет права их обнулять, иначе слот «освободится» под уже
        // существующими бронями.
        const { id: _ignored, bookedCount: _bookedCount, ...patch } = input;
        const updated = await this.schedule.update(input.id, patch);
        result.push(updated);

        if (current.date !== updated.date) {
          await this.bookings.updateDateByScheduleId(updated.id, updated.date);
        }
      }
    }

    const created = await this.schedule.insertMany(
      slots
        .filter((slot) => slot.id === undefined)
        .map((slot) => this.buildSlot(slot, { offeringId, ...owner })),
    );
    result.push(...created);

    const removed = existing.filter((slot) => !keptIds.has(slot.id)).map((slot) => slot.id);

    // ⚠️ Перед удалением слота его записи надо отменить, а не бросить.
    //
    // Раньше запись просто повисала на несуществующем слоте: в файле это было
    // возможно, в базе — нет, там стоит внешний ключ. Каскад тоже не годится:
    // он стёр бы историю атлета, включая уже прошедшие занятия. Поэтому записи
    // переводятся в «отменено провайдером» — атлет видит отмену, а не пустоту,
    // места освобождаются, уведомления уходят после коммита.
    for (const slotId of removed) {
      await this.cancelBookingsOfRemovedSlot(slotId, actorUserId);
    }

    // ⚠️ ЗАВЕРШЁННУЮ запись отменить нечем: правила переходов из завершения не выводят,
    // и это правильно — занятие состоялось. Но и держать слот из-за неё нельзя: провайдер
    // просил убрать занятие из расписания, а «успех, но слот остался» — молчаливый
    // полууспех, худший из возможных ответов.
    //
    // Поэтому ссылка записи на слот обнуляется (внешний ключ `SetNull`), а сама запись
    // остаётся: дата, цена и вид спорта записаны в ней снимком на момент бронирования.
    // История атлета цела, расписание чистое, порчи данных нет.
    // Ссылка на слот снимается ЯВНО, а не только внешним ключом.
    //
    // В базе `SetNull` сделал бы это сам, но файловая реализация — путь отката — про
    // внешние ключи не знает. Явный шаг уравнивает оба хранилища: один и тот же набор
    // проверок обязан давать один и тот же результат, иначе откат приведёт к другому
    // состоянию данных, чем то, из которого откатывались.
    for (const slotId of removed) {
      const attached = await this.bookings.findMany({ scheduleId: slotId });

      for (const booking of attached) {
        await this.bookings.update(booking.id, { scheduleId: null });
      }
    }

    await this.schedule.removeMany(removed);

    return result;
  }

  /**
   * Отмена записей на удаляемый слот.
   *
   * Переход делает сам сервис записей: у него правила переходов, история,
   * пересчёт мест и уведомления. Дублировать это здесь означало бы завести
   * вторую, расходящуюся копию тех же правил.
   */
  private async cancelBookingsOfRemovedSlot(
    scheduleId: number,
    actorUserId: number | undefined,
  ): Promise<void> {
    const affected = await this.bookings.findMany({
      scheduleId,
      status: [...ACTIVE_BOOKING_STATUSES],
    });

    for (const booking of affected) {
      await this.bookingService.transition({
        bookingId: booking.id,
        to: 'cancelled_by_provider',
        actor: 'provider',
        actorUserId,
        reason: 'Занятие отменено: слот удалён из расписания',
      });
    }
  }

  /** Каскад: услуги, их слоты, записи и отзывы владельца. */
  private cascadeDelete(owner: { ownerType: 'club' | 'trainer'; ownerId: number }): Promise<void> {
    // Удаление затрагивает пять коллекций: половинчатый результат оставил бы
    // записи на несуществующие слоты.
    return this.transactions.runInTransaction(() => this.cascadeDeleteInner(owner));
  }

  private async cascadeDeleteInner(owner: {
    ownerType: 'club' | 'trainer';
    ownerId: number;
  }): Promise<void> {
    const offerings = await this.offerings.findMany(owner);
    const offeringIds = offerings.map((offering) => offering.id);
    const ownerFilter =
      owner.ownerType === 'club' ? { clubId: owner.ownerId } : { trainerId: owner.ownerId };

    // ⚠️ Порядок обязателен и изменён относительно прежней версии.
    //
    // Раньше сначала удалялись слоты, потом записи: файлу порядок был безразличен.
    // В базе порядок значим, но НЕ из-за запрета на удаление: миграция
    // `20260820165041_detachable_booking_slot` перевела ссылку записи на слот
    // в `ON DELETE SET NULL` — слот удаляемой публикации отцепляется от записи,
    // а не блокирует удаление. Порядок важен по другой причине: удали мы слоты
    // первыми, записи ЭТОЙ ЖЕ публикации успели бы потерять ссылку на слот
    // прежде, чем их саму удалит следующая строка, и в журнале осталась бы
    // запись без слота. Поэтому записи убираются первыми, и только потом слоты.
    // Поведение прежнее: тот же набор строк исчезает, меняется лишь очерёдность.
    //
    // Ручной перебор здесь оставлен намеренно: та же чистка описана каскадами
    // в схеме, но файловая реализация каскадов не знает, а она жива как путь
    // отката. Когда путь отката снимут, этот метод схлопнется до удаления
    // владельца — база доделает остальное сама.
    await this.bookings.removeMany(ownerFilter);
    await this.reviews.removeMany(ownerFilter);

    for (const offeringId of offeringIds) {
      const slots = await this.schedule.findByOfferingId(offeringId);
      await this.schedule.removeMany(slots.map((slot) => slot.id));
    }

    await this.offerings.removeMany(offeringIds);
  }

  // --- Публикация из формы провайдера -----------------------------------------

  /** Создание клуба из формы модалки. */
  createClubFromForm(form: ClubForm, userId: number): Promise<ClubPublicationResult> {
    return this.createClub({
      club: clubFromForm(form, userId),
      offering: clubOfferingFromForm(form),
      slots: slotsFromForm(form),
    });
  }

  /** Правка клуба из формы. Системные поля клуб сохраняет свои. */
  updateClubFromForm(
    form: ClubForm,
    clubId: number,
    userId: number,
  ): Promise<ClubPublicationResult> {
    return this.updateClub({
      clubId,
      userId,
      club: clubPatchFromForm(form),
      offering: clubOfferingPatchFromForm(form),
      slots: slotsFromForm(form),
    });
  }

  createTrainerFromForm(
    form: TrainerForm,
    userId: number,
  ): Promise<{ trainer: Trainer; offering: Offering; schedules: Schedule[] }> {
    return this.createTrainer({
      trainer: trainerFromForm(form, userId),
      offering: trainerOfferingFromForm(form),
      slots: slotsFromForm(form),
      clubId: form.clubId ?? null,
      userId,
    });
  }

  updateTrainerFromForm(
    form: TrainerForm,
    trainerId: number,
    userId: number,
  ): Promise<{ trainer: Trainer; offering: Offering; schedules: Schedule[] }> {
    return this.updateTrainer({
      trainerId,
      userId,
      trainer: trainerPatchFromForm(form),
      offering: trainerOfferingPatchFromForm(form),
      slots: slotsFromForm(form),
    });
  }
}
