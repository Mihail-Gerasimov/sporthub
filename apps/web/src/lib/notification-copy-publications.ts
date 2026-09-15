/**
 * Тексты уведомлений темы «Публикации»: решения площадки по публикации владельца.
 *
 * Своя тема — свой модуль (фаза 38, шаг 38.43). Здесь письма владельцу о скрытии
 * и возврате (довесок фазы 37) и о подтверждении и его отзыве (фаза 38), а также
 * надзорная строка об отзыве подтверждения. `notification-copy.ts` собирает из этого
 * словаря общую карту; читателей у него нет, кроме неё.
 *
 * ⚠️ Имени администратора в письмах владельцу НЕТ — решение заказчика: владельцу
 * важна причина, а не фамилия. В надзорной строке исполнитель остаётся.
 */
import type { NotificationType } from '@sporthub/types';

import type { CopyResolver } from '@/lib/notification-copy';

/** Строка из `payload` или пусто: тексты не имеют права печатать `undefined`. */
export function payloadText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const text = payloadText;

/** Типы темы «Публикации» — ровно те, чьи тексты живут здесь. */
type PublicationNotificationType = Extract<
  NotificationType,
  | 'publication_hidden_for_owner'
  | 'publication_unhidden_for_owner'
  | 'publication_verified_for_owner'
  | 'publication_verification_revoked_for_owner'
  | 'oversight_verification_revoked'
>;

export const PUBLICATION_COPY: Record<PublicationNotificationType, CopyResolver> = {
  publication_hidden_for_owner: (payload) => {
    const name = text(payload.publicationName);
    const reason = text(payload.reason);

    return {
      title: name ? `Публикация «${name}» скрыта` : 'Публикация скрыта',
      // Причина — главное в этом письме: без неё человек не знает, что исправлять.
      // Хвост про записи — не украшение: публикации нет в каталоге, и человек должен
      // понимать, почему у него перестали появляться заявки.
      description: reason
        ? `Причина: ${reason}. Публикация не видна в каталоге, новые записи не приходят.`
        : 'Публикация не видна в каталоге, новые записи не приходят.',
    };
  },
  publication_unhidden_for_owner: (payload) => {
    const name = text(payload.publicationName);

    return {
      title: name ? `Публикация «${name}» вернулась в каталог` : 'Публикация вернулась в каталог',
      description: 'Она снова видна людям, записи приходят как прежде.',
    };
  },
  // --- Фаза 38, шаг 38.43: верификация публикации ---
  publication_verified_for_owner: (payload) => {
    const name = text(payload.publicationName);

    return {
      title: name ? `Публикация «${name}» подтверждена` : 'Публикация подтверждена',
      description: 'Площадка проверила её: на карточке появился знак «проверено».',
    };
  },
  publication_verification_revoked_for_owner: (payload) => {
    const name = text(payload.publicationName);
    const reason = text(payload.reason);

    return {
      title: name ? `Подтверждение «${name}» отозвано` : 'Подтверждение отозвано',
      // Причина — главное: без неё человек не знает, что исправлять. Имени
      // администратора здесь нет — решение заказчика, как и у скрытия.
      description: reason
        ? `Причина: ${reason}. Знак «проверено» с карточки снят.`
        : 'Знак «проверено» с карточки снят.',
    };
  },
  oversight_verification_revoked: (payload) => {
    const name = text(payload.publicationName);
    const reason = text(payload.reason);

    return {
      title: 'Подтверждение отозвано',
      description:
        [name && `«${name}»`, reason].filter(Boolean).join(' — ') ||
        'Подтверждение публикации отозвано администратором.',
    };
  },
  // --- Фаза 38, шаг 38.43: верификация публикации ---
  publication_verified_for_owner: (payload) => {
    const name = text(payload.publicationName);

    return {
      title: name ? `Публикация «${name}» подтверждена` : 'Публикация подтверждена',
      description: 'Площадка проверила её: на карточке появился знак «проверено».',
    };
  },
  publication_verification_revoked_for_owner: (payload) => {
    const name = text(payload.publicationName);
    const reason = text(payload.reason);

    return {
      title: name ? `Подтверждение «${name}» отозвано` : 'Подтверждение отозвано',
      // Причина — главное: без неё человек не знает, что исправлять.
      description: reason
        ? `Причина: ${reason}. Знак «проверено» с карточки снят.`
        : 'Знак «проверено» с карточки снят.',
    };
  },
  oversight_verification_revoked: (payload) => {
    const name = text(payload.publicationName);
    const reason = text(payload.reason);

    return {
      title: 'Подтверждение отозвано',
      description:
        [name && `«${name}»`, reason].filter(Boolean).join(' — ') ||
        'Подтверждение публикации отозвано администратором.',
    };
  },
};
