/**
 * Create-контракт публикации тренера.
 * Маппит форму PublishTrainerModal → persisted-сущности: trainer + offering + schedule[].
 * Step 14.4
 */
import type { CreateTrainerPublicationInput, UpdateTrainerPublicationInput } from '@/lib/db';
import type { EntityId, Offering, OfferingFormat, Schedule, Trainer } from '@/types';

import type { TrainerFormState, TrainerOfferingFormItem } from '@/lib/schemas/publish';

/* --- Типы формы — реэкспорт из единого источника publish.ts --- */

export type TrainerPublishForm = TrainerFormState;

/* --- Результат маппинга --- */

export interface TrainerPublishEntities {
  trainer: Trainer;
  offering: Offering;
  schedules: Schedule[];
  /** Phase 24 Step 24.10: дополнительные услуги с их расписанием, если заполнены в форме. */
  additionalOfferings?: CreateTrainerPublicationInput['additionalOfferings'];
}

/* --- Хелперы --- */

/** Генерация slug: lowercase, пробелы → дефисы, только a-z0-9- и кириллица */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zа-яё0-9-]/g, '')
    .replace(/-+/g, '-');
}

/** Маппинг русского названия формата → OfferingFormat */
const offeringFormatMap: Record<string, OfferingFormat> = {
  Индивидуальная: 'personal',
  Групповая: 'group',
  'Мини-группа': 'mini_group',
};

