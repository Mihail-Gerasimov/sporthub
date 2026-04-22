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
  isNotificationTypeEnabled,
  type NotificationGroupKey,
} from '@/lib/notification-types';
import { useToastStore } from '@/stores/useToastStore';
import type { NotificationType } from '@/types';

const GROUP_TITLES: Record<NotificationGroupKey, string> = {
  booking: 'Записи',
  links: 'Связи',
  quarantine: 'Дисциплина',
};

/** Задержка между кликом по чекбоксу и реальным PATCH — чтобы не спамить сеть при быстрых изменениях. */
const DEBOUNCE_MS = 500;

interface Props {
  /** Id пользователя — используется в path PATCH-эндпоинта и body для ownership-guard. */
  userId: number;
  /** Текущие preferences (опционально). Undefined → все типы включены по умолчанию. */
  notificationPreferences?: Partial<Record<NotificationType, boolean>>;
}

export function UserNotificationPreferencesEditor({ userId, notificationPreferences }: Props) {
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

  // Группировка типов по NOTIFICATION_TYPE_GROUP — результат стабилен, считаем 1 раз.
  const typesByGroup = useMemo<Record<NotificationGroupKey, NotificationType[]>>(() => {
    const map: Record<NotificationGroupKey, NotificationType[]> = {
      booking: [],
      links: [],
      quarantine: [],
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
        body: JSON.stringify({ userId, preferences: nextPrefs }),
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

      {NOTIFICATION_GROUP_KEYS.map((group) => (
        <section
          key={group}
          data-testid={`notification-preferences-group-${group}`}
          className="flex flex-col gap-2"
        >
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {GROUP_TITLES[group]}
          </h3>
          <ul className="flex flex-col gap-2">
            {typesByGroup[group].map((type) => {
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
