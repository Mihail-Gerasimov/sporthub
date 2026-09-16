import { APP_LIMITS, DEFAULT_CITY } from '@sporthub/types';
import { isSlotOpenToday } from '@sporthub/domain';
import { resolveNames } from '@/lib/utils';
import type {
  Club,
  Coordinates,
  EntityId,
  ISODateTimeString,
  Offering,
  OfferingFormat,
  Schedule,
  Specialty,
  Sport,
  Trainer,
  TrainerClubLink,
} from '@sporthub/types';

export type TrainerPreviewSport = Pick<Sport, 'id' | 'name' | 'icon'>;

/** Phase 24 Step 24.11: preview одной услуги тренера для каталога и detail-секций. */
export type TrainerOfferingPreview = {
  id: EntityId;
  title: string;
  format: OfferingFormat;
  price: number;
  durationMinutes: number;
  /** Имя клуба, если услуга привязана к confirmed link; иначе null («частная»). */
  venueClubName: string | null;
  /** trainerClubLinkId у offering — нужен, чтобы отфильтровать offerings на странице клуба. */
  trainerClubLinkId: EntityId | null;
};

export type TrainerDirectoryItem = {
  id: EntityId;
  name: string;
  slug: string;
  bio: string;
  avatarUrl: string;
  experienceYears: number;
  specialtyIds: EntityId[];
  /** Display-имена специализаций, резолвленные из справочника */
  specialtyNames: string[];
  rating: number;
  reviewCount: number;
  /** Когда площадка проверила карточку; пусто — знака «проверено» нет (38.52). */
  verifiedAt?: ISODateTimeString;
  priceFrom: number;
  sportIds: EntityId[];
  sports: TrainerPreviewSport[];
  city: string;
  address: string;
  coordinates: Coordinates;
  distanceKm: number | null;
  venueName: string | null;
  venueLabel: string;
  venueAddress: string;
  primaryOfferingId: EntityId | null;
  primaryOfferingTitle: string | null;
  primaryOfferingFormat: OfferingFormat | null;
  nextSlotId: EntityId | null;
  nextSlotDate: string | null;
  nextSlotStartTime: string | null;
  availableSlotsCount: number;
  offeringTitles: string[];
  /** Phase 24 Step 24.11: массив услуг тренера — для «Услуги» секции и агрегатов. */
  offerings: TrainerOfferingPreview[];
  searchText: string;
};

export type TrainerAvailabilityItem = {
  id: EntityId;
  trainerId: EntityId;
  trainerName: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  price: number;
  room?: string;
  availableSpots: number;
  format: OfferingFormat | null;
  venueLabel: string;
};

type BuildTrainerDirectoryInput = {
  clubs: Club[];
  offerings: Offering[];
  schedule: Schedule[];
  /** Справочник специализаций для резолвинга specialtyIds → имена */
  specialties?: Specialty[];
  sports: TrainerPreviewSport[];
  trainers: Trainer[];
  /** Phase 24 Step 24.8: confirmed-связи тренер↔клуб для резолвинга venueClub. */
  trainerClubLinks?: TrainerClubLink[];
  /** Phase 28.24: ключ «сегодня» (`YYYY-MM-DD`) — фильтр nextSlot/availableSlotsCount
   * только по сегодняшним слотам, симметрично клубному `getUpcomingSessions`. */
  targetDate: string;
  /** Момент «сейчас» — день того же момента, что и `targetDate`; аргументом, а не из часов. */
  now: Date;
  /**
   * Порядок справочника: `rating` — рейтинг, отзывы, имя (каталог в памяти, Д-15);
   * `given` — как пришло: витрина берёт четвёрку запросом `sort=rating&limit=4`,
   * где ничьи разводит номер (38.31), и пересортировка по имени ломала бы порядок ответа.
   */
  order?: 'rating' | 'given';
};

type GetTrainerAvailabilityInput = {
  limit?: number;
  schedule: Schedule[];
  trainers: TrainerDirectoryItem[];
  /** Phase 28.24: ключ «сегодня» (`YYYY-MM-DD`) — slot-блок «Свободные окна тренеров»
   * показывает только сегодняшние слоты, как клубный «Ближайшие занятия». */
  targetDate: string;
  /** Момент «сейчас» — аргументом, как у `getUpcomingSessions`. */
  now: Date;
};

