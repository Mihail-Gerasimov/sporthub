// Сервис публикаций: создание, правка и уборка клубов и карточек тренера.
//
// «Уборка», а не «удаление», с шага 35.24a: у владельца это АРХИВ (лицо уходит
// из каталога, история остаётся), у модератора — стирание. Оба исхода проходят
// через один запрет: пока на лицо записаны люди, убрать его нельзя.
//
// Самые тяжёлые операции проекта — до пяти коллекций в одной транзакции.
// Раньше каждая из них собирала полные массивы коллекций вручную и передавала
// их снимками. Здесь то же самое выражено через репозитории внутри транзакции,
// поэтому в фазе базы вызывающий код не меняется вовсе.

import { ACTIVE_BOOKING_STATUSES, notificationPayload } from '@sporthub/domain';
import { Inject, Injectable } from '@nestjs/common';
import type { Club, Offering, Schedule, Trainer } from '@sporthub/types';

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../common/domain-error';
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
  type ClubEditForm,
  type ClubForm,
  type TrainerEditForm,
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
import type { OwnerIdFilter, ReviewsRepository } from '../repositories/crud.repository';
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
import { NotificationService } from '../notifications/notification.service';

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
  /**
   * Расписание правки (шаг 36.5, решение заказчика 1).
   *
   * ⚠️ `undefined` и `[]` означают РАЗНОЕ, и различие стоит чужих записей.
   * `undefined` — «расписание не присылали, не трогать вовсе». `[]` — «убрать
   * все слоты», и записи на них будут отменены от имени провайдера. До этой
   * фазы поле было обязательным, и клиент, правивший один телефон, обязан был
   * прислать расписание целиком: не прислал — потерял его молча, с успешным
   * ответом.
   */
  slots?: PublicationSlotInput[];
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

/**
 * Что произошло с публикацией по запросу «убрать» (шаг 35.24a).
 *
 * Исход возвращается наружу, а не остаётся внутри сервиса: от него зависит запись
 * в журнале — «убрана из каталога» и «стёрта» это разные события, и аудит, который
 * называет их одинаково, врёт. Значение размеченное, а не булево: третий исход
 * (например, «убрана с уведомлением клиентов») добавится веткой, а компилятор
 * покажет все места, где её забыли обработать.
 */
export type PublicationRemoval = 'archived' | 'deleted';

/**
 * Текст отказа «сначала разберитесь с людьми» — ОДНО объявление на все поводы.
 *
 * Поводов уже два: убрать лицо (шаг 35.24a) и убрать занятие из расписания
 * (шаг 36.8). Смысл у отказа один, и второй экземпляр текста разъехался бы
 * с первым при первой же правке формулировки.
 *
 * ⚠️ Текст обязан объяснять причину и называть следующий шаг: «нельзя» без
 * причины владелец прочитает как поломку приложения и напишет в поддержку.
 */
function bookingsInTheWayMessage(action: string, count: number): string {
  return (
    `Нельзя ${action}: на ближайшие занятия записаны люди (${count}). ` +
    'Сначала отмените эти записи — участники получат уведомления — и повторите.'
  );
}

/**
 * Причина скрытия, которую ставит сам владелец.
 *
 * Объявлена ОДИН раз и здесь: её читает карточка публикации в разделе модерации,
 * и вторая копия строки разъехалась бы при первой же правке формулировки.
 */
export const OWNER_ARCHIVE_REASON = 'Убрано владельцем из каталога';

/**
 * Что делать со скрытием, когда владелец правит публикацию (шаг 36.20, решение 15).
 *
 * ⚠️ Смена продуктового поведения. Прежде правка снимала скрытие ВСЕГДА: владелец
 * нажимал «Сохранить» — и публикация возвращалась в каталог. То есть модерация
 * обходилась одним нажатием, а решение модератора не стоило ничего.
 *
 * Развилка проходит по ВИДУ скрытия, а не по факту:
 *
 * - скрыл модератор → публикация остаётся скрытой и получает признак «исправлено,
 *   ждёт повторной проверки». Модератор узнаёт об этом уведомлением;
 * - убрал сам владелец → правка возвращает в каталог, как и раньше. Это не
 *   послабление, а сохранение существующего пути: другой кнопки «вернуть из архива»
 *   у владельца нет, и без этой ветки архив стал бы билетом в один конец.
 *
 * ⚠️ Скрытая БЕЗ вида считается работой модератора. После миграции таких строк
 * не остаётся, но ошибаться здесь надо в сторону сохранения скрытия: «вернули
 * в каталог то, что прятал модератор» — дефект, а «не вернули из архива» —
 * неудобство, которое видно и лечится вторым нажатием.
 */
