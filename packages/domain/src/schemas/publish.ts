/**
 * Zod-схемы валидации payload публикации клуба и тренера.
 * Используются в POST /api/clubs и POST /api/trainers.
 * Step 14.5
 */
import { z } from 'zod';

import type { CancellationPolicy, EntityId } from '@sporthub/types';

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
  userId: z.number().int().positive('ID пользователя обязателен'),
});

/** Схема публикации клуба с cross-field валидацией: slot.sportId ∈ sportIds */
export const publishClubSchema = publishClubBaseSchema.refine(
  (data) => data.scheduleSlots.every((slot) => data.sportIds.includes(slot.sportId)),
  {
    message:
      'В слотах используется направление, которое не выбрано в публикации. Поправьте слоты или добавьте направление.',
    path: ['scheduleSlots'],
  },
);

/** Phase 24 Step 24.10: единая схема одной offering-карточки тренера (multi-offering).
 * attachmentMode='club' требует clubLinkId (id confirmed TrainerClubLink тренера).
 * attachmentMode='private' — clubLinkId отсутствует; услуга оказывается тренером самостоятельно. */
const trainerOfferingItemSchema = z
  .object({
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(1, 'Название услуги обязательно'),
    description: z.string().trim().min(1, 'Описание услуги обязательно'),
    format: z.string().trim().min(1, 'Формат занятий обязателен'),
    price: z.string().regex(/^\d+$/, 'Цена должна быть числом'),
    duration: z
      .string()
      .regex(/^\d+$/, 'Длительность должна быть числом')
      .refine((val) => Number(val) % 5 === 0, {
        message: 'Длительность должна быть кратна 5 минутам',
      }),
    location: z.string().trim().min(1, 'Место проведения обязательно'),
    cancellationPolicy: z
      .enum(['free_anytime', 'free_until_24h', 'free_until_2h', 'no_refund'])
      .default('free_until_24h'),
    attachmentMode: z.enum(['club', 'private']),
    clubLinkId: z.number().int().positive().optional(),
    scheduleSlots: z.array(scheduleSlotSchema).min(1, 'Добавьте хотя бы один слот расписания'),
  })
  .refine((data) => data.attachmentMode !== 'club' || typeof data.clubLinkId === 'number', {
    message: 'Для услуги «в клубе» обязательно выбрать подтверждённую связь',
    path: ['clubLinkId'],
  });

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
  // Phase 24 Step 24.10: дополнительные услуги тренера (multi-offering).
  // Основная услуга остаётся в плоских offering*-полях (первая карточка),
  // каждая доп. карточка — полный TrainerOfferingFormItem со своим расписанием.
  additionalOfferings: z.array(trainerOfferingItemSchema).optional().default([]),
  userId: z.number().int().positive('ID пользователя обязателен'),
});

/** Схема публикации тренера с cross-field валидацией: slot.sportId ∈ sportIds */
export const publishTrainerSchema = publishTrainerBaseSchema.refine(
  (data) => data.scheduleSlots.every((slot) => data.sportIds.includes(slot.sportId)),
  {
    message:
      'В слотах используется направление, которое не выбрано в публикации. Поправьте слоты или добавьте направление.',
    path: ['scheduleSlots'],
  },
);

export type PublishClubPayload = z.infer<typeof publishClubSchema>;
export type PublishTrainerPayload = z.infer<typeof publishTrainerSchema>;

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

/**
 * Phase 24 Step 24.10: одна offering-карточка в multi-offering UI тренера.
 * Используется в `TrainerFormState.additionalOfferings`. «Основная» услуга
 * по-прежнему живёт в плоских offering*-полях для обратной совместимости
 * с тестами и текущим UI; доп. услуги — в массиве.
 */
export type TrainerOfferingFormItem = {
  id?: EntityId;
  title: string;
  description: string;
  format: string;
  price: string;
  duration: string;
  location: string;
  cancellationPolicy: CancellationPolicy;
  attachmentMode: 'club' | 'private';
  /** ID confirmed TrainerClubLink тренера — обязателен при attachmentMode='club'. */
  clubLinkId?: EntityId;
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
  /**
   * Phase 24 Step 24.10: multi-offering тренера. Дополнительные услуги к основной
   * (которая остаётся в плоских offering*-полях и первом scheduleSlots[]).
   * Каждый элемент — independent offering с собственным attachmentMode и расписанием.
   */
  additionalOfferings?: TrainerOfferingFormItem[];
};
