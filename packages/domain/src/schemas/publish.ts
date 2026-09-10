/**
 * Zod-схемы валидации payload публикации клуба и тренера.
 * Используются в POST /api/clubs и POST /api/trainers.
 * Step 14.5
 */
import { z } from 'zod';

import type { EntityId } from '@sporthub/types';

/** Опциональные координаты, полученные через Geocoder */
const coordinatesSchema = z
  .object({
    lat: z.number(),
    lng: z.number(),
  })
  .optional();

/** Regex: время с шагом 10 минут (00, 10, 20, 30, 40, 50) */
const TIME_STEP_10_REGEX = /^([01]\d|2[0-3]):[0-5]0$/;

/** Слот расписания (общий для клуба и тренера) */
const scheduleSlotSchema = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(1, 'Название слота обязательно'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Формат даты: YYYY-MM-DD'),
  startTime: z
    .string()
    .regex(TIME_STEP_10_REGEX, 'Время должно быть кратно 10 минутам (например, 09:00, 09:30)'),
  endTime: z
    .string()
    .regex(TIME_STEP_10_REGEX, 'Время должно быть кратно 10 минутам (например, 10:00, 10:30)'),
  price: z.string().regex(/^\d+$/, 'Цена должна быть числом'),
  capacity: z.string().regex(/^\d+$/, 'Вместимость должна быть числом'),
  location: z.string().trim().min(1, 'Место проведения обязательно'),
  sportId: z.number().int().positive('Направление обязательно'),
});

/** Базовая схема публикации клуба (без cross-field refine) */
const publishClubBaseSchema = z.object({
  name: z.string().trim().min(2, 'Название клуба обязательно'),
  city: z.string().trim().min(1, 'Город обязателен'),
  address: z.string().trim().min(1, 'Адрес обязателен'),
  description: z.string().trim().min(50, 'Описание — минимум 50 символов'),
  phone: z
    .string()
    .trim()
    .min(1, 'Телефон обязателен')
    .regex(/^\+7\s?\(?\d{3}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/, 'Некорректный формат телефона'),
  email: z
    .string()
    .trim()
    .default('')
    .refine((val) => val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: 'Некорректный формат email',
    }),
  priceFrom: z.string().regex(/^\d+$/, 'Цена должна быть числом'),
  sportIds: z.array(z.number()).min(1, 'Выберите хотя бы одно направление'),
  tagIds: z.array(z.number()),
  amenityIds: z.array(z.number()),
  vk: z.string().trim().default(''),
  telegram: z.string().trim().default(''),
  facebook: z.string().trim().default(''),
  coordinates: coordinatesSchema,
  cityCoordinates: coordinatesSchema,
  scheduleSlots: z.array(scheduleSlotSchema).min(1, 'Добавьте хотя бы один слот расписания'),
  // ⚠️ Фаза 34: поле принимается, но НИ НА ЧТО не влияет — владельца публикации
  // сервер берёт из сессии. Оставлено необязательным, чтобы клиент, собранный
  // до этой фазы, пережил выкатку: он поле ещё шлёт. Удаляется вместе с последним
  // таким клиентом.
  userId: z.number().int().positive('ID пользователя обязателен').optional(),
});

/**
 * Сверка направлений: направление каждого слота выбрано в самой публикации.
 *
 * ⚠️ Шаг 36.4. Расписание читается ЧЕРЕЗ `?? []`, и это не перестраховка.
 * В схеме правки поле необязательное; прямое разыменование давало бы исключение
 * внутри `refine`, а `safeParse` исключения из `refine` не ловит — наружу ушёл бы
 * 500 вместо 400. Одна проверка на обе схемы: смысл у неё один, и разъехаться
 * двум копиям здесь незачем.
 */
const slotSportsBelongToPublication = (data: {
  sportIds: number[];
  scheduleSlots?: { sportId: number }[];
}): boolean => (data.scheduleSlots ?? []).every((slot) => data.sportIds.includes(slot.sportId));

/** Текст и адрес ошибки сверки направлений — общие для создания и правки. */
const SLOT_SPORT_MISMATCH = {
  message:
    'В слотах используется направление, которое не выбрано в публикации. Поправьте слоты или добавьте направление.',
  path: ['scheduleSlots'],
};

/** Схема публикации клуба с cross-field валидацией: slot.sportId ∈ sportIds */
export const publishClubSchema = publishClubBaseSchema.refine(
  slotSportsBelongToPublication,
  SLOT_SPORT_MISMATCH,
);

/**
 * Схема ПРАВКИ клуба (шаг 36.4, решение заказчика 1).
 *
 * Отличие от создания ровно одно: `scheduleSlots` необязателен. Поля нет —
 * расписание не трогаем вовсе; поле есть — работает прежняя замена целиком.
 * Пустой массив по-прежнему отклоняется: публикация без единого слота нерабочая,
 * каким бы путём она такой ни стала.
 *
 * ⚠️ Смягчать общую схему было нельзя: это разрешило бы создать публикацию
 * без расписания. Поэтому схем две, а не одна с послаблением.
 */
export const editClubSchema = publishClubBaseSchema
  .extend({
    scheduleSlots: z
      .array(scheduleSlotSchema)
      .min(1, 'Добавьте хотя бы один слот расписания')
      .optional(),
  })
  .refine(slotSportsBelongToPublication, SLOT_SPORT_MISMATCH);

