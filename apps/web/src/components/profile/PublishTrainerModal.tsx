// Модалка публикации тренера — единая форма create/edit с submit через API.
'use client';

import { useCallback, useEffect, useState } from 'react';

import { AdditionalOfferingsEditor } from '@/components/profile/AdditionalOfferingsEditor';
import { AddressGeocoder } from '@/components/profile/AddressGeocoder';
import { CitySuggestInput } from '@/components/profile/CitySuggestInput';
import { PublishModalShell } from '@/components/profile/PublishModalShell';
import { validateTrainerForm } from '@/components/profile/publish-validation';
import { ScheduleSlotsEditor } from '@/components/profile/ScheduleSlotsEditor';
import { TagSelector } from '@/components/profile/TagSelector';
import type { TagSelectorItem } from '@/components/profile/TagSelector';
import { Button, Input, Select } from '@/components/ui';
import type { TrainerFormState, TrainerOfferingFormItem } from '@sporthub/domain';
import type { TrainerClubLink } from '@sporthub/types';

/** Минимальная информация о клубе для select-привязки */
type ClubOption = {
  id: number;
  name: string;
};

/** Доступные форматы предоставляемой услуги (не TagSelector — 3 чипа, одиночный выбор) */
const AVAILABLE_OFFERING_FORMATS = ['Индивидуальная', 'Групповая', 'Мини-группа'];

/** Маска телефона: +7 (XXX) XXX-XX-XX */
function applyPhoneMask(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('8') || d.startsWith('7')) d = d.slice(1);
  d = d.slice(0, 10);

  let result = '+7';
  if (d.length > 0) result += ` (${d.slice(0, 3)}`;
  if (d.length >= 3) result += ')';
  if (d.length > 3) result += ` ${d.slice(3, 6)}`;
  if (d.length > 6) result += `-${d.slice(6, 8)}`;
  if (d.length > 8) result += `-${d.slice(8, 10)}`;

  return result;
}

// --- Начальное состояние формы ---

