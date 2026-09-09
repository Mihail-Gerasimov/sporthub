// Phase 26 Step 26.3: UI-редактор per-type notification preferences в Settings.
// 3 group-секции (booking/links/quarantine) из NOTIFICATION_TYPE_GROUP.
// REQUIRED_NOTIFICATION_TYPES — disabled + плашка «Нельзя отключить».
// Изменение чекбокса debounced (500мс) отправляет PATCH на
// /api/users/[id]/notification-preferences с полным снапшотом prefs и toast'ит
// результат через useToastStore.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { getNotificationCopy } from '@/components/profile/notifications/notification-copy';
import { Badge, Card } from '@/components/ui';
import {
  NOTIFICATION_GROUP_KEYS,
  NOTIFICATION_TYPE_GROUP,
  canDisableNotificationType,
  isNotificationTypeApplicable,
  isNotificationTypeEnabled,
  type NotificationGroupKey,
} from '@sporthub/domain';
import { useToastStore } from '@/stores/useToastStore';
import type { NotificationType } from '@sporthub/types';

const GROUP_TITLES: Record<NotificationGroupKey, string> = {
  booking: 'Записи',
  links: 'Связи',
  quarantine: 'Дисциплина',
  // Phase 29 Step 29.4: уведомления при отзывах.
  reviews: 'Отзывы',
};

/** Задержка между кликом по чекбоксу и реальным PATCH — чтобы не спамить сеть при быстрых изменениях. */
const DEBOUNCE_MS = 500;

interface Props {
  /**
   * Чьи настройки правим. Номер уходит ТОЛЬКО в адрес маршрута — сервер сверяет
   * его с сессией и чужие настройки не отдаёт и не меняет. В теле запроса
   * такого поля больше нет: схема стала строгой и отвергает его.
   */
  userId: number;
  /** Текущие preferences (опционально). Undefined → все типы включены по умолчанию. */
  notificationPreferences?: Partial<Record<NotificationType, boolean>>;
  /**
   * Phase 26 Step 26.8: тип аккаунта, определяет видимость групп.
   * athlete не получает link_* уведомлений (все уходят провайдеру через
   * managedByUserId), поэтому группу `links` у атлета не рендерим вовсе.
   */
  accountType: 'athlete' | 'provider';
}

