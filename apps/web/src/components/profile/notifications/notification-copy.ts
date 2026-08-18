/**
 * Phase 24 Step 24.7: маппинг NotificationType → человекочитаемый заголовок + описание.
 * Используется в dropdown'е NotificationBell'а и в плоских списках на страницах
 * /profile/{athlete|provider}/notifications. payload опционален — у некоторых
 * типов нужен только статический текст.
 */
import type { NotificationType } from '@sporthub/types';

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
    title: 'Тренировка отменена автоматически',
    description:
      'Провайдер не подтвердил вашу запись вовремя — слот освобождён. Выберите другой слот.',
  }),
  // --- booking FSM — уведомления провайдеру (Phase 26 hotfix, Phase 27 Step 27.7 — copy) ---
  booking_requested: () => ({
    title: 'Новая запись на ваш слот',
    description:
      'Спортсмен записался и ждёт подтверждения. Откройте раздел «Бронирования», чтобы ответить.',
  }),
  booking_cancelled_by_athlete_to_provider: () => ({
    title: 'Клиент отменил запись',
    description: 'Слот снова свободен — другие спортсмены смогут записаться.',
  }),
  booking_auto_expired_to_provider: () => ({
    title: 'Запись снята автоматически',
    description:
      'Вы не подтвердили запись за час до начала — слот освобождён. Старайтесь отвечать раньше.',
  }),
  // --- trainer↔club link ---
  // Phase 27 Step 27.9: copy зависит от инициатора. Club-initiated получает
  // manager тренера — текст «Клуб приглашает». Trainer-initiated получает
  // manager клуба — текст «Новый запрос от тренера».
  link_requested: (payload) => {
    const fromClub = payload.initiatedBy === 'club';
    return {
      title: fromClub ? 'Клуб приглашает к сотрудничеству' : 'Новый запрос от тренера',
      description: fromClub
        ? 'Клуб предложил вам привязаться. Откройте раздел «Связи», чтобы принять или отклонить.'
        : 'Тренер попросил привязаться к вашему клубу — подтвердите в кабинете.',
    };
  },
  // Phase 27 Step 27.11: dynamic copy — для club-initiated pending уведомление
  // уходит manager'у клуба (его приглашение приняли/отклонили), тексту «Клуб
  // подтвердил…» в этом случае не место. Смотрим payload.initiatedBy.
  link_approved: (payload) => {
    const trainerApproved = payload.initiatedBy === 'club';
    return {
      title: trainerApproved ? 'Тренер принял приглашение' : 'Клуб подтвердил связь',
      description: trainerApproved
        ? 'Тренер подтвердил сотрудничество — клуб отображается у него на странице.'
        : 'Тренер теперь отображается как работающий в клубе на публичных страницах.',
    };
  },
  link_rejected: (payload) => {
    const trainerRejected = payload.initiatedBy === 'club';
    return {
      title: trainerRejected ? 'Тренер отклонил приглашение' : 'Клуб отклонил связь',
      description: trainerRejected
        ? 'Можно попробовать пригласить другого тренера позже.'
        : 'Можно попробовать отправить новый запрос позже.',
    };
  },
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
  // --- Phase 29 Step 29.4: review-уведомления ---
  // Provider получает уведомление при поступлении нового отзыва на его клуб/тренера.
  // Имя автора, рейтинг и название entity подставляются из payload, если есть.
  review_received_by_provider: (payload) => {
    const authorName = typeof payload.authorName === 'string' ? payload.authorName : 'Спортсмен';
    const entityName = typeof payload.entityName === 'string' ? payload.entityName : '';
    const rating = typeof payload.rating === 'number' ? payload.rating : null;
    const ratingPart = rating !== null ? ` (${rating}★)` : '';
    return {
      title: 'Получен новый отзыв',
      description: entityName
        ? `${authorName} оставил отзыв${ratingPart} для «${entityName}».`
        : `${authorName} оставил новый отзыв${ratingPart}.`,
    };
  },
  // Athlete получает confirmation, что его отзыв опубликован.
  review_published_for_athlete: (payload) => {
    const entityName = typeof payload.entityName === 'string' ? payload.entityName : '';
    return {
      title: 'Ваш отзыв опубликован',
      description: entityName
        ? `Отзыв на «${entityName}» добавлен в общий список.`
        : 'Отзыв добавлен в общий список.',
    };
  },
};

export function getNotificationCopy(
  type: NotificationType,
  payload: Record<string, unknown> = {},
): NotificationCopy {
  return COPY_MAP[type](payload);
}
