// Чистые функции валидации publish-форм (Step 13.5).
// Возвращают объект ошибок { fieldName: 'Сообщение' } или пустой объект.

import type { ScheduleSlotForm } from '@/components/profile/PublishClubModal';

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
  disciplines: string[];
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
  priceFrom: string;
  sport: string;
  specializations: string[];
  workFormat: string;
  offeringName: string;
  offeringDescription: string;
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

/** Проверка что строка — положительное число */
function isPositiveNumber(value: string): boolean {
  const num = Number(value);
  return value.trim() !== '' && !Number.isNaN(num) && num > 0;
}

// --- Валидация формы клуба ---

export function validateClubForm(form: ClubFormInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) {
    errors.name = 'Укажите название клуба';
  }
  if (!form.city.trim()) {
    errors.city = 'Укажите город';
  }
  if (!form.address.trim()) {
    errors.address = 'Укажите адрес';
  }
  if (!form.description.trim()) {
    errors.description = 'Добавьте описание';
  }
  if (!form.phone.trim()) {
    errors.phone = 'Укажите телефон';
  }

  // Email — необязательный, но если заполнен, проверяем формат
  if (form.email.trim() && !isValidEmail(form.email)) {
    errors.email = 'Некорректный формат email';
  }

  if (!isPositiveNumber(form.priceFrom)) {
    errors.priceFrom = 'Укажите цену (положительное число)';
  }

  if (form.disciplines.length === 0) {
    errors.disciplines = 'Необходимо выбрать хотя бы 1 направление';
  }

  return errors;
}

// --- Валидация формы тренера ---

export function validateTrainerForm(form: TrainerFormInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.firstName.trim()) {
    errors.firstName = 'Укажите имя';
  }
  if (!form.lastName.trim()) {
    errors.lastName = 'Укажите фамилию';
  }
  if (!form.city.trim()) {
    errors.city = 'Укажите город';
  }
  if (!form.bio.trim()) {
    errors.bio = 'Добавьте описание о себе';
  }
  if (!isPositiveNumber(form.experience)) {
    errors.experience = 'Укажите опыт (положительное число)';
  }
  if (!form.sport.trim()) {
    errors.sport = 'Выберите основной вид спорта';
  }
  if (form.specializations.length === 0) {
    errors.specializations = 'Выберите минимум 1 специализацию';
  }
  if (!form.workFormat.trim()) {
    errors.workFormat = 'Выберите формат работы';
  }
  if (!form.offeringName.trim()) {
    errors.offeringName = 'Укажите название услуги';
  }
  if (!isPositiveNumber(form.offeringPrice)) {
    errors.offeringPrice = 'Укажите цену услуги (положительное число)';
  }
  if (!isPositiveNumber(form.offeringDuration)) {
    errors.offeringDuration = 'Укажите длительность (положительное число)';
  }

  // clubId — опциональный, не валидируем

  return errors;
}
