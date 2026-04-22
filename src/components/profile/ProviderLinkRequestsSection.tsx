// Phase 24 Step 24.9b: блок «Запросы от тренеров» + «Подтверждённые тренеры»
// в кабинете провайдера. Виден только club-owner'у с хотя бы одним клубом.
// Pending-запросы отображаются с кнопками «Подтвердить» / «Отклонить».
// Confirmed-связи — с кнопкой «Отвязать».
//
// ВНИМАНИЕ (Phase 26 Step 26.5): компонент стал orphan — больше не
// импортируется из продакшн-кода после удаления ProviderProfilePage.tsx.
// Функциональность (approve/reject/revoke pending-links + invite-flow)
// полностью покрывается подмаршрутом /profile/provider/links (ProviderLinks.tsx,
// Step 25.12 + Step 26.4). Файл + его тест provider-link-requests-section.test.tsx
// оставлены как готовый reference UI; их удаление возможно в следующей фазе.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Card } from '@/components/ui';
import { useToastStore } from '@/stores/useToastStore';
import type { Club, Trainer, TrainerClubLink } from '@/types';

export interface ProviderLinkRequestsSectionProps {
  /** Клубы, которыми управляет текущий provider (source of truth для inbox). */
  providerClubs: Club[];
  /** Полный справочник тренеров — нужен для отображения имени по trainerId. */
  trainers: Trainer[];
  /** Id текущего пользователя-провайдера (нужен для action endpoints). */
  userId: number | null;
}

function buildTrainerMap(trainers: Trainer[]): Map<number, Trainer> {
  const map = new Map<number, Trainer>();
  for (const trainer of trainers) {
    map.set(trainer.id, trainer);
  }
  return map;
}

function buildClubMap(clubs: Club[]): Map<number, Club> {
  const map = new Map<number, Club>();
  for (const club of clubs) {
    map.set(club.id, club);
  }
  return map;
}

export function ProviderLinkRequestsSection({
  providerClubs,
  trainers,
  userId,
}: ProviderLinkRequestsSectionProps) {
  const [pending, setPending] = useState<TrainerClubLink[]>([]);
  const [confirmed, setConfirmed] = useState<TrainerClubLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLinkId, setActionLinkId] = useState<number | null>(null);
  const addToast = useToastStore((state) => state.addToast);
  const router = useRouter();

  const trainersById = buildTrainerMap(trainers);
  const clubsById = buildClubMap(providerClubs);

  const loadLinks = useCallback(async () => {
    if (providerClubs.length === 0) {
      setPending([]);
      setConfirmed([]);
      return;
    }
    setLoading(true);
    try {
      // Параллельный fetch по каждому клубу. Результаты склеиваем. Ошибки/отсутствующий
      // ответ трактуем как пустой список — не валим UI, если сеть недоступна.
      const allLinks = await Promise.all(
        providerClubs.map(async (club) => {
          try {
            const response = await fetch(`/api/trainer-club-links?clubId=${club.id}`);
            if (!response || !response.ok) return [] as TrainerClubLink[];
            const body = (await response.json()) as {
              success: boolean;
              data?: TrainerClubLink[];
            };
            return body.success && body.data ? body.data : [];
          } catch {
            return [] as TrainerClubLink[];
          }
        }),
      );
      const flat = allLinks.flat();
      setPending(flat.filter((link) => link.status === 'pending'));
      setConfirmed(flat.filter((link) => link.status === 'confirmed'));
    } finally {
      setLoading(false);
    }
  }, [providerClubs]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const callAction = useCallback(
    async (linkId: number, action: 'approve' | 'reject' | 'revoke') => {
      if (userId === null) return;
      setActionLinkId(linkId);
      try {
        const response = await fetch(`/api/trainer-club-links/${linkId}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        const body = (await response.json()) as { success: boolean; error?: string };
        if (!response.ok || !body.success) {
          addToast({ message: body.error ?? 'Не удалось выполнить действие', tone: 'error' });
          return;
        }
        const successMessage =
          action === 'approve'
            ? 'Связь подтверждена'
            : action === 'reject'
              ? 'Запрос отклонён'
              : 'Связь разорвана';
        addToast({ message: successMessage, tone: 'success' });
        await loadLinks();
        router.refresh();
      } finally {
        setActionLinkId(null);
      }
    },
    [userId, loadLinks, addToast, router],
  );

  if (providerClubs.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-6 p-6 sm:p-8" data-testid="provider-link-requests-section">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Связи с тренерами</h2>
          <p className="mt-1 text-sm text-muted">
            Подтвердите привязки тренеров к вашим клубам или отклоните запрос.
          </p>
        </div>
      </header>

      {/* Pending inbox */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-[0.10em] text-muted">
          Запросы от тренеров
          {pending.length > 0 ? ` (${pending.length})` : ''}
        </h3>
        {loading && pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Загружаем запросы…</p>
        ) : pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Новых запросов нет.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {pending.map((link) => {
              const trainer = trainersById.get(link.trainerId);
              const club = clubsById.get(link.clubId);
              const busy = actionLinkId === link.id;
              return (
                <li
                  key={link.id}
                  data-testid={`link-request-pending-${link.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {trainer?.name ?? `Тренер #${link.trainerId}`}
                    </p>
                    <p className="text-xs text-muted">
                      Запрос к клубу «{club?.name ?? `Клуб #${link.clubId}`}»
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        void callAction(link.id, 'approve');
                      }}
                    >
                      Подтвердить
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        void callAction(link.id, 'reject');
                      }}
                    >
                      Отклонить
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Confirmed list */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-[0.10em] text-muted">
          Подтверждённые тренеры
          {confirmed.length > 0 ? ` (${confirmed.length})` : ''}
        </h3>
        {confirmed.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Пока нет подтверждённых связей.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {confirmed.map((link) => {
              const trainer = trainersById.get(link.trainerId);
              const club = clubsById.get(link.clubId);
              const busy = actionLinkId === link.id;
              return (
                <li
                  key={link.id}
                  data-testid={`link-confirmed-${link.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {trainer?.name ?? `Тренер #${link.trainerId}`}
                    </p>
                    <p className="text-xs text-muted">
                      Работает в «{club?.name ?? `Клуб #${link.clubId}`}»
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      void callAction(link.id, 'revoke');
                    }}
                  >
                    Отвязать
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Card>
  );
}
