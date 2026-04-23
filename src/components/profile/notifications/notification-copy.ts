/**
 * Phase 24 Step 24.7: маппинг NotificationType → человекочитаемый заголовок + описание.
 * Используется в dropdown'е NotificationBell'а и в плоских списках на страницах
 * /profile/{athlete|provider}/notifications. payload опционален — у некоторых
 * типов нужен только статический текст.
 */
import type { NotificationType } from '@/types';

export interface NotificationCopy {
  /** Короткий заголовок карточки уведомления (bold). */
  title: string;
  /** Дополнительное описание или «пустой» текст — показывается под заголовком. */
  description?: string;
}

type CopyResolver = (payload: Record<string, unknown>) => NotificationCopy;

const COPY_MAP: Record<NotificationType, CopyResolver> = {
  // --- booking FSM ---
  booking_confirmed: () => ({
    title: 'Бронирование подтверждено',
    description: 'Провайдер подтвердил вашу запись — слот закреплён за вами.',
  }),
  booking_rejected: (payload) => {
    const reason = typeof payload.reason === 'string' ? payload.reason : null;
    return {
      title: 'Бронирование отклонено',
      description: reason
        ? `Причина: ${reason}`
        : 'Провайдер отклонил запись. Попробуйте другой слот.',
    };
  },
  booking_cancelled_by_athlete: () => ({
    title: 'Вы отменили бронирование',
    description: 'Запись снята. Если слот уже оплачен — следите за статусом возврата.',
  }),
  booking_cancelled_by_provider: () => ({
    title: 'Провайдер отменил запись',
    description: 'К сожалению, занятие не состоится. Выберите другой слот.',
  }),
  booking_completed: () => ({
    title: 'Занятие прошло',
    description: 'Как всё прошло? Оставьте отзыв — это поможет другим спортсменам.',
  }),
  booking_no_show: () => ({
    title: 'Отмечено «не пришёл»',
    description: 'Провайдер зафиксировал неявку. Это влияет на ваш рейтинг надёжности.',
  }),
  booking_auto_expired: () => ({
    title: 'Запись отменена автоматически',
    description: 'Провайдер не успел подтвердить слот вовремя.',
  }),
  // --- booking FSM — уведомления провайдеру (Phase 26 hotfix) ---
  booking_requested: () => ({
    title: 'Новая запись на ваш слот',
    description: 'Спортсмен записался на тренировку и ждёт подтверждения.',
  }),
  booking_cancelled_by_athlete_to_provider: () => ({
    title: 'Клиент отменил запись',
    description: 'Слот снова доступен для записи другими спортсменами.',
  }),
  booking_auto_expired_to_provider: () => ({
    title: 'Запись авто-отменена',
    description: 'Вы не успели подтвердить слот за час до начала — запись снята автоматически.',
  }),
  // --- trainer↔club link ---
  link_requested: () => ({
    title: 'Новый запрос от тренера',
    description: 'Тренер попросил привязаться к вашему клубу — подтвердите в кабинете.',
  }),
  link_approved: () => ({
    title: 'Клуб подтвердил связь',
    description: 'Тренер теперь отображается как работающий в клубе на публичных страницах.',
  }),
  link_rejected: () => ({
    title: 'Клуб отклонил связь',
    description: 'Можно попробовать отправить новый запрос позже.',
  }),
  link_revoked: () => ({
    title: 'Связь с клубом разорвана',
    description: 'Публичные страницы больше не показывают клуб рядом с тренером.',
  }),
  // --- карантин ---
  quarantine_start: () => ({
    title: 'Карантин записи',
    description: 'Из-за повторных отмен новые бронирования временно ограничены.',
  }),
  quarantine_end: () => ({
    title: 'Карантин снят',
    description: 'Вы снова можете записываться на слоты без ограничений.',
  }),
  quarantine_lifted_by_admin: () => ({
    title: 'Карантин снят администратором',
    description: 'Ограничения записи временно сняты службой поддержки.',
  }),
};

export function getNotificationCopy(
  type: NotificationType,
  payload: Record<string, unknown> = {},
): NotificationCopy {
  return COPY_MAP[type](payload);
}
