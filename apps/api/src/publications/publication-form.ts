// Превращение формы публикации в сущности.
//
// Прежняя версия жила во фронте и сама раздавала идентификаторы через `Date.now()`.
// Здесь идентификаторы выдаёт хранилище, поэтому маппинг строит сущности без них.
// Всё остальное — вычисление адреса-ссылки, короткого описания, длительности —
// перенесено дословно: от этого зависит вид уже опубликованных карточек.

import type { Club, Offering, Schedule, Trainer } from '@sporthub/types';

import type { PublicationSlotInput } from './publication.service';

/** Адрес-ссылка из названия: нижний регистр, пробелы в дефис, лишнее выбрасывается. */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zа-яё0-9-]/g, '')
    .replace(/-+/g, '-');
}

/** Короткое описание — до 120 символов, по возможности по границе предложения. */
export function makeShortDescription(description: string): string {
  if (description.length <= 120) return description;

  const cut = description.slice(0, 120);
  const lastSentenceEnd = Math.max(
    cut.lastIndexOf('.'),
    cut.lastIndexOf('!'),
    cut.lastIndexOf('?'),
  );

  if (lastSentenceEnd > 40) {
    return description.slice(0, lastSentenceEnd + 1);
  }

  const lastSpace = cut.lastIndexOf(' ');

  return `${description.slice(0, lastSpace > 0 ? lastSpace : 120)}…`;
}

/** Длительность занятия в минутах по времени начала и конца. */
export function calcDuration(startTime: string, endTime: string): number {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);

  return endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
}

/**
 * Название формата занятий из формы — в код услуги. Форма присылает русское
 * слово, хранилище и фронт работают с кодом; при незнакомом значении берётся
 * индивидуальный формат, как было и раньше.
 */
const OFFERING_FORMAT_BY_LABEL: Record<string, Offering['format']> = {
  Индивидуальная: 'personal',
  Групповая: 'group',
  'Мини-группа': 'mini_group',
};

function offeringFormatFromLabel(label: string): Offering['format'] {
  return OFFERING_FORMAT_BY_LABEL[label] ?? 'personal';
}

/** Форма публикации клуба — то, что приходит из модалки провайдера. */
export type ClubForm = {
  name: string;
  city: string;
  address: string;
  description: string;
  phone: string;
  email?: string;
  priceFrom: string;
  sportIds: number[];
  tagIds: number[];
  amenityIds: number[];
  vk?: string;
  telegram?: string;
  facebook?: string;
  coordinates?: { lat: number; lng: number };
  cityCoordinates?: { lat: number; lng: number };
  scheduleSlots: Array<{
    id?: number;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    price: string;
    capacity: string;
    location: string;
    sportId: number;
  }>;
};

export type TrainerForm = {
  firstName: string;
  lastName: string;
  city: string;
  address: string;
  bio: string;
  experience: string;
  sportIds: number[];
  specialtyIds: number[];
  workFormatIds: number[];
  phone: string;
  vk?: string;
  telegram?: string;
  facebook?: string;
  offeringName: string;
  offeringDescription: string;
  offeringFormat: string;
  offeringPrice: string;
  offeringDuration: string;
  offeringLocation: string;
  clubId?: number | null;
  coordinates?: { lat: number; lng: number };
  cityCoordinates?: { lat: number; lng: number };
  scheduleSlots: ClubForm['scheduleSlots'];
};

/** Клуб из формы — без идентификатора и метки времени, их проставит хранилище. */
export function clubFromForm(
  form: ClubForm,
  managedByUserId: number,
): Omit<Club, 'id' | 'createdAt'> {
  return {
    name: form.name,
    slug: generateSlug(form.name),
    description: form.description,
    shortDescription: makeShortDescription(form.description),
    city: form.city,
    address: form.address,
    phone: form.phone,
    ...(form.email ? { email: form.email } : {}),
    ...(form.vk ? { vk: form.vk } : {}),
    ...(form.telegram ? { telegram: form.telegram } : {}),
    ...(form.facebook ? { facebook: form.facebook } : {}),
    coordinates: form.coordinates ?? { lat: 0, lng: 0 },
    sportIds: form.sportIds,
    imageUrls: [],
    amenityIds: form.amenityIds,
    tagIds: form.tagIds,
    rating: 0,
    reviewCount: 0,
    priceFrom: Number(form.priceFrom),
    distanceKm: 0,
    managedByUserId,
    source: 'provider',
    status: 'published',
  } as Omit<Club, 'id' | 'createdAt'>;
}

/** Клубная услуга из формы. Владелец проставляется сервисом после создания клуба. */
export function clubOfferingFromForm(
  form: ClubForm,
): Omit<Offering, 'id' | 'createdAt' | 'ownerId'> {
  return {
    ownerType: 'club',
    sportId: form.sportIds[0] ?? 0,
    title: `Занятия — ${form.name}`,
    description: form.description,
    format: 'group',
    price: Number(form.priceFrom),
    durationMinutes: 60,
    capacity: 20,
    address: form.address,
    coordinates: form.coordinates ?? { lat: 0, lng: 0 },
  } as Omit<Offering, 'id' | 'createdAt' | 'ownerId'>;
}

