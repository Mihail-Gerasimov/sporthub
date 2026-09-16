/**
 * Тексты уведомлений: тип уведомления → заголовок и описание карточки.
 *
 * Читателей уже трое: выпадашка колокольчика в шапке, лента кабинета и редактор
 * настроек уведомлений; четвёртым станет надзорная лента администратора.
 *
 * ⚠️ Шаг 37.39. Модуль переехал из `components/profile/notifications/` в `lib/`.
 * Частью кабинета он перестал быть давно — колокольчик шапки зовёт его с фазы 24, —
 * а вот адрес об этом молчал, и служебной панели пришлось бы импортировать тексты
 * из чужого каркаса. Здесь ни состояния, ни разметки: чистый словарь.
 */
import type { NotificationType } from '@sporthub/types';

import { PUBLICATION_COPY, payloadText as text } from '@/lib/notification-copy-publications';

export interface NotificationCopy {
  /** Короткий заголовок карточки уведомления (bold). */
  title: string;
  /** Дополнительное описание или «пустой» текст — показывается под заголовком. */
  description?: string;
}

export type CopyResolver = (payload: Record<string, unknown>) => NotificationCopy;

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
    description: 'Провайдер зафиксировал неявку — занятие засчитано как пропущенное.',
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
  // Шаг 36.21: надзор. Владелец исправил публикацию, которую скрыл модератор,
  // и она ушла на повторную проверку. Единственное уведомление, адресованное
  // администратору: раньше в его ящике не было ни одной строки.
  publication_recheck_requested: (payload) => {
    const name = typeof payload.publicationName === 'string' ? payload.publicationName : '';
    return {
      title: 'Владелец исправил скрытую публикацию',
      description: name
        ? `«${name}» ждёт повторной проверки.`
        : 'Публикация ждёт повторной проверки.',
    };
  },
  // --- Фаза 37: надзорные события ------------------------------------------------
  //
  // ⚠️ Тексты пишутся для АДМИНИСТРАТОРА, а не для участника: он смотрит на чужое
  // действие со стороны. Поэтому здесь называются обе стороны там, где они есть, —
  // иначе строка «сменён пароль» не отвечает на главный вопрос «чей».
  oversight_impersonation_started: (payload) => {
    const target = text(payload.targetName) || text(payload.targetEmail);
    return {
      title: 'Работа от чужого лица',
      description: target
        ? `Администратор начал работать от лица «${target}».`
        : 'Администратор начал работать от чужого лица.',
    };
  },
  oversight_password_changed_by_admin: (payload) => {
    const target = text(payload.targetName) || text(payload.targetEmail);
    return {
      title: 'Администратор сменил чужой пароль',
      description: target
        ? `Пароль учётной записи «${target}» изменён не её владельцем.`
        : 'Пароль чужой учётной записи изменён администратором.',
    };
  },
  oversight_booking_hard_deleted: (payload) => {
    // ⚠️ Первым называется ЧЬЯ запись (нашёл браузерный прогон, 37.61). Прежде текст
    // печатал только занятие и дату, и главный вопрос — «у кого отняли» — оставался
    // без ответа. Имя приходит снимком: записи уже нет, сходить за ним некуда.
    const who = text(payload.athleteName);
    const slot = text(payload.slotTitle);
    const date = text(payload.date);
    const what = [slot, date].filter(Boolean).join(', ');

    return {
      title: 'Запись стёрта необратимо',
      description:
        [who && `Запись «${who}»`, what].filter(Boolean).join(' — ') ||
        'Чужая запись удалена администратором.',
    };
  },
  oversight_link_force_revoked: (payload) => {
    const detached = typeof payload.detachedCount === 'number' ? payload.detachedCount : undefined;
    return {
      title: 'Связь разорвана принудительно',
      description:
        detached === undefined
          ? 'Администратор разорвал связь тренера с клубом.'
          : `Администратор разорвал связь; занятий отцеплено: ${detached}.`,
    };
  },
  oversight_publication_deleted: (payload) => {
    const name = text(payload.publicationName);
    return {
      title: 'Публикация стёрта необратимо',
      description: name
        ? `«${name}» удалена вместе со всем, что на ней висело.`
        : 'Публикация удалена каскадом.',
    };
  },
  oversight_publication_hidden: (payload) => {
    const name = text(payload.publicationName);
    const reason = text(payload.reason);
    return {
      title: 'Публикация скрыта',
      description:
        [name && `«${name}»`, reason].filter(Boolean).join(' — ') ||
        'Публикация скрыта модератором.',
    };
  },
  oversight_publication_created: (payload) => {
    const name = text(payload.publicationName);
    return {
      title: 'Новое лицо в каталоге',
      // Премодерации нет: карточка встаёт в каталог сразу, и это единственная
      // точка, где надзор вообще может её увидеть — иначе только по жалобе.
      description: name
        ? `«${name}» опубликовано и уже видно людям.`
        : 'Новая публикация уже видна людям.',
    };
  },
  oversight_login_blocked: (payload) => {
    const key = text(payload.key);
    const exists = payload.accountExists === true;
    return {
      title: 'Вход заблокирован после подбора пароля',
      description: [
        key && `Ключ: ${key}.`,
        exists ? 'Учётная запись существует.' : 'Учётной записи с таким адресом нет.',
      ]
        .filter(Boolean)
        .join(' '),
    };
  },
  // --- Довесок к фазе 37: решения по публикации — её владельцу ---------------------
  //
  // ⚠️ Имя администратора в текстах НЕ называется — решение заказчика. Владельцу
  // важна причина, а не фамилия; имя превращает административное решение в личный
  // конфликт. В журнале и в очереди надзора исполнитель, разумеется, остаётся.
  // Решения по публикации — своя тема и свой модуль: см. `notification-copy-publications.ts`.
  ...PUBLICATION_COPY,
};

export function getNotificationCopy(
  type: NotificationType,
  payload: Record<string, unknown> = {},
): NotificationCopy {
  return COPY_MAP[type](payload);
}
