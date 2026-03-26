// Модалка публикации клуба — полная форма с 6 секциями (Step 13.3).
// Form-state локальный, без записи в JSON и без API.
'use client';

import { useState } from 'react';

import { PublishModalShell } from '@/components/profile/PublishModalShell';
import { validateClubForm } from '@/components/profile/publish-validation';
import { ScheduleSlotsEditor } from '@/components/profile/ScheduleSlotsEditor';
import { Chip, Input } from '@/components/ui';

// --- Локальные типы (form-only, не в src/types/) ---

/** Слот расписания — переиспользуется в PublishTrainerModal */
export type ScheduleSlotForm = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  price: string;
  capacity: string;
  location: string;
  discipline: string;
};

/** Состояние формы клуба */
type ClubFormState = {
  name: string;
  city: string;
  address: string;
  description: string;
  phone: string;
  email: string;
  priceFrom: string;
  coverPreset: string;
  disciplines: string[];
  tags: string[];
  amenities: string[];
  scheduleSlots: ScheduleSlotForm[];
};

// --- Справочники для выбора ---

const AVAILABLE_DISCIPLINES = [
  'Йога',
  'Бокс',
  'Плавание',
  'Кроссфит',
  'Танцы',
  'Тренажёрный зал',
  'Единоборства',
  'Пилатес',
];

const AVAILABLE_TAGS = [
  'Утренние группы',
  'Вечерние группы',
  'Интенсив',
  'Спокойный формат',
  'Восстановление',
  'Экспресс-сессии',
  'После работы',
  'Фитнес',
];

const AVAILABLE_AMENITIES = [
  'Парковка',
  'Душевые',
  'Раздевалки',
  'Шкафчики',
  'Сауна',
  'Кардио-зона',
  'Свободные веса',
  'Пробная тренировка',
];

const COVER_PRESETS = [
  { id: 'teal', label: 'Бирюзовый' },
  { id: 'rust', label: 'Терракотовый' },
  { id: 'sage', label: 'Оливковый' },
  { id: 'coral', label: 'Коралловый' },
];

// --- Начальное состояние формы ---