export function UserNotificationPreferencesEditor({
  userId,
  notificationPreferences,
  accountType,
}: Props) {
  // Phase 29 Step 29.4: 'reviews' видим обеим ролям (athlete получает
  // confirmation своего отзыва, provider — входящие отзывы клиентов).
  const visibleGroups: readonly NotificationGroupKey[] =
    accountType === 'athlete'
      ? (['booking', 'quarantine', 'reviews'] as const)
      : NOTIFICATION_GROUP_KEYS;
  // Локальный draft preferences — инициализируется фактическим состоянием user.
  // Для отсутствующих ключей isNotificationTypeEnabled вернёт true по дефолту.
  const [prefs, setPrefs] = useState<Partial<Record<NotificationType, boolean>>>(() => {
    const result: Partial<Record<NotificationType, boolean>> = {};
    for (const type of Object.keys(NOTIFICATION_TYPE_GROUP) as NotificationType[]) {
      result[type] = isNotificationTypeEnabled({ notificationPreferences }, type);
    }
    return result;
  });

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addToast = useToastStore((state) => state.addToast);

  // Phase 26 hotfix: при mount подтягиваем актуальные prefs через GET.
  // AuthSessionUser в store не содержит notificationPreferences (session-only),
  // поэтому при SSR-рендере мы не можем прокинуть prop; компонент сам читает свои
  // настройки с сервера. Пропускаем fetch, если prop явно передан (тесты/будущий SSR).
  useEffect(() => {
    if (notificationPreferences !== undefined) return;
    let cancelled = false;
    const loadPrefs = async () => {
      try {
        const response = await fetch(`/api/users/${userId}/notification-preferences`);
        if (!response.ok) return;
        const body = (await response.json()) as {
          success?: boolean;
          data?: { notificationPreferences?: Partial<Record<NotificationType, boolean>> };
        };
        if (cancelled || !body.success) return;
        const loaded = body.data?.notificationPreferences ?? {};
        const next: Partial<Record<NotificationType, boolean>> = {};
        for (const type of Object.keys(NOTIFICATION_TYPE_GROUP) as NotificationType[]) {
          next[type] = isNotificationTypeEnabled({ notificationPreferences: loaded }, type);
        }
        setPrefs(next);
      } catch {
        // silent — остаётся дефолтный state (всё включено)
      }
    };
    void loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [userId, notificationPreferences]);

  // Группировка типов по NOTIFICATION_TYPE_GROUP — результат стабилен, считаем 1 раз.
  const typesByGroup = useMemo<Record<NotificationGroupKey, NotificationType[]>>(() => {
    const map: Record<NotificationGroupKey, NotificationType[]> = {
      booking: [],
      links: [],
      quarantine: [],
      // Phase 29 Step 29.4: новая группа отзывов.
      reviews: [],
    };
    for (const [type, group] of Object.entries(NOTIFICATION_TYPE_GROUP) as Array<
      [NotificationType, NotificationGroupKey]
    >) {
      map[group].push(type);
    }
    return map;
  }, []);

  // Подчищаем зависший debounce-таймер при размонтировании, чтобы не слать stale PATCH.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const savePrefs = async (nextPrefs: Partial<Record<NotificationType, boolean>>) => {
    try {
      const response = await fetch(`/api/users/${userId}/notification-preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: nextPrefs }),
      });
      if (!response.ok) {
        addToast({ message: 'Не удалось сохранить настройки уведомлений', tone: 'error' });
        return;
      }
      addToast({ message: 'Настройки уведомлений сохранены', tone: 'success' });
    } catch {
      addToast({ message: 'Не удалось сохранить настройки уведомлений', tone: 'error' });
    }
  };

  const handleToggle = (type: NotificationType, nextValue: boolean) => {
    // Защита на уровне handler'а на случай, если disabled на input'е обойдут (например
    // автотесты через fireEvent.click на disabled input).
    if (!canDisableNotificationType(type)) return;

    const next = { ...prefs, [type]: nextValue };
    setPrefs(next);

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      void savePrefs(next);
    }, DEBOUNCE_MS);
  };

  return (
    <Card className="flex flex-col gap-5 p-6 sm:p-8" data-testid="notification-preferences-editor">
      <header>
        <h2 className="font-display text-xl font-semibold text-ink">Уведомления</h2>
        <p className="mt-1 text-sm text-muted">
          Выберите, какие события вы хотите получать в ленте и bell-иконке. Критичные уведомления
          (подтверждения, отмены провайдером, карантин) отключить нельзя.
        </p>
      </header>

      {visibleGroups.map((group) => (
        <section
          key={group}
          data-testid={`notification-preferences-group-${group}`}
          className="flex flex-col gap-2"
        >
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {GROUP_TITLES[group]}
          </h3>
          <ul className="flex flex-col gap-2">
            {typesByGroup[group]
              .filter((type) => isNotificationTypeApplicable(type, accountType))
              .map((type) => {
                const isRequired = !canDisableNotificationType(type);
                const label = getNotificationCopy(type).title;
                // `prefs[type]` может быть undefined только если тип не в NOTIFICATION_TYPE_GROUP
                // — но мы инициализируем каждый ключ в useState. Fallback true на всякий случай.
                const checked = prefs[type] ?? true;
                return (
                  <li key={type}>
                    <label className="flex flex-wrap items-center gap-3">
                      <input
                        type="checkbox"
                        data-testid={`notification-preferences-toggle-${type}`}
                        checked={checked}
                        disabled={isRequired}
                        onChange={(event) => handleToggle(type, event.target.checked)}
                        className="size-4 rounded border-line text-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <span className="text-sm text-ink">{label}</span>
                      {isRequired ? <Badge tone="outline">Нельзя отключить</Badge> : null}
                    </label>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </Card>
  );
}
