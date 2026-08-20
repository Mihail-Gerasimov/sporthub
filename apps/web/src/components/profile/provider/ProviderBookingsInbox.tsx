// Inbox входящих записей для провайдера (Step 25.9): 4 таба FSM, фильтры по
// offering / виду спорта, FSM-действия (confirm / reject / check-in completed /
// check-in no_show / cancel) через Phase 24 API-endpoints. Карточки с acton-кнопками
// показывают имя атлета + его ReliabilityBadge (compact+showDetails), offering-title,
// время слота, место. В табе «Требуют check-in» карточки с <6h до конца окна 48h
// получают красный border.
'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useMemo, useState } from 'react';

import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { RejectBookingReasonModal } from '@/components/profile/provider/RejectBookingReasonModal';
import { Badge, Button, Card, ReliabilityBadge } from '@/components/ui';
import { DISCIPLINE_CONFIG, getSlotEndAt, getSlotStartAt } from '@sporthub/domain';
import { computeAthleteReliability } from '@sporthub/domain';
import { cn, formatDate, getBookingClubId, getBookingTrainerId } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import type {
  Booking,
  BookingStatus,
  Club,
  Offering,
  Schedule,
  Sport,
  Trainer,
  User,
} from '@sporthub/types';

const ALL_VALUE = '__all__';
const APPROACHING_CHECKIN_WINDOW_MS = 6 * 60 * 60 * 1000;
const CHECK_IN_WINDOW_MS = DISCIPLINE_CONFIG.checkIn.windowHoursAfterEnd * 60 * 60 * 1000;

type InboxTab = 'pending' | 'confirmed' | 'check-in' | 'history';

const TAB_LABELS: Record<InboxTab, string> = {
  pending: 'Ожидают подтверждения',
  confirmed: 'Подтверждённые ближайшие',
  'check-in': 'Требуют check-in',
  history: 'История',
};

// Phase 27 Step 27.4: динамический label + tone для карточек booking'ов в табе «История».
// Ранее отображался единый захардкоженный «Финальный статус» без различия — теперь
// карточка несёт конкретный статус FSM, симметрично athlete-таймлайну.
// Статусы, которых не должно быть в истории (pending/confirmed), всё же закрыты
// fallback'ом, чтобы не падать на edge-case данных из seed/миграции.
const HISTORY_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Ожидание',
  confirmed: 'Подтверждена',
  completed: 'Проведено',
  no_show: 'Не явился',
  unmarked: 'Не отмечено',
  rejected_by_provider: 'Вы отклонили',
  cancelled_by_athlete: 'Отменена спортсменом',
  cancelled_by_provider: 'Вы отменили',
};

// Палитра истории намеренно НЕ берётся из общей карты `BOOKING_STATUS_TONES`:
// в истории тон отвечает на другой вопрос. Там статус описывает состояние
// активной записи, здесь — исход прошедшего занятия: проведённое становится
// успехом (`success` вместо `teal`), неявка — предупреждением (`warning`
// вместо `danger`), а отмена спортсменом перестаёт быть тревогой (`outline`).
// Схлопывать эти две карты нельзя: совпадение части ключей случайно.
const HISTORY_STATUS_TONES: Record<BookingStatus, 'success' | 'warning' | 'danger' | 'outline'> = {
  pending: 'outline',
  confirmed: 'outline',
  completed: 'success',
  no_show: 'warning',
  unmarked: 'outline',
  rejected_by_provider: 'danger',
  cancelled_by_athlete: 'outline',
  cancelled_by_provider: 'danger',
};

type ProviderBookingsInboxProps = {
  bookings?: Booking[];
  clubs?: Club[];
  trainers?: Trainer[];
  offerings?: Offering[];
  schedule?: Schedule[];
  sports?: Sport[];
  users?: User[];
};

type EnrichedBooking = {
  booking: Booking;
  slot?: Schedule;
  offering?: Offering;
  title: string;
  athleteName: string;
  athleteEmail: string;
  contextLabel: string;
  locationLabel: string;
  timeLabel: string;
  endAtMs: number | null;
};

/**
 * Конец занятия в миллисекундах. Момент даёт общий помощник — по часам зала.
 *
 * Раньше здесь жила своя функция с тем же именем `getSlotEndAt`, что и на бэкенде,
 * но с другим типом результата (число вместо `Date`) и с моментом в поясе браузера:
 * от неё зависело и распределение записей по табу «Требуют check-in», и красная
 * рамка «меньше шести часов до конца окна». Смещение пояса больше этих шести часов,
 * поэтому подсветка срочности показывалась не тем записям.
 */
function getSlotEndAtMs(slot: Schedule): number {
  return getSlotEndAt(slot).getTime();
}

