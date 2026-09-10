// Phase 25 Step 25.14 → Phase 26 Step 26.4: client-обёртка над
// ProviderPublicationsSection для /profile/provider/publications. Теперь содержит
// полный CRUD: edit-bootstrap через /api/clubs/[id] и /api/trainers/[id] + открытие
// PublishClubModal / PublishTrainerModal; delete через window.confirm + DELETE.
// Переезд state/handlers сделан без сквозных изменений — логика зеркально
// повторяет ProviderProfilePage (финальная дедупликация корневого — в Step 26.5).
'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useMemo, useRef, useState } from 'react';

import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { ProviderPublicationsSection } from '@/components/profile/ProviderPublicationsSection';
import { PublishClubModal } from '@/components/profile/PublishClubModal';
import { PublishTrainerModal } from '@/components/profile/PublishTrainerModal';
import { Button, Card } from '@/components/ui';
import { mapClubToFormState, mapTrainerToFormState } from '@/lib/contracts/reverse-mapping';
import type { ClubFormState, TrainerFormState } from '@sporthub/domain';
import { useAuthFaces, useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type {
  Amenity,
  Club,
  EntityId,
  Offering,
  Schedule,
  Specialty,
  Sport,
  Tag,
  Trainer,
  TrainerClubLink,
  WorkFormat,
} from '@sporthub/types';

type ProviderPublicationsProps = {
  clubs?: Club[];
  trainers?: Trainer[];
  sports?: Sport[];
  tags?: Tag[];
  amenities?: Amenity[];
  specialties?: Specialty[];
  workFormats?: WorkFormat[];
};

type PublishModalMode = 'create' | 'edit';

type TrainerClubOption = {
  id: EntityId;
  name: string;
};

type ClubEditBootstrapResponse = {
  error?: string;
  success?: boolean;
  data?: {
    club?: Club;
    primaryOffering?: Offering | null;
    schedule?: Schedule[];
  };
};

type TrainerEditBootstrapResponse = {
  error?: string;
  success?: boolean;
  data?: {
    trainer?: Trainer;
    affiliatedClub?: Pick<Club, 'id' | 'name'> | null;
    primaryOffering?: Offering | null;
    schedule?: Schedule[];
    additionalOfferings?: Array<{ offering: Offering; schedules: Schedule[] }>;
  };
};

type TrainerClubLinksResponse = {
  success?: boolean;
  data?: TrainerClubLink[];
};

export function ProviderPublications({
  clubs = [],
  trainers = [],
  sports = [],
  tags = [],
  amenities = [],
  specialties = [],
  workFormats = [],
}: ProviderPublicationsProps) {
  const user = useAuthStore((s) => s.user);
  const { faces } = useAuthFaces();
  const addToast = useToastStore((state) => state.addToast);
  const router = useRouter();

  // --- State модалок и edit-режима ---
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isTrainerModalOpen, setIsTrainerModalOpen] = useState(false);
  const [clubModalMode, setClubModalMode] = useState<PublishModalMode>('create');
  const [trainerModalMode, setTrainerModalMode] = useState<PublishModalMode>('create');
  const [clubEditEntityId, setClubEditEntityId] = useState<EntityId | null>(null);
  const [trainerEditEntityId, setTrainerEditEntityId] = useState<EntityId | null>(null);
  const [clubInitialData, setClubInitialData] = useState<ClubFormState | null>(null);
  const [trainerInitialData, setTrainerInitialData] = useState<TrainerFormState | null>(null);
  const [trainerEditClubOption, setTrainerEditClubOption] = useState<TrainerClubOption | null>(
    null,
  );

  /** Счётчик запросов, чтобы поздний ответ не открыл устаревшую модалку. */
  const editBootstrapRequestIdRef = useRef(0);

  // --- Свои публикации. useMemo до early-return, иначе react-hooks ломаются. ---
  //
  // ⚠️ Шаг 35.33. Раньше здесь стояла ещё одна проверка — «положено ли этой роли
  // вести такой вид публикаций», — и владелец клуба, у которого была карточка
  // тренера, своей карточки не видел: право на неё было только у роли `trainer`.
  // Это и был дефект 4.6 № 1 в интерфейсном виде. Теперь показывается то, чем
  // человек владеет, и ничего сверх.
  // ⚠️ Шаг 35.20a. Свои публикации отбираются по ЛИЦАМ услуг из ответа
  // «кто я», а не по номеру владельца в карточке каталога: это поле из
  // публичной выдачи ушло — по нему кто угодно строил карту владельцев,
  // скачав каталог одним запросом.
  const providerClubs = useMemo(() => getProviderClubs(clubs, faces), [clubs, faces]);
  const providerTrainers = useMemo(() => getProviderTrainers(trainers, faces), [trainers, faces]);

  // Для trainer-модалки показываем все клубы провайдера + (в edit-режиме) текущий affiliated клуб,
  // даже если он чужой — иначе селект не сможет показать текущее значение.
  const providerClubOptions = useMemo<TrainerClubOption[]>(
    () => providerClubs.map((club) => ({ id: club.id, name: club.name })),
    [providerClubs],
  );
  const trainerModalClubOptions = useMemo<TrainerClubOption[]>(() => {
    if (!trainerEditClubOption) return providerClubOptions;
    const exists = providerClubOptions.some((c) => c.id === trainerEditClubOption.id);
    return exists ? providerClubOptions : [...providerClubOptions, trainerEditClubOption];
  }, [providerClubOptions, trainerEditClubOption]);

  // --- Handlers ---

  function handlePublishSuccess(message: string) {
    addToast({ message, tone: 'success' });
    startTransition(() => {
      router.refresh();
    });
  }

  function invalidatePendingEditBootstrap() {
    editBootstrapRequestIdRef.current += 1;
  }

  function resetClubModalState() {
    setIsClubModalOpen(false);
    setClubModalMode('create');
    setClubEditEntityId(null);
    setClubInitialData(null);
  }

  function resetTrainerModalState() {
    setIsTrainerModalOpen(false);
    setTrainerModalMode('create');
    setTrainerEditEntityId(null);
    setTrainerInitialData(null);
    setTrainerEditClubOption(null);
  }

  function handleOpenCreateClubModal() {
    invalidatePendingEditBootstrap();
    setClubModalMode('create');
    setClubEditEntityId(null);
    setClubInitialData(null);
    setIsClubModalOpen(true);
  }

  function handleOpenCreateTrainerModal() {
    invalidatePendingEditBootstrap();
    setTrainerModalMode('create');
    setTrainerEditEntityId(null);
    setTrainerInitialData(null);
    setTrainerEditClubOption(null);
    setIsTrainerModalOpen(true);
  }

  async function handleDeletePublication(entityType: 'club' | 'trainer', entityId: EntityId) {
    const endpoint = entityType === 'club' ? `/api/clubs/${entityId}` : `/api/trainers/${entityId}`;
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        // ⚠️ Шаг 35.24a: «удаление» владельцем ПРЯЧЕТ лицо, а не стирает его.
        // Отзывы, прошедшие записи и связи с тренерами остаются на месте —
        // это чужая история, и текст обязан говорить правду о том, что произошло.
        addToast({ message: 'Публикация убрана из каталога', tone: 'success' });
        startTransition(() => {
          router.refresh();
        });
      } else {
        // Причину отказа отдаёт сервер: «на занятия записаны люди — сначала
        // отмените записи». Подменять её общей фразой значит спрятать
        // единственную подсказку, что делать дальше.
        addToast({ message: result.error ?? 'Не удалось убрать публикацию', tone: 'error' });
      }
    } catch {
      addToast({ message: 'Ошибка при удалении публикации', tone: 'error' });
    }
  }

  async function handleEditPublication(entityType: 'club' | 'trainer', entityId: EntityId) {
    const requestId = editBootstrapRequestIdRef.current + 1;
    editBootstrapRequestIdRef.current = requestId;

    try {
      if (entityType === 'club') {
        const response = await fetch(`/api/clubs/${entityId}`);
        const result = (await response.json()) as ClubEditBootstrapResponse;

        if (requestId !== editBootstrapRequestIdRef.current) return;

        const club = result.data?.club;
        const primaryOffering = result.data?.primaryOffering;
        const schedule = result.data?.schedule;

        if (
          !response.ok ||
          result.success !== true ||
          !club ||
          !primaryOffering ||
          !Array.isArray(schedule)
        ) {
          addToast({
            message: result.error ?? 'Не удалось загрузить клуб для редактирования',
            tone: 'error',
          });
          return;
        }

        setClubModalMode('edit');
        setClubEditEntityId(entityId);
        setClubInitialData(mapClubToFormState(club, primaryOffering, schedule));
        setIsClubModalOpen(true);
        return;
      }

      // trainer: параллельно грузим детали + список его links (для резолва attachmentMode).
      const [response, linksResponse] = await Promise.all([
        fetch(`/api/trainers/${entityId}`),
        fetch(`/api/trainer-club-links?trainerId=${entityId}`),
      ]);
      const result = (await response.json()) as TrainerEditBootstrapResponse;
      const linksResult = (await linksResponse.json()) as TrainerClubLinksResponse;

      if (requestId !== editBootstrapRequestIdRef.current) return;

      const trainer = result.data?.trainer;
      const primaryOffering = result.data?.primaryOffering;
      const schedule = result.data?.schedule;
      const additionalOfferings = result.data?.additionalOfferings ?? [];
      const trainerLinks = linksResult.success ? (linksResult.data ?? []) : [];

      if (
        !response.ok ||
        result.success !== true ||
        !trainer ||
        !primaryOffering ||
        !Array.isArray(schedule)
      ) {
        addToast({
          message: result.error ?? 'Не удалось загрузить тренера для редактирования',
          tone: 'error',
        });
        return;
      }

      const primarySchedule = schedule.filter((slot) => slot.offeringId === primaryOffering.id);

      setTrainerModalMode('edit');
      setTrainerEditEntityId(entityId);
      setTrainerInitialData(
        mapTrainerToFormState(
          trainer,
          primaryOffering,
          primarySchedule,
          additionalOfferings,
          trainerLinks,
        ),
      );
      setTrainerEditClubOption(
        result.data?.affiliatedClub
          ? { id: result.data.affiliatedClub.id, name: result.data.affiliatedClub.name }
          : null,
      );
      setIsTrainerModalOpen(true);
    } catch {
      if (requestId !== editBootstrapRequestIdRef.current) return;
      addToast({
        message: 'Ошибка при загрузке публикации для редактирования',
        tone: 'error',
      });
    }
  }

  // --- Early-return (после всех hooks) ---
  // ⚠️ Шаг 35.34. Здесь стояла плашка «Доступ ограничен» — косметика поверх
  // УЖЕ отданных данных: пускать или нет, решает серверный лейаут, и решает
  // до похода за ними. Осталась одна причина ничего не рисовать: ответ
  // «кто я» ещё в пути, и номера человека нет.
  if (!user) {
    return null;
  }

  return (
    <div data-testid="provider-publications" className="flex flex-col gap-4">
      <ProviderPublicationsSection
        clubs={providerClubs}
        trainers={providerTrainers}
        onEdit={handleEditPublication}
        onDelete={handleDeletePublication}
      />

      {/*
        ⚠️ Шаг 35.34. Кнопки заведения показываются всем: лицо услуг заводит любой
        вошедший (решение заказчика 1). Прежде их прятало право роли, и завести
        себе карточку тренера владелец клуба не мог вовсе. Ограничение на
        заведение (модерация, оплата) — вопрос будущей фазы, и это будет условие
        на один маршрут, а не новая роль.
      */}
      <Card className="flex flex-wrap gap-3 p-4 sm:p-6">
        <Button onClick={handleOpenCreateClubModal}>Опубликовать клуб</Button>
        <Button variant="outline" onClick={handleOpenCreateTrainerModal}>
          Опубликовать тренера
        </Button>
      </Card>

      {/* Publish-модалки */}
      <PublishClubModal
        open={isClubModalOpen}
        onClose={resetClubModalState}
        onSuccess={handlePublishSuccess}
        mode={clubModalMode}
        entityId={clubEditEntityId}
        initialData={clubInitialData}
        sports={sports}
        tags={tags}
        amenities={amenities}
      />
      <PublishTrainerModal
        open={isTrainerModalOpen}
        onClose={resetTrainerModalState}
        onSuccess={handlePublishSuccess}
        clubs={trainerModalClubOptions}
        mode={trainerModalMode}
        entityId={trainerEditEntityId}
        initialData={trainerInitialData}
        sports={sports}
        specialties={specialties}
        workFormats={workFormats}
      />
    </div>
  );
}
