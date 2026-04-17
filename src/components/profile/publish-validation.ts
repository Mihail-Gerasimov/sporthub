// Чистые функции валидации publish-форм (Step 13.5, обновлено Phase 23).
// Возвращают объект ошибок { fieldName: 'Сообщение' } или пустой объект.

import type { ScheduleSlotForm } from '@/lib/schemas/publish';
import type { EntityId } from '@/types';

// --- Типы форм (дублируем для валидации, т.к. оригиналы — локальные в модалках) ---

/** Состояние формы клуба (для валидации) */
type ClubFormInput = {
  name: string;
  city: string;
  address: string;
  description: string;
  phone: string;
  email: string;
  priceFrom: string;
  sportIds: EntityId[];
  tagIds?: EntityId[];
  amenityIds?: EntityId[];
  scheduleSlots?: ScheduleSlotForm[];
  // Остальные поля не участвуют в валидации MVP
};

/** Состояние формы тренера (для валидации) */
type TrainerFormInput = {
  firstName: string;
  lastName: string;
  city: string;
  address: string;
  bio: string;
  experience: string;
  sportIds: EntityId[];
  specialtyIds: EntityId[];
  workFormatIds: EntityId[];
  phone: string;
  offeringName: string;
  offeringDescription: string;
  offeringFormat: string;
  offeringPrice: string;
  offeringDuration: string;
  offeringLocation: string;
  clubId: number | null;
  scheduleSlots: ScheduleSlotForm[];
  // Остальные поля не участвуют в валидации MVP
};

// --- Хелперы ---

