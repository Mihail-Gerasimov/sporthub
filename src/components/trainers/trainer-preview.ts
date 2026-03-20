import { APP_LIMITS, DEFAULT_CITY } from '@/lib/constants';
import { normalizeSearchText } from '@/lib/utils';
import type {
  Club,
  Coordinates,
  EntityId,
  Offering,
  OfferingFormat,
  Schedule,
  Sport,
  Trainer,
} from '@/types';

export type TrainerPreviewSport = Pick<Sport, 'id' | 'name' | 'icon'>;

export type TrainerDirectoryItem = {
  id: EntityId;
  name: string;
  slug: string;
  bio: string;
  avatarUrl: string;
  experienceYears: number;
  specialties: string[];
  rating: number;
  reviewCount: number;
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
  sports: TrainerPreviewSport[];
  trainers: Trainer[];
};

type GetTrainerAvailabilityInput = {
  limit?: number;
  schedule: Schedule[];
  trainers: TrainerDirectoryItem[];
};

function getSlotSortKey(slot: Pick<Schedule, 'date' | 'startTime'>): string {
  return `${slot.date}T${slot.startTime}`;
}

export function buildTrainerDirectory({
  clubs,
  offerings,
  schedule,
  sports,
  trainers,
}: BuildTrainerDirectoryInput): TrainerDirectoryItem[] {
  const clubsById = new Map(clubs.map((club) => [club.id, club]));
  const trainerOfferings = offerings.filter((offering) => offering.ownerType === 'trainer');
  const trainerOfferingsByTrainerId = new Map<EntityId, Offering[]>();
  const trainerScheduleByTrainerId = new Map<EntityId, Schedule[]>();

  for (const offering of trainerOfferings) {
    const currentOfferings = trainerOfferingsByTrainerId.get(offering.ownerId) ?? [];
    currentOfferings.push(offering);
    trainerOfferingsByTrainerId.set(offering.ownerId, currentOfferings);
  }

  for (const slot of schedule) {
    if (slot.ownerType !== 'trainer' || slot.trainerId === undefined) {
      continue;
    }

    const currentSchedule = trainerScheduleByTrainerId.get(slot.trainerId) ?? [];
    currentSchedule.push(slot);
    trainerScheduleByTrainerId.set(slot.trainerId, currentSchedule);
  }

  return trainers
    .flatMap((trainer) => {
      const offeringsForTrainer = [...(trainerOfferingsByTrainerId.get(trainer.id) ?? [])].sort(
        (left, right) => {
          if (left.price !== right.price) {
            return left.price - right.price;
          }

          return left.title.localeCompare(right.title, 'ru');
        },
      );
      const availableSlots = [...(trainerScheduleByTrainerId.get(trainer.id) ?? [])]
        .filter((slot) => slot.bookedCount < slot.capacity)
        .sort((left, right) => getSlotSortKey(left).localeCompare(getSlotSortKey(right)));
      const sportsForTrainer = sports.filter((sport) => trainer.sportIds.includes(sport.id));
      const primaryOffering = offeringsForTrainer[0] ?? null;
      const nextSlot = availableSlots[0] ?? null;
      const venueClub =
        primaryOffering?.affiliatedClubId !== undefined
          ? (clubsById.get(primaryOffering.affiliatedClubId) ?? null)
          : null;
      const coordinates =
        trainer.coordinates ?? primaryOffering?.coordinates ?? venueClub?.coordinates ?? null;
      const address = primaryOffering?.address ?? trainer.address ?? venueClub?.address ?? null;

      if (!coordinates || !address) {
        return [];
      }

      const venueName = venueClub?.name ?? null;
      const venueLabel = venueName ?? address;

      const searchText = normalizeSearchText(
        [
          trainer.name,
          trainer.bio,
          trainer.specialties.join(' '),
          sportsForTrainer.map((sport) => sport.name).join(' '),
          offeringsForTrainer
            .map((offering) => `${offering.title} ${offering.description}`)
            .join(' '),
          venueName ?? '',
          address,
        ].join(' '),
      );

      return [
        {
          id: trainer.id,
          name: trainer.name,
          slug: trainer.slug,
          bio: trainer.bio,
          avatarUrl: trainer.avatarUrl,
          experienceYears: trainer.experienceYears,
          specialties: trainer.specialties,
          rating: trainer.rating,
          reviewCount: trainer.reviewCount,
          priceFrom: trainer.priceFrom,
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
          searchText,
        } satisfies TrainerDirectoryItem,
      ];
    })
    .sort((left, right) => {
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
}: GetTrainerAvailabilityInput): TrainerAvailabilityItem[] {
  const trainerById = new Map(trainers.map((trainer) => [trainer.id, trainer]));

  return schedule
    .filter((slot) => slot.ownerType === 'trainer')
    .filter((slot) => slot.trainerId !== undefined)
    .filter((slot) => slot.bookedCount < slot.capacity)
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
    .slice(0, limit);
}
