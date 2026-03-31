/**
 * Reverse-mapping: persisted-сущности → form-state для предзаполнения edit-форм.
 * Обратное преобразование к publish-club.ts / publish-trainer.ts.
 * Step 15.2
 */
import sportsData from '@/data/sports.json';
import type { ClubFormState, ScheduleSlotForm, TrainerFormState } from '@/lib/schemas/publish';
import type { Club, EntityId, Offering, OfferingFormat, Schedule, Trainer } from '@/types';

/* --- Справочники для обратного маппинга --- */

/** Словарь sportId → название спорта из sports.json */
const sportIdToName: Record<EntityId, string> = {};
for (const sport of sportsData) {
  sportIdToName[sport.id] = sport.name;
}

/** Обратный маппинг OfferingFormat → русское название для формы */
const offeringFormatReverseMap: Record<OfferingFormat, string> = {
  personal: 'Индивидуальная',
  group: 'Групповая',
  mini_group: 'Мини-группа',
};

/* --- Общий маппинг слотов расписания --- */

/** Маппит persisted Schedule → ScheduleSlotForm с сохранением id */
function mapScheduleToSlotForm(schedule: Schedule): ScheduleSlotForm {
  return {
    id: schedule.id,
    title: schedule.title,
    date: schedule.date,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    price: String(schedule.price),
    capacity: String(schedule.capacity),
    location: schedule.room ?? '',
    discipline: sportIdToName[schedule.sportId] ?? '',
  };
}

/* --- Reverse-mapping клуба --- */

/**
 * Маппит persisted клуб + primary offering + расписание → ClubFormState.
 * Используется для предзаполнения edit-модалки клуба.
 */
export function mapClubToFormState(
  club: Club,
  _offering: Offering,
  schedules: Schedule[],
): ClubFormState {
  return {
    name: club.name,
    city: club.city,
    address: club.address,
    description: club.description,
    phone: club.phone,
    email: club.email ?? '',
    priceFrom: String(club.priceFrom),
    disciplines: club.sportIds.map((id) => sportIdToName[id]).filter(Boolean),
    tags: club.tags,
    amenities: club.amenities,
    scheduleSlots: schedules.map(mapScheduleToSlotForm),
  };
}

/* --- Reverse-mapping тренера --- */

/**
 * Маппит persisted тренер + primary offering + расписание → TrainerFormState.
 * Используется для предзаполнения edit-модалки тренера.
 */
export function mapTrainerToFormState(
  trainer: Trainer,
  offering: Offering,
  schedules: Schedule[],
): TrainerFormState {
  // Разделяем полное имя на firstName и lastName
  const nameParts = trainer.name.split(' ');
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ');

  // Определяем основной вид спорта из sportIds
  const sport = trainer.sportIds[0] != null ? (sportIdToName[trainer.sportIds[0]] ?? '') : '';

  return {
    firstName,
    lastName,
    city: trainer.city ?? '',
    address: trainer.address ?? '',
    bio: trainer.bio,
    experience: String(trainer.experienceYears),
    sport,
    specializations: [...trainer.specialties],
    workFormat: offering.format === 'personal' ? 'Индивидуально' : 'В клубе',
    offeringName: offering.title,
    offeringDescription: offering.description,
    offeringFormat: offeringFormatReverseMap[offering.format] ?? 'Индивидуальная',
    offeringPrice: String(offering.price),
    offeringDuration: String(offering.durationMinutes),
    offeringLocation: offering.address,
    clubId: trainer.affiliatedClubId ?? null,
    scheduleSlots: schedules.map(mapScheduleToSlotForm),
  };
}
