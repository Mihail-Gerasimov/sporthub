// Модалка публикации клуба — единая форма create/edit с submit через API.
'use client';

import { useEffect, useState } from 'react';

import { PublishModalShell } from '@/components/profile/PublishModalShell';
import { validateClubForm } from '@/components/profile/publish-validation';
import { ScheduleSlotsEditor } from '@/components/profile/ScheduleSlotsEditor';
import { Chip, Input } from '@/components/ui';
import type { ClubFormState } from '@/lib/schemas/publish';

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

type PublishModalMode = 'create' | 'edit';

type PublishClubModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  userId: number | null;
  mode?: PublishModalMode;
  entityId?: number | null;
  initialData?: ClubFormState | null;
};

type PublishClubApiErrorBody = {
  details?: Record<string, string[] | undefined>;
  error?: string;
  success?: boolean;
};

/** Глубоко клонирует form-state, чтобы edit/open не шарили ссылки между рендерами. */
function cloneClubFormState(form: ClubFormState): ClubFormState {
  return {
    ...form,
    disciplines: [...form.disciplines],
    tags: [...form.tags],
    amenities: [...form.amenities],
    scheduleSlots: form.scheduleSlots.map((slot) => ({ ...slot })),
  };
}

/** Возвращает стартовое состояние для create/edit режима. */
function resolveInitialState(
  mode: PublishModalMode,
  initialData?: ClubFormState | null,
): ClubFormState {
  if (mode === 'edit' && initialData) {
    return cloneClubFormState(initialData);
  }

  return createInitialState();
}

function buildClubPayload(form: ClubFormState, userId: number, entityId?: number) {
  return {
    name: form.name,
    city: form.city,
    address: form.address,
    description: form.description,
    phone: form.phone,
    email: form.email,
    priceFrom: form.priceFrom,
    disciplines: form.disciplines,
    tags: form.tags,
    amenities: form.amenities,
    scheduleSlots: form.scheduleSlots.map((slot) => {
      if (entityId === undefined) {
        const nextSlot = { ...slot };
        delete nextSlot.id;
        return nextSlot;
      }

      return slot.id !== undefined ? { ...slot, id: slot.id } : { ...slot };
    }),
    userId,
  };
}

function getApiFieldErrors(details?: Record<string, string[] | undefined>): Record<string, string> {
  if (!details) {
    return {};
  }

  return Object.entries(details).reduce<Record<string, string>>((acc, [field, messages]) => {
    const message = messages?.[0];

    if (message) {
      acc[field] = message;
    }

    return acc;
  }, {});
}

export function PublishClubModal({
  open,
  onClose,
  onSuccess,
  userId,
  mode = 'create',
  entityId = null,
  initialData,
}: PublishClubModalProps) {
  const isEditMode = mode === 'edit';
  const [form, setForm] = useState<ClubFormState>(() => resolveInitialState(mode, initialData));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoNotice, setPhotoNotice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [submitNoticeTone, setSubmitNoticeTone] = useState<'info' | 'danger'>('info');

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(resolveInitialState(mode, initialData));
    setErrors({});
    setPhotoNotice(false);
    setIsSubmitting(false);
    setSubmitNotice(null);
    setSubmitNoticeTone('info');
  }, [entityId, initialData, mode, open]);

  // Сброс формы при закрытии
  function handleClose() {
    setForm(createInitialState());
    setErrors({});
    setPhotoNotice(false);
    setIsSubmitting(false);
    setSubmitNotice(null);
    setSubmitNoticeTone('info');
    onClose();
  }

  // Отправка payload в API и синхронизация кабинета после успеха
  async function handleSubmit() {
    setSubmitNotice(null);
    setSubmitNoticeTone('info');

    const validationErrors = validateClubForm(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setSubmitNotice('Проверьте обязательные поля формы');
      setSubmitNoticeTone('danger');
      return;
    }

    if (userId === null) {
      setSubmitNotice('Не удалось определить пользователя провайдера');
      setSubmitNoticeTone('danger');
      return;
    }

    if (isEditMode && entityId === null) {
      setSubmitNotice('Не удалось определить публикацию для редактирования');
      setSubmitNoticeTone('danger');
      return;
    }

    setIsSubmitting(true);

    try {
      const endpoint = isEditMode ? `/api/clubs/${entityId}` : '/api/clubs';
      const response = await fetch(endpoint, {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildClubPayload(form, userId, entityId ?? undefined)),
      });
      const body = (await response.json()) as PublishClubApiErrorBody;

      if (!response.ok || body.success !== true) {
        const serverErrors = getApiFieldErrors(body.details);

        if (Object.keys(serverErrors).length > 0) {
          setErrors(serverErrors);
        }

        setSubmitNotice(
          body.error ?? (isEditMode ? 'Не удалось обновить клуб' : 'Не удалось создать клуб'),
        );
        setSubmitNoticeTone('danger');
        return;
      }

      handleClose();
      onSuccess(
        isEditMode
          ? 'Изменения клуба сохранены. Кабинет обновлён.'
          : 'Клуб опубликован. Кабинет обновлён.',
      );
    } catch {
      setSubmitNotice(
        isEditMode
          ? 'Не удалось обновить клуб. Проверьте соединение и попробуйте снова.'
          : 'Не удалось создать клуб. Проверьте соединение и попробуйте снова.',
      );
      setSubmitNoticeTone('danger');
    } finally {
      setIsSubmitting(false);
    }
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
      title={isEditMode ? 'Редактировать клуб' : 'Опубликовать клуб'}
      description={
        isEditMode
          ? 'Измените активные поля публикации клуба и сохраните обновления.'
          : 'Заполните информацию о клубе для публикации на платформе.'
      }
      primaryLabel={isEditMode ? 'Сохранить изменения' : 'Создать публикацию'}
      onPrimary={handleSubmit}
      primaryLoading={isSubmitting}
      secondaryLabel="Отмена"
      notice={submitNotice ?? undefined}
      noticeTone={submitNoticeTone}
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

            {/* Цена от — перенесена из «Теги и удобства» */}
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
          </div>
        </section>

        <hr className="border-line" />

        {/* Секция 2: Фото — квадрат с иконкой + */}
        <section>
          <button
            type="button"
            className="flex size-32 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-canvas transition-colors hover:border-accent hover:text-accent"
            onClick={() => {
              setPhotoNotice(true);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
              className="size-8 text-muted"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="text-xs font-semibold text-muted">Добавить фото</span>
          </button>
          {photoNotice ? (
            <div className="mt-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Функционал загрузки фото находится в разработке
            </div>
          ) : null}
        </section>

        <hr className="border-line" />

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

        <hr className="border-line" />

        {/* Секция 4: Добавить теги */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Добавить теги</h3>
          <div className="mt-3 flex flex-wrap gap-2">
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
        </section>

        <hr className="border-line" />

        {/* Секция 5: Удобства клуба */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Удобства клуба</h3>
          <div className="mt-3 flex flex-wrap gap-2">
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
        </section>

        <hr className="border-line" />

        {/* Секция 6: Стартовое расписание */}
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
          {errors.scheduleSlots ? (
            <p className="mt-2 text-xs text-red-500">{errors.scheduleSlots}</p>
          ) : null}
        </section>

        <hr className="border-line" />

        {/* Секция 7: Дополнительные возможности */}
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
