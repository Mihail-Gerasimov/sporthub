// Phase 26 Step 26.3: UI-редактор per-type notification preferences в Settings.
// Group-секции (booking/links/reviews) из NOTIFICATION_TYPE_GROUP.
// REQUIRED_NOTIFICATION_TYPES — disabled + плашка «Нельзя отключить».
// Изменение чекбокса debounced (500мс) отправляет PATCH на
// /api/users/[id]/notification-preferences с полным снапшотом prefs и toast'ит
// результат через useToastStore.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useCabinet } from '@/components/profile/cabinet-context';
import type { ServiceFace } from '@/lib/service-faces';
import { getNotificationCopy } from '@/components/profile/notifications/notification-copy';
import { Badge, Card } from '@/components/ui';
import {
  NOTIFICATION_GROUP_KEYS,
  NOTIFICATION_TYPE_GROUP,
  canDisableNotificationType,
  isNotificationTypeEnabled,
  type NotificationGroupKey,
} from '@sporthub/domain';
import { useToastStore } from '@/stores/useToastStore';
import type { NotificationType } from '@sporthub/types';

const GROUP_TITLES: Record<NotificationGroupKey, string> = {
  booking: 'Записи',
  links: 'Связи',
  // Phase 29 Step 29.4: уведомления при отзывах.
  reviews: 'Отзывы',
  // Шаг 36.21: надзор — уведомления администратору о повторной проверке.
  moderation: 'Модерация',
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
}

/**
 * Ящик, чьи настройки правит редактор, — в виде параметров запроса.
 *
 * ⚠️ Найдено браузерным прогоном 10.09.2026. Настройки на лицо появились шагом 35.29,
 * а редактор о лицах не знал: в кабинете КЛУБА он правил ЛИЧНЫЙ ящик человека.
 * Владелец трёх клубов не мог заглушить один — галочка внутри кабинета клуба
 * гасила тип у всех лиц сразу. Тот же класс, что и лента уведомлений: разделение
 * сделано на сервере, а до браузера не дошло.
 *
 * Ящик берётся у ОТКРЫТОГО КАБИНЕТА, а не выбирается отдельным переключателем:
 * в кабинете клуба правятся настройки этого клуба, в личном — личные. Второй
 * выбор рядом с уже существующим адресом означал бы две правды об одном.
 */
function mailboxQuery(face: ServiceFace | null): string {
  if (face === null) return '';

  return `?faceType=${face.kind}&faceId=${face.id}`;
}

export function UserNotificationPreferencesEditor({ userId, notificationPreferences }: Props) {
  // ⚠️ Шаг 35.28a. Группы показываются все: какие уведомления человеку приходят,
  // решает его владение лицами, а не роль. Прежде группа «Связи» пряталась у атлета,
  // и человек с клубом не мог настроить то, что ему приходит.
  const visibleGroups: readonly NotificationGroupKey[] = NOTIFICATION_GROUP_KEYS;
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
  // Ящик берётся у открытого кабинета: в кабинете клуба правятся настройки клуба,
  // в личном — личные. `null` — личный кабинет.
  const face = useCabinet().face;

  // Phase 26 hotfix: при mount подтягиваем актуальные prefs через GET.
  // AuthSessionUser в store не содержит notificationPreferences (session-only),
  // поэтому при SSR-рендере мы не можем прокинуть prop; компонент сам читает свои
  // настройки с сервера. Пропускаем fetch, если prop явно передан (тесты/будущий SSR).
  useEffect(() => {
    if (notificationPreferences !== undefined) return;
    let cancelled = false;
    const loadPrefs = async () => {
      try {
        const response = await fetch(
          `/api/users/${userId}/notification-preferences${mailboxQuery(face)}`,
        );
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
  }, [userId, notificationPreferences, face]);

  // Группировка типов по NOTIFICATION_TYPE_GROUP — результат стабилен, считаем 1 раз.
  const typesByGroup = useMemo<Record<NotificationGroupKey, NotificationType[]>>(() => {
    const map: Record<NotificationGroupKey, NotificationType[]> = {
      booking: [],
      links: [],
      // Phase 29 Step 29.4: новая группа отзывов.
      reviews: [],
      // Шаг 36.21: надзор. У обычного человека эта группа пуста — уведомление
      // адресовано администратору, — и пустая вкладка ему не рисуется.
      moderation: [],
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
      const response = await fetch(
        `/api/users/${userId}/notification-preferences${mailboxQuery(face)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            preferences: nextPrefs,
            // Пара «вид + номер» называется целиком или не называется вовсе:
            // половина отвергается разбором.
            ...(face === null ? {} : { faceType: face.kind, faceId: face.id }),
          }),
        },
      );
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
        {/*
          ⚠️ Шаг 36.52, решение заказчика 22. Настройка применяется при ОТПРАВКЕ:
          выключенный тип не создаёт уведомления вовсе. Значит галочка обещает
          «больше не присылать», а не «убрать из ленты в том числе старое», —
          и цена решения (пропущенное не вернётся) названа человеку прямо,
          а не подразумевается.
        */}
        <p className="mt-1 text-sm text-muted">
          Выберите, какие события вы хотите получать в ленте и колокольчике. Настройка действует на
          новые уведомления: выключите — такие больше не придут, а пришедшие раньше останутся в
          ленте. Критичные уведомления (подтверждения и отмены провайдером) отключить нельзя.
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
              // Отбора по роли здесь больше нет: настройка принадлежит человеку,
              // и все типы своей группы показываются целиком (шаг 35.28a).
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