function createInitialState(): TrainerFormState {
  return {
    firstName: '',
    lastName: '',
    city: '',
    address: '',
    bio: '',
    experience: '',
    sportIds: [],
    specialtyIds: [],
    workFormatIds: [],
    phone: '',
    vk: '',
    telegram: '',
    facebook: '',
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
        sportId: 0,
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
  mode?: PublishModalMode;
  entityId?: number | null;
  initialData?: TrainerFormState | null;
  /** Справочник видов спорта (из SSR) */
  sports?: TagSelectorItem[];
  /** Справочник специализаций (из SSR) */
  specialties?: TagSelectorItem[];
  /** Справочник форматов работы (из SSR) */
  workFormats?: TagSelectorItem[];
};

type PublishTrainerApiErrorBody = {
  details?: Record<string, string[] | undefined>;
  error?: string;
  success?: boolean;
};

/** Глубоко клонирует form-state, чтобы edit/open не шарили ссылки между рендерами.
 * Phase 25 Step 25.1a: клонируем также additionalOfferings (включая каждый scheduleSlots). */
function cloneTrainerFormState(form: TrainerFormState): TrainerFormState {
  return {
    ...form,
    specialtyIds: [...form.specialtyIds],
    sportIds: [...form.sportIds],
    workFormatIds: [...form.workFormatIds],
    scheduleSlots: form.scheduleSlots.map((slot) => ({ ...slot })),
    ...(form.additionalOfferings !== undefined
      ? {
          additionalOfferings: form.additionalOfferings.map((item) => ({
            ...item,
            scheduleSlots: item.scheduleSlots.map((slot) => ({ ...slot })),
          })),
        }
      : {}),
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

// ⚠️ Поля `userId` в теле больше нет. Владельца публикации сервер берёт из сессии;
// до фазы 34 именно это число и решало, от чьего имени публикуется карточка.
function buildTrainerPayload(form: TrainerFormState, entityId?: number) {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    city: form.city,
    address: form.address,
    bio: form.bio,
    experience: form.experience,
    phone: form.phone,
    vk: form.vk,
    telegram: form.telegram,
    facebook: form.facebook,
    sportIds: form.sportIds,
    specialtyIds: form.specialtyIds,
    workFormatIds: form.workFormatIds,
    offeringName: form.offeringName,
    offeringDescription: form.offeringDescription,
    offeringFormat: form.offeringFormat,
    offeringPrice: form.offeringPrice,
    offeringDuration: form.offeringDuration,
    offeringLocation: form.offeringLocation,
    clubId: form.clubId,
    ...(form.coordinates ? { coordinates: form.coordinates } : {}),
    scheduleSlots: form.scheduleSlots.map((slot) => {
      if (entityId === undefined) {
        const nextSlot = { ...slot };
        delete nextSlot.id;
        return nextSlot;
      }

      return slot.id !== undefined ? { ...slot, id: slot.id } : { ...slot };
    }),
    // Phase 24 Step 24.10: дополнительные услуги передаём как есть — Zod валидирует форму,
    // а контракты раскроют каждую карточку в offering + schedule[] в db.ts.
    ...(form.additionalOfferings && form.additionalOfferings.length > 0
      ? { additionalOfferings: form.additionalOfferings }
      : {}),
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
  mode = 'create',
  entityId = null,
  initialData,
  sports = [],
  specialties = [],
  workFormats = [],
}: PublishTrainerModalProps) {
  const isEditMode = mode === 'edit';
  const [form, setForm] = useState<TrainerFormState>(() => resolveInitialState(mode, initialData));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoNotice, setPhotoNotice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [submitNoticeTone, setSubmitNoticeTone] = useState<'info' | 'danger'>('info');

  // Phase 24 Step 24.9a: state для управления привязкой тренера к клубу через links API.
  // currentLink — последний active link (pending|confirmed), либо null;
  // linkHistory — последний не-active (rejected|revoked) для плашки «новый запрос».
  const [currentLink, setCurrentLink] = useState<TrainerClubLink | null>(null);
  const [linkHistory, setLinkHistory] = useState<TrainerClubLink | null>(null);
  const [linkPendingAction, setLinkPendingAction] = useState(false);
  const [linkActionError, setLinkActionError] = useState<string | null>(null);
  const [linkRequestClubId, setLinkRequestClubId] = useState<number | null>(null);
  // Phase 24 Step 24.10c: все confirmed links тренера — для attachmentMode='club' select
  // в AdditionalOfferingsEditor (multi-offering).
  const [confirmedLinks, setConfirmedLinks] = useState<TrainerClubLink[]>([]);

  // Загружаем актуальные link'и тренера в edit-режиме при открытии.
  // trainerId = entityId; публичные статусы отображаются на основе response.
  const fetchLinks = useCallback(async () => {
    if (!isEditMode || entityId === null) return;
    try {
      const response = await fetch(`/api/trainer-club-links?trainerId=${entityId}`);
      if (!response.ok) return;
      const body = (await response.json()) as {
        success: boolean;
        data?: TrainerClubLink[];
      };
      if (!body.success || !body.data) return;
      const active =
        body.data.find((link) => link.status === 'pending' || link.status === 'confirmed') ?? null;
      setCurrentLink(active);
      setConfirmedLinks(body.data.filter((link) => link.status === 'confirmed'));
      // Последняя неактивная — для подсказки «Отправить новый запрос».
      const lastInactive =
        body.data.find((link) => link.status === 'rejected' || link.status === 'revoked') ?? null;
      setLinkHistory(active ? null : lastInactive);
    } catch {
      // silent — UI просто покажет форму выбора клуба
    }
  }, [entityId, isEditMode]);

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
    // Сбрасываем состояние привязки — дальше fetchLinks подтянет актуальное.
    setCurrentLink(null);
    setLinkHistory(null);
    setLinkActionError(null);
    setLinkRequestClubId(null);
    void fetchLinks();
  }, [entityId, initialData, mode, open, fetchLinks]);

  // Действия над link'ом в edit-режиме (trainerId = entityId).
  const submitLinkRequest = useCallback(
    async (clubId: number) => {
      if (!isEditMode || entityId === null) return;
      setLinkPendingAction(true);
      setLinkActionError(null);
      try {
        const response = await fetch('/api/trainer-club-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trainerId: entityId, clubId }),
        });
        const body = (await response.json()) as { success: boolean; error?: string };
        if (!response.ok || !body.success) {
          setLinkActionError(body.error ?? 'Не удалось отправить запрос');
          return;
        }
        await fetchLinks();
        setLinkRequestClubId(null);
      } finally {
        setLinkPendingAction(false);
      }
    },
    [isEditMode, entityId, fetchLinks],
  );

  const submitLinkRevoke = useCallback(async () => {
    if (!currentLink) return;
    setLinkPendingAction(true);
    setLinkActionError(null);
    try {
      // Для pending вызываем тот же revoke-эндпоинт — но backend требует confirmed.
      // На pending сторона тренера просто отзывает: backend в Step 24.9 расширим, сейчас
      // используем простой fallback — шлём revoke только для confirmed. Для pending
      // фактически используем тот же endpoint: backend 409 отдаст, если не confirmed.
      const endpoint =
        currentLink.status === 'pending'
          ? `/api/trainer-club-links/${currentLink.id}/revoke`
          : `/api/trainer-club-links/${currentLink.id}/revoke`;
      const response = await fetch(endpoint, { method: 'POST' });
      const body = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !body.success) {
        setLinkActionError(body.error ?? 'Не удалось отозвать запрос');
        return;
      }
      await fetchLinks();
    } finally {
      setLinkPendingAction(false);
    }
  }, [currentLink, fetchLinks]);

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
        body: JSON.stringify(buildTrainerPayload(form, entityId ?? undefined)),
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
              <CitySuggestInput
                value={form.city}
                cityCoordinates={form.cityCoordinates}
                onChange={(city, coords) => {
                  setForm((prev) => ({
                    ...prev,
                    city,
                    cityCoordinates: coords,
                    coordinates: undefined,
                  }));
                }}
                error={errors.city}
              />
              <AddressGeocoder
                city={form.city}
                cityCoordinates={form.cityCoordinates}
                address={form.address}
                onAddressChange={(address) => {
                  updateField('address', address);
                }}
                onCoordinatesChange={(coords) => {
                  setForm((prev) => ({ ...prev, coordinates: coords }));
                }}
                addressError={errors.address}
              />
            </div>

            {/* О себе — textarea */}
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

        {/* Секция 3: Специализация — TagSelector для sports, specialties, workFormats */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Специализация</h3>
          <div className="mt-4 flex flex-col gap-4">
            <TagSelector
              label="Виды спорта"
              items={sports}
              selectedIds={form.sportIds}
              onChange={(ids) => {
                setForm((prev) => ({ ...prev, sportIds: ids }));
              }}
              placeholder="Поиск вида спорта..."
            />
            {errors.sportIds ? <p className="text-xs text-red-500">{errors.sportIds}</p> : null}

            <TagSelector
              label="Специализации"
              items={specialties}
              selectedIds={form.specialtyIds}
              onChange={(ids) => {
                setForm((prev) => ({ ...prev, specialtyIds: ids }));
              }}
              placeholder="Поиск специализации..."
            />
            {errors.specialtyIds ? (
              <p className="text-xs text-red-500">{errors.specialtyIds}</p>
            ) : null}

            <TagSelector
              label="Формат работы"
              items={workFormats}
              selectedIds={form.workFormatIds}
              onChange={(ids) => {
                setForm((prev) => ({ ...prev, workFormatIds: ids }));
              }}
              placeholder="Поиск формата..."
            />
            {errors.workFormatIds ? (
              <p className="text-xs text-red-500">{errors.workFormatIds}</p>
            ) : null}
          </div>
        </section>

        <hr className="border-line" />

        {/* Секция 4: Связать себя с клубом.
            Phase 24 Step 24.9a: в edit-режиме работаем через API links (pending/confirmed/revoked),
            в create-режиме остаётся простой Select — после создания тренера связь отправляется
            отдельным запросом в Step 24.10 (multi-offering). */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Связать себя с клубом</h3>
          <p className="mt-1 text-sm text-muted">
            Вы можете указать спортивный клуб, в котором работаете, чтобы спортсмены узнали о вашей
            деятельности больше.
          </p>
          {isEditMode ? (
            <div className="mt-3 flex flex-col gap-3" data-testid="trainer-club-link-section">
              {/* Активная связь pending/confirmed — показываем статус и кнопку «Отозвать» */}
              {currentLink ? (
                <div className="rounded-card border border-line bg-canvas p-4">
                  <p className="text-sm font-semibold text-ink">
                    {currentLink.status === 'pending'
                      ? `Запрос отправлен в клуб «${clubs.find((c) => c.id === currentLink.clubId)?.name ?? 'Клуб'}»`
                      : `Работаете в клубе «${clubs.find((c) => c.id === currentLink.clubId)?.name ?? 'Клуб'}»`}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {currentLink.status === 'pending'
                      ? 'Ожидается подтверждение клубом. Вы можете отозвать запрос.'
                      : 'Связь подтверждена — клуб отображается на публичной странице.'}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    disabled={linkPendingAction}
                    onClick={() => {
                      void submitLinkRevoke();
                    }}
                  >
                    {currentLink.status === 'pending' ? 'Отозвать запрос' : 'Отвязать от клуба'}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {linkHistory ? (
                    <p className="text-xs text-muted">
                      {linkHistory.status === 'rejected'
                        ? 'Предыдущий запрос был отклонён клубом. Можно отправить новый запрос.'
                        : 'Предыдущая связь была разорвана. Можно отправить новый запрос.'}
                    </p>
                  ) : null}
                  <Select
                    value={linkRequestClubId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLinkRequestClubId(val ? Number(val) : null);
                    }}
                  >
                    <option value="">Выберите клуб для связи</option>
                    {clubs.map((club) => (
                      <option key={club.id} value={club.id}>
                        {club.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={linkRequestClubId === null || linkPendingAction}
                    onClick={() => {
                      if (linkRequestClubId !== null) void submitLinkRequest(linkRequestClubId);
                    }}
                  >
                    Отправить запрос клубу
                  </Button>
                </div>
              )}
              {linkActionError ? <p className="text-xs text-red-500">{linkActionError}</p> : null}
            </div>
          ) : (
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
          )}
        </section>

        <hr className="border-line" />

        {/* Секция 5: Контактная информация */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Контактная информация</h3>
          <div className="mt-4 flex flex-col gap-4">
            <Input
              label="Телефон"
              type="tel"
              placeholder="+7 (999) 123-45-67"
              value={form.phone}
              error={errors.phone}
              onChange={(e) => {
                updateField('phone', applyPhoneMask(e.target.value));
              }}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="ВКонтакте"
                placeholder="vk.com/your-profile или username"
                value={form.vk}
                onChange={(e) => {
                  updateField('vk', e.target.value);
                }}
              />
              <Input
                label="Telegram"
                placeholder="@username или ссылка"
                value={form.telegram}
                onChange={(e) => {
                  updateField('telegram', e.target.value);
                }}
              />
              <Input
                label="Facebook"
                placeholder="Ссылка на страницу"
                value={form.facebook}
                onChange={(e) => {
                  updateField('facebook', e.target.value);
                }}
              />
            </div>
          </div>
        </section>

        <hr className="border-line" />

        {/* Секция 6: Услуга тренера */}
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

            {/* Формат предоставляемой услуги — 3 чипа, одиночный выбор */}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink">Формат предоставляемой услуги</p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_OFFERING_FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={form.offeringFormat === f}
                    className={`rounded-pill border px-4 py-2 text-sm font-semibold transition-colors ${
                      form.offeringFormat === f
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-line bg-panel text-ink hover:border-accent hover:text-accent'
                    }`}
                    onClick={() => {
                      // Клик по выбранному — снимает выбор
                      updateField('offeringFormat', form.offeringFormat === f ? '' : f);
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {errors.offeringFormat ? (
                <p className="mt-1 text-xs text-red-500">{errors.offeringFormat}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Укажите цену данной услуги"
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
            <Input
              label="Укажите адрес проведения тренировки"
              placeholder="ул. Спортивная, 10, Зал №3"
              value={form.offeringLocation}
              error={errors.offeringLocation}
              onChange={(e) => {
                updateField('offeringLocation', e.target.value);
              }}
            />
          </div>
        </section>

        <hr className="border-line" />

        {/* Секция 7: Добавить тренировочный слот */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Добавить тренировочный слот
          </h3>
          <p className="mt-1 text-sm text-muted">Добавьте от 1 до 3 тренировочных слотов</p>
          <div className="mt-3">
            <ScheduleSlotsEditor
              slots={form.scheduleSlots}
              onChange={(slots) => {
                setForm((prev) => ({ ...prev, scheduleSlots: slots }));
              }}
              sportIds={form.sportIds}
              sports={sports}
            />
          </div>
          {errors.scheduleSlots ? (
            <p className="mt-2 text-xs text-red-500">{errors.scheduleSlots}</p>
          ) : null}
        </section>

        <hr className="border-line" />

        {/* Phase 24 Step 24.10c: Доп. услуги (multi-offering) */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">Дополнительные услуги</h3>
          <p className="mt-1 text-sm text-muted">
            Добавьте отдельные услуги: каждая может быть частной или «в клубе» при подтверждённой
            связи.
          </p>
          <div className="mt-3">
            <AdditionalOfferingsEditor
              items={form.additionalOfferings ?? []}
              onChange={(next) => {
                setForm((prev) => ({ ...prev, additionalOfferings: next }));
              }}
              confirmedLinks={confirmedLinks}
              clubsById={new Map(clubs.map((c) => [c.id, c.name]))}
              sportOptions={sports}
              trainerSportIds={form.sportIds}
            />
          </div>
        </section>

        <hr className="border-line" />

        {/* Секция 8: Дополнительные возможности */}
        <section>
          <h3 className="font-display text-lg font-semibold text-ink">
            Дополнительные возможности
          </h3>
          <div className="mt-3 flex flex-col gap-2">
            {[
              'Видео / галерея',
              'Образование / сертификаты',
              'Достижения',
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
