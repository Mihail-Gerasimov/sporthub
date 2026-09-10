/**
 * Reverse-mapping: persisted-сущности → form-state для предзаполнения edit-форм.
 * Обратное преобразование к publish-club.ts / publish-trainer.ts.
 * Step 15.2 + Phase 25 Step 25.1a (trainer-club-links).
 * Шаг 36.9a: доп. услуги из маппинга ушли вместе с редактором — сервер их
 * никогда не сохранял, и заполнять форму было нечем.
 */
import type { ClubFormState, ScheduleSlotForm, TrainerFormState } from '@sporthub/domain';
import { isValidCoordinates } from '@/lib/utils';
import type {
  Club,
  Offering,
  OfferingFormat,
  Schedule,
  Trainer,
  TrainerClubLink,
} from '@sporthub/types';

/** Обратный маппинг OfferingFormat → русское название для формы */
const offeringFormatReverseMap: Record<OfferingFormat, string> = {
  personal: 'Индивидуальная',
  group: 'Групповая',
  mini_group: 'Мини-группа',
};

/* --- Общий маппинг слотов расписания --- */

/** Маппит persisted Schedule → ScheduleSlotForm с сохранением id и sportId */
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
    sportId: schedule.sportId,
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
    sportIds: [...club.sportIds],
    tagIds: [...club.tagIds],
    amenityIds: [...club.amenityIds],
    vk: club.vk ?? '',
    telegram: club.telegram ?? '',
    facebook: club.facebook ?? '',
    // Восстанавливаем координаты только если они валидные (не {0,0})
    ...(isValidCoordinates(club.coordinates) ? { coordinates: club.coordinates } : {}),
    scheduleSlots: schedules.map(mapScheduleToSlotForm),
  };
}

/* --- Reverse-mapping тренера --- */

/**
 * Маппит persisted тренер + primary offering + расписание → TrainerFormState.
 * Используется для предзаполнения edit-модалки тренера.
 * Phase 25 Step 25.1b: `links` — список связей тренер↔клуб; из него резолвится
 * `clubId` формы.
 */
export function mapTrainerToFormState(
  trainer: Trainer,
  offering: Offering,
  schedules: Schedule[],
  links: TrainerClubLink[] = [],
): TrainerFormState {
  // Разделяем полное имя на firstName и lastName
  const nameParts = trainer.name.split(' ');
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ');

  return {
    firstName,
    lastName,
    city: trainer.city ?? '',
    address: trainer.address ?? '',
    bio: trainer.bio,
    experience: String(trainer.experienceYears),
    sportIds: [...trainer.sportIds],
    specialtyIds: [...trainer.specialtyIds],
    workFormatIds: [...trainer.workFormatIds],
    phone: trainer.phone ?? '',
    vk: trainer.vk ?? '',
    telegram: trainer.telegram ?? '',
    facebook: trainer.facebook ?? '',
    offeringName: offering.title,
    offeringDescription: offering.description,
    offeringFormat: offeringFormatReverseMap[offering.format] ?? 'Индивидуальная',
    offeringPrice: String(offering.price),
    offeringDuration: String(offering.durationMinutes),
    offeringLocation: offering.address,
    // Phase 25 Step 25.1b: clubId формы тренера резолвится через confirmed
    // TrainerClubLink, а не через удалённое поле `trainer.affiliatedClubId`.
    clubId: links.find((link) => link.status === 'confirmed')?.clubId ?? null,
    // Восстанавливаем координаты только если они валидные (не {0,0})
    ...(isValidCoordinates(trainer.coordinates) ? { coordinates: trainer.coordinates } : {}),
    scheduleSlots: schedules.map(mapScheduleToSlotForm),
  };
}