/** Тренер из формы. Имя собирается из двух полей — так было и раньше. */
export function trainerFromForm(
  form: TrainerForm,
  managedByUserId: number,
): Omit<Trainer, 'id' | 'createdAt'> {
  const name = `${form.firstName} ${form.lastName}`.trim();

  return {
    name,
    slug: generateSlug(name),
    bio: form.bio,
    avatarUrl: '',
    experienceYears: Number(form.experience),
    specialtyIds: form.specialtyIds,
    workFormatIds: form.workFormatIds,
    rating: 0,
    reviewCount: 0,
    priceFrom: Number(form.offeringPrice),
    sportIds: form.sportIds,
    city: form.city,
    address: form.address,
    coordinates: form.coordinates ?? { lat: 0, lng: 0 },
    phone: form.phone,
    ...(form.vk ? { vk: form.vk } : {}),
    ...(form.telegram ? { telegram: form.telegram } : {}),
    ...(form.facebook ? { facebook: form.facebook } : {}),
    managedByUserId,
    source: 'provider',
    status: 'published',
  } as Omit<Trainer, 'id' | 'createdAt'>;
}

export function trainerOfferingFromForm(
  form: TrainerForm,
): Omit<Offering, 'id' | 'createdAt' | 'ownerId'> {
  return {
    ownerType: 'trainer',
    sportId: form.sportIds[0] ?? 0,
    title: form.offeringName,
    description: form.offeringDescription,
    format: offeringFormatFromLabel(form.offeringFormat),
    price: Number(form.offeringPrice),
    durationMinutes: Number(form.offeringDuration),
    capacity: 1,
    address: form.offeringLocation,
    coordinates: form.coordinates ?? { lat: 0, lng: 0 },
  } as Omit<Offering, 'id' | 'createdAt' | 'ownerId'>;
}

/** Слоты расписания из формы. Владелец и услуга проставляются сервисом. */
export function slotsFromForm(form: {
  scheduleSlots: ClubForm['scheduleSlots'];
}): PublicationSlotInput[] {
  return form.scheduleSlots.map((slot) => ({
    ...(slot.id !== undefined ? { id: slot.id } : {}),
    sportId: slot.sportId,
    title: slot.title,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    durationMinutes: calcDuration(slot.startTime, slot.endTime),
    level: 'all_levels',
    capacity: Number(slot.capacity),
    bookedCount: 0,
    price: Number(slot.price),
    room: slot.location,
  })) as PublicationSlotInput[];
}

/**
 * Правка клуба меняет только то, что есть в форме.
 *
 * Адрес-ссылка, картинки, происхождение записи, расстояние и рейтинг остаются
 * прежними: они либо назначены при создании, либо считаются системой. Прежний
 * маппер собирал ровно этот набор полей, и порядок правки от него зависит —
 * иначе правка клуба стирала бы его картинки и меняла адрес-ссылку.
 */
export function clubPatchFromForm(form: ClubForm): Partial<Club> {
  return {
    name: form.name,
    description: form.description,
    shortDescription: makeShortDescription(form.description),
    city: form.city,
    address: form.address,
    phone: form.phone,
    email: form.email || undefined,
    vk: form.vk || undefined,
    telegram: form.telegram || undefined,
    facebook: form.facebook || undefined,
    sportIds: form.sportIds,
    amenityIds: form.amenityIds,
    tagIds: form.tagIds,
    priceFrom: Number(form.priceFrom),
    ...(form.coordinates ? { coordinates: form.coordinates } : {}),
  } as Partial<Club>;
}

/** Правка услуги клуба. Координаты пишутся только если форма их дала. */
export function clubOfferingPatchFromForm(form: ClubForm): Partial<Offering> {
  return {
    ownerType: 'club',
    sportId: form.sportIds[0] ?? 0,
    title: `Занятия — ${form.name}`,
    description: form.description,
    format: 'group',
    price: Number(form.priceFrom),
    durationMinutes: 60,
    capacity: 20,
    address: form.address,
    ...(form.coordinates ? { coordinates: form.coordinates } : {}),
  } as Partial<Offering>;
}

/** Правка тренера — тот же принцип, что и у клуба. */
export function trainerPatchFromForm(form: TrainerForm): Partial<Trainer> {
  return {
    name: `${form.firstName} ${form.lastName}`,
    bio: form.bio,
    experienceYears: Number(form.experience),
    specialtyIds: form.specialtyIds,
    workFormatIds: form.workFormatIds,
    priceFrom: Number(form.offeringPrice),
    sportIds: form.sportIds,
    city: form.city,
    address: form.address,
    phone: form.phone || undefined,
    vk: form.vk || undefined,
    telegram: form.telegram || undefined,
    facebook: form.facebook || undefined,
    ...(form.coordinates ? { coordinates: form.coordinates } : {}),
  } as Partial<Trainer>;
}

export function trainerOfferingPatchFromForm(form: TrainerForm): Partial<Offering> {
  return {
    ownerType: 'trainer',
    sportId: form.sportIds[0] ?? 0,
    title: form.offeringName,
    description: form.offeringDescription,
    format: offeringFormatFromLabel(form.offeringFormat),
    price: Number(form.offeringPrice),
    durationMinutes: Number(form.offeringDuration),
    capacity: 1,
    address: form.offeringLocation,
    ...(form.coordinates ? { coordinates: form.coordinates } : {}),
  } as Partial<Offering>;
}
