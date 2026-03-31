/**
 * Create-контракт публикации тренера.
 * Маппит форму PublishTrainerModal → persisted-сущности: trainer + offering + schedule[].
 * Step 14.4
 */
import sportsData from '@/data/sports.json';
import type { UpdateTrainerPublicationInput } from '@/lib/db';
import type { EntityId, Offering, OfferingFormat, Schedule, Trainer } from '@/types';

import type { TrainerFormState } from '@/lib/schemas/publish';

/* --- Типы формы — реэкспорт из единого источника publish.ts --- */

export type TrainerPublishForm = TrainerFormState;

/* --- Результат маппинга --- */

export interface TrainerPublishEntities {
  trainer: Trainer;
  offering: Offering;
  schedules: Schedule[];
}

/* --- Хелперы --- */

/** Словарь название спорта → id из sports.json */
const sportNameToId: Record<string, EntityId> = {};
for (const sport of sportsData) {
  sportNameToId[sport.name] = sport.id;
}

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
  const sportId = sportNameToId[form.sport];
  const sportIds: EntityId[] = sportId != null ? [sportId] : [];

  /* Тренер */
  const trainer: Trainer = {
    id: trainerId,
    createdAt: now,
    name: `${form.firstName} ${form.lastName}`,
    slug: generateSlug(`${form.firstName} ${form.lastName}`),
    bio: form.bio,
    avatarUrl: '',
    experienceYears: Number(form.experience),
    specialties: form.specializations,
    rating: 0,
    reviewCount: 0,
    priceFrom: Number(form.offeringPrice),
    sportIds,
    city: form.city,
    address: form.address,
    coordinates: { lat: 0, lng: 0 },
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
    coordinates: { lat: 0, lng: 0 },
  };

  /* Слоты расписания */
  const schedules: Schedule[] = form.scheduleSlots.map((slot) => ({
    id: nextEntityId(),
    createdAt: now,
    offeringId,
    ownerType: 'trainer' as const,
    ownerId: trainerId,
    trainerId,
    sportId: sportIds[0] ?? 0,
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

  return { trainer, offering, schedules };
}

/**
 * Маппит форму редактирования тренера в update-payload для db.ts.
 * Системные поля и slug сохраняются на уровне db.ts.
 */
export function mapTrainerFormToUpdateInput(
  form: TrainerPublishForm,
  trainerId: EntityId,
  managedByUserId: EntityId,
): UpdateTrainerPublicationInput {
  const sportId = sportNameToId[form.sport];
  const sportIds: EntityId[] = sportId != null ? [sportId] : [];

  return {
    trainerId,
    userId: managedByUserId,
    trainer: {
      name: `${form.firstName} ${form.lastName}`,
      bio: form.bio,
      experienceYears: Number(form.experience),
      specialties: form.specializations,
      priceFrom: Number(form.offeringPrice),
      sportIds,
      city: form.city,
      address: form.address,
      ...(form.clubId != null ? { affiliatedClubId: form.clubId } : {}),
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
    },
    schedules: form.scheduleSlots.map((slot) => ({
      ...(slot.id !== undefined ? { id: slot.id } : {}),
      sportId: sportIds[0] ?? 0,
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
  };
}
