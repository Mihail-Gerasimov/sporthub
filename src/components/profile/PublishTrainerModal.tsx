// Модалка публикации тренера — полная форма с 7 секциями (Step 13.4).
// Form-state локальный, без записи в JSON и без API.
'use client';

import { useState } from 'react';

import { PublishModalShell } from '@/components/profile/PublishModalShell';
import type { ScheduleSlotForm } from '@/components/profile/PublishClubModal';
import { validateTrainerForm } from '@/components/profile/publish-validation';
import { Chip, Input } from '@/components/ui';

// --- Локальные типы (form-only, не в src/types/) ---

/** Состояние формы тренера */
type TrainerFormState = {
  firstName: string;
  lastName: string;
  city: string;
  address: string;
  bio: string;
  experience: string;
  priceFrom: string;
  coverPreset: string;
  sport: string;
  specializations: string[];
  workFormat: string;
  offeringName: string;
  offeringDescription: string;
  offeringFormat: string;
  offeringPrice: string;
  offeringDuration: string;
  offeringLocation: string;
  clubId: number | null;
  scheduleSlots: ScheduleSlotForm[];
};

/** Минимальная информация о клубе для select-привязки */
type ClubOption = {
  id: number;
  name: string;
};

// --- Справочники для выбора ---

const AVAILABLE_SPORTS = [
  'Йога',
  'Бокс',
  'Плавание',
  'Кроссфит',
  'Танцы',
  'Единоборства',
  'Пилатес',
  'Лёгкая атлетика',
];

const AVAILABLE_SPECIALIZATIONS = [
  'Персональные тренировки',
  'Групповые занятия',
  'Детские группы',
  'Реабилитация',
  'Подготовка к соревнованиям',
  'Снижение веса',
  'Набор массы',
  'Растяжка',
];

const AVAILABLE_WORK_FORMATS = ['В клубе', 'На выезде', 'Онлайн', 'Смешанный'];

const AVAILABLE_OFFERING_FORMATS = ['Индивидуальная', 'Групповая', 'Парная', 'Мини-группа'];

const COVER_PRESETS = [
  { id: 'teal', label: 'Бирюзовый' },
  { id: 'rust', label: 'Терракотовый' },
  { id: 'sage', label: 'Оливковый' },
  { id: 'coral', label: 'Коралловый' },
];

// --- Начальное состояние формы ---

function createInitialState(): TrainerFormState {
  return {
    firstName: '',
    lastName: '',
    city: '',
    address: '',
    bio: '',
    experience: '',
    priceFrom: '',
    coverPreset: 'teal',
    sport: '',
    specializations: [],
    workFormat: '',
    offeringName: '',
    offeringDescription: '',
    offeringFormat: '',
    offeringPrice: '',
    offeringDuration: '',
    offeringLocation: '',
    clubId: null,
    scheduleSlots: [
      {
        title: '',
        date: '',
        startTime: '',
        endTime: '',
        price: '',
        capacity: '',
        location: '',
        discipline: '',
      },
    ],
  };
}

// --- Компонент ---

type PublishTrainerModalProps = {
  open: boolean;
  onClose: () => void;
  /** Список клубов для опциональной привязки */
  clubs: ClubOption[];
};

