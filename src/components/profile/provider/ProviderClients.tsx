// CRM-раздел провайдера (Step 25.10-B). Агрегирует уникальных клиентов из bookings
// провайдера, показывает фильтры (reliability / recency / offering / entity), карточку
// клиента с reliability-бейджем, completed-счётчиком и топ-3 offerings; drawer —
// полная история записей + редактируемая заметка (POST create / PATCH update / DELETE).
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useMemo, useState } from 'react';

import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { Badge, Button, Card, Modal, ReliabilityBadge } from '@/components/ui';
import { computeAthleteReliability } from '@/lib/reliability';
import { cn, formatDate, getBookingClubId, getBookingTrainerId } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import type { Booking, Club, Offering, ProviderClientNote, Schedule, Trainer, User } from '@/types';

const ALL_VALUE = '__all__';
// 30 дней — порог «свежего» визита. Клиенты без посещений за 30 дней считаются stale
// (кандидаты на реактивацию). Значение зашито отдельной константой для тестируемости.
const STALE_VISIT_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_NOTE_LENGTH = 2000;

type ReliabilityFilter = typeof ALL_VALUE | 'new' | 'warning' | 'danger' | 'normal';
type RecencyFilter = typeof ALL_VALUE | 'recent' | 'stale';

type OfferingCount = { offeringId: number; title: string; count: number };

type ClientAggregate = {
  userId: number;
  user: User | null;
  reliability: ReturnType<typeof computeAthleteReliability>;
  totalBookings: number;
  completedCount: number;
  firstVisitMs: number | null;
  lastVisitMs: number | null;
  topOfferings: OfferingCount[];
  bookings: Booking[];
  note: ProviderClientNote | null;
};

type ProviderClientsProps = {
  bookings?: Booking[];
  clubs?: Club[];
  trainers?: Trainer[];
  offerings?: Offering[];
  schedule?: Schedule[];
  users?: User[];
  notes?: ProviderClientNote[];
};

