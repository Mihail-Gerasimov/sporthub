'use client';

/**
 * Карточка публикации в разделе модерации: состояние, признаки очередей и действия.
 *
 * Вынесена из `ModerationPage` шагом 38.54: страница подошла к своему потолку строк,
 * а карточка получила два новых действия — «Подтвердить» и «Отозвать» проверку.
 * Плашки и кнопки — `ui/Badge` и `ui/Button` (правка по ревью 38.54): своей второй
 * пилюли у раздела нет, недостающие тон `pending` и вариант `danger` добавлены в словари.
 *
 * Действия — по состоянию, как предусловия на сервере: подтвердить можно только
 * опубликованную и ещё не подтверждённую, отозвать — только подтверждённую; у скрытой
 * — только «Показать». Кнопки, которых сервер отбил бы 409, не рисуются вовсе.
 * Нужна ли действию причина, карточка не знает: это решает словарь действий домена
 * в самой странице.
 *
 * ⚠️ У кнопок действий подпись с именем публикации (`aria-label`): в списке из
 * пятнадцати строк пятнадцать одинаковых «Подтвердить» неразличимы для экранного
 * диктора — фаза 37 ловила это на трёх кнопках «Разобрать».
 *
 * Почему не `ui/Card`: строка модерации — составная (`Badge` + `VerifiedBadge` +
 * `Button` + причина скрытия) сеткой «данные | действия» с обводкой по состоянию
 * очереди; `Card` — одна поверхность без слотов под действия. Собрана из частей
 * `ui/*`, а не поверх `Card`, чтобы не вкладывать обводку в обводку.
 */
import { HIDE_KIND_LABELS, isHideKind, type ModerationAction } from '@sporthub/domain';
import type { CatalogOwnerType, HideKindValue } from '@sporthub/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { cn } from '@/lib/utils';

/** Тип элемента из GET /api/publications */
export interface PublicationItem {
  id: number;
  name: string;
  type: CatalogOwnerType;
  city: string;
  sportIds: number[];
  status: string | undefined;
  createdAt: string;
  managedByUserId: number | undefined;
  hideReason?: string;
  hiddenAt?: string;
  /** Вид скрытия: архив владельца или работа модератора (шаг 36.12). */
  hiddenKind?: HideKindValue;
  /** Владелец исправил скрытую публикацию, она ждёт повторной проверки. */
  awaitingRecheck?: boolean;
  /** Когда площадка проверила публикацию; пусто — не проверена (38.54). */
  verifiedAt?: string;
}

export function ModerationItemCard({
  item,
  focused,
  actionLoading,
  onAction,
}: {
  item: PublicationItem;
  /** Та самая публикация, ради которой перешли из уведомления. */
  focused: boolean;
  actionLoading: boolean;
  /** Действие по словарю домена; причину, если она нужна, спросит страница. */
  onAction: (action: ModerationAction) => void;
}) {
  const isHidden = item.status === 'hidden';
  const isPending = item.status === 'pending';
  const isVerified = item.verifiedAt !== undefined;
  // Признак повторной проверки: владелец исправил то, что скрыл модератор.
  const isAwaitingRecheck = item.awaitingRecheck === true;
  /**
   * Подпись скрытия берётся из словаря `@sporthub/domain` по ПРИЗНАКУ вида,
   * а не сравнением текста причины с константой: иначе владельцу достаточно
   * вписать служебную строку руками, чтобы его архив выглядел работой модератора.
   * Публикации, скрытые до появления признака, остаются с прежней подписью.
   */
  const hiddenLabel = isHideKind(item.hiddenKind) ? HIDE_KIND_LABELS[item.hiddenKind] : 'Скрыто';
  const dateLabel = new Date(item.createdAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <article
      className={cn(
        'grid grid-cols-1 items-center gap-x-4 gap-y-3.5 rounded-[16px] border bg-card p-[18px] sm:p-[18px_22px] xl:grid-cols-[1fr_auto]',
        focused ? 'border-lime' : 'border-line',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Заголовок карточки — шкалой `t-h3` (38.109): Inter 600, обычный регистр. */}
          <h3 className="t-h3 m-0 break-words text-ink">{item.name}</h3>
          <Badge tone="outline">{item.type === 'club' ? 'Клуб' : 'Тренер'}</Badge>
          {isHidden ? (
            <Badge tone="neutral">{hiddenLabel}</Badge>
          ) : isPending ? (
            // ⚠️ «Новая», а не «На проверке»: рядом живёт вторая очередь —
            // исправленные после скрытия. Прежняя подпись годилась обеим,
            // и модератор не мог понять, какую именно очередь он смотрит.
            <Badge tone="pending">Новая, на проверке</Badge>
          ) : (
            <Badge tone="success">Опубликовано</Badge>
          )}
          {/* Знак проверки — тот же, что видят люди в каталоге: один компонент, одна подпись. */}
          {isVerified ? <VerifiedBadge ownerType={item.type} /> : null}
          {/* Признак идёт рядом со скрытием, а не вместо него: публикация
              всё ещё вне каталога, но разбирательство уже сдвинулось. */}
          {isAwaitingRecheck ? <Badge tone="pending">Исправлено, ждёт проверки</Badge> : null}
          {/* Бейдж наводки — рядом с состоянием, а не вместо него: он говорит,
              ПОЧЕМУ эта строка здесь, и ничего не сообщает о самой публикации. */}
          {focused ? <Badge tone="accent">Из уведомления</Badge> : null}
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs font-medium text-muted">
          {item.city && <span>{item.city}</span>}
          {item.city ? (
            <span
              aria-hidden="true"
              className="inline-block h-[3px] w-[3px] rounded-full bg-disabled"
            />
          ) : null}
          <span>Создано: {dateLabel}</span>
        </p>
        {isHidden && item.hideReason ? (
          <p className="m-0 text-xs font-medium text-red">Причина: {item.hideReason}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {isHidden ? (
          <Button size="sm" onClick={() => onAction('unhide')} disabled={actionLoading}>
            Показать
          </Button>
        ) : (
          <>
            {isVerified ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => onAction('unverify')}
                disabled={actionLoading}
                aria-label={`Отозвать: ${item.name}`}
              >
                Отозвать
              </Button>
            ) : isPending ? null : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onAction('verify')}
                disabled={actionLoading}
                aria-label={`Подтвердить: ${item.name}`}
              >
                Подтвердить
              </Button>
            )}
            <Button
              size="sm"
              variant="danger"
              onClick={() => onAction('hide')}
              disabled={actionLoading}
            >
              Скрыть
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
