/**
 * Create-контракт публикации клуба.
 * Маппит форму PublishClubModal → persisted-сущности: club + offering + schedule[].
 * Step 14.3
 */
import sportsData from '@/data/sports.json';
import type { UpdateClubPublicationInput } from '@/lib/db';
import type { ScheduleSlotForm, ClubFormState } from '@/lib/schemas/publish';
import type { Club, EntityId, Offering, Schedule } from '@/types';

/* --- Типы формы — реэкспорт из единого источника publish.ts --- */

export type { ScheduleSlotForm };
export type ClubPublishForm = ClubFormState;

/* --- Результат маппинга --- */

export interface ClubPublishEntities {
  club: Club;
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

/** Обрезка description до ~120 символов по границе предложения */
function makeShortDescription(description: string): string {
  if (description.length <= 120) return description;
  // Ищем конец предложения (точка, вопрос, восклицание) в пределах 120 символов
  const cut = description.slice(0, 120);
  const lastSentenceEnd = Math.max(
    cut.lastIndexOf('.'),
    cut.lastIndexOf('!'),
    cut.lastIndexOf('?'),
  );
  if (lastSentenceEnd > 40) {
    return description.slice(0, lastSentenceEnd + 1);
  }
  // Иначе обрезаем по пробелу и добавляем многоточие
  const lastSpace = cut.lastIndexOf(' ');
  return `${description.slice(0, lastSpace > 0 ? lastSpace : 120)}…`;
}

/** Маппинг названий дисциплин → sportIds */
function disciplinesToSportIds(disciplines: string[]): EntityId[] {
  return disciplines.map((name) => sportNameToId[name]).filter((id): id is EntityId => id != null);
}

/** Расчёт durationMinutes из startTime/endTime (HH:MM) */
function calcDuration(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

/* --- Основная функция маппинга --- */

let nextId = Date.now(); // Уникальные id для новых сущностей
function nextEntityId(): EntityId {
  return ++nextId;
}

/**
 * Маппит форму публикации клуба в набор persisted-сущностей.
 * Не записывает в БД — только формирует объекты.
 */
export function mapClubFormToEntities(
  form: ClubPublishForm,
  managedByUserId: EntityId,
): ClubPublishEntities {
  const now = new Date().toISOString();
  const clubId = nextEntityId();
  const sportIds = disciplinesToSportIds(form.disciplines);

  /* Клуб */
  const club: Club = {
    id: clubId,
    createdAt: now,
    name: form.name,
    slug: generateSlug(form.name),
    description: form.description,
    shortDescription: makeShortDescription(form.description),
    city: form.city,
    address: form.address,
    phone: form.phone,
    ...(form.email ? { email: form.email } : {}),
    coordinates: { lat: 0, lng: 0 },
    sportIds,
    imageUrls: [],
    amenities: form.amenities,
    tags: form.tags,
    rating: 0,
    reviewCount: 0,
    priceFrom: Number(form.priceFrom),
    distanceKm: 0,
    isFeatured: false,
    managedByUserId,
    source: 'provider',
    status: 'published',
  };

  /* Одна клубная услуга (offering) */
  const offeringId = nextEntityId();
  const offering: Offering = {
    id: offeringId,
    createdAt: now,
    ownerType: 'club',
    ownerId: clubId,
    affiliatedClubId: clubId,
    sportId: sportIds[0] ?? 0,
    title: `Занятия — ${form.name}`,
    description: form.description,
    format: 'group',
    price: Number(form.priceFrom),
    durationMinutes: 60,
    capacity: 20,
    address: form.address,
    coordinates: { lat: 0, lng: 0 },
  };

  /* Слоты расписания */
  const schedules: Schedule[] = form.scheduleSlots.map((slot) => ({
    id: nextEntityId(),
    createdAt: now,
    offeringId,
    ownerType: 'club' as const,
    ownerId: clubId,
    clubId,
    sportId: sportNameToId[slot.discipline] ?? sportIds[0] ?? 0,
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

  return { club, offering, schedules };
}

/**
 * Маппит форму редактирования клуба в update-payload для db.ts.
 * Системные поля сохраняются на уровне db.ts, сюда попадают только активные MVP-поля.
 */
export function mapClubFormToUpdateInput(
  form: ClubPublishForm,
  clubId: EntityId,
  managedByUserId: EntityId,
): UpdateClubPublicationInput {
  const sportIds = disciplinesToSportIds(form.disciplines);

  return {
    clubId,
    userId: managedByUserId,
    club: {
      name: form.name,
      description: form.description,
      shortDescription: makeShortDescription(form.description),
      city: form.city,
      address: form.address,
      phone: form.phone,
      email: form.email || undefined,
      sportIds,
      amenities: form.amenities,
      tags: form.tags,
      priceFrom: Number(form.priceFrom),
    },
    offering: {
      ownerType: 'club',
      sportId: sportIds[0] ?? 0,
      title: `Занятия — ${form.name}`,
      description: form.description,
      format: 'group',
      price: Number(form.priceFrom),
      durationMinutes: 60,
      capacity: 20,
      address: form.address,
    },
    schedules: form.scheduleSlots.map((slot) => ({
      ...(slot.id !== undefined ? { id: slot.id } : {}),
      sportId: sportNameToId[slot.discipline] ?? sportIds[0] ?? 0,
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
