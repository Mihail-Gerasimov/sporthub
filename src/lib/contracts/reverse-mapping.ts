/**
 * Reverse-mapping: persisted-сущности → form-state для предзаполнения edit-форм.
 * Обратное преобразование к publish-club.ts / publish-trainer.ts.
 * Step 15.2 + Phase 25 Step 25.1a (additionalOfferings и trainer-club-links).
 */
import type {
  ClubFormState,
  ScheduleSlotForm,
  TrainerFormState,
  TrainerOfferingFormItem,
} from '@/lib/schemas/publish';
import { isValidCoordinates } from '@/lib/utils';
import type {
  CancellationPolicy,
  Club,
  Offering,
  OfferingFormat,
  Schedule,
  Trainer,
  TrainerClubLink,
} from '@/types';

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
 * Phase 25 Step 25.1a: маппит один persisted Offering + его расписание →
 * TrainerOfferingFormItem для additionalOfferings[] в форме.
 * `attachmentMode` резолвится по `offering.trainerClubLinkId`: если link существует
 * и `status === 'confirmed'` — 'club', иначе fallback на 'private'.
 */
function mapOfferingToTrainerFormItem(
  offering: Offering,
  schedules: Schedule[],
  links: TrainerClubLink[],
): TrainerOfferingFormItem {
  const cancellationPolicy: CancellationPolicy = offering.cancellationPolicy ?? 'free_until_24h';
  const linkId = offering.trainerClubLinkId;
  const confirmedLink =
    linkId !== undefined
      ? links.find((link) => link.id === linkId && link.status === 'confirmed')
      : undefined;
  const attachmentMode: TrainerOfferingFormItem['attachmentMode'] = confirmedLink
    ? 'club'
    : 'private';

  return {
    id: offering.id,
    title: offering.title,
    description: offering.description,
    format: offeringFormatReverseMap[offering.format] ?? 'Индивидуальная',
    price: String(offering.price),
    duration: String(offering.durationMinutes),
    location: offering.address,
    cancellationPolicy,
    attachmentMode,
    ...(confirmedLink ? { clubLinkId: confirmedLink.id } : {}),
    scheduleSlots: schedules.map(mapScheduleToSlotForm),
  };
}

/**
 * Маппит persisted тренер + primary offering + расписание → TrainerFormState.
 * Используется для предзаполнения edit-модалки тренера.
 * Phase 25 Step 25.1a: опциональные `additionalOfferings` и `links` для multi-offering
 * edit-flow — передавай, если бэкенд вернул дополнительные услуги и список связей
 * тренер↔клуб (чтобы корректно резолвить `attachmentMode`/`clubLinkId`).
 */
export function mapTrainerToFormState(
  trainer: Trainer,
  offering: Offering,
  schedules: Schedule[],
  additionalOfferings?: Array<{ offering: Offering; schedules: Schedule[] }>,
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
    clubId: trainer.affiliatedClubId ?? null,
    // Восстанавливаем координаты только если они валидные (не {0,0})
    ...(isValidCoordinates(trainer.coordinates) ? { coordinates: trainer.coordinates } : {}),
    scheduleSlots: schedules.map(mapScheduleToSlotForm),
    ...(additionalOfferings !== undefined
      ? {
          additionalOfferings: additionalOfferings.map((entry) =>
            mapOfferingToTrainerFormItem(entry.offering, entry.schedules, links),
          ),
        }
      : {}),
  };
}