/** Проверка базового формата email */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Проверка формата российского телефона (+7 (XXX) XXX-XX-XX) */
function isValidPhone(value: string): boolean {
  return /^\+7\s?\(?\d{3}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/.test(value);
}

/** Проверка: город / имя — только буквы (кириллица, латиница), пробелы, дефисы */
function isValidNameOrCity(value: string): boolean {
  return /^[a-zA-Zа-яА-ЯёЁ\s-]+$/.test(value);
}

/** Проверка: адрес — буквы, цифры, точки, запятые, дефисы, пробелы, косая черта */
function isValidAddress(value: string): boolean {
  return /^[a-zA-Zа-яА-ЯёЁ0-9\s.,\-/]+$/.test(value);
}

/** Проверка: описание — обычная пунктуация, без мусора (&^#$@%) */
function isValidDescription(value: string): boolean {
  return !/[&^#$@%]/.test(value);
}

/** Проверка что строка — положительное число */
function isPositiveNumber(value: string): boolean {
  const num = Number(value);
  return value.trim() !== '' && !Number.isNaN(num) && num > 0;
}

/** Проверка что длительность кратна 5 минутам */
function isDurationMultipleOf5(value: string): boolean {
  const num = Number(value);
  return !Number.isNaN(num) && num > 0 && num % 5 === 0;
}

/** Проверка минимальной длины текстового поля */
function hasMinLength(value: string, minLength: number): boolean {
  return value.trim().length >= minLength;
}

/** Проверка что слот расписания заполнен полностью */
function isScheduleSlotComplete(slot: ScheduleSlotForm): boolean {
  return (
    slot.title.trim() !== '' &&
    slot.date.trim() !== '' &&
    slot.startTime.trim() !== '' &&
    slot.endTime.trim() !== '' &&
    isPositiveNumber(slot.price) &&
    isPositiveNumber(slot.capacity) &&
    slot.location.trim() !== '' &&
    slot.discipline.trim() !== ''
  );
}

// --- Валидация формы клуба ---

export function validateClubForm(form: ClubFormInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) {
    errors.name = 'Укажите название клуба';
  }
  if (!form.city.trim()) {
    errors.city = 'Укажите город';
  } else if (!isValidNameOrCity(form.city.trim())) {
    errors.city = 'Город может содержать только буквы, пробелы и дефисы';
  }
  if (!form.address.trim()) {
    errors.address = 'Укажите адрес';
  } else if (!isValidAddress(form.address.trim())) {
    errors.address = 'Адрес содержит недопустимые символы';
  }
  if (!form.description.trim()) {
    errors.description = 'Добавьте описание';
  } else if (!hasMinLength(form.description, 50)) {
    errors.description = 'Описание должно содержать минимум 50 символов';
  } else if (!isValidDescription(form.description)) {
    errors.description = 'Описание содержит недопустимые символы';
  }
  if (!form.phone.trim()) {
    errors.phone = 'Укажите телефон';
  } else if (!isValidPhone(form.phone.trim())) {
    errors.phone = 'Некорректный формат телефона';
  }

  // Email — необязательный, но если заполнен, проверяем формат
  if (form.email.trim() && !isValidEmail(form.email)) {
    errors.email = 'Некорректный формат email';
  }

  if (!isPositiveNumber(form.priceFrom)) {
    errors.priceFrom = 'Укажите цену (положительное число)';
  }

  if (form.sportIds.length === 0) {
    errors.sportIds = 'Необходимо выбрать хотя бы 1 направление';
  }

  if (!form.scheduleSlots || form.scheduleSlots.length === 0) {
    errors.scheduleSlots = 'Добавьте хотя бы 1 слот расписания';
  } else if (form.scheduleSlots.some((slot) => !isScheduleSlotComplete(slot))) {
    errors.scheduleSlots = 'Заполните стартовое расписание полностью';
  }

  return errors;
}

// --- Валидация формы тренера ---

export function validateTrainerForm(form: TrainerFormInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.firstName.trim()) {
    errors.firstName = 'Укажите имя';
  } else if (!isValidNameOrCity(form.firstName.trim())) {
    errors.firstName = 'Имя может содержать только буквы, пробелы и дефисы';
  }
  if (!form.lastName.trim()) {
    errors.lastName = 'Укажите фамилию';
  } else if (!isValidNameOrCity(form.lastName.trim())) {
    errors.lastName = 'Фамилия может содержать только буквы, пробелы и дефисы';
  }
  if (!form.city.trim()) {
    errors.city = 'Укажите город';
  } else if (!isValidNameOrCity(form.city.trim())) {
    errors.city = 'Город может содержать только буквы, пробелы и дефисы';
  }
  if (!form.address.trim()) {
    errors.address = 'Укажите адрес';
  } else if (!isValidAddress(form.address.trim())) {
    errors.address = 'Адрес содержит недопустимые символы';
  }
  if (!form.bio.trim()) {
    errors.bio = 'Добавьте описание о себе';
  } else if (!hasMinLength(form.bio, 50)) {
    errors.bio = 'Описание должно содержать минимум 50 символов';
  } else if (!isValidDescription(form.bio)) {
    errors.bio = 'Описание содержит недопустимые символы';
  }
  if (!isPositiveNumber(form.experience)) {
    errors.experience = 'Укажите опыт (положительное число)';
  }
  if (!form.phone.trim()) {
    errors.phone = 'Укажите телефон';
  } else if (!isValidPhone(form.phone.trim())) {
    errors.phone = 'Некорректный формат телефона';
  }
  if (form.sportIds.length === 0) {
    errors.sportIds = 'Выберите основной вид спорта';
  }
  if (form.specialtyIds.length === 0) {
    errors.specialtyIds = 'Выберите минимум 1 специализацию';
  }
  if (form.workFormatIds.length === 0) {
    errors.workFormatIds = 'Выберите формат работы';
  }
  if (!form.offeringName.trim()) {
    errors.offeringName = 'Укажите название услуги';
  }
  if (!form.offeringDescription.trim()) {
    errors.offeringDescription = 'Добавьте описание услуги';
  }
  if (!form.offeringFormat.trim()) {
    errors.offeringFormat = 'Выберите формат услуги';
  }
  if (!isPositiveNumber(form.offeringPrice)) {
    errors.offeringPrice = 'Укажите цену услуги (положительное число)';
  }
  if (!isPositiveNumber(form.offeringDuration)) {
    errors.offeringDuration = 'Укажите длительность (положительное число)';
  } else if (!isDurationMultipleOf5(form.offeringDuration)) {
    errors.offeringDuration = 'Длительность должна быть кратна 5 минутам (например, 55 или 60)';
  }
  if (!form.offeringLocation.trim()) {
    errors.offeringLocation = 'Укажите место проведения';
  }

  if (form.scheduleSlots.length === 0) {
    errors.scheduleSlots = 'Добавьте хотя бы 1 слот расписания';
  } else if (form.scheduleSlots.some((slot) => !isScheduleSlotComplete(slot))) {
    errors.scheduleSlots = 'Заполните стартовое расписание полностью';
  }

  // clubId — опциональный, не валидируем

  return errors;
}