function getSlotSortKey(slot: Pick<Schedule, 'date' | 'startTime'>): string {
  return `${slot.date}T${slot.startTime}`;
}

export function buildTrainerDirectory({
  clubs,
  offerings,
  schedule,
  specialties = [],
  sports,
  trainers,
  trainerClubLinks = [],
  targetDate,
  now,
  order = 'rating',
}: BuildTrainerDirectoryInput): TrainerDirectoryItem[] {
  const clubsById = new Map(clubs.map((club) => [club.id, club]));
  // Phase 24 Step 24.8: confirmed links по trainerId → clubId (authoritative).
  const confirmedClubIdByTrainerId = new Map<EntityId, EntityId>();
  // Phase 24 Step 24.11: map linkId → clubName для резолва venue у multi-offering.
  const clubNameByLinkId = new Map<EntityId, string>();
  for (const link of trainerClubLinks) {
    if (link.status === 'confirmed') {
      confirmedClubIdByTrainerId.set(link.trainerId, link.clubId);
      const club = clubsById.get(link.clubId);
      if (club) clubNameByLinkId.set(link.id, club.name);
    }
  }
  const trainerOfferings = offerings.filter((offering) => offering.ownerType === 'trainer');
  const trainerOfferingsByTrainerId = new Map<EntityId, Offering[]>();
  const trainerScheduleByTrainerId = new Map<EntityId, Schedule[]>();

  for (const offering of trainerOfferings) {
    const currentOfferings = trainerOfferingsByTrainerId.get(offering.ownerId) ?? [];
    currentOfferings.push(offering);
    trainerOfferingsByTrainerId.set(offering.ownerId, currentOfferings);
  }

  for (const slot of schedule) {
    if (slot.ownerType !== 'trainer' || slot.trainerId === undefined) continue;

    const currentSchedule = trainerScheduleByTrainerId.get(slot.trainerId) ?? [];
    currentSchedule.push(slot);
    trainerScheduleByTrainerId.set(slot.trainerId, currentSchedule);
  }

  const items = trainers.flatMap((trainer) => {
    const offeringsForTrainer = [...(trainerOfferingsByTrainerId.get(trainer.id) ?? [])].sort(
      (left, right) => {
        if (left.price !== right.price) {
          return left.price - right.price;
        }

        return left.title.localeCompare(right.title, 'ru');
      },
    );
    // Phase 28.24: nextSlot и availableSlotsCount — только сегодняшние свободные
    // окна тренера, симметрично клубному getUpcomingSessions. «Свободное окно дня» —
    // предикат домена `isSlotOpenToday` (сегодня ∧ не началось ∧ места), один
    // на клубы и тренеров; `targetDate` — день того же момента, что и `now`.
    const availableSlots = [...(trainerScheduleByTrainerId.get(trainer.id) ?? [])]
      .filter((slot) => slot.date === targetDate && isSlotOpenToday(slot, now))
      .sort((left, right) => getSlotSortKey(left).localeCompare(getSlotSortKey(right)));
    const sportsForTrainer = sports.filter((sport) => trainer.sportIds.includes(sport.id));
    const primaryOffering = offeringsForTrainer[0] ?? null;
    const nextSlot = availableSlots[0] ?? null;
    // Phase 24 Step 24.9c: venueClub в каталоге — ТОЛЬКО через confirmed TrainerClubLink.
    const linkClubId = confirmedClubIdByTrainerId.get(trainer.id);
    const venueClub = linkClubId !== undefined ? (clubsById.get(linkClubId) ?? null) : null;
    const coordinates =
      trainer.coordinates ?? primaryOffering?.coordinates ?? venueClub?.coordinates ?? null;
    const address = primaryOffering?.address ?? trainer.address ?? venueClub?.address ?? null;

    if (!coordinates || !address) return [];

    const venueName = venueClub?.name ?? null;
    const venueLabel = venueName ?? address;

    // Резолвим имена специализаций из справочника
    const specialtyNames = resolveNames(trainer.specialtyIds, specialties);

    const searchText = [
      trainer.name,
      trainer.bio,
      specialtyNames.join(' '),
      sportsForTrainer.map((sport) => sport.name).join(' '),
      offeringsForTrainer.map((offering) => `${offering.title} ${offering.description}`).join(' '),
      venueName ?? '',
      address,
    ]
      .join(' ')
      .toLocaleLowerCase('ru-RU');

    return [
      {
        id: trainer.id,
        name: trainer.name,
        slug: trainer.slug,
        bio: trainer.bio,
        avatarUrl: trainer.avatarUrl,
        experienceYears: trainer.experienceYears,
        specialtyIds: trainer.specialtyIds,
        specialtyNames,
        rating: trainer.rating,
        reviewCount: trainer.reviewCount,
        verifiedAt: trainer.verifiedAt,
        // Phase 24 Step 24.11: min price по всем offerings — иначе fallback trainer.priceFrom.
        priceFrom:
          offeringsForTrainer.length > 0
            ? Math.min(...offeringsForTrainer.map((offering) => offering.price))
            : trainer.priceFrom,
        sportIds: trainer.sportIds,
        sports: sportsForTrainer,
        city: trainer.city ?? venueClub?.city ?? DEFAULT_CITY,
        address,
        coordinates,
        distanceKm: venueClub?.distanceKm ?? null,
        venueName,
        venueLabel,
        venueAddress: address,
        primaryOfferingId: primaryOffering?.id ?? null,
        primaryOfferingTitle: primaryOffering?.title ?? null,
        primaryOfferingFormat: primaryOffering?.format ?? null,
        nextSlotId: nextSlot?.id ?? null,
        nextSlotDate: nextSlot?.date ?? null,
        nextSlotStartTime: nextSlot?.startTime ?? null,
        availableSlotsCount: availableSlots.length,
        offeringTitles: offeringsForTrainer.map((offering) => offering.title),
        // Phase 24 Step 24.11: preview-массив услуг с venue-резолвом по trainerClubLinkId.
        offerings: offeringsForTrainer.map((offering) => ({
          id: offering.id,
          title: offering.title,
          format: offering.format,
          price: offering.price,
          durationMinutes: offering.durationMinutes,
          venueClubName:
            offering.trainerClubLinkId !== undefined
              ? (clubNameByLinkId.get(offering.trainerClubLinkId) ?? null)
              : null,
          trainerClubLinkId: offering.trainerClubLinkId ?? null,
        })),
        searchText,
      } satisfies TrainerDirectoryItem,
    ];
  });

  if (order === 'given') return items;

  return items.sort((left, right) => {
    if (right.rating !== left.rating) {
      return right.rating - left.rating;
    }

    if (right.reviewCount !== left.reviewCount) {
      return right.reviewCount - left.reviewCount;
    }

    return left.name.localeCompare(right.name, 'ru');
  });
}

