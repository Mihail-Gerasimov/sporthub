// Секция «Мои отзывы» атлета (Step 25.6). Выделена из AthleteFeedbackSettingsSection как
// самостоятельный компонент для монтирования на /profile/athlete/reviews. Поведение
// expand/collapse сохранено — первые 3 отзыва видны сразу, остальные по кнопке.
// В AthleteFeedbackSettingsSection блок отзывов временно остаётся для совместимости —
// финальная дедупликация после Step 25.17 (когда settings и reviews будут разделены в навигации).
'use client';

import { useMemo, useState } from 'react';

import { Badge, Button, Card, Rating } from '@/components/ui';
import { formatDate } from '@/lib/utils';

import type { AthleteReviewItem } from '@/components/profile/athlete-review-items';

type AthleteReviewsSectionProps = {
  reviewItems: AthleteReviewItem[];
};

const INITIAL_VISIBLE_REVIEWS_COUNT = 3;

export function AthleteReviewsSection({ reviewItems }: AthleteReviewsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleReviewItems = useMemo(
    () => (isExpanded ? reviewItems : reviewItems.slice(0, INITIAL_VISIBLE_REVIEWS_COUNT)),
    [isExpanded, reviewItems],
  );
  const hasHiddenReviews = reviewItems.length > INITIAL_VISIBLE_REVIEWS_COUNT;

  return (
    <section data-testid="athlete-reviews-section">
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
                  onClick={() => setIsExpanded((current) => !current)}
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
