import { describe, expectTypeOf, expect, it } from 'vitest';

import type {
  Booking,
  BookingActor,
  BookingStatus,
  BookingStatusTransition,
  CancellationPolicy,
  CancelReason,
  CatalogOwnerType,
  Club,
  Coordinates,
  EntityId,
  EntitySource,
  EntityStatus,
  ISODateTimeString,
  LogAction,
  Notification,
  OwnedNotification,
  SupervisionNotification,
  NotificationType,
  Offering,
  OfferingFormat,
  Review,
  Schedule,
  Trainer,
  TrainerClubLink,
  TrainerClubLinkStatus,
} from '@sporthub/types';

const trainerFixture: Trainer = {
  id: 101,
  createdAt: '2026-03-19T09:00:00.000Z',
  name: 'Илья Романов',
  slug: 'ilya-romanov',
  bio: 'Независимый тренер по функциональному тренингу.',
  avatarUrl: '/images/trainers/ilya-romanov.jpg',
  experienceYears: 8,
  specialtyIds: [1, 2],
  workFormatIds: [1],
  rating: 4.8,
  reviewCount: 12,
  priceFrom: 1800,
  sportIds: [4, 6],
  city: 'Самара',
  address: 'ул. Ново-Садовая, 181А',
  coordinates: {
    lat: 53.2251,
    lng: 50.1664,
  },
};

const offeringFixture: Offering = {
  id: 501,
  createdAt: '2026-03-19T09:00:00.000Z',
  ownerType: 'trainer',
  ownerId: trainerFixture.id,
  sportId: 4,
  title: 'Персональная функциональная тренировка',
  description: 'Индивидуальная сессия на силу и выносливость.',
  format: 'personal',
  price: 2200,
  durationMinutes: 60,
  capacity: 1,
  address: trainerFixture.address ?? 'Адрес уточняется',
  coordinates: trainerFixture.coordinates ?? { lat: 0, lng: 0 },
};

const scheduleFixture: Schedule = {
  id: 701,
  createdAt: '2026-03-19T09:00:00.000Z',
  offeringId: offeringFixture.id,
  ownerType: 'trainer',
  ownerId: trainerFixture.id,
  sportId: offeringFixture.sportId,
  title: offeringFixture.title,
  date: '2026-03-20',
  startTime: '10:00',
  endTime: '11:00',
  durationMinutes: offeringFixture.durationMinutes,
  level: 'all_levels',
  capacity: offeringFixture.capacity,
  bookedCount: 0,
  price: offeringFixture.price,
};

const bookingFixture: Booking = {
  id: 901,
  createdAt: '2026-03-19T09:00:00.000Z',
  scheduleId: scheduleFixture.id,
  offeringId: offeringFixture.id,
  ownerType: 'trainer',
  ownerId: trainerFixture.id,
  userId: 1,
  sportId: offeringFixture.sportId,
  date: scheduleFixture.date,
  status: 'confirmed',
  paymentStatus: 'unpaid',
  totalPrice: offeringFixture.price,
};