export function ProviderBookingsInbox({
  bookings = [],
  clubs = [],
  trainers = [],
  offerings = [],
  schedule = [],
  sports = [],
  users = [],
}: ProviderBookingsInboxProps) {
  const user = useAuthStore((s) => s.user);
  const accountType = useAuthStore((s) => s.accountType);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);

  const providerUserId = user?.id ?? null;
  const [tab, setTab] = useState<InboxTab>('pending');
  const [offeringFilter, setOfferingFilter] = useState<string>(ALL_VALUE);
  const [sportFilter, setSportFilter] = useState<string>(ALL_VALUE);
  const [pendingActionId, setPendingActionId] = useState<number | null>(null);
  // Phase 27 Step 27.13: модалка причины при reject. Один монтаж под список —
  // EnrichedBooking хранит контекст (имя атлета, id) для submit'а.
  const [rejectingItem, setRejectingItem] = useState<EnrichedBooking | null>(null);

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

  // Offerings провайдера для dropdown-фильтра.
  const providerOfferings = useMemo(
    () =>
      offerings.filter(
        (o) =>
          (o.ownerType === 'club' && clubIdSet.has(o.ownerId)) ||
          (o.ownerType === 'trainer' && trainerIdSet.has(o.ownerId)),
      ),
    [offerings, clubIdSet, trainerIdSet],
  );

  // Все bookings, относящиеся к провайдеру (по club/trainer id).
  const providerBookings = useMemo(
    () =>
      bookings.filter((b) => {
        const bClub = getBookingClubId(b);
        const bTrainer = getBookingTrainerId(b);
        if (bClub !== null && clubIdSet.has(bClub)) return true;
        if (bTrainer !== null && trainerIdSet.has(bTrainer)) return true;
        return false;
      }),
    [bookings, clubIdSet, trainerIdSet],
  );

  const scheduleById = useMemo(() => new Map(schedule.map((s) => [s.id, s])), [schedule]);
  const offeringById = useMemo(() => new Map(offerings.map((o) => [o.id, o])), [offerings]);
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const trainerById = useMemo(() => new Map(trainers.map((t) => [t.id, t])), [trainers]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const nowMs = new Date().getTime();

  // Разбивка по табам.
  const bookingsByTab = useMemo<Record<InboxTab, EnrichedBooking[]>>(() => {
    const enrich = (booking: Booking): EnrichedBooking => {
      const slot = scheduleById.get(booking.scheduleId);
      const offering =
        booking.offeringId !== undefined ? offeringById.get(booking.offeringId) : undefined;
      const athlete = userById.get(booking.userId);
      const bClub = getBookingClubId(booking);
      const bTrainer = getBookingTrainerId(booking);
      const clubName = bClub !== null ? (clubById.get(bClub)?.name ?? '') : '';
      const trainerName = bTrainer !== null ? (trainerById.get(bTrainer)?.name ?? '') : '';
      const contextLabel =
        [trainerName, clubName].filter(Boolean).join(' · ') || 'Занятие SportHub';
      const locationLabel = slot?.room
        ? `${clubName || trainerName || 'Площадка'} · ${slot.room}`
        : clubName || trainerName || 'Площадка';
      const timeLabel = slot
        ? `${slot.startTime}${slot.endTime ? ` – ${slot.endTime}` : ''}`
        : 'Время уточняется';
      const endAtMs = slot ? getSlotEndAtMs(slot) : null;

      return {
        booking,
        slot,
        offering,
        title: offering?.title ?? slot?.title ?? 'Занятие SportHub',
        athleteName: athlete?.name ?? 'Спортсмен SportHub',
        athleteEmail: athlete?.email ?? '',
        contextLabel,
        locationLabel,
        timeLabel,
        endAtMs,
      };
    };

    const pending: EnrichedBooking[] = [];
    const confirmed: EnrichedBooking[] = [];
    const checkIn: EnrichedBooking[] = [];
    const history: EnrichedBooking[] = [];

    for (const booking of providerBookings) {
      const enriched = enrich(booking);

      if (booking.status === 'pending') {
        pending.push(enriched);
        continue;
      }

      if (booking.status === 'confirmed') {
        if (enriched.endAtMs !== null && enriched.endAtMs <= nowMs) {
          // Окно check-in ещё не истекло?
          if (enriched.endAtMs + CHECK_IN_WINDOW_MS > nowMs) {
            checkIn.push(enriched);
            continue;
          }
          // Иначе — уже прошло окно, пусть попадёт в confirmed (будет unmarked после lazy).
        }

        confirmed.push(enriched);
        continue;
      }

      history.push(enriched);
    }

    // Sort confirmed — по startAt asc. Момент начала берёт общий помощник.
    confirmed.sort((a, b) => {
      const aMs = a.slot ? getSlotStartAt(a.slot).getTime() : 0;
      const bMs = b.slot ? getSlotStartAt(b.slot).getTime() : 0;
      return aMs - bMs;
    });
    // Sort check-in — по убыванию срочности (меньше msLeft = выше).
    checkIn.sort((a, b) => {
      const aLeft = a.endAtMs !== null ? a.endAtMs + CHECK_IN_WINDOW_MS - nowMs : Infinity;
      const bLeft = b.endAtMs !== null ? b.endAtMs + CHECK_IN_WINDOW_MS - nowMs : Infinity;
      return aLeft - bLeft;
    });
    // History — самые свежие сверху (по booking.date desc).
    history.sort((a, b) => b.booking.date.localeCompare(a.booking.date));

    return { pending, confirmed, 'check-in': checkIn, history };
  }, [providerBookings, nowMs, scheduleById, offeringById, clubById, trainerById, userById]);

  // Фильтры применяются внутри выбранного таба.
  const filtered = useMemo(() => {
    return bookingsByTab[tab].filter((item) => {
      if (offeringFilter !== ALL_VALUE) {
        const offeringId = Number(offeringFilter);
        if (item.booking.offeringId !== offeringId) return false;
      }
      if (sportFilter !== ALL_VALUE) {
        const sportId = Number(sportFilter);
        if (item.booking.sportId !== sportId) return false;
      }
      return true;
    });
  }, [bookingsByTab, tab, offeringFilter, sportFilter]);

  async function transition({
    item,
    endpoint,
    payload,
    successMessage,
    errorFallback,
  }: {
    item: EnrichedBooking;
    endpoint: string;
    payload: Record<string, unknown>;
    successMessage: string;
    errorFallback: string;
  }) {
    if (providerUserId === null) {
      addToast({ message: 'Не удалось определить провайдера для действия', tone: 'error' });
      return;
    }

    setPendingActionId(item.booking.id);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: providerUserId, ...payload }),
      });
      const result = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok || !result.success) {
        addToast({ message: result.error ?? errorFallback, tone: 'error' });
        return;
      }

      addToast({ message: successMessage, tone: 'success' });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      addToast({ message: errorFallback, tone: 'error' });
    } finally {
      setPendingActionId(null);
    }
  }

  if (!isAuthenticated || accountType !== 'provider' || !user) {
    return <AccessDeniedCard requiredRole="provider" testId="provider-bookings-access-denied" />;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="provider-bookings-inbox">
      <Card className="p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Входящие записи
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Управляйте заявками атлетов по табам FSM: подтверждайте pending, отмечайте check-in по
          истечении слота, просматривайте историю.
        </p>
      </Card>

      {/* Табы. */}
      <div className="flex flex-wrap gap-2" role="tablist" data-testid="provider-bookings-tabs">
        {(Object.keys(TAB_LABELS) as InboxTab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            data-testid={`provider-bookings-tab-${key}`}
            className={cn(
              'rounded-pill px-4 py-2 text-sm font-semibold transition-colors',
              tab === key
                ? 'bg-accent text-ink'
                : 'border border-line bg-panel text-ink hover:border-accent hover:text-accent',
            )}
          >
            {TAB_LABELS[key]}{' '}
            <span className="ml-1 text-xs opacity-75">{bookingsByTab[key].length}</span>
          </button>
        ))}
      </div>

      {/* Фильтры. */}
      <Card className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <label className="flex min-w-[180px] flex-col gap-1 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
          Offering
          <select
            data-testid="provider-bookings-filter-offering"
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
          Вид спорта
          <select
            data-testid="provider-bookings-filter-sport"
            value={sportFilter}
            onChange={(event) => setSportFilter(event.target.value)}
            className="rounded-pill border border-line bg-panel px-3 py-2 text-sm font-normal text-ink"
          >
            <option value={ALL_VALUE}>Все виды</option>
            {sports.map((sport) => (
              <option key={sport.id} value={String(sport.id)}>
                {sport.name}
              </option>
            ))}
          </select>
        </label>
      </Card>

      {/* Список карточек. */}
      {filtered.length === 0 ? (
        <Card className="p-6 sm:p-8">
          <p className="text-sm leading-relaxed text-muted">Нет записей по выбранному фильтру.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((item) => {
            const isApproachingCheckIn =
              tab === 'check-in' &&
              item.endAtMs !== null &&
              item.endAtMs + CHECK_IN_WINDOW_MS - nowMs <= APPROACHING_CHECKIN_WINDOW_MS;

            const athleteReliability = computeAthleteReliability(bookings, item.booking.userId);
            const isPending = pendingActionId === item.booking.id;

            return (
              <li
                key={item.booking.id}
                data-testid={`provider-bookings-card-${item.booking.id}`}
                data-approaching={isApproachingCheckIn ? 'true' : undefined}
                className={cn(
                  'rounded-card border bg-canvas p-4',
                  isApproachingCheckIn ? 'border-danger' : 'border-line',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-ink">{item.athleteName}</p>
                      <ReliabilityBadge reliability={athleteReliability} compact showDetails />
                    </div>
                    <p className="mt-1 text-xs text-muted">{item.athleteEmail}</p>
                    <p className="mt-3 text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {item.contextLabel} · {item.locationLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                      Дата и время
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {formatDate(item.booking.date, { day: 'numeric', month: 'long' })}
                    </p>
                    <p className="mt-1 text-xs text-muted">{item.timeLabel}</p>
                  </div>
                </div>

                {/* Кнопки FSM — в зависимости от таба. */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {tab === 'pending' ? (
                    <>
                      <Button
                        variant="outline"
                        loading={isPending}
                        onClick={() =>
                          transition({
                            item,
                            endpoint: `/api/bookings/${item.booking.id}/confirm`,
                            payload: {},
                            successMessage: 'Запись подтверждена.',
                            errorFallback: 'Не удалось подтвердить запись',
                          })
                        }
                        data-testid={`provider-bookings-action-confirm-${item.booking.id}`}
                      >
                        Подтвердить
                      </Button>
                      <Button
                        variant="outline"
                        loading={isPending}
                        onClick={() => setRejectingItem(item)}
                        data-testid={`provider-bookings-action-reject-${item.booking.id}`}
                      >
                        Отклонить
                      </Button>
                    </>
                  ) : null}

                  {tab === 'check-in' ? (
                    <>
                      <Button
                        variant="outline"
                        loading={isPending}
                        onClick={() =>
                          transition({
                            item,
                            endpoint: `/api/bookings/${item.booking.id}/check-in`,
                            payload: { outcome: 'completed' },
                            successMessage: 'Отмечено: атлет пришёл.',
                            errorFallback: 'Не удалось отметить completed',
                          })
                        }
                        data-testid={`provider-bookings-action-checkin-completed-${item.booking.id}`}
                      >
                        Пришёл
                      </Button>
                      <Button
                        variant="outline"
                        loading={isPending}
                        onClick={() =>
                          transition({
                            item,
                            endpoint: `/api/bookings/${item.booking.id}/check-in`,
                            payload: { outcome: 'no_show' },
                            successMessage: 'Отмечено: атлет не пришёл.',
                            errorFallback: 'Не удалось отметить no_show',
                          })
                        }
                        data-testid={`provider-bookings-action-checkin-noshow-${item.booking.id}`}
                      >
                        Не пришёл
                      </Button>
                    </>
                  ) : null}

                  {tab === 'pending' || tab === 'confirmed' ? (
                    <Button
                      variant="outline"
                      loading={isPending}
                      onClick={() =>
                        transition({
                          item,
                          endpoint: `/api/bookings/${item.booking.id}/cancel`,
                          payload: {},
                          successMessage: 'Запись отменена.',
                          errorFallback: 'Не удалось отменить запись',
                        })
                      }
                      data-testid={`provider-bookings-action-cancel-${item.booking.id}`}
                    >
                      Отменить
                    </Button>
                  ) : null}

                  {tab === 'history' ? (
                    <Badge
                      tone={HISTORY_STATUS_TONES[item.booking.status]}
                      data-testid={`provider-bookings-history-status-${item.booking.id}`}
                    >
                      {HISTORY_STATUS_LABELS[item.booking.status]}
                    </Badge>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Phase 27 Step 27.13: модалка причины reject (опциональная). Reuse одним
          монтажом — закрытие сбрасывает item, открытие — выставляет. */}
      <RejectBookingReasonModal
        open={rejectingItem !== null}
        athleteName={rejectingItem?.athleteName ?? ''}
        loading={pendingActionId !== null && pendingActionId === rejectingItem?.booking.id}
        onClose={() => setRejectingItem(null)}
        onConfirm={(reason) => {
          const item = rejectingItem;
          if (item === null) return;
          setRejectingItem(null);
          void transition({
            item,
            endpoint: `/api/bookings/${item.booking.id}/reject`,
            payload: reason !== null ? { reason } : {},
            successMessage: 'Запись отклонена.',
            errorFallback: 'Не удалось отклонить запись',
          });
        }}
      />
    </div>
  );
}
