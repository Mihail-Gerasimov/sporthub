'use client';

/**
 * Страница модерации публикаций.
 * Отображает объединённый список клубов и тренеров с фильтрами,
 * поиском, пагинацией и действиями hide/unhide.
 */
import { useCallback, useEffect, useState } from 'react';

import type { City } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/stores/useAuthStore';

import { HideReasonModal } from './HideReasonModal';

/** Тип элемента из GET /api/publications */
interface PublicationItem {
  id: number;
  name: string;
  type: 'club' | 'trainer';
  city: string;
  sportIds: number[];
  status: string | undefined;
  createdAt: string;
  managedByUserId: number | undefined;
  hideReason?: string;
  hiddenAt?: string;
}

interface ModerationPageProps {
  sports: Array<{ id: number; name: string }>;
}

export function ModerationPage({ sports }: ModerationPageProps) {
  const user = useAuthStore((s) => s.user);

  // Динамический список городов для фильтра
  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    fetch('/api/cities')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setCities(json.data);
      })
      .catch(() => {});
  }, []);

  // Фильтры
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [search, setSearch] = useState('');

  // Данные
  const [items, setItems] = useState<PublicationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  // Модалка скрытия
  const [hideTarget, setHideTarget] = useState<PublicationItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (cityFilter) params.set('city', cityFilter);
    if (sportFilter) params.set('sportId', sportFilter);
    if (search.trim()) params.set('search', search.trim());
    params.set('offset', String(offset));
    params.set('limit', String(limit));

    try {
      const res = await fetch(`/api/publications?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data);
        setTotal(json.total);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, cityFilter, sportFilter, search, offset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Сброс offset при смене фильтров
  useEffect(() => {
    setOffset(0);
  }, [statusFilter, typeFilter, cityFilter, sportFilter, search]);

  const handleHide = async (reason: string) => {
    if (!hideTarget || !user) return;
    setActionLoading(true);
    try {
      await fetch('/api/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hide',
          entityType: hideTarget.type,
          entityId: hideTarget.id,
          moderatorId: user.id,
          reason,
        }),
      });
      setHideTarget(null);
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnhide = async (item: PublicationItem) => {
    if (!user || !confirm(`Показать публикацию «${item.name}»?`)) return;
    setActionLoading(true);
    try {
      await fetch('/api/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unhide',
          entityType: item.type,
          entityId: item.id,
          moderatorId: user.id,
        }),
      });
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Модерация публикаций</h1>
        <p className="mt-1 text-sm text-muted">
          Управление видимостью клубов и тренеров на платформе
        </p>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию..."
          className="w-full rounded-pill border border-line bg-canvas px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none sm:w-64"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-pill border border-line bg-canvas px-4 py-2.5 text-sm text-ink"
        >
          <option value="all">Все статусы</option>
          <option value="published">Опубликовано</option>
          <option value="hidden">Скрыто</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-pill border border-line bg-canvas px-4 py-2.5 text-sm text-ink"
        >
          <option value="all">Все типы</option>
          <option value="club">Клубы</option>
          <option value="trainer">Тренеры</option>
        </select>
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="rounded-pill border border-line bg-canvas px-4 py-2.5 text-sm text-ink"
        >
          <option value="">Все города</option>
          {cities.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value)}
          className="rounded-pill border border-line bg-canvas px-4 py-2.5 text-sm text-ink"
        >
          <option value="">Все виды спорта</option>
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Список публикаций */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-line bg-panel p-8 text-center text-muted">
          Публикации не найдены
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={`${item.type}-${item.id}`}
              className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{item.name}</span>
                  <Badge tone={item.type === 'club' ? 'accent' : 'teal'}>
                    {item.type === 'club' ? 'Клуб' : 'Тренер'}
                  </Badge>
                  {item.status === 'hidden' ? (
                    <Badge tone="danger">Скрыто</Badge>
                  ) : (
                    <Badge tone="success">Опубликовано</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted">
                  {item.city && <span>{item.city}</span>}
                  <span>
                    Создано:{' '}
                    {new Date(item.createdAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                {item.status === 'hidden' && item.hideReason && (
                  <p className="text-xs text-danger">Причина: {item.hideReason}</p>
                )}
              </div>
              <div className="shrink-0">
                {item.status === 'hidden' ? (
                  <button
                    type="button"
                    onClick={() => handleUnhide(item)}
                    disabled={actionLoading}
                    className="rounded-pill border border-success bg-success/10 px-4 py-2 text-sm font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50"
                  >
                    Показать
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setHideTarget(item)}
                    disabled={actionLoading}
                    className="rounded-pill border border-danger bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
                  >
                    Скрыть
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="rounded-pill border border-line px-4 py-2 text-muted transition-colors hover:text-ink disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-muted">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setOffset(offset + limit)}
            disabled={currentPage >= totalPages}
            className="rounded-pill border border-line px-4 py-2 text-muted transition-colors hover:text-ink disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      )}

      {/* Модалка скрытия */}
      <HideReasonModal
        open={!!hideTarget}
        onClose={() => setHideTarget(null)}
        onConfirm={handleHide}
        entityName={hideTarget?.name ?? ''}
        loading={actionLoading}
      />
    </div>
  );
}