describe('Domain model contracts', () => {
  it('описывает услугу как отдельную сущность с владельцем клуба или тренера', () => {
    expectTypeOf<CatalogOwnerType>().toEqualTypeOf<'club' | 'trainer'>();
    expectTypeOf<OfferingFormat>().toEqualTypeOf<'group' | 'personal' | 'mini_group'>();
    expectTypeOf<Offering>().toMatchTypeOf<{
      ownerType: CatalogOwnerType;
      ownerId: EntityId;
      affiliatedClubId?: EntityId;
      sportId: EntityId;
      title: string;
      description: string;
      format: OfferingFormat;
      price: number;
      durationMinutes: number;
      capacity: number;
      address: string;
      coordinates: Coordinates;
    }>();
  });

  it('позволяет описывать тренера как самостоятельную сущность услуг', () => {
    expectTypeOf<Trainer>().toMatchTypeOf<{
      affiliatedClubId?: EntityId;
      sportIds: EntityId[];
      city?: string;
      address?: string;
      coordinates?: Coordinates;
    }>();
  });

  it('готовит расписание и запись к slot-based модели через offering', () => {
    expectTypeOf<Schedule>().toMatchTypeOf<{
      offeringId?: EntityId;
      ownerType?: CatalogOwnerType;
      ownerId?: EntityId;
      affiliatedClubId?: EntityId;
      clubId?: EntityId;
      trainerId?: EntityId;
      sportId: EntityId;
    }>();

    expectTypeOf<Booking>().toMatchTypeOf<{
      offeringId?: EntityId;
      ownerType?: CatalogOwnerType;
      ownerId?: EntityId;
      affiliatedClubId?: EntityId;
      clubId?: EntityId;
      trainerId?: EntityId;
      sportId: EntityId;
    }>();
  });

  it('сохраняет раздельные сценарии отзывов для клуба и тренера', () => {
    expectTypeOf<Review>().toMatchTypeOf<{
      clubId?: EntityId;
      trainerId?: EntityId;
    }>();
  });

  it('позволяет собрать фикстуры независимого тренера, услуги, слота и записи', () => {
    expect(trainerFixture.sportIds).toEqual([4, 6]);
    expect(offeringFixture.ownerType).toBe('trainer');
    expect(scheduleFixture.offeringId).toBe(offeringFixture.id);
    expect(bookingFixture.offeringId).toBe(offeringFixture.id);
    expect(bookingFixture.clubId).toBeUndefined();
  });

  it('определяет source и status как строгие union-типы для публикаций', () => {
    expectTypeOf<EntitySource>().toEqualTypeOf<'provider' | 'seed'>();
    expectTypeOf<EntityStatus>().toEqualTypeOf<'published' | 'draft' | 'hidden'>();
  });

  it('Club содержит поля source, status и managedByUserId для динамического каталога', () => {
    expectTypeOf<Club>().toMatchTypeOf<{
      source?: EntitySource;
      status?: EntityStatus;
      managedByUserId?: EntityId;
      slug: string;
    }>();
  });

  it('Trainer содержит поля source, status и managedByUserId для динамического каталога', () => {
    expectTypeOf<Trainer>().toMatchTypeOf<{
      source?: EntitySource;
      status?: EntityStatus;
      managedByUserId?: EntityId;
      slug: string;
    }>();
  });

  it('новая публикация клуба имеет корректный shape с safe defaults', () => {
    const newClub: Club = {
      id: 1,
      createdAt: '2026-03-27T10:00:00.000Z',
      name: 'Тестовый клуб',
      slug: 'testovyj-klub',
      description: 'Описание тестового клуба для проверки.',
      shortDescription: 'Описание тестового клуба',
      city: 'Самара',
      address: 'ул. Тестовая, 1',
      phone: '+7 999 000 00 00',
      coordinates: { lat: 0, lng: 0 },
      sportIds: [1],
      imageUrls: ['/images/placeholder-club.jpg'],
      amenityIds: [],
      tagIds: [],
      rating: 0,
      reviewCount: 0,
      priceFrom: 1500,
      distanceKm: 0,
      source: 'provider',
      status: 'published',
      managedByUserId: 2,
    };

    expect(newClub.source).toBe('provider');
    expect(newClub.status).toBe('published');
    expect(newClub.managedByUserId).toBe(2);
    expect(newClub.rating).toBe(0);
    expect(newClub.reviewCount).toBe(0);
    expect(newClub.distanceKm).toBe(0);
    expect(newClub.coordinates).toEqual({ lat: 0, lng: 0 });
  });

  // --- Phase 24: FSM booking, привязка тренер↔клуб, уведомления ---

  it('Phase 24: BookingStatus содержит 8 значений FSM + deprecated cancelled', () => {
    expectTypeOf<BookingStatus>().toMatchTypeOf<
      | 'pending'
      | 'confirmed'
      | 'completed'
      | 'no_show'
      | 'unmarked'
      | 'rejected_by_provider'
      | 'cancelled_by_athlete'
      | 'cancelled_by_provider'
      | 'cancelled'
    >();
  });

  it('Phase 24: BookingActor описывает инициатора перехода FSM', () => {
    expectTypeOf<BookingActor>().toEqualTypeOf<'athlete' | 'provider' | 'admin' | 'system'>();
  });

  it('Phase 24: CancellationPolicy содержит 4 preset-значения', () => {
    expectTypeOf<CancellationPolicy>().toEqualTypeOf<
      'free_anytime' | 'free_until_24h' | 'free_until_2h' | 'no_refund'
    >();
  });

  it('Phase 24: CancelReason различает on_time и late', () => {
    expectTypeOf<CancelReason>().toEqualTypeOf<'on_time' | 'late'>();
  });

  it('Phase 24: BookingStatusTransition описывает запись истории переходов', () => {
    expectTypeOf<BookingStatusTransition>().toMatchTypeOf<{
      from: BookingStatus | null;
      to: BookingStatus;
      actor: BookingActor;
      actorUserId?: EntityId;
      at: ISODateTimeString;
      reason?: string;
    }>();
  });

  it('Phase 24: Booking расширен полями FSM (history, snapshot, cancel/complete metadata)', () => {
    expectTypeOf<Booking>().toMatchTypeOf<{
      statusHistory?: BookingStatusTransition[];
      cancellationPolicySnapshot?: CancellationPolicy;
      cancelledBy?: BookingActor;
      cancelReason?: CancelReason;
      completedAt?: ISODateTimeString;
    }>();
  });

  it('Phase 24: Offering получает cancellationPolicy и trainerClubLinkId', () => {
    expectTypeOf<Offering>().toMatchTypeOf<{
      cancellationPolicy?: CancellationPolicy;
      trainerClubLinkId?: EntityId;
    }>();
  });

  it('Phase 24: TrainerClubLinkStatus — 4 состояния жизненного цикла', () => {
    expectTypeOf<TrainerClubLinkStatus>().toEqualTypeOf<
      'pending' | 'confirmed' | 'rejected' | 'revoked'
    >();
  });

  it('Phase 24: TrainerClubLink описывает двустороннюю привязку тренер↔клуб', () => {
    expectTypeOf<TrainerClubLink>().toMatchTypeOf<{
      trainerId: EntityId;
      clubId: EntityId;
      status: TrainerClubLinkStatus;
      initiatedBy: 'trainer' | 'club';
      approvedAt?: ISODateTimeString;
      revokedAt?: ISODateTimeString;
      revokedBy?: 'trainer' | 'club' | 'admin';
    }>();
  });

  it('Phase 24: NotificationType покрывает FSM booking и link-события', () => {
    // ⚠️ Направление проверки исправлено на шаге 37.21. Прежде здесь стояло
    // `expectTypeOf<NotificationType>().toMatchTypeOf<…одиннадцать значений…>()`,
    // то есть «весь словарь обязан уместиться в этот список». Такое утверждение
    // ломается при добавлении ЛЮБОГО типа и не проверяет того, ради чего написано:
    // что перечисленные события в словаре ЕСТЬ.
    //
    // Правильное направление обратное: каждое названное значение обязано быть
    // допустимым значением словаря.
    expectTypeOf<'booking_confirmed'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'booking_rejected'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'booking_cancelled_by_athlete'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'booking_cancelled_by_provider'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'booking_completed'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'booking_no_show'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'booking_auto_expired'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'link_requested'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'link_approved'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'link_rejected'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'link_revoked'>().toMatchTypeOf<NotificationType>();
  });

  it('Phase 37: NotificationType покрывает надзорные события', () => {
    expectTypeOf<'oversight_impersonation_started'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'oversight_password_changed_by_admin'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'oversight_booking_hard_deleted'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'oversight_link_force_revoked'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'oversight_publication_deleted'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'oversight_publication_hidden'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'oversight_publication_created'>().toMatchTypeOf<NotificationType>();
    expectTypeOf<'oversight_login_blocked'>().toMatchTypeOf<NotificationType>();
  });

  it('Phase 37: Notification — размеченный union по виду адресата', () => {
    // ⚠️ Утверждение переписано, а не удалено (шаг 37.11). Прежнее требовало
    // `userId: EntityId` у КАЖДОГО уведомления — с появлением очереди надзора
    // это перестало быть правдой: у неё владельца-человека нет и быть не может.
    //
    // ⚠️ Этот тест — единственная настоящая страховка на такую правку.
    // Сверка контрактов её не поймает: в эталоне у всех трёх маршрутов
    // уведомлений тело пустое, и форма строки им не покрыта вовсе.
    expectTypeOf<Notification>().toMatchTypeOf<{
      addresseeKind: 'personal' | 'club' | 'trainer' | 'supervision';
      type: NotificationType;
      payload: Record<string, unknown>;
      readAt?: ISODateTimeString;
    }>();
  });

  it('Phase 37: владелец-человек есть у человеческого ящика и отсутствует у надзорного', () => {
    // Ради этого различения union и заводился: читатель обязан сузить тип
    // НА СБОРКЕ, прежде чем взять владельца. Необязательное поле переложило бы
    // ответственность на дисциплину читателя, а цена промаха здесь — «погасить
    // ленту всей площадки, ответ 200».
    expectTypeOf<OwnedNotification>().toMatchTypeOf<{ userId: EntityId }>();
    expectTypeOf<SupervisionNotification>().not.toMatchTypeOf<{ userId: EntityId }>();
  });

  it('Phase 24: LogAction расширен значениями FSM/links/reliability', () => {
    // ⚠️ Направление проверки исправлено вместе с соседней (шаг 37.21): «весь
    // словарь обязан уместиться в этот список» ломается при добавлении любого
    // действия и не проверяет того, ради чего написано.
    expectTypeOf<'booking_confirm'>().toMatchTypeOf<LogAction>();
    expectTypeOf<'booking_reject'>().toMatchTypeOf<LogAction>();
    expectTypeOf<'booking_check_in_completed'>().toMatchTypeOf<LogAction>();
    expectTypeOf<'booking_check_in_no_show'>().toMatchTypeOf<LogAction>();
    expectTypeOf<'booking_auto_expire'>().toMatchTypeOf<LogAction>();
    expectTypeOf<'link_request'>().toMatchTypeOf<LogAction>();
    expectTypeOf<'link_approve'>().toMatchTypeOf<LogAction>();
    expectTypeOf<'link_reject'>().toMatchTypeOf<LogAction>();
    expectTypeOf<'link_revoke'>().toMatchTypeOf<LogAction>();
    expectTypeOf<'reliability_recompute'>().toMatchTypeOf<LogAction>();
    expectTypeOf<'admin_hard_delete_booking'>().toMatchTypeOf<LogAction>();
    // Шаг 37.27: след блокировки входа после подбора пароля.
    expectTypeOf<'login_lockout'>().toMatchTypeOf<LogAction>();
  });

  it('новая публикация тренера имеет корректный shape с safe defaults', () => {
    const newTrainer: Trainer = {
      id: 1,
      createdAt: '2026-03-27T10:00:00.000Z',
      name: 'Иван Тестов',
      slug: 'ivan-testov',
      bio: 'Тестовый тренер.',
      avatarUrl: '/images/placeholder-trainer.jpg',
      experienceYears: 5,
      specialtyIds: [1],
      workFormatIds: [1],
      rating: 0,
      reviewCount: 0,
      priceFrom: 2000,
      sportIds: [1],
      city: 'Самара',
      address: 'ул. Тестовая, 2',
      coordinates: { lat: 0, lng: 0 },
      source: 'provider',
      status: 'published',
      managedByUserId: 2,
    };

    expect(newTrainer.source).toBe('provider');
    expect(newTrainer.status).toBe('published');
    expect(newTrainer.managedByUserId).toBe(2);
    expect(newTrainer.rating).toBe(0);
    expect(newTrainer.reviewCount).toBe(0);
    expect(newTrainer.coordinates).toEqual({ lat: 0, lng: 0 });
  });
});
