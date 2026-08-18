/**
 * Phase 29 fix: компонент сжат до одной секции «Мои отзывы». Старый блок
 * «Базовые настройки» (дубль профиля + плашка «Редактирование появится позже»)
 * удалён — теперь редактирование живёт в `AccountCredentialsSection`.
 *
 * Параметры `accountTitle` и `user` оставлены в Props для обратной
 * совместимости вызывающих, но в render не используются.
 */
'use client';

import { useMemo, useState } from 'react';

import type { AuthSessionUser } from '@/stores/useAuthStore';
import { Badge, Button, Card, Rating } from '@/components/ui';
import { formatDate } from '@/lib/utils';

import type { AthleteReviewItem } from '@/components/profile/athlete-review-items';

type AthleteFeedbackSettingsSectionProps = {
  /** Не используется в текущем render; оставлено в API для обратной совместимости. */
  accountTitle?: string;
  reviewItems: AthleteReviewItem[];
  /** Не используется в текущем render; оставлено в API для обратной совместимости. */
  user?: AuthSessionUser;
};

const INITIAL_VISIBLE_REVIEWS_COUNT = 3;

export function AthleteFeedbackSettingsSection({
  reviewItems,
}: AthleteFeedbackSettingsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleReviewItems = useMemo(
    () => (isExpanded ? reviewItems : reviewItems.slice(0, INITIAL_VISIBLE_REVIEWS_COUNT)),
    [isExpanded, reviewItems],
  );
  const hasHiddenReviews = reviewItems.length > INITIAL_VISIBLE_REVIEWS_COUNT;

  return (
    <section data-testid="athlete-feedback-settings-section">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">My reviews</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Мои отзывы</h2>
        </div>

        <Badge tone="outline">{reviewItems.length} отзывов</Badge>
      </div>

      <Card className="mt-6 p-6 sm:p-7">
        {reviewItems.length > 0 ? (
          <>
            <div className="grid gap-4">
              {visibleReviewItems.map((reviewItem) => (
                <div key={reviewItem.id} className="rounded-card border border-line bg-canvas p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="outline">{reviewItem.targetTypeLabel}</Badge>
                      <Badge tone="success">
                        {formatDate(reviewItem.createdAt, {
                          day: 'numeric',
                          month: 'long',
                        })}
                      </Badge>
                    </div>

                    <Rating value={reviewItem.rating} />
                  </div>

                  <p className="mt-4 text-lg font-semibold text-ink">{reviewItem.targetName}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{reviewItem.text}</p>
                </div>
              ))}
            </div>

            {hasHiddenReviews ? (
              <div className="mt-5 flex justify-start">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsExpanded((currentValue) => !currentValue);
                  }}
                >
                  {isExpanded ? 'Скрыть отзывы' : 'Показать все отзывы'}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-card border border-line bg-canvas p-5">
            <p className="text-sm leading-relaxed text-muted">
              Ты ещё не оставлял отзывы. После новых оценок клубов и тренеров они появятся здесь.
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}
