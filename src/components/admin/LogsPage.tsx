/**
 * Клиентский компонент страницы логов активности платформы.
 * Хронологическая лента событий с фильтрами, пагинацией и автообновлением.
 * Phase 20 — Step 20.4.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge, Button, Card, Select, Skeleton } from '@/components/ui';
import type { LogAction, LogEntry } from '@/types';

// Маппинг LogAction → human-readable русские метки.
// Phase 24 добавляет 14 новых значений (FSM booking, trainer↔club-link, карантин,
// reliability, admin hard-delete); финальные формулировки уточняются в Step 24.15
// вместе с расширением фильтров страницы логов.
const ACTION_LABELS: Record<LogAction, string> = {
  publish_create: 'Публикация создана',
  publish_update: 'Публикация обновлена',
  publish_delete: 'Публикация удалена',
  booking_create: 'Запись создана',
  booking_cancel: 'Запись отменена',
  admin_login: 'Вход администратора',
  admin_impersonate_start: 'Impersonation начат',
  admin_impersonate_stop: 'Impersonation завершён',
  moderation_hide: 'Публикация скрыта',
  moderation_unhide: 'Публикация восстановлена',
  moderation_auto_restore: 'Публикация авто-восстановлена',
  // Phase 24 — FSM booking
  booking_confirm: 'Запись подтверждена',
  booking_reject: 'Запись отклонена',
  booking_check_in_completed: 'Check-in: тренировка проведена',
  booking_check_in_no_show: 'Check-in: спортсмен не пришёл',
  booking_auto_expire: 'Запись авто-отменена (истёк срок)',
  // Phase 24 — trainer↔club link
  link_request: 'Запрос привязки тренер↔клуб',
  link_approve: 'Привязка подтверждена',
  link_reject: 'Привязка отклонена',
  link_revoke: 'Привязка разорвана',
  // Phase 24 — карантин и reliability
  quarantine_start: 'Карантин начался',
  quarantine_end: 'Карантин завершён',
  quarantine_admin_lift: 'Карантин снят администратором',
  reliability_recompute: 'Рейтинг пересчитан',
  // Phase 24 — админский hard-delete
  admin_hard_delete_booking: 'Запись удалена администратором',
};

// Тон badge для типа действия
const ACTION_TONES: Record<string, 'teal' | 'accent' | 'neutral' | 'outline'> = {
  publish_create: 'teal',
  publish_update: 'neutral',
  publish_delete: 'accent',
  booking_create: 'teal',
  booking_cancel: 'accent',
  admin_login: 'outline',
  admin_impersonate_start: 'outline',
  admin_impersonate_stop: 'outline',
  moderation_hide: 'accent',
  moderation_unhide: 'teal',
  moderation_auto_restore: 'neutral',
};

// Тон badge для роли актора
const ROLE_LABELS: Record<string, string> = {
  athlete: 'Спортсмен',
  club_owner: 'Провайдер',
  trainer: 'Тренер',
  admin: 'Админ',
};

// Маппинг entityType → русское название
const ENTITY_TYPE_LABELS: Record<string, string> = {
  club: 'Клуб',
  trainer: 'Тренер',
  booking: 'Запись',
  user: 'Пользователь',
};

// Пресеты периодов
type PeriodFilter = 'all' | 'today' | 'week';

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 'all', label: 'Всё время' },
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Последняя неделя' },
];

// Опции фильтра по action
const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все действия' },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 30_000;

/** Вычисляет ISO-строку from/to для пресета периода */
function getPeriodRange(period: PeriodFilter): { from?: string; to?: string } {
  if (period === 'all') return {};

  const now = new Date();

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString() };
  }

  if (period === 'week') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { from: start.toISOString() };
  }

  return {};
}

/** Форматирует дату лога в читаемый вид */
function formatLogDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Сегодня, ${time}`;

  return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [actorFilter, setActorFilter] = useState('');
  const [autoPolling, setAutoPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Загружает логи из API с текущими фильтрами */
  const fetchLogs = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (actorFilter.trim()) params.set('actorId', actorFilter.trim());

      const period = getPeriodRange(periodFilter);
      if (period.from) params.set('from', period.from);
      if (period.to) params.set('to', period.to);

      params.set('offset', String(offset));
      params.set('limit', String(PAGE_SIZE));

      const response = await fetch(`/api/logs?${params.toString()}`);
      const json = await response.json();

      if (json.success) {
        setLogs(json.data);
        setTotal(json.total);
      }
    } catch {
      // Ошибка загрузки — сохраняем текущее состояние
    } finally {
      setLoading(false);
    }
  }, [actionFilter, periodFilter, actorFilter, offset]);

  // Загрузка при изменении фильтров или пагинации
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Автопoллинг
  useEffect(() => {
    if (autoPolling) {
      pollingRef.current = setInterval(fetchLogs, POLL_INTERVAL_MS);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [autoPolling, fetchLogs]);

  // Сброс offset при смене фильтров
  const handleActionChange = (value: string) => {
    setActionFilter(value);
    setOffset(0);
  };

  const handlePeriodChange = (value: string) => {
    setPeriodFilter(value as PeriodFilter);
    setOffset(0);
  };

  const handleActorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setActorFilter(event.target.value);
    setOffset(0);
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Заголовок и управление */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Логи активности</h1>

        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={fetchLogs}>
            Обновить
          </Button>

          <button
            type="button"
            onClick={() => setAutoPolling((prev) => !prev)}
            className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${autoPolling ? 'bg-success animate-pulse' : 'bg-line'}`}
            />
            {autoPolling ? 'Автообновление вкл' : 'Автообновление выкл'}
          </button>
        </div>
      </div>

      {/* Фильтры */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select
            label="Тип действия"
            value={actionFilter}
            onChange={(e) => handleActionChange(e.target.value)}
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Select
            label="Период"
            value={periodFilter}
            onChange={(e) => handlePeriodChange(e.target.value)}
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <div>
            <label htmlFor="actor-filter" className="mb-1 block text-sm font-medium text-muted">
              ID актора
            </label>
            <input
              id="actor-filter"
              type="text"
              inputMode="numeric"
              placeholder="Например, 2"
              value={actorFilter}
              onChange={handleActorChange}
              className="w-full rounded-card border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </Card>

      {/* Лента событий */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted">Нет событий по выбранным фильтрам</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <LogCard key={log.id} log={log} />
          ))}
        </div>
      )}

      {/* Пагинация */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {offset + 1}–{Math.min(offset + logs.length, total)} из {total}
          </p>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Назад
            </Button>
            <span className="flex items-center px-2 text-sm text-muted">
              {currentPage} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Далее
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Карточка одного лога */
function LogCard({ log }: { log: LogEntry }) {
  const actionLabel = ACTION_LABELS[log.action] ?? log.action;
  const actionTone = ACTION_TONES[log.action] ?? 'neutral';
  const roleLabel = ROLE_LABELS[log.actorRole] ?? log.actorRole;
  const entityLabel = ENTITY_TYPE_LABELS[log.entityType] ?? log.entityType;
  const metaName = log.meta?.name as string | undefined;

  return (
    <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={actionTone}>{actionLabel}</Badge>
          <span className="text-xs text-muted">
            {roleLabel} #{log.actorId}
          </span>
        </div>
        <p className="text-sm text-ink">
          {entityLabel} #{log.entityId}
          {metaName && <span className="text-muted"> — {metaName}</span>}
        </p>
      </div>

      <time className="shrink-0 text-xs text-muted" dateTime={log.createdAt}>
        {formatLogDate(log.createdAt)}
      </time>
    </Card>
  );
}
