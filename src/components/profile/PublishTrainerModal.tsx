// Модалка публикации тренера — единая форма create/edit с submit через API.
'use client';

import { useEffect, useState } from 'react';

import { PublishModalShell } from '@/components/profile/PublishModalShell';
import { validateTrainerForm } from '@/components/profile/publish-validation';
import { ScheduleSlotsEditor } from '@/components/profile/ScheduleSlotsEditor';
import { Chip, Input, Select } from '@/components/ui';
import type { TrainerFormState } from '@/lib/schemas/publish';

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

const AVAILABLE_OFFERING_FORMATS = ['Индивидуальная', 'Групповая', 'Мини-группа'];

// --- Начальное состояние формы ---

function createInitialState(): TrainerFormState {
  return {
    firstName: '',
    lastName: '',
    city: '',
    address: '',
    bio: '',
    experience: '',
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

type PublishModalMode = 'create' | 'edit';

type PublishTrainerModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  /** Список клубов для опциональной привязки */
  clubs: ClubOption[];
  userId: number | null;
  mode?: PublishModalMode;
  entityId?: number | null;
  initialData?: TrainerFormState | null;
};

type PublishTrainerApiErrorBody = {
  details?: Record<string, string[] | undefined>;
  error?: string;
  success?: boolean;
};

/** Глубоко клонирует form-state, чтобы edit/open не шарили ссылки между рендерами. */
function cloneTrainerFormState(form: TrainerFormState): TrainerFormState {
  return {
    ...form,
    specializations: [...form.specializations],
    scheduleSlots: form.scheduleSlots.map((slot) => ({ ...slot })),
  };
}

/** Возвращает стартовое состояние для create/edit режима. */
function resolveInitialState(
  mode: PublishModalMode,
  initialData?: TrainerFormState | null,
): TrainerFormState {
  if (mode === 'edit' && initialData) {
    return cloneTrainerFormState(initialData);
  }

  return createInitialState();
}

function buildTrainerPayload(form: TrainerFormState, userId: number, entityId?: number) {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    city: form.city,
    address: form.address,
    bio: form.bio,
    experience: form.experience,
    sport: form.sport,
    specializations: form.specializations,
    workFormat: form.workFormat,
    offeringName: form.offeringName,
    offeringDescription: form.offeringDescription,
    offeringFormat: form.offeringFormat,
    offeringPrice: form.offeringPrice,
    offeringDuration: form.offeringDuration,
    offeringLocation: form.offeringLocation,
    clubId: form.clubId,
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

export function PublishTrainerModal({
  open,
  onClose,
  onSuccess,
  clubs,
  userId,
  mode = 'create',
  entityId = null,
  initialData,
}: PublishTrainerModalProps) {
  const isEditMode = mode === 'edit';
  const [form, setForm] = useState<TrainerFormState>(() => resolveInitialState(mode, initialData));
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

    const validationErrors = validateTrainerForm(form);
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
      const endpoint = isEditMode ? `/api/trainers/${entityId}` : '/api/trainers';
      const response = await fetch(endpoint, {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildTrainerPayload(form, userId, entityId ?? undefined)),
      });
      const body = (await response.json()) as PublishTrainerApiErrorBody;

      if (!response.ok || body.success !== true) {
        const serverErrors = getApiFieldErrors(body.details);

        if (Object.keys(serverErrors).length > 0) {
          setErrors(serverErrors);
        }

        setSubmitNotice(
          body.error ?? (isEditMode ? 'Не удалось обновить тренера' : 'Не удалось создать тренера'),
        );
        setSubmitNoticeTone('danger');
        return;
      }

      handleClose();
      onSuccess(
        isEditMode
          ? 'Изменения тренера сохранены. Кабинет обновлён.'
          : 'Тренер опубликован. Кабинет обновлён.',
      );
    } catch {
      setSubmitNotice(
        isEditMode
          ? 'Не удалось обновить тренера. Проверьте соединение и попробуйте снова.'
          : 'Не удалось создать тренера. Проверьте соединение и попробуйте снова.',
      );
      setSubmitNoticeTone('danger');
    } finally {
      setIsSubmitting(false);
    }
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
      title={isEditMode ? 'Редактировать тренера' : 'Опубликовать тренера'}
      description={
        isEditMode
          ? 'Измените активные поля публикации тренера и сохраните обновления.'
          : 'Заполните информацию о тренере для публикации на платформе.'
      }
      primaryLabel={isEditMode ? 'Сохранить изменения' : 'Создать публикацию'}
      onPrimary={handleSubmit}
      primaryLoading={isSubmitting}
      notice={submitNotice ?? undefined}
      noticeTone={submitNoticeTone}
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
                error={errors.address}
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

        {/* Секция 3: Специализация */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Специализация</h3>
          <div className="mt-4 flex flex-col gap-4">
            {/* Основной вид спорта — select */}
            <Select
              label="Основной вид спорта"
              value={form.sport}
              error={errors.sport}
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
            </Select>

            {/* Тип — chips (переименовано из «Специализации») */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Тип</p>
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

        <hr className="border-line" />

        {/* Секция 4: Связать себя с клубом */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Связать себя с клубом</h3>
          <p className="mt-1 text-sm text-muted">
            Вы можете указать спортивный клуб, в котором работаете, чтобы спортсмены узнали о вашей
            деятельности больше.
          </p>
          <div className="mt-3">
            <Select
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
            </Select>
          </div>
        </section>

        <hr className="border-line" />

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
                className={`w-full rounded-card border bg-panel px-4 py-3 text-sm text-ink outline-none transition-all placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15 ${errors.offeringDescription ? 'border-red-400' : 'border-line'}`}
                value={form.offeringDescription}
                onChange={(e) => {
                  updateField('offeringDescription', e.target.value);
                }}
              />
              {errors.offeringDescription ? (
                <p className="text-xs text-red-500">{errors.offeringDescription}</p>
              ) : null}
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
              {errors.offeringFormat ? (
                <p className="mt-1 text-xs text-red-500">{errors.offeringFormat}</p>
              ) : null}
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

            {/* Адрес проведения тренировки */}
            <div className="flex flex-col gap-1">
              <Input
                label="Укажите адрес проведения тренировки"
                placeholder="ул. Спортивная, 10, Зал №3"
                value={form.offeringLocation}
                error={errors.offeringLocation}
                onChange={(e) => {
                  updateField('offeringLocation', e.target.value);
                }}
              />
              <p className="text-xs text-muted">
                Автоопределение адреса и работа с картой будут доступны в следующих обновлениях
              </p>
            </div>
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