export function getTrainerAvailability({
  limit = APP_LIMITS.upcomingSessions,
  schedule,
  trainers,
  targetDate,
  now,
}: GetTrainerAvailabilityInput): TrainerAvailabilityItem[] {
  const trainerById = new Map(trainers.map((trainer) => [trainer.id, trainer]));

  return (
    schedule
      .filter((slot) => slot.ownerType === 'trainer')
      .filter((slot) => slot.trainerId !== undefined)
      // «Свободное окно дня» — тот же предикат домена, что у справочника и клубов.
      .filter((slot) => slot.date === targetDate && isSlotOpenToday(slot, now))
      .flatMap((slot) => {
        const trainer = trainerById.get(slot.trainerId ?? -1);

        if (!trainer) {
          return [];
        }

        return [
          {
            id: slot.id,
            trainerId: trainer.id,
            trainerName: trainer.name,
            title: slot.title,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            price: slot.price,
            room: slot.room,
            availableSpots: slot.capacity - slot.bookedCount,
            format: trainer.primaryOfferingFormat,
            venueLabel: trainer.venueLabel,
          } satisfies TrainerAvailabilityItem,
        ];
      })
      .sort((left, right) => {
        const leftTimestamp = `${left.date}T${left.startTime}`;
        const rightTimestamp = `${right.date}T${right.startTime}`;

        if (leftTimestamp !== rightTimestamp) {
          return leftTimestamp.localeCompare(rightTimestamp);
        }

        return left.trainerName.localeCompare(right.trainerName, 'ru');
      })
      .slice(0, limit)
  );
}