export function ProviderClients({
  bookings = [],
  clubs = [],
  trainers = [],
  offerings = [],
  schedule = [],
  users = [],
  notes = [],
}: ProviderClientsProps) {
  const user = useAuthStore((s) => s.user);
  const accountType = useAuthStore((s) => s.accountType);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);

  const providerUserId = user?.id ?? null;

  const [entityFilter, setEntityFilter] = useState<string>(ALL_VALUE);
  const [offeringFilter, setOfferingFilter] = useState<string>(ALL_VALUE);
  const [reliabilityFilter, setReliabilityFilter] = useState<ReliabilityFilter>(ALL_VALUE);
  const [recencyFilter, setRecencyFilter] = useState<RecencyFilter>(ALL_VALUE);
  const [openedClientId, setOpenedClientId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const providerClubs = useMemo(
    () => (providerUserId === null ? [] : getProviderClubs(clubs, providerUserId)),
    [clubs, providerUserId],
  );
  const providerTrainers = useMemo(
    () => (providerUserId === null ? [] : getProviderTrainers(trainers, providerUserId)),
    [trainers, providerUserId],
  );

  const clubIdSet = useMemo(() => new Set(providerClubs.map((c) => c.id)), [providerClubs]);
  const trainerIdSet = useMemo(
    () => new Set(providerTrainers.map((t) => t.id)),
    [providerTrainers],
  );

  // Offerings провайдера: все услуги, принадлежащие его managed клубам или тренерам.
  const providerOfferings = useMemo(
    () =>
      offerings.filter(
        (offering) =>
          (offering.ownerType === 'club' && clubIdSet.has(offering.ownerId)) ||
          (offering.ownerType === 'trainer' && trainerIdSet.has(offering.ownerId)),
      ),
    [offerings, clubIdSet, trainerIdSet],
  );

  const providerBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        const clubId = getBookingClubId(booking);
        const trainerId = getBookingTrainerId(booking);
        if (clubId !== null && clubIdSet.has(clubId)) return true;
        if (trainerId !== null && trainerIdSet.has(trainerId)) return true;
        return false;
      }),
    [bookings, clubIdSet, trainerIdSet],
  );

  const offeringById = useMemo(
    () => new Map(offerings.map((offering) => [offering.id, offering])),
    [offerings],
  );
  const scheduleById = useMemo(() => new Map(schedule.map((slot) => [slot.id, slot])), [schedule]);
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const trainerById = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);
  const notesByClient = useMemo(
    () => new Map(notes.map((note) => [note.clientUserId, note])),
    [notes],
  );

  const nowMs = new Date().getTime();

  // Агрегация уникальных клиентов из provider bookings. reliability считается по всем
  // bookings (не только провайдеровским), чтобы бейдж отражал полную историю клиента.
  const clientAggregates = useMemo<ClientAggregate[]>(() => {
    const groupedBookings = new Map<number, Booking[]>();
    for (const booking of providerBookings) {
      if (!groupedBookings.has(booking.userId)) {
        groupedBookings.set(booking.userId, []);
      }
      groupedBookings.get(booking.userId)!.push(booking);
    }

    const aggregates: ClientAggregate[] = [];
    for (const [userId, userBookings] of groupedBookings) {
      const userData = users.find((u) => u.id === userId) ?? null;
      const reliability = computeAthleteReliability(bookings, userId);
      const completedCount = userBookings.filter((b) => b.status === 'completed').length;

      const visitMs = userBookings
        .map((b) => new Date(`${b.date}T00:00:00`).getTime())
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => a - b);

      const offeringCounts = new Map<number, number>();
      for (const booking of userBookings) {
        if (booking.offeringId !== undefined) {
          offeringCounts.set(booking.offeringId, (offeringCounts.get(booking.offeringId) ?? 0) + 1);
        }
      }
      const topOfferings: OfferingCount[] = Array.from(offeringCounts.entries())
        .map(([offeringId, count]) => ({
          offeringId,
          title: offeringById.get(offeringId)?.title ?? 'Услуга',
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      aggregates.push({
        userId,
        user: userData,
        reliability,
        totalBookings: userBookings.length,
        completedCount,
        firstVisitMs: visitMs[0] ?? null,
        lastVisitMs: visitMs.at(-1) ?? null,
        topOfferings,
        bookings: userBookings,
        note: notesByClient.get(userId) ?? null,
      });
    }

    return aggregates.sort((a, b) => (b.lastVisitMs ?? 0) - (a.lastVisitMs ?? 0));
  }, [providerBookings, bookings, users, offeringById, notesByClient]);

  const filteredClients = useMemo(() => {
    return clientAggregates.filter((client) => {
      if (entityFilter !== ALL_VALUE) {
        const [kind, rawId] = entityFilter.split(':');
        const id = Number(rawId);
        const matches = client.bookings.some((booking) => {
          if (kind === 'club') return getBookingClubId(booking) === id;
          if (kind === 'trainer') return getBookingTrainerId(booking) === id;
          return false;
        });
        if (!matches) return false;
      }

      if (offeringFilter !== ALL_VALUE) {
        const offeringId = Number(offeringFilter);
        if (!client.bookings.some((b) => b.offeringId === offeringId)) return false;
      }

      if (reliabilityFilter !== ALL_VALUE) {
        if (reliabilityFilter === 'new' && !client.reliability.isNewUser) return false;
        if (reliabilityFilter === 'warning' && client.reliability.badge !== 'warning') return false;
        if (reliabilityFilter === 'danger' && client.reliability.badge !== 'danger') return false;
        if (
          reliabilityFilter === 'normal' &&
          (client.reliability.isNewUser || client.reliability.badge !== null)
        ) {
          return false;
        }
      }

      if (recencyFilter !== ALL_VALUE) {
        const lastMs = client.lastVisitMs;
        if (lastMs === null) return false;
        const diff = nowMs - lastMs;
        if (recencyFilter === 'recent' && diff > STALE_VISIT_THRESHOLD_MS) return false;
        if (recencyFilter === 'stale' && diff <= STALE_VISIT_THRESHOLD_MS) return false;
      }

      return true;
    });
  }, [clientAggregates, entityFilter, offeringFilter, reliabilityFilter, recencyFilter, nowMs]);

  const openedClient = useMemo(
    () =>
      openedClientId === null
        ? null
        : (clientAggregates.find((c) => c.userId === openedClientId) ?? null),
    [clientAggregates, openedClientId],
  );

  // При смене openedClient синхронизируем черновик заметки с актуальным значением
  // из пропсов. Если клиент закрыт — сбрасываем черновик.
  useEffect(() => {
    setNoteDraft(openedClient?.note?.note ?? '');
  }, [openedClient]);

  async function saveNote() {
    if (!openedClient || providerUserId === null) {
      return;
    }

    const trimmed = noteDraft.trim();
    if (!trimmed) {
      addToast({ message: 'Заметка не может быть пустой', tone: 'error' });
      return;
    }

    const existing = openedClient.note;
    const endpoint = existing
      ? `/api/provider-client-notes/${existing.id}`
      : '/api/provider-client-notes';
    const method = existing ? 'PATCH' : 'POST';
    const body = existing
      ? { userId: providerUserId, note: trimmed }
      : {
          providerUserId,
          clientUserId: openedClient.userId,
          note: trimmed,
        };

    setIsSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok || !result.success) {
        addToast({ message: result.error ?? 'Не удалось сохранить заметку', tone: 'error' });
        return;
      }

      addToast({ message: 'Заметка сохранена.', tone: 'success' });
      setOpenedClientId(null);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      addToast({ message: 'Не удалось сохранить заметку', tone: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteNote() {
    if (!openedClient || !openedClient.note || providerUserId === null) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/provider-client-notes/${openedClient.note.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: providerUserId }),
      });
      const result = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok || !result.success) {
        addToast({ message: result.error ?? 'Не удалось удалить заметку', tone: 'error' });
        return;
      }

      addToast({ message: 'Заметка удалена.', tone: 'success' });
      setOpenedClientId(null);
      startTransition(() => {
        router.refresh();
      });
    } catch {
      addToast({ message: 'Не удалось удалить заметку', tone: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isAuthenticated || accountType !== 'provider' || !user) {
    return <AccessDeniedCard requiredRole="provider" testId="provider-clients-access-denied" />;
  }

  const isProviderEmpty = providerClubs.length === 0 && providerTrainers.length === 0;

  return (
    <div className="flex flex-col gap-6" data-testid="provider-clients">
      <Card className="p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Клиенты</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Уникальные клиенты ваших клубов и тренеров. Открывайте карточку, чтобы увидеть историю
          записей и оставить личную заметку.
        </p>
      </Card>

      {isProviderEmpty ? (
        <Card className="p-6 sm:p-8" data-testid="provider-clients-empty">
          <p className="text-sm leading-relaxed text-muted">
            Пока нет опубликованных клубов или тренеров — как только появятся первые записи, здесь
            соберётся ваша клиентская база.
          </p>
          <div className="mt-5">
            <Link
              href="/profile/provider"
              className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
            >
              Опубликовать услугу
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* Фильтры. */}
          <Card className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
            <label className="flex min-w-[180px] flex-col gap-1 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Entity
              <select
                data-testid="provider-clients-filter-entity"
                value={entityFilter}
                onChange={(event) => setEntityFilter(event.target.value)}
                className="rounded-pill border border-line bg-panel px-3 py-2 text-sm font-normal text-ink"
              >
                <option value={ALL_VALUE}>Все клубы и тренеры</option>
                {providerClubs.map((cl) => (
                  <option key={`club-${cl.id}`} value={`club:${cl.id}`}>
                    Клуб: {cl.name}
                  </option>
                ))}
                {providerTrainers.map((tr) => (
                  <option key={`trainer-${tr.id}`} value={`trainer:${tr.id}`}>
                    Тренер: {tr.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[180px] flex-col gap-1 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Offering
              <select
                data-testid="provider-clients-filter-offering"
                value={offeringFilter}
                onChange={(event) => setOfferingFilter(event.target.value)}
                className="rounded-pill border border-line bg-panel px-3 py-2 text-sm font-normal text-ink"
              >
                <option value={ALL_VALUE}>Все offerings</option>
                {providerOfferings.map((offering) => (
                  <option key={offering.id} value={String(offering.id)}>
                    {offering.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[180px] flex-col gap-1 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Reliability
              <select
                data-testid="provider-clients-filter-reliability"
                value={reliabilityFilter}
                onChange={(event) => setReliabilityFilter(event.target.value as ReliabilityFilter)}
                className="rounded-pill border border-line bg-panel px-3 py-2 text-sm font-normal text-ink"
              >
                <option value={ALL_VALUE}>Все</option>
                <option value="new">Новые клиенты</option>
                <option value="normal">Надёжные</option>
                <option value="warning">Warning</option>
                <option value="danger">Danger</option>
              </select>
            </label>
            <label className="flex min-w-[180px] flex-col gap-1 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Последний визит
              <select
                data-testid="provider-clients-filter-recency"
                value={recencyFilter}
                onChange={(event) => setRecencyFilter(event.target.value as RecencyFilter)}
                className="rounded-pill border border-line bg-panel px-3 py-2 text-sm font-normal text-ink"
              >
                <option value={ALL_VALUE}>Любой</option>
                <option value="recent">За последние 30 дней</option>
                <option value="stale">Более 30 дней назад</option>
              </select>
            </label>
          </Card>

          {filteredClients.length === 0 ? (
            <Card className="p-6 sm:p-8" data-testid="provider-clients-no-matches">
              <p className="text-sm leading-relaxed text-muted">
                Нет клиентов по выбранным фильтрам.
              </p>
            </Card>
          ) : (
            <ul
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              data-testid="provider-clients-list"
            >
              {filteredClients.map((client) => {
                const staleDays =
                  client.lastVisitMs !== null
                    ? Math.floor((nowMs - client.lastVisitMs) / (24 * 60 * 60 * 1000))
                    : null;

                return (
                  <li key={client.userId}>
                    <button
                      type="button"
                      data-testid={`provider-clients-card-${client.userId}`}
                      onClick={() => setOpenedClientId(client.userId)}
                      className="flex w-full flex-col gap-3 rounded-card border border-line bg-canvas p-4 text-left transition-colors hover:border-accent"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-base font-semibold text-ink">
                          {client.user?.name ?? 'Спортсмен SportHub'}
                        </p>
                        <ReliabilityBadge reliability={client.reliability} compact showDetails />
                      </div>
                      <p className="text-xs text-muted">{client.user?.email ?? ''}</p>

                      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
                        <div>
                          <p className="font-semibold uppercase tracking-[0.10em]">Записей</p>
                          <p className="mt-1 text-base font-semibold text-ink">
                            {client.totalBookings}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold uppercase tracking-[0.10em]">Completed</p>
                          <p className="mt-1 text-base font-semibold text-ink">
                            {client.completedCount}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold uppercase tracking-[0.10em]">Первый визит</p>
                          <p className="mt-1 text-sm text-ink">
                            {client.firstVisitMs
                              ? formatDate(new Date(client.firstVisitMs), {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="font-semibold uppercase tracking-[0.10em]">
                            Последний визит
                          </p>
                          <p className="mt-1 text-sm text-ink">
                            {client.lastVisitMs
                              ? formatDate(new Date(client.lastVisitMs), {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '—'}
                          </p>
                        </div>
                      </div>

                      {client.topOfferings.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {client.topOfferings.map((offering) => (
                            <Badge
                              key={offering.offeringId}
                              tone="outline"
                            >{`${offering.title} × ${offering.count}`}</Badge>
                          ))}
                        </div>
                      ) : null}

                      {client.note ? (
                        <p className="mt-1 rounded-card border border-line bg-panel p-3 text-xs italic text-muted">
                          «{client.note.note}»
                        </p>
                      ) : null}

                      {staleDays !== null && staleDays >= 30 ? (
                        <Badge tone="warning">Не был {staleDays} д.</Badge>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Modal
        open={openedClient !== null}
        onClose={() => setOpenedClientId(null)}
        title={openedClient?.user?.name ?? 'Клиент'}
        description={openedClient?.user?.email}
      >
        {openedClient ? (
          <div className="flex flex-col gap-5" data-testid="provider-clients-drawer">
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-ink">
                {openedClient.user?.name ?? 'Клиент SportHub'}
              </p>
              {openedClient.user?.email ? (
                <p className="text-xs text-muted">{openedClient.user.email}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ReliabilityBadge reliability={openedClient.reliability} showDetails />
              <Badge tone="outline">
                Записей: {openedClient.totalBookings} · Completed: {openedClient.completedCount}
              </Badge>
            </div>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                История записей
              </h3>
              <ul className="flex flex-col gap-2">
                {openedClient.bookings
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((booking) => {
                    const slot = scheduleById.get(booking.scheduleId);
                    const offering =
                      booking.offeringId !== undefined
                        ? offeringById.get(booking.offeringId)
                        : undefined;
                    const clubId = getBookingClubId(booking);
                    const trainerId = getBookingTrainerId(booking);
                    const clubName = clubId !== null ? (clubById.get(clubId)?.name ?? '') : '';
                    const trainerName =
                      trainerId !== null ? (trainerById.get(trainerId)?.name ?? '') : '';
                    const context = [trainerName, clubName].filter(Boolean).join(' · ');

                    return (
                      <li
                        key={booking.id}
                        data-testid={`provider-clients-drawer-history-item-${booking.id}`}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-line bg-canvas p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink">
                            {offering?.title ?? slot?.title ?? 'Занятие'}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {context || 'Локация уточняется'}
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted">
                          <p className="font-semibold text-ink">
                            {formatDate(booking.date, {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                          {slot ? (
                            <p className="mt-1">
                              {slot.startTime}
                              {slot.endTime ? ` – ${slot.endTime}` : ''}
                            </p>
                          ) : null}
                          <p className="mt-1">{booking.status}</p>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Заметка провайдера
              </h3>
              <textarea
                data-testid="provider-clients-drawer-note-textarea"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                maxLength={MAX_NOTE_LENGTH}
                rows={4}
                placeholder="Приватная заметка (видна только вам)…"
                className={cn(
                  'w-full rounded-card border border-line bg-canvas p-3 text-sm text-ink',
                  'focus:border-accent focus:outline-none',
                )}
              />
              <p className="text-xs text-muted">
                {noteDraft.length} / {MAX_NOTE_LENGTH}
              </p>
            </section>

            <div className="flex flex-wrap justify-end gap-2">
              {openedClient.note ? (
                <Button
                  variant="outline"
                  data-testid="provider-clients-drawer-note-delete"
                  loading={isSubmitting}
                  onClick={() => {
                    void deleteNote();
                  }}
                >
                  Удалить
                </Button>
              ) : null}
              <Button
                data-testid="provider-clients-drawer-note-save"
                loading={isSubmitting}
                onClick={() => {
                  void saveNote();
                }}
              >
                {openedClient.note ? 'Сохранить' : 'Создать'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