/** Базовая схема публикации тренера (без cross-field refine) */
const publishTrainerBaseSchema = z.object({
  firstName: z.string().trim().min(1, 'Имя обязательно'),
  lastName: z.string().trim().min(1, 'Фамилия обязательна'),
  city: z.string().trim().min(1, 'Город обязателен'),
  address: z.string().trim().min(1, 'Адрес обязателен'),
  bio: z.string().trim().min(50, 'Описание — минимум 50 символов'),
  experience: z.string().regex(/^\d+$/, 'Стаж должен быть числом'),
  sportIds: z.array(z.number()).min(1, 'Выберите вид спорта'),
  specialtyIds: z.array(z.number()).min(1, 'Выберите хотя бы одну специализацию'),
  workFormatIds: z.array(z.number()).min(1, 'Формат работы обязателен'),
  phone: z
    .string()
    .trim()
    .min(1, 'Телефон обязателен')
    .regex(/^\+7\s?\(?\d{3}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/, 'Некорректный формат телефона'),
  vk: z.string().trim().default(''),
  telegram: z.string().trim().default(''),
  facebook: z.string().trim().default(''),
  offeringName: z.string().trim().min(1, 'Название услуги обязательно'),
  offeringDescription: z.string().trim().min(1, 'Описание услуги обязательно'),
  offeringFormat: z.string().trim().min(1, 'Формат занятий обязателен'),
  offeringPrice: z.string().regex(/^\d+$/, 'Цена должна быть числом'),
  offeringDuration: z
    .string()
    .regex(/^\d+$/, 'Длительность должна быть числом')
    .refine((val) => Number(val) % 5 === 0, {
      message: 'Длительность должна быть кратна 5 минутам (например, 55 или 60)',
    }),
  offeringLocation: z.string().trim().min(1, 'Место проведения обязательно'),
  clubId: z.number().int().positive().nullable(),
  coordinates: coordinatesSchema,
  cityCoordinates: coordinatesSchema,
  scheduleSlots: z.array(scheduleSlotSchema).min(1, 'Добавьте хотя бы один слот расписания'),
  // ⚠️ Фаза 34: поле принимается, но НИ НА ЧТО не влияет — владельца публикации
  // сервер берёт из сессии. Оставлено необязательным, чтобы клиент, собранный
  // до этой фазы, пережил выкатку: он поле ещё шлёт. Удаляется вместе с последним
  // таким клиентом.
  userId: z.number().int().positive('ID пользователя обязателен').optional(),
});

/** Схема публикации тренера с cross-field валидацией: slot.sportId ∈ sportIds */
export const publishTrainerSchema = publishTrainerBaseSchema.refine(
  slotSportsBelongToPublication,
  SLOT_SPORT_MISMATCH,
);

/** Схема ПРАВКИ карточки тренера — то же послабление, что и у клуба (шаг 36.4). */
export const editTrainerSchema = publishTrainerBaseSchema
  .extend({
    scheduleSlots: z
      .array(scheduleSlotSchema)
      .min(1, 'Добавьте хотя бы один слот расписания')
      .optional(),
  })
  .refine(slotSportsBelongToPublication, SLOT_SPORT_MISMATCH);

export type PublishClubPayload = z.infer<typeof publishClubSchema>;
export type PublishTrainerPayload = z.infer<typeof publishTrainerSchema>;
export type EditClubPayload = z.infer<typeof editClubSchema>;
export type EditTrainerPayload = z.infer<typeof editTrainerSchema>;

/* ========================================
   Shared form-state типы для publish/edit модалок.
   Единый источник правды — используется в create и edit flow.
   Step 15.1
   ======================================== */

/** Слот расписания формы. id присутствует только при редактировании существующего слота. */
export type ScheduleSlotForm = {
  id?: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  price: string;
  capacity: string;
  location: string;
  /** ID вида спорта из справочника (вместо текстового discipline) */
  sportId: number;
};

/** Состояние формы клуба (create и edit) */
export type ClubFormState = {
  name: string;
  city: string;
  address: string;
  description: string;
  phone: string;
  email: string;
  priceFrom: string;
  sportIds: EntityId[];
  tagIds: EntityId[];
  amenityIds: EntityId[];
  // Контакты — соцсети
  vk: string;
  telegram: string;
  facebook: string;
  /** Координаты, полученные через Geocoder (опциональны — публикация возможна и без них) */
  coordinates?: { lat: number; lng: number };
  /** Координаты центра города для runtime-добавления в cities.json */
  cityCoordinates?: { lat: number; lng: number };
  scheduleSlots: ScheduleSlotForm[];
};

/** Состояние формы тренера (create и edit) */
export type TrainerFormState = {
  firstName: string;
  lastName: string;
  city: string;
  address: string;
  bio: string;
  experience: string;
  sportIds: EntityId[];
  specialtyIds: EntityId[];
  workFormatIds: EntityId[];
  // Контакты
  phone: string;
  vk: string;
  telegram: string;
  facebook: string;
  offeringName: string;
  offeringDescription: string;
  offeringFormat: string;
  offeringPrice: string;
  offeringDuration: string;
  offeringLocation: string;
  clubId: number | null;
  /** Координаты, полученные через Geocoder (опциональны — публикация возможна и без них) */
  coordinates?: { lat: number; lng: number };
  /** Координаты центра города для runtime-добавления в cities.json */
  cityCoordinates?: { lat: number; lng: number };
  scheduleSlots: ScheduleSlotForm[];
};
