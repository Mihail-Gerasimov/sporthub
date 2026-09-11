// Dashboard провайдера (Step 25.8): сводка «что требует внимания прямо сейчас».
// Условный рендер по getProviderClubs / getProviderTrainers — провайдер может быть
// club-стороной, trainer-стороной или обеими сразу. Для multi-offering тренера
// внутри trainer-секции разбиваем активные записи per-offering.
'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import {
  getProviderClubs,
  getProviderReviews,
  getProviderTrainers,
} from '@/components/profile/provider-helpers';
import { Badge, Card, ReliabilityBadge } from '@/components/ui';
import { ACTIVE_BOOKING_STATUSES } from '@sporthub/domain';
import { DISCIPLINE_CONFIG, getSlotEndAt, shiftDateKey } from '@sporthub/domain';
import { computeClubReliability, computeTrainerReliability } from '@sporthub/domain';
import {
  findBookingSlot,
  getBookingClubId,
  getBookingTrainerId,
  getDateKeyInTimeZone,
} from '@/lib/utils';
import { FACE_CABINET_TITLE } from '@/lib/service-faces';
import { useCabinet, useCabinetFaces } from '@/components/profile/cabinet-context';
import { useAuthStore } from '@/stores/useAuthStore';
import type {
  Booking,
  Club,
  EntityId,
  Offering,
  Review,
  Schedule,
  Trainer,
  TrainerClubLink,
} from '@sporthub/types';

type ProviderDashboardProps = {
  bookings?: Booking[];
  clubs?: Club[];
  trainers?: Trainer[];
  offerings?: Offering[];
  schedule?: Schedule[];
  links?: TrainerClubLink[];
  /**
   * Сколько непрочитанных в ящике ОТКРЫТОГО кабинета (шаг 37.57).
   *
   * ⚠️ Число, а не лента. Прежде сюда приходил массив уведомлений, и сводка
   * считала непрочитанные фильтром по нему — поверх выдачи, обрезанной потолком
   * в сто строк. После сотни уведомлений KPI молча занижался.
   *
   * Считает база, страница только передаёт. Массива здесь больше нет намеренно:
   * пока он есть, всегда найдётся второй способ посчитать это же число — а два
   * способа в проекте уже трижды расходились («в колокольчике 3, в списке 0»).
   */
  unreadCount?: number;
  /** Phase 26 Step 26.9: отзывы для KPI «Рейтинг». */
  reviews?: Review[];
};

const APPROACHING_CHECKIN_WINDOW_MS = 6 * 60 * 60 * 1000;
const CHECK_IN_WINDOW_MS = DISCIPLINE_CONFIG.checkIn.windowHoursAfterEnd * 60 * 60 * 1000;
const DAY_KEYS_IN_WEEK = 7;

/** Helper: проверяет, относится ли booking к набору club/trainer id'ов провайдера. */
function belongsToProvider(
  booking: Booking,
  clubIds: Set<EntityId>,
  trainerIds: Set<EntityId>,
): boolean {
  const bookingClub = getBookingClubId(booking);
  const bookingTrainer = getBookingTrainerId(booking);

  if (bookingClub !== null && clubIds.has(bookingClub)) return true;
  if (bookingTrainer !== null && trainerIds.has(bookingTrainer)) return true;

  return false;
}

/** KPI-карточка с числом и подписью + опциональный link. */
function KpiCard({
  label,
  value,
  caption,
  href,
  testid,
}: {
  label: string;
  value: number;
  caption: string;
  href?: string;
  testid: string;
}) {
  const body = (
    <div className="rounded-card border border-line bg-panel p-4" data-testid={testid}>
      <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-xs text-muted">{caption}</p>
    </div>
  );

  if (!href) {
    return body;
  }

  return (
    <Link
      href={href}
      className="block transition-colors hover:[&>div]:border-accent"
      data-testid={`${testid}-link`}
    >
      {body}
    </Link>
  );
}