/** Расчёт durationMinutes из startTime/endTime (HH:MM) */
function calcDuration(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

/* --- Уникальные id для новых сущностей --- */

let nextId = Date.now();
function nextEntityId(): EntityId {
  return ++nextId;
}

/* --- Основная функция маппинга --- */

/**
 * Маппит форму публикации тренера в набор persisted-сущностей.
 * Не записывает в БД — только формирует объекты.
 */
export function mapTrainerFormToEntities(
  form: TrainerPublishForm,
  managedByUserId: EntityId,
): TrainerPublishEntities {
  const now = new Date().toISOString();
  const trainerId = nextEntityId();
  const sportIds = form.sportIds;

  /* Тренер */
  const trainer: Trainer = {
    id: trainerId,
    createdAt: now,
    name: `${form.firstName} ${form.lastName}`,
    slug: generateSlug(`${form.firstName} ${form.lastName}`),
    bio: form.bio,
    avatarUrl: '',
    experienceYears: Number(form.experience),
    specialtyIds: form.specialtyIds,
    workFormatIds: form.workFormatIds,
    rating: 0,
    reviewCount: 0,
    priceFrom: Number(form.offeringPrice),
    sportIds,
    city: form.city,
    address: form.address,
    coordinates: form.coordinates ?? { lat: 0, lng: 0 },
    ...(form.phone ? { phone: form.phone } : {}),
    ...(form.vk ? { vk: form.vk } : {}),
    ...(form.telegram ? { telegram: form.telegram } : {}),
    ...(form.facebook ? { facebook: form.facebook } : {}),
    ...(form.clubId != null ? { affiliatedClubId: form.clubId } : {}),
    managedByUserId,
    source: 'provider',
    status: 'published',
  };

  /* Одна услуга тренера (offering) */
  const offeringId = nextEntityId();
  const offering: Offering = {
    id: offeringId,
    createdAt: now,
    ownerType: 'trainer',
    ownerId: trainerId,
    ...(form.clubId != null ? { affiliatedClubId: form.clubId } : {}),
    sportId: sportIds[0] ?? 0,
    title: form.offeringName,
    description: form.offeringDescription,
    format: offeringFormatMap[form.offeringFormat] ?? 'personal',
    price: Number(form.offeringPrice),
    durationMinutes: Number(form.offeringDuration),
    capacity: 1,
    address: form.offeringLocation,
    coordinates: form.coordinates ?? { lat: 0, lng: 0 },
  };

  /* Слоты расписания — sportId берётся напрямую из слота формы */
  const schedules: Schedule[] = form.scheduleSlots.map((slot) => ({
    id: nextEntityId(),
    createdAt: now,
    offeringId,
    ownerType: 'trainer' as const,
    ownerId: trainerId,
    trainerId,
    sportId: slot.sportId,
    title: slot.title,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    durationMinutes: calcDuration(slot.startTime, slot.endTime),
    level: 'all_levels' as const,
    capacity: Number(slot.capacity),
    bookedCount: 0,
    price: Number(slot.price),
    room: slot.location,
  }));

  // Phase 24 Step 24.10: дополнительные услуги (multi-offering) из form.additionalOfferings.
  // id/createdAt/ownerId/offeringId проставит createTrainerPublication, здесь — смысловые поля.
  const additionalOfferings = (form.additionalOfferings ?? []).map((item) =>
    buildAdditionalOfferingFromForm(item, sportIds),
  );

  return {
    trainer,
    offering,
    schedules,
    ...(additionalOfferings.length > 0 ? { additionalOfferings } : {}),
  };
}

/** Phase 24 Step 24.10: строит пару {offering, schedules} для одной карточки multi-offering. */
function buildAdditionalOfferingFromForm(
  item: TrainerOfferingFormItem,
  trainerSportIds: EntityId[],
): {
  offering: Omit<Offering, 'id' | 'createdAt' | 'ownerId'>;
  schedules: Omit<Schedule, 'id' | 'createdAt' | 'ownerId' | 'trainerId' | 'offeringId'>[];
} {
  const fallbackSportId = item.scheduleSlots[0]?.sportId ?? trainerSportIds[0] ?? 0;
  const offering: Omit<Offering, 'id' | 'createdAt' | 'ownerId'> = {
    ownerType: 'trainer',
    sportId: fallbackSportId,
    title: item.title,
    description: item.description,
    format: offeringFormatMap[item.format] ?? 'personal',
    price: Number(item.price),
    durationMinutes: Number(item.duration),
    capacity: 1,
    address: item.location,
    coordinates: { lat: 0, lng: 0 },
    cancellationPolicy: item.cancellationPolicy,
    ...(item.attachmentMode === 'club' && item.clubLinkId !== undefined
      ? { trainerClubLinkId: item.clubLinkId }
      : {}),
  };

  const schedules = item.scheduleSlots.map((slot) => ({
    ownerType: 'trainer' as const,
    sportId: slot.sportId,
    title: slot.title,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    durationMinutes: calcDuration(slot.startTime, slot.endTime),
    level: 'all_levels' as const,
    capacity: Number(slot.capacity),
    bookedCount: 0,
    price: Number(slot.price),
    room: slot.location,
  }));

  return { offering, schedules };
}

/**
 * Маппит форму редактирования тренера в update-payload для db.ts.
 * Системные поля и slug сохраняются на уровне db.ts.
 * Phase 25 Step 25.1a: передаёт `additionalOfferings` в update-payload для full-replace
 * массива дополнительных услуг. Опциональное поле — если в форме его нет, update
 * не трогает существующие additional; если массив пустой `[]`, db удаляет все additional.
 */
export function mapTrainerFormToUpdateInput(
  form: TrainerPublishForm,
  trainerId: EntityId,
  managedByUserId: EntityId,
): UpdateTrainerPublicationInput {
  const sportIds = form.sportIds;

  return {
    trainerId,
    userId: managedByUserId,
    trainer: {
      name: `${form.firstName} ${form.lastName}`,
      bio: form.bio,
      experienceYears: Number(form.experience),
      specialtyIds: form.specialtyIds,
      workFormatIds: form.workFormatIds,
      priceFrom: Number(form.offeringPrice),
      sportIds,
      city: form.city,
      address: form.address,
      phone: form.phone || undefined,
      vk: form.vk || undefined,
      telegram: form.telegram || undefined,
      facebook: form.facebook || undefined,
      ...(form.clubId != null ? { affiliatedClubId: form.clubId } : {}),
      ...(form.coordinates ? { coordinates: form.coordinates } : {}),
    },
    offering: {
      ownerType: 'trainer',
      sportId: sportIds[0] ?? 0,
      ...(form.clubId != null ? { affiliatedClubId: form.clubId } : {}),
      title: form.offeringName,
      description: form.offeringDescription,
      format: offeringFormatMap[form.offeringFormat] ?? 'personal',
      price: Number(form.offeringPrice),
      durationMinutes: Number(form.offeringDuration),
      capacity: 1,
      address: form.offeringLocation,
      ...(form.coordinates ? { coordinates: form.coordinates } : {}),
    },
    schedules: form.scheduleSlots.map((slot) => ({
      ...(slot.id !== undefined ? { id: slot.id } : {}),
      sportId: slot.sportId,
      title: slot.title,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationMinutes: calcDuration(slot.startTime, slot.endTime),
      level: 'all_levels',
      capacity: Number(slot.capacity),
      price: Number(slot.price),
      room: slot.location,
    })),
    ...(form.additionalOfferings !== undefined
      ? {
          additionalOfferings: form.additionalOfferings.map((item) =>
            buildAdditionalOfferingForUpdate(item, sportIds),
          ),
        }
      : {}),
  };
}

/**
 * Phase 25 Step 25.1a: строит {offering, schedules} entry для update-payload
 * дополнительной услуги. Отличия от create-варианта:
 *   - offering.id сохраняется, если указан (для update существующей) — db.ts делает diff по id.
 *   - schedule.id тоже сохраняется per слот.
 */
function buildAdditionalOfferingForUpdate(
  item: TrainerOfferingFormItem,
  trainerSportIds: EntityId[],
): NonNullable<UpdateTrainerPublicationInput['additionalOfferings']>[number] {
  const fallbackSportId = item.scheduleSlots[0]?.sportId ?? trainerSportIds[0] ?? 0;
  return {
    offering: {
      ...(item.id !== undefined ? { id: item.id } : {}),
      ownerType: 'trainer' as const,
      sportId: fallbackSportId,
      title: item.title,
      description: item.description,
      format: offeringFormatMap[item.format] ?? 'personal',
      price: Number(item.price),
      durationMinutes: Number(item.duration),
      capacity: 1,
      address: item.location,
      cancellationPolicy: item.cancellationPolicy,
      ...(item.attachmentMode === 'club' && item.clubLinkId !== undefined
        ? { trainerClubLinkId: item.clubLinkId }
        : {}),
    },
    schedules: item.scheduleSlots.map((slot) => ({
      ...(slot.id !== undefined ? { id: slot.id } : {}),
      sportId: slot.sportId,
      title: slot.title,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      durationMinutes: calcDuration(slot.startTime, slot.endTime),
      level: 'all_levels' as const,
      capacity: Number(slot.capacity),
      price: Number(slot.price),
      room: slot.location,
    })),
  };
}
