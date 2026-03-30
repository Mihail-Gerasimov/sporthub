/**
 * Zod-схемы валидации payload публикации клуба и тренера.
 * Используются в POST /api/clubs и POST /api/trainers.
 * Step 14.5
 */
import { z } from 'zod';

/** Слот расписания (общий для клуба и тренера) */
const scheduleSlotSchema = z.object({
  title: z.string().trim().min(1, 'Название слота обязательно'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Формат даты: YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Формат времени: HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Формат времени: HH:MM'),
  price: z.string().regex(/^\d+$/, 'Цена должна быть числом'),
  capacity: z.string().regex(/^\d+$/, 'Вместимость должна быть числом'),
  location: z.string().trim().min(1, 'Место проведения обязательно'),
  discipline: z.string().trim().min(1, 'Дисциплина обязательна'),
});

/** Схема публикации клуба */
export const publishClubSchema = z.object({
  name: z.string().trim().min(2, 'Название клуба обязательно'),
  city: z.string().trim().min(1, 'Город обязателен'),
  address: z.string().trim().min(1, 'Адрес обязателен'),
  description: z.string().trim().min(50, 'Описание — минимум 50 символов'),
  phone: z.string().trim().min(1, 'Телефон обязателен'),
  email: z.string().trim().default(''),
  priceFrom: z.string().regex(/^\d+$/, 'Цена должна быть числом'),
  disciplines: z.array(z.string().trim().min(1)).min(1, 'Выберите хотя бы одну дисциплину'),
  tags: z.array(z.string()),
  amenities: z.array(z.string()),
  scheduleSlots: z.array(scheduleSlotSchema).min(1, 'Добавьте хотя бы один слот расписания'),
  userId: z.number().int().positive('ID пользователя обязателен'),
});

/** Схема публикации тренера */
export const publishTrainerSchema = z.object({
  firstName: z.string().trim().min(1, 'Имя обязательно'),
  lastName: z.string().trim().min(1, 'Фамилия обязательна'),
  city: z.string().trim().min(1, 'Город обязателен'),
  address: z.string().trim().min(1, 'Адрес обязателен'),
  bio: z.string().trim().min(50, 'Описание — минимум 50 символов'),
  experience: z.string().regex(/^\d+$/, 'Стаж должен быть числом'),
  sport: z.string().trim().min(1, 'Выберите вид спорта'),
  specializations: z.array(z.string().trim().min(1)).min(1, 'Выберите хотя бы одну специализацию'),
  workFormat: z.string().trim().min(1, 'Формат работы обязателен'),
  offeringName: z.string().trim().min(1, 'Название услуги обязательно'),
  offeringDescription: z.string().trim().min(1, 'Описание услуги обязательно'),
  offeringFormat: z.string().trim().min(1, 'Формат занятий обязателен'),
  offeringPrice: z.string().regex(/^\d+$/, 'Цена должна быть числом'),
  offeringDuration: z.string().regex(/^\d+$/, 'Длительность должна быть числом'),
  offeringLocation: z.string().trim().min(1, 'Место проведения обязательно'),
  clubId: z.number().int().positive().nullable(),
  scheduleSlots: z.array(scheduleSlotSchema).min(1, 'Добавьте хотя бы один слот расписания'),
  userId: z.number().int().positive('ID пользователя обязателен'),
});

export type PublishClubPayload = z.infer<typeof publishClubSchema>;
export type PublishTrainerPayload = z.infer<typeof publishTrainerSchema>;