export function PublishTrainerModal({ open, onClose, clubs }: PublishTrainerModalProps) {
  const [form, setForm] = useState<TrainerFormState>(createInitialState);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Сброс формы при закрытии
  function handleClose() {
    setForm(createInitialState());
    setErrors({});
    onClose();
  }

  // Валидация и submit
  function handleSubmit() {
    const validationErrors = validateTrainerForm(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    // STUB: submit-flow будет реализован в Step 13.8
  }

  // Обновление текстового поля
  function updateField(field: keyof TrainerFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Toggle элемента в массиве specializations
  function toggleSpecialization(item: string) {
    setForm((prev) => {
      const current = prev.specializations;
      const next = current.includes(item) ? current.filter((v) => v !== item) : [...current, item];
      return { ...prev, specializations: next };
    });
  }

  return (
    <PublishModalShell
      open={open}
      onClose={handleClose}
      title="Опубликовать тренера"
      description="Заполните информацию о тренере для публикации на платформе."
      primaryLabel="Создать публикацию"
      onPrimary={handleSubmit}
      secondaryLabel="Отмена"
      onSecondary={handleClose}
    >
      <div className="flex flex-col gap-8">
        {/* Секция 1: Основная информация */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Основная информация</h3>
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Имя"
                placeholder="Александр"
                value={form.firstName}
                error={errors.firstName}
                onChange={(e) => {
                  updateField('firstName', e.target.value);
                }}
              />
              <Input
                label="Фамилия"
                placeholder="Иванов"
                value={form.lastName}
                error={errors.lastName}
                onChange={(e) => {
                  updateField('lastName', e.target.value);
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Город"
                placeholder="Москва"
                value={form.city}
                error={errors.city}
                onChange={(e) => {
                  updateField('city', e.target.value);
                }}
              />
              <Input
                label="Адрес / локация"
                placeholder="ул. Спортивная, 10"
                value={form.address}
                onChange={(e) => {
                  updateField('address', e.target.value);
                }}
              />
            </div>

            {/* Краткое описание — textarea */}
            <div className="flex flex-col gap-2">
              <label htmlFor="trainer-bio" className="text-sm font-semibold text-ink">
                О себе
              </label>
              <textarea
                id="trainer-bio"
                placeholder="Расскажите о себе и своём подходе к тренировкам"
                rows={3}
                className={`w-full rounded-card border bg-panel px-4 py-3 text-sm text-ink outline-none transition-all placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15 ${errors.bio ? 'border-red-400' : 'border-line'}`}
                value={form.bio}
                onChange={(e) => {
                  updateField('bio', e.target.value);
                }}
              />
              {errors.bio ? <p className="text-xs text-red-500">{errors.bio}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Опыт (лет)"
                type="number"
                placeholder="5"
                value={form.experience}
                error={errors.experience}
                onChange={(e) => {
                  updateField('experience', e.target.value);
                }}
              />
              <Input
                label="Цена от (₽)"
                type="number"
                placeholder="1500"
                value={form.priceFrom}
                onChange={(e) => {
                  updateField('priceFrom', e.target.value);
                }}
              />
            </div>
          </div>
        </section>

        {/* Секция 2: Фото и визуал */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Фото и визуал</h3>
          <div className="mt-4 flex flex-col gap-4">
            {/* Стиль карточки (cover preset) */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Стиль карточки</p>
              <div className="flex flex-wrap gap-2">
                {COVER_PRESETS.map((preset) => (
                  <Chip
                    key={preset.id}
                    active={form.coverPreset === preset.id}
                    onClick={() => {
                      updateField('coverPreset', preset.id);
                    }}
                  >
                    {preset.label}
                  </Chip>
                ))}
              </div>
            </div>

            {/* STUB: загрузка фото */}
            <div className="rounded-card border border-dashed border-line bg-canvas p-4">
              <p className="text-sm text-muted">
                Загрузка фото будет доступна позже{' '}
                <span className="inline-flex rounded-pill bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Скоро
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* Секция 3: Специализация */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Специализация</h3>
          <div className="mt-4 flex flex-col gap-4">
            {/* Основной вид спорта — select */}
            <div className="flex flex-col gap-2">
              <label htmlFor="trainer-sport" className="text-sm font-semibold text-ink">
                Основной вид спорта
              </label>
              <select
                id="trainer-sport"
                className={`w-full rounded-card border bg-panel px-4 py-3 text-sm text-ink outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/15 ${errors.sport ? 'border-red-400' : 'border-line'}`}
                value={form.sport}
                onChange={(e) => {
                  updateField('sport', e.target.value);
                }}
              >
                <option value="">Выберите вид спорта</option>
                {AVAILABLE_SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {errors.sport ? <p className="text-xs text-red-500">{errors.sport}</p> : null}
            </div>

            {/* Специализации — chips */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Специализации (1–4)</p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_SPECIALIZATIONS.map((spec) => (
                  <Chip
                    key={spec}
                    active={form.specializations.includes(spec)}
                    onClick={() => {
                      toggleSpecialization(spec);
                    }}
                  >
                    {spec}
                  </Chip>
                ))}
              </div>
              {errors.specializations ? (
                <p className="mt-1 text-xs text-red-500">{errors.specializations}</p>
              ) : null}
            </div>

            {/* Формат работы — chips */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Формат работы</p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_WORK_FORMATS.map((wf) => (
                  <Chip
                    key={wf}
                    active={form.workFormat === wf}
                    onClick={() => {
                      updateField('workFormat', wf);
                    }}
                  >
                    {wf}
                  </Chip>
                ))}
              </div>
              {errors.workFormat ? (
                <p className="mt-1 text-xs text-red-500">{errors.workFormat}</p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Секция 4: Привязка к клубу */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Привязка к клубу</h3>
          <p className="mt-1 text-sm text-muted">
            Выберите клуб, если тренер работает в клубе (необязательно)
          </p>
          <div className="mt-3">
            <select
              className="w-full rounded-card border border-line bg-panel px-4 py-3 text-sm text-ink outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/15"
              value={form.clubId ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  clubId: val ? Number(val) : null,
                }));
              }}
            >
              <option value="">Без привязки к клубу</option>
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Секция 5: Услуга тренера */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Услуга тренера</h3>
          <p className="mt-1 text-sm text-muted">Опишите первую услугу, которую предлагаете</p>
          <div className="mt-4 flex flex-col gap-4">
            <Input
              label="Название услуги"
              placeholder="Персональная тренировка"
              value={form.offeringName}
              error={errors.offeringName}
              onChange={(e) => {
                updateField('offeringName', e.target.value);
              }}
            />

            {/* Описание услуги — textarea */}
            <div className="flex flex-col gap-2">
              <label htmlFor="offering-description" className="text-sm font-semibold text-ink">
                Описание услуги
              </label>
              <textarea
                id="offering-description"
                placeholder="Что входит в услугу, для кого подходит"
                rows={3}
                className="w-full rounded-card border border-line bg-panel px-4 py-3 text-sm text-ink outline-none transition-all placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15"
                value={form.offeringDescription}
                onChange={(e) => {
                  updateField('offeringDescription', e.target.value);
                }}
              />
            </div>

            {/* Формат услуги — chips */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Формат услуги</p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_OFFERING_FORMATS.map((f) => (
                  <Chip
                    key={f}
                    active={form.offeringFormat === f}
                    onClick={() => {
                      updateField('offeringFormat', f);
                    }}
                  >
                    {f}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Цена (₽)"
                type="number"
                placeholder="2000"
                value={form.offeringPrice}
                error={errors.offeringPrice}
                onChange={(e) => {
                  updateField('offeringPrice', e.target.value);
                }}
              />
              <Input
                label="Длительность (мин)"
                type="number"
                placeholder="60"
                value={form.offeringDuration}
                error={errors.offeringDuration}
                onChange={(e) => {
                  updateField('offeringDuration', e.target.value);
                }}
              />
            </div>

            <Input
              label="Место проведения"
              placeholder="Зал №3, FitZone Studio"
              value={form.offeringLocation}
              onChange={(e) => {
                updateField('offeringLocation', e.target.value);
              }}
            />
          </div>
        </section>

        {/* Секция 6: Стартовое расписание */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Стартовое расписание</h3>
          <p className="mt-1 text-sm text-muted">
            Редактор расписания будет подключён на следующем шаге.
          </p>
          {/* STUB: placeholder для ScheduleSlotsEditor (Step 13.7) */}
          <div className="mt-3 rounded-card border border-dashed border-line bg-canvas p-4">
            <p className="text-sm text-muted">
              {form.scheduleSlots.length} слот(ов) — редактор появится позже
            </p>
          </div>
        </section>

        {/* Секция 7: Дополнительные возможности */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Дополнительные возможности
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            {[
              'Видео / галерея',
              'Образование / сертификаты',
              'Достижения',
              'Соцсети / сайт',
              'Работа в нескольких клубах',
              'Пакеты / абонементы',
              'Онлайн-формат',
              'Расширенный конструктор расписания',
            ].map((label) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-card border border-dashed border-line bg-canvas px-4 py-3"
              >
                <span className="text-sm text-muted">{label}</span>
                <span className="inline-flex rounded-pill bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Скоро
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PublishModalShell>
  );
}