export function ProviderDashboard({
  bookings = [],
  clubs = [],
  trainers = [],
  offerings = [],
  schedule = [],
  links = [],
  unreadCount = 0,
  reviews = [],
}: ProviderDashboardProps) {
  const user = useAuthStore((state) => state.user);
  // ⚠️ Шаг 35.32. Кабинет открыт в контексте ЛИЦА услуг, и подпись называет
  // именно его: «CrossFit Garage», а не «кабинет провайдера». У кого лицо одно,
  // тот разницы не заметит; у кого их несколько — по подписи видит, где он.
  // ⚠️ Лица берутся у ОТКРЫТОГО КАБИНЕТА, а не у человека. Раздел кабинета клуба
  // отбирает данные этого клуба; раньше здесь стоял список всех лиц из стора,
  // и кабинет клуба Б показывал записи и публикации клуба А.
  const faces = useCabinetFaces();
  // ⚠️ Шаг 35.31. Какое лицо открыто, знает АДРЕС кабинета, а не состояние стора:
  // с адресными маршрутами это одно и то же лицо, но источник теперь один.
  // Отсюда же собираются ссылки на соседние разделы — они адресные тоже.
  const cabinet = useCabinet();
  const cabinetPath = cabinet.href;
  const cabinetTitle = cabinet.face?.name ?? FACE_CABINET_TITLE;

  // ⚠️ Шаг 35.20a. Свои публикации отбираются по ЛИЦАМ услуг из ответа
  // «кто я», а не по номеру владельца в карточке каталога: это поле из
  // публичной выдачи ушло — по нему кто угодно строил карту владельцев,
  // скачав каталог одним запросом.
  const providerClubs = useMemo(() => getProviderClubs(clubs, faces), [clubs, faces]);
  const providerTrainers = useMemo(() => getProviderTrainers(trainers, faces), [trainers, faces]);

  const clubIdSet = useMemo(() => new Set(providerClubs.map((c) => c.id)), [providerClubs]);
  const trainerIdSet = useMemo(
    () => new Set(providerTrainers.map((t) => t.id)),
    [providerTrainers],
  );

  const providerBookings = useMemo(
    () => bookings.filter((b) => belongsToProvider(b, clubIdSet, trainerIdSet)),
    [bookings, clubIdSet, trainerIdSet],
  );

  // Pending — все pending-записи, прилетевшие на entities провайдера.
  const pendingBookings = useMemo(
    () => providerBookings.filter((b) => b.status === 'pending'),
    [providerBookings],
  );

  // Approaching check-in: confirmed, slot уже закончился, окно check-in закрывается в ближайшие 6h.
  const approachingCheckInCount = useMemo(() => {
    const now = new Date().getTime();
    const slotById = new Map(schedule.map((slot) => [slot.id, slot]));

    return providerBookings.filter((b) => {
      if (b.status !== 'confirmed') return false;

      const slot = findBookingSlot(b, slotById);
      if (!slot) return false;

      // Конец занятия — по часам зала. Момент в поясе браузера сдвигал всё окно
      // отметки исхода на смещение пояса: счётчик «check-in истекает» зажигался
      // и гас не тогда, когда окно действительно закрывается на бэкенде.
      const endAt = getSlotEndAt(slot).getTime();
      const windowEnd = endAt + CHECK_IN_WINDOW_MS;
      const msLeft = windowEnd - now;

      return msLeft > 0 && msLeft <= APPROACHING_CHECKIN_WINDOW_MS;
    }).length;
  }, [providerBookings, schedule]);

  // Pending link-requests: club-side (кто-то предлагает привязку к моим клубам),
  // trainer-side (мои отправленные pending).
  const pendingLinksForClubs = useMemo(
    () => links.filter((l) => l.status === 'pending' && clubIdSet.has(l.clubId)),
    [links, clubIdSet],
  );
  const pendingLinksForTrainers = useMemo(
    () => links.filter((l) => l.status === 'pending' && trainerIdSet.has(l.trainerId)),
    [links, trainerIdSet],
  );
  const totalPendingLinks = pendingLinksForClubs.length + pendingLinksForTrainers.length;

  // Phase 26 Step 26.9: отзывы на managed-сущности и средний рейтинг для KPI.
  const providerReviews = useMemo(
    () =>
      getProviderReviews(
        reviews,
        providerClubs.map((c) => c.id),
        providerTrainers.map((t) => t.id),
      ),
    [reviews, providerClubs, providerTrainers],
  );

  const averageRating = useMemo(() => {
    if (providerReviews.length === 0) return 0;
    const sum = providerReviews.reduce((acc, r) => acc + r.rating, 0);
    return Math.round((sum / providerReviews.length) * 10) / 10;
  }, [providerReviews]);

  // ⚠️ Непрочитанных здесь БОЛЬШЕ НЕ СЧИТАЮТ (шаг 37.57). Число приходит готовым
  // из `unreadCount` — его считает база по ящику открытого кабинета.
  //
  // Правилось это место трижды, и первые два раза — вширь, а не вглубь. Сначала
  // считались все непрочитанные ЧЕЛОВЕКА, включая личные: сводка клуба показывала
  // уведомления о его собственной записи к чужому тренеру. Потом отбор сузился
  // до «есть адресат» — то есть до всех лиц СРАЗУ, и у владельца двух клубов оба
  // кабинета показывали одно число. И только третья правка назвала настоящую
  // причину: считать было нечего и незачем — массив приходил обрезанным потолком
  // выдачи, и верным число оставалось лишь до сотого уведомления.

  // KPI активных записей на сегодня и на ближайшие 7 дней.
  const { activeToday, activeWeek } = useMemo(() => {
    // Момент передаётся явно: `Intl` без аргумента берёт время в обход подменённых
    // часов, и такой расчёт нельзя ни проверить тестом, ни зафиксировать во времени.
    const todayKey = getDateKeyInTimeZone(new Date());
    // Граница недели — сдвиг календарного ключа. Прежний `addDays` шёл через полночь
    // в поясе браузера и на границе суток отдавал соседний день.
    const weekEndKey = shiftDateKey(todayKey, DAY_KEYS_IN_WEEK);

    let today = 0;
    let week = 0;

    for (const booking of providerBookings) {
      if (!ACTIVE_BOOKING_STATUSES.has(booking.status)) continue;
      if (booking.date < todayKey) continue;

      if (booking.date === todayKey) today += 1;
      if (booking.date < weekEndKey) week += 1;
    }

    return { activeToday: today, activeWeek: week };
  }, [providerBookings]);

  const hasClubSide = providerClubs.length > 0;
  const hasTrainerSide = providerTrainers.length > 0;
  const isEmpty = !hasClubSide && !hasTrainerSide;

  // Per-offering активные записи тренера: Map<trainerId, Array<{ offering, count }>>.
  const trainerOfferingsBreakdown = useMemo(() => {
    const map = new Map<EntityId, Array<{ offering: Offering; activeCount: number }>>();

    for (const trainer of providerTrainers) {
      const trainerOfferings = offerings.filter(
        (o) => o.ownerType === 'trainer' && o.ownerId === trainer.id,
      );

      const items = trainerOfferings.map((offering) => {
        const activeCount = providerBookings.filter(
          (b) => b.offeringId === offering.id && ACTIVE_BOOKING_STATUSES.has(b.status),
        ).length;

        return { offering, activeCount };
      });

      map.set(trainer.id, items);
    }

    return map;
  }, [providerTrainers, offerings, providerBookings]);

  // ⚠️ Шаг 35.34. Здесь стояла плашка «Доступ ограничен» — косметика поверх
  // УЖЕ отданных данных: пускать или нет, решает серверный лейаут, и решает
  // до похода за ними. Осталась одна причина ничего не рисовать: ответ
  // «кто я» ещё в пути, и номера человека нет.
  if (!user) {
    return null;
  }

  if (isEmpty) {
    return (
      <Card className="p-6 sm:p-8" data-testid="provider-dashboard-empty">
        <div className="flex flex-wrap gap-2">
          <Badge tone="outline">{cabinetTitle}</Badge>
        </div>
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-ink">
          Опубликуйте первую услугу
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          У вас пока нет ни клубов, ни тренеров. Начните с публикации — и здесь появятся записи,
          рейтинг надёжности и метрики.
        </p>
        <div className="mt-6">
          <Link
            href={`${cabinetPath}/publications`}
            className="inline-flex min-h-12 items-center justify-center rounded-pill bg-accent px-5 text-sm font-semibold text-ink transition-colors hover:bg-accent/90"
          >
            Перейти к публикации
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="provider-dashboard">
      {/* Шапка. */}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="outline">{cabinetTitle}</Badge>
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">
              Обзор, {user.name}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Что требует внимания прямо сейчас: заявки, ссылки тренер↔клуб, окна check-in.
            </p>
            {/* Мета-инфо пользователя (Phase 26 Step 26.5 — перенос из удалённого монолита). */}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
              {user.id != null ? (
                <span
                  data-testid="provider-dashboard-account-id"
                  className="font-mono text-xs"
                >{`ID: #${user.id}`}</span>
              ) : null}
              <span data-testid="provider-dashboard-city">
                {user.city ? `г. ${user.city}` : 'не указан'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI + attention-блоки. */}
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        data-testid="provider-dashboard-kpi"
      >
        <KpiCard
          testid="provider-dashboard-pending-bookings"
          label="Ожидают подтверждения"
          value={pendingBookings.length}
          caption="Pending-заявки атлетов"
          href={`${cabinetPath}/bookings?tab=pending`}
        />
        <KpiCard
          testid="provider-dashboard-pending-links"
          label="Заявки на привязку"
          value={totalPendingLinks}
          caption="Ожидающие ссылки тренер↔клуб"
          href={`${cabinetPath}/links`}
        />
        <KpiCard
          testid="provider-dashboard-approaching-checkin"
          label="Check-in истекает"
          value={approachingCheckInCount}
          caption="Меньше 6ч до конца окна (48ч после слота)"
          href={`${cabinetPath}/bookings?tab=check-in`}
        />
        <KpiCard
          testid="provider-dashboard-unread"
          label="Непрочитанные"
          value={unreadCount}
          caption="Новых уведомлений"
          href={`${cabinetPath}/notifications`}
        />
        <KpiCard
          testid="provider-dashboard-rating"
          label="Рейтинг"
          value={averageRating}
          caption="Средний балл отзывов"
          href={`${cabinetPath}/reviews`}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-canvas p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Активные записи сегодня
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">{activeToday}</p>
          <p className="mt-2 text-xs text-muted">pending + confirmed с датой = сегодня</p>
        </div>
        <div className="rounded-card border border-line bg-canvas p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Активные на неделе
          </p>
          <p className="mt-3 text-3xl font-semibold text-ink">{activeWeek}</p>
          <p className="mt-2 text-xs text-muted">В ближайшие 7 дней</p>
        </div>
      </section>

      {/* Club-side блок: список клубов + reliability + подсекции при желании. */}
      {hasClubSide ? (
        <Card className="p-6 sm:p-8" data-testid="provider-dashboard-clubs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold text-ink">Мои клубы</h2>
            <Badge tone="outline">{providerClubs.length}</Badge>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {providerClubs.map((club) => {
              const reliability = computeClubReliability(bookings, club.id);
              return (
                <li
                  key={club.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-4"
                >
                  <div>
                    <p className="text-base font-semibold text-ink">{club.name}</p>
                    <p className="mt-1 text-xs text-muted">{club.city}</p>
                  </div>
                  <ReliabilityBadge reliability={reliability} compact />
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* Trainer-side блок: список тренеров + reliability + per-offering разбивка при multi-offering. */}
      {hasTrainerSide ? (
        <Card className="p-6 sm:p-8" data-testid="provider-dashboard-trainers">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold text-ink">Мои тренеры</h2>
            <Badge tone="outline">{providerTrainers.length}</Badge>
          </div>
          <ul className="mt-4 flex flex-col gap-4">
            {providerTrainers.map((trainer) => {
              const reliability = computeTrainerReliability(bookings, trainer.id);
              const offeringsForTrainer = trainerOfferingsBreakdown.get(trainer.id) ?? [];
              const showPerOffering = offeringsForTrainer.length > 1;

              return (
                <li
                  key={trainer.id}
                  className="rounded-card border border-line bg-canvas p-4"
                  data-testid={`provider-dashboard-trainer-${trainer.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-base font-semibold text-ink">{trainer.name}</p>
                    <ReliabilityBadge reliability={reliability} compact />
                  </div>

                  {showPerOffering ? (
                    <ul
                      className="mt-3 flex flex-col gap-2"
                      data-testid={`provider-dashboard-trainer-offerings-${trainer.id}`}
                    >
                      {offeringsForTrainer.map(({ offering, activeCount }) => (
                        <li
                          key={offering.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-panel px-3 py-2 text-sm"
                        >
                          <span className="text-ink">{offering.title}</span>
                          <span className="text-xs font-semibold text-muted">
                            {activeCount} активных
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* Quick actions. */}
      <div className="flex flex-wrap gap-3" data-testid="provider-dashboard-quick-actions">
        <Link
          href={`${cabinetPath}/publications`}
          className="inline-flex min-h-12 items-center justify-center rounded-pill bg-accent px-5 text-sm font-semibold text-ink transition-colors hover:bg-accent/90"
        >
          Опубликовать новое
        </Link>
        <Link
          href={`${cabinetPath}/bookings`}
          className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Все записи
        </Link>
        <Link
          href={`${cabinetPath}/clients`}
          className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Мои клиенты
        </Link>
        <Link
          href={`${cabinetPath}/stats`}
          className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Статистика
        </Link>
      </div>
    </div>
  );
}