function hiddenStatePatchOnEdit(
  current: Pick<Club, 'status' | 'hiddenKind'>,
): Partial<Club> & Partial<Trainer> {
  if (current.status !== 'hidden') {
    return {};
  }

  if (current.hiddenKind === 'owner_archive') {
    return {
      status: 'published',
      hideReason: undefined,
      hiddenByUserId: undefined,
      hiddenAt: undefined,
      hiddenKind: undefined,
      awaitingRecheck: false,
    };
  }

  // Скрытие сохраняется целиком: и статус, и причина, и кто скрыл. Меняется одно —
  // модерация узнаёт, что публикацию исправили.
  return { awaitingRecheck: true };
}

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
    // Уведомление модератору о правке скрытой публикации (шаг 36.21).
    private readonly notifications: NotificationService,
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

    const hiddenPatch = hiddenStatePatchOnEdit(current);
    const club = await this.clubs.update(input.clubId, {
      ...input.club,
      ...hiddenPatch,
    });

    await this.notifyModeratorOfRecheck(hiddenPatch, current, {
      kind: 'club',
      id: input.clubId,
      name: club.name,
    });

    const updatedOffering = await this.offerings.update(offering.id, input.offering);
    const schedules = await this.applySlots(
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
    /** См. `UpdateClubInput.slots`: `undefined` — не трогать, `[]` — убрать все. */
    slots?: PublicationSlotInput[];
  }): Promise<{ trainer: Trainer; offering: Offering; schedules: Schedule[] }> {
    return this.transactions.runInTransaction(() => this.updateTrainerInner(input));
  }

  private async updateTrainerInner(input: {
    trainerId: number;
    userId: number;
    trainer: Partial<Trainer>;
    offering: Partial<Offering>;
    slots?: PublicationSlotInput[];
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

    const hiddenPatch = hiddenStatePatchOnEdit(current);
    const trainer = await this.trainers.update(input.trainerId, {
      ...input.trainer,
      ...hiddenPatch,
    });

    await this.notifyModeratorOfRecheck(hiddenPatch, current, {
      kind: 'trainer',
      id: input.trainerId,
      name: trainer.name,
    });

    const updatedOffering = await this.offerings.update(offering.id, input.offering);
    const schedules = await this.applySlots(
      input.slots,
      offering.id,
      { trainerId: input.trainerId },
      input.userId,
    );

    return { trainer, offering: updatedOffering, schedules };
  }

  // --- Уборка лица: архив у владельца, стирание у модератора -------------------

  /**
   * Убрать клуб из каталога.
   *
   * ⚠️ Шаг 35.24a, решение заказчика 21. Раньше этот метод СТИРАЛ публикацию
   * вместе с чужой историей: записями людей на занятия, их отзывами и связями
   * с чужими тренерами. На живой базе у клуба 1 это было 9 записей, 2 отзыва
   * и 3 связи, и ни один из этих людей ничего бы не узнал — просто пришёл бы
   * на занятие, которого больше нет. Пока лицо мог завести только «провайдер»,
   * такое случалось редко; после фазы 35 лицо заводит любой вошедший, и
   * «завёл — передумал — убрал» становится обычным действием.
   *
   * Поэтому у метода теперь ДВА исхода, и выбирает между ними не флаг снаружи,
   * а тот, кто действует:
   *
   * - **владелец** свою публикацию ПРЯЧЕТ. Лицо уходит из каталога, новых записей
   *   не принимает (`BookingService.create`), но остаётся в базе целиком: отзывы —
   *   чужие слова, прошедшие записи — чужая история, связи с тренерами — чужие
   *   договорённости. Стирать это по нажатию одной кнопки владельцу нечем;
   * - **модератор** публикацию СТИРАЕТ. Жёсткое удаление сохранено ровно здесь
   *   и только здесь, потому что у него есть предмет, которого нет у скрытия:
   *   заведённое по ошибке лицо, дубль, спам, требование убрать данные. У админа
   *   для «спрятать» уже есть свой маршрут модерации, и «удалить» у него значит
   *   именно «стереть», а не «спрятать вторым способом».
   *
   * Оба исхода проходят через один запрет — живые записи на будущее (см.
   * `assertNoUpcomingBookings`).
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
   *
   * Возвращает то, что на самом деле произошло: журналу нужно записать событие,
   * а не намерение.
   */
  /**
   * Известить модератора, что владелец исправил скрытую публикацию (шаг 36.21).
   *
   * ⚠️ Адресат — тот, КТО СКРЫЛ. Это точнее, чем «всем администраторам»: разбирался
   * с публикацией конкретный человек, и продолжать разбирательство ему.
   *
   * ⚠️ Это НЕ «базовый набор человека», от которого администратор отстранён
   * решением 13. Это служебный инструмент надзора, и механизм для него уже есть:
   * колокольчик показывается любому вошедшему, включая администратора, — просто
   * до этой фазы ему никто не писал, и в базе у него было ноль строк.
   *
   * ⚠️ Отправка — ПОСЛЕ коммита. Уведомление о правке, которая не сохранилась, —
   * ложь, и она хуже молчания.
   *
   * Если скрывший неизвестен (строка из прошлого без номера), уведомление
   * не отправляется: раздел модерации всё равно показывает признак, и молчание
   * здесь честнее, чем письмо в никуда.
   */
  private async notifyModeratorOfRecheck(
    patch: Partial<Club> & Partial<Trainer>,
    current: Pick<Club, 'hiddenByUserId'>,
    publication: { kind: 'club' | 'trainer'; id: number; name: string },
  ): Promise<void> {
    if (patch.awaitingRecheck !== true || current.hiddenByUserId === undefined) {
      return;
    }

    const moderatorId = current.hiddenByUserId;

    await this.transactions.afterCommit(async () => {
      await this.notifications.notify(
        { userId: moderatorId },
        'publication_recheck_requested',
        notificationPayload('publication_recheck_requested', publication.kind, publication.id, {
          publicationName: publication.name,
        }),
      );
    });
  }

  /**
   * Можно ли скрыть публикацию прямо сейчас (шаг 36.19, решение заказчика 14).
   *
   * ⚠️ Тот же запрет, что у уборки лица, и по той же причине: дело не в целостности
   * данных, а в людях. Скрытая публикация исчезает из каталога, но УЖЕ СОЗДАННУЮ
   * запись не отменяет — человек по-прежнему ждёт занятие и узнает о беде, придя
   * к закрытой двери.
   *
   * ⚠️ Правило одно на владельца и на модератора. Право модерации даёт трогать чужую
   * вещь, а не отменять чужое занятие молча: модератору доступен обычный порядок —
   * связаться с владельцем, отменить записи, скрыть.
   *
   * ⚠️ Обратная сторона названа заказчиком и принята: модератор не сможет мгновенно
   * убрать публикацию с нарушением, пока на неё кто-то записан. Цена в другую
   * сторону — площадка молча подводит тех, кто уже заплатил временем.
   *
   * Метод публичный намеренно: его зовёт раздел модерации, и заводить там ВТОРУЮ
   * проверку живых записей нельзя — две копии разойдутся при первой же правке
   * набора действующих статусов.
   */
  async assertCanHide(owner: { kind: 'club' | 'trainer'; id: number }): Promise<void> {
    const filter =
      owner.kind === 'club'
        ? { clubIds: [owner.id], trainerIds: [] }
        : { clubIds: [], trainerIds: [owner.id] };

    await this.assertNoUpcomingBookings(
      filter,
      owner.kind === 'club' ? 'клуб' : 'карточку тренера',
      'скрыть',
    );
  }

  async removeClub(clubId: number, actor: PublicationActor): Promise<PublicationRemoval> {
    const club = await this.clubs.findById(clubId);

    if (!club) {
      throw new NotFoundError(`Клуб с id ${clubId} не найден`);
    }

    if (actor.kind === 'owner') {
      this.ensureManagedBy(club.managedByUserId, actor.userId, 'клуба', clubId);
    }

    await this.assertNoUpcomingBookings({ clubIds: [clubId], trainerIds: [] }, 'клуб');

    if (actor.kind === 'owner') {
      await this.clubs.update(clubId, this.archivePatch(actor.userId));

      return 'archived';
    }

    await this.cascadeDelete({ ownerType: 'club', ownerId: clubId });
    await this.clubs.remove(clubId);

    return 'deleted';
  }

  /** Убрать карточку тренера. Правила — те же, что у клуба. */
  async removeTrainer(trainerId: number, actor: PublicationActor): Promise<PublicationRemoval> {
    const trainer = await this.trainers.findById(trainerId);

    if (!trainer) {
      throw new NotFoundError(`Тренер с id ${trainerId} не найден`);
    }

    if (actor.kind === 'owner') {
      this.ensureManagedBy(trainer.managedByUserId, actor.userId, 'тренера', trainerId);
    }

    await this.assertNoUpcomingBookings({ clubIds: [], trainerIds: [trainerId] }, 'карточку');

    if (actor.kind === 'owner') {
      await this.trainers.update(trainerId, this.archivePatch(actor.userId));

      return 'archived';
    }

    await this.cascadeDelete({ ownerType: 'trainer', ownerId: trainerId });
    await this.trainers.remove(trainerId);

    return 'deleted';
  }

  /**
   * Пометка «лицо убрано из каталога».
   *
   * ⚠️ Второго механизма скрытия НЕ заводится. Поля `hiddenAt`, `hideReason`
   * и `hiddenByUserId` уже есть у клубов и карточек — ими пользуется модерация,
   * по ним же каталог отсекает скрытое (`excludeHidden`). Кнопка владельца
   * направлена ТУДА ЖЕ: пара «своё скрытие рядом с чужим» дала бы два источника
   * правды о видимости лица, и первый же запрос каталога пришлось бы учить обоим.
   *
   * Кто скрыл — записывается: в карточке публикации видно, убрал её владелец
   * или модератор, и разбор жалобы не упирается в «непонятно, кто это сделал».
   *
   * Обратный путь есть и он уже работает: правка публикации снимает скрытие
   * (`updateClubInner`/`updateTrainerInner`), то есть «вернуть в каталог» —
   * это сохранить карточку заново. Отдельной кнопки восстановления владельцу
   * не заводится, пока за ней нет второго потребителя.
   */
  private archivePatch(userId: number): Partial<Club> & Partial<Trainer> {
    return {
      status: 'hidden' as const,
      hideReason: OWNER_ARCHIVE_REASON,
      hiddenByUserId: userId,
      hiddenAt: new Date().toISOString(),
      // ⚠️ Шаг 36.12. Именно ЭТО отличает архив владельца от скрытия модератором,
      // а не текст причины: причина — содержимое поля, и владелец волен написать
      // в неё что угодно. Плашка на карточке читает признак, не строку.
      hiddenKind: 'owner_archive' as const,
      awaitingRecheck: false,
    };
  }

  /**
   * Запрет убирать лицо, пока на него записаны люди (шаг 35.24a, решение 21).
   *
   * ⚠️ Смысл запрета — не в целостности данных, а в людях. Архив прячет лицо
   * из каталога, но УЖЕ СОЗДАННУЮ запись он не отменяет: атлет по-прежнему ждёт
   * занятие, и если владелец просто уберёт публикацию, человек узнает об этом,
   * придя к закрытой двери. Поэтому порядок обязателен: сначала отмени записи —
   * отмена рассылает уведомления, — и только потом убирай лицо.
   *
   * ⚠️ Правило одно на владельца и на модератора. Каскад модератора сносит те же
   * чужие записи; право модерации даёт трогать чужую вещь, а не отменять занятие
   * молча. Ему доступен обычный порядок: скрыть публикацию своим маршрутом,
   * отменить записи, стереть.
   *
   * Считает база: `count` с отбором по публикациям, действующим статусам и дню
   * занятия. Ни одна строка записей не доезжает до приложения, и цена проверки
   * не зависит от того, сколько у лица записей за всю его историю.
   */
  private async assertNoUpcomingBookings(
    owners: OwnerIdFilter,
    label: string,
    // Глагол называется вызывающим: один и тот же запрет закрывает два разных
    // действия — «убрать» и «скрыть», — и отказ обязан говорить про то, что человек
    // на самом деле пытался сделать.
    verb = 'убрать',
  ): Promise<void> {
    // Сегодняшний день ВКЛЮЧИТЕЛЬНО: занятие сегодня вечером — такое же будущее,
    // как и завтрашнее. День берётся в UTC — тем же способом, каким день занятия
    // лежит в базе, иначе граница уехала бы на сутки для половины поясов.
    const today = new Date().toISOString().slice(0, 10);

    const upcoming = await this.bookings.count({
      owners,
      status: [...ACTIVE_BOOKING_STATUSES],
      dateFrom: today,
    });

    if (upcoming > 0) {
      throw new ConflictError(bookingsInTheWayMessage(`${verb} ${label}`, upcoming));
    }
  }

  /**
   * Запрет удалять слот, на который записаны люди (шаг 36.8, решение заказчика 2).
   *
   * ⚠️ Прежде такой слот удалялся, а записи на него отменялись «от имени
   * провайдера»: человек получал отмену, которую никто не заказывал, а надёжность
   * провайдера падала за его же правку формы. Правило то же, что у запрета убирать
   * лицо, и повод тот же — сначала разберись с людьми.
   *
   * Считает база: один `count` на ВЕСЬ набор удаляемых слотов. Перебор по слоту
   * дал бы столько запросов, сколько слотов убирают за раз.
   */
  private async assertNoUpcomingBookingsOnSlots(slotIds: number[]): Promise<void> {
    if (slotIds.length === 0) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const upcoming = await this.bookings.count({
      scheduleId: slotIds,
      status: [...ACTIVE_BOOKING_STATUSES],
      dateFrom: today,
    });

    if (upcoming > 0) {
      throw new ConflictError(
        bookingsInTheWayMessage(
          slotIds.length === 1
            ? 'убрать это занятие из расписания'
            : 'убрать эти занятия из расписания',
          upcoming,
        ),
      );
    }
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

  private assertNoDuplicateSlotIds(slots: PublicationSlotInput[] | undefined, label: string): void {
    const ids = (slots ?? []).map((slot) => slot.id).filter((id): id is number => id !== undefined);

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
   * Развилка правки расписания (шаг 36.5, решение заказчика 1).
   *
   * Расписания во входе нет — не трогаем его вовсе и отдаём существующее:
   * форма ответа не меняется, клиент рисует карточку по ней же, и пустой список
   * был бы тихой ложью — расписание на месте, а на экране его нет.
   *
   * Расписание есть — работает прежняя замена целиком, включая удаление того,
   * чего в теле не оказалось.
   */
  private async applySlots(
    slots: PublicationSlotInput[] | undefined,
    offeringId: number,
    owner: { clubId?: number; trainerId?: number },
    actorUserId?: number,
  ): Promise<Schedule[]> {
    if (slots === undefined) {
      return this.schedule.findByOfferingId(offeringId);
    }

    return this.syncSlots(slots, offeringId, owner, actorUserId);
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
    const keptIds = new Set<number>(
      slots.map((slot) => slot.id).filter((id): id is number => id !== undefined),
    );
    const result: Schedule[] = [];

    // Слоты, которых в теле не оказалось, — кандидаты на удаление.
    const removed = existing.filter((slot) => !keptIds.has(slot.id)).map((slot) => slot.id);

    // ⚠️ Шаг 36.8, решение заказчика 2. Проверка стоит ДО единой правки, а не перед
    // самим удалением: отказ обязан быть отказом целиком. Правка идёт в одной
    // транзакции и откатилась бы в любом случае, но полагаться на откат там, где
    // можно просто не начинать, — значит проверять последствия вместо причины.
    await this.assertNoUpcomingBookingsOnSlots(removed);

    for (const input of slots) {
      if (input.id !== undefined) {
        const current = existingById.get(input.id);

        if (!current) {
          const label = owner.clubId !== undefined ? 'клуба' : 'тренера';
          throw new NotFoundError(`Слот ${label} с id ${input.id} не найден`);
        }

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
    form: ClubEditForm,
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
    form: TrainerEditForm,
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
