'use client';

/**
 * Карточка публикации в разделе модерации: состояние, признаки очередей и действия.
 *
 * Вынесена из `ModerationPage` шагом 38.54: страница подошла к своему потолку строк,
 * а карточка получила два новых действия — «Подтвердить» и «Отозвать» проверку.
 *
 * Действия — по состоянию, как предусловия на сервере: подтвердить можно только
 * опубликованную и ещё не подтверждённую, отозвать — только подтверждённую; у скрытой
 * — только «Показать». Кнопки, которых сервер отбил бы 409, не рисуются вовсе.
 *
 * ⚠️ У кнопок действий подпись с именем публикации (`aria-label`): в списке из
 * пятнадцати строк пятнадцать одинаковых «Подтвердить» неразличимы для экранного
 * диктора — фаза 37 ловила это на трёх кнопках «Разобрать».
 */
import type { ReactNode } from 'react';

import { HIDE_KIND_LABELS, isHideKind } from '@sporthub/domain';
import type { CatalogOwnerType, HideKindValue } from '@sporthub/types';
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

const ACTION_BUTTON =
  'inline-flex w-full items-center justify-center whitespace-nowrap rounded-full px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-50 sm:w-auto';

const ACTION_TONES = {
  primary: 'border-0 bg-lime text-ink hover:bg-lime-hov',
  outline: 'border-2 border-lime bg-bg text-ink hover:bg-lime',
  danger:
    'border border-red/45 bg-transparent text-red hover:border-red hover:bg-red hover:text-card',
} as const;

export function ModerationItemCard({
  item,
  focused,
  actionLoading,
  onHide,
  onUnhide,
  onVerify,
  onUnverify,
}: {
  item: PublicationItem;
  /** Та самая публикация, ради которой перешли из уведомления. */
  focused: boolean;
  actionLoading: boolean;
  onHide: () => void;
  onUnhide: () => void;
  onVerify: () => void;
  onUnverify: () => void;
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
          <h3 className="m-0 break-words font-display text-[18px] uppercase leading-none tracking-tight text-ink">
            {item.name}
          </h3>
          <StateBadge tone="lime-fill">{item.type === 'club' ? 'Клуб' : 'Тренер'}</StateBadge>
          {isHidden ? (
            <StateBadge tone="muted">{hiddenLabel}</StateBadge>
          ) : isPending ? (
            // ⚠️ «Новая», а не «На проверке»: рядом живёт вторая очередь —
            // исправленные после скрытия. Прежняя подпись годилась обеим,
            // и модератор не мог понять, какую именно очередь он смотрит.
            <StateBadge tone="gold">Новая, на проверке</StateBadge>
          ) : (
            <StateBadge tone="lime-soft">Опубликовано</StateBadge>
          )}
          {/* Знак проверки — тот же, что видят люди в каталоге: один компонент, одна подпись. */}
          {isVerified ? <VerifiedBadge ownerType={item.type} /> : null}
          {/* Признак идёт рядом со скрытием, а не вместо него: публикация
              всё ещё вне каталога, но разбирательство уже сдвинулось. */}
          {isAwaitingRecheck ? (
            <StateBadge tone="gold">Исправлено, ждёт проверки</StateBadge>
          ) : null}
          {/* Бейдж наводки — рядом с состоянием, а не вместо него: он говорит,
              ПОЧЕМУ эта строка здесь, и ничего не сообщает о самой публикации. */}
          {focused ? <StateBadge tone="lime-fill">Из уведомления</StateBadge> : null}
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
          <button
            type="button"
            onClick={onUnhide}
            disabled={actionLoading}
            className={cn(ACTION_BUTTON, ACTION_TONES.primary)}
          >
            Показать
          </button>
        ) : (
          <>
            {isVerified ? (
              <button
                type="button"
                onClick={onUnverify}
                disabled={actionLoading}
                aria-label={`Отозвать: ${item.name}`}
                className={cn(ACTION_BUTTON, ACTION_TONES.danger)}
              >
                Отозвать
              </button>
            ) : isPending ? null : (
              <button
                type="button"
                onClick={onVerify}
                disabled={actionLoading}
                aria-label={`Подтвердить: ${item.name}`}
                className={cn(ACTION_BUTTON, ACTION_TONES.outline)}
              >
                Подтвердить
              </button>
            )}
            <button
              type="button"
              onClick={onHide}
              disabled={actionLoading}
              className={cn(ACTION_BUTTON, ACTION_TONES.danger)}
            >
              Скрыть
            </button>
          </>
        )}
      </div>
    </article>
  );
}

type StateTone = 'lime-fill' | 'lime-soft' | 'muted' | 'gold';

/** Плашка состояния карточки — компактнее общего `Badge`, тона раздела. */
function StateBadge({ tone, children }: { tone: StateTone; children: ReactNode }) {
  const classes: Record<StateTone, string> = {
    'lime-fill': 'border-transparent bg-lime text-ink',
    'lime-soft': 'border-lime/30 bg-lime-soft text-lime-hov',
    muted: 'border-line bg-card-2 text-muted',
    gold: 'border-gold/30 bg-gold/10 text-gold',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em]',
        classes[tone],
      )}
    >
      {children}
    </span>
  );
}