function createInitialState(): ClubFormState {
  return {
    name: '',
    city: '',
    address: '',
    description: '',
    phone: '',
    email: '',
    priceFrom: '',
    coverPreset: 'teal',
    disciplines: [],
    tags: [],
    amenities: [],
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

type PublishClubModalProps = {
  open: boolean;
  onClose: () => void;
};

export function PublishClubModal({ open, onClose }: PublishClubModalProps) {
  const [form, setForm] = useState<ClubFormState>(createInitialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoNotice, setPhotoNotice] = useState(false);
  const [submitNotice, setSubmitNotice] = useState(false);

  // Сброс формы при закрытии
  function handleClose() {
    setForm(createInitialState());
    setErrors({});
    setPhotoNotice(false);
    setSubmitNotice(false);
    onClose();
  }

  // Валидация и submit — stub: показываем notice вместо сохранения
  function handleSubmit() {
    const validationErrors = validateClubForm(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    setSubmitNotice(true);
  }

  // Обновление текстового поля
  function updateField(field: keyof ClubFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Toggle элемента в массиве (disciplines, tags, amenities)
  function toggleArrayItem(field: 'disciplines' | 'tags' | 'amenities', item: string) {
    setForm((prev) => {
      const current = prev[field];
      const next = current.includes(item) ? current.filter((v) => v !== item) : [...current, item];
      return { ...prev, [field]: next };
    });
  }

  return (
    <PublishModalShell
      open={open}
      onClose={handleClose}
      title="Опубликовать клуб"
      description="Заполните информацию о клубе для публикации на платформе."
      primaryLabel="Создать публикацию"
      onPrimary={handleSubmit}
      secondaryLabel="Отмена"
      notice={submitNotice ? 'Сохранение публикации будет доступно в следующей фазе' : undefined}
      onSecondary={handleClose}
    >
      <div className="flex flex-col gap-8">
        {/* Секция 1: Основная информация */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Основная информация</h3>
          <div className="mt-4 flex flex-col gap-4">
            <Input
              label="Название клуба"
              placeholder="Например: FitZone Studio"
              value={form.name}
              error={errors.name}
              onChange={(e) => {
                updateField('name', e.target.value);
              }}
            />
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
                label="Адрес"
                placeholder="ул. Спортивная, 10"
                value={form.address}
                error={errors.address}
                onChange={(e) => {
                  updateField('address', e.target.value);
                }}
              />
            </div>

            {/* Краткое описание — textarea */}
            <div className="flex flex-col gap-2">
              <label htmlFor="club-description" className="text-sm font-semibold text-ink">
                Краткое описание
              </label>
              <textarea
                id="club-description"
                placeholder="Расскажите о клубе в 2-3 предложениях"
                rows={3}
                className={`w-full rounded-card border bg-panel px-4 py-3 text-sm text-ink outline-none transition-all placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15 ${errors.description ? 'border-red-400' : 'border-line'}`}
                value={form.description}
                onChange={(e) => {
                  updateField('description', e.target.value);
                }}
              />
              {errors.description ? (
                <p className="text-xs text-red-500">{errors.description}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Телефон"
                type="tel"
                placeholder="+7 (999) 123-45-67"
                value={form.phone}
                error={errors.phone}
                onChange={(e) => {
                  updateField('phone', e.target.value);
                }}
              />
              <Input
                label="Email"
                type="email"
                placeholder="info@club.ru"
                value={form.email}
                error={errors.email}
                onChange={(e) => {
                  updateField('email', e.target.value);
                }}
              />
            </div>
          </div>
        </section>

        {/* Секция 2: Фото и визуал */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Фото и визуал</h3>
          <div className="mt-4 flex flex-col gap-4">
            {/* Стиль карточки (cover preset) — активное поле */}
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
            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="inline-flex w-fit items-center gap-2 rounded-pill border border-dashed border-line bg-canvas px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
                onClick={() => {
                  setPhotoNotice(true);
                }}
              >
                Добавить фото
              </button>
              {photoNotice ? (
                <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Функционал загрузки фото находится в разработке
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* Секция 3: Направления клуба */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Направления клуба</h3>
          <p className="mt-1 text-sm text-muted">Выберите минимум 1 направление</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {AVAILABLE_DISCIPLINES.map((d) => (
              <Chip
                key={d}
                active={form.disciplines.includes(d)}
                onClick={() => {
                  toggleArrayItem('disciplines', d);
                }}
              >
                {d}
              </Chip>
            ))}
          </div>
          {errors.disciplines ? (
            <p className="mt-2 text-xs text-red-500">{errors.disciplines}</p>
          ) : null}
        </section>

        {/* Секция 4: Теги и удобства */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Теги и удобства</h3>

          <div className="mt-4 flex flex-col gap-4">
            <Input
              label="Цена от (₽)"
              type="number"
              placeholder="500"
              value={form.priceFrom}
              error={errors.priceFrom}
              onChange={(e) => {
                updateField('priceFrom', e.target.value);
              }}
            />

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Теги (2–4)</p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_TAGS.map((tag) => (
                  <Chip
                    key={tag}
                    active={form.tags.includes(tag)}
                    onClick={() => {
                      toggleArrayItem('tags', tag);
                    }}
                  >
                    {tag}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Удобства (2–4)</p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_AMENITIES.map((a) => (
                  <Chip
                    key={a}
                    active={form.amenities.includes(a)}
                    onClick={() => {
                      toggleArrayItem('amenities', a);
                    }}
                  >
                    {a}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Секция 5: Стартовое расписание */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Стартовое расписание</h3>
          <p className="mt-1 text-sm text-muted">Добавьте от 1 до 3 слотов расписания.</p>
          <div className="mt-3">
            <ScheduleSlotsEditor
              slots={form.scheduleSlots}
              onChange={(slots) => {
                setForm((prev) => ({ ...prev, scheduleSlots: slots }));
              }}
            />
          </div>
        </section>

        {/* Секция 6: Дополнительные возможности */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Дополнительные возможности
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            {[
              'Сайт / соцсети',
              'Полное описание',
              'Featured / промо',
              'Расширенный блок тренеров',
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
