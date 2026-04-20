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
  NotificationType,
  Offering,
  OfferingFormat,
  Review,
  Schedule,
  Trainer,
  TrainerClubLink,
  TrainerClubLinkStatus,
} from '@/types';

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
      isFeatured: false,
      source: 'provider',
      status: 'published',
      managedByUserId: 2,
    };

    expect(newClub.source).toBe('provider');
    expect(newClub.status).toBe('published');
    expect(newClub.managedByUserId).toBe(2);
    expect(newClub.rating).toBe(0);
    expect(newClub.reviewCount).toBe(0);
    expect(newClub.isFeatured).toBe(false);
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

  it('Phase 24: NotificationType покрывает FSM booking, link-события и карантин', () => {
    expectTypeOf<NotificationType>().toMatchTypeOf<
      | 'booking_confirmed'
      | 'booking_rejected'
      | 'booking_cancelled_by_athlete'
      | 'booking_cancelled_by_provider'
      | 'booking_completed'
      | 'booking_no_show'
      | 'booking_auto_expired'
      | 'link_requested'
      | 'link_approved'
      | 'link_rejected'
      | 'link_revoked'
      | 'quarantine_start'
      | 'quarantine_end'
      | 'quarantine_lifted_by_admin'
    >();
  });

  it('Phase 24: Notification описывает in-app уведомление', () => {
    expectTypeOf<Notification>().toMatchTypeOf<{
      userId: EntityId;
      type: NotificationType;
      payload: Record<string, unknown>;
      readAt?: ISODateTimeString;
    }>();
  });

  it('Phase 24: LogAction расширен 14 значениями FSM/links/карантина/reliability', () => {
    expectTypeOf<LogAction>().toMatchTypeOf<
      | 'booking_confirm'
      | 'booking_reject'
      | 'booking_check_in_completed'
      | 'booking_check_in_no_show'
      | 'booking_auto_expire'
      | 'link_request'
      | 'link_approve'
      | 'link_reject'
      | 'link_revoke'
      | 'quarantine_start'
      | 'quarantine_end'
      | 'quarantine_admin_lift'
      | 'reliability_recompute'
      | 'admin_hard_delete_booking'
    >();
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
