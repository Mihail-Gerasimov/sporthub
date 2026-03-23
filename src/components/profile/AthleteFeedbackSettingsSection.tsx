'use client';

import { useMemo, useState } from 'react';

import { AUTH_STORAGE_KEY, type AuthSessionUser } from '@/stores/useAuthStore';
import { Badge, Button, Card, Rating } from '@/components/ui';
import { formatDate } from '@/lib/utils';

import type { AthleteReviewItem } from '@/components/profile/athlete-review-items';

type AthleteFeedbackSettingsSectionProps = {
  accountTitle: string;
  reviewItems: AthleteReviewItem[];
  user: AuthSessionUser;
};

const INITIAL_VISIBLE_REVIEWS_COUNT = 3;

export function AthleteFeedbackSettingsSection({
  accountTitle,
  reviewItems,
  user,
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
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Feedback and settings
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
            Отзывы и базовые настройки
          </h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="outline">{reviewItems.length} отзывов</Badge>
          <Badge tone="teal">Read only MVP</Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6 sm:p-7">
          <div data-testid="athlete-reviews-block">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink">Мои отзывы</h3>
              <Badge tone="outline">{reviewItems.length}</Badge>
            </div>

            {reviewItems.length > 0 ? (
              <>
                <div className="mt-4 grid gap-4">
                  {visibleReviewItems.map((reviewItem) => (
                    <div
                      key={reviewItem.id}
                      className="rounded-card border border-line bg-canvas p-4"
                    >
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
              <div className="mt-4 rounded-card border border-line bg-canvas p-5">
                <p className="text-sm leading-relaxed text-muted">
                  Ты ещё не оставлял отзывы. После новых оценок клубов и тренеров они появятся
                  здесь.
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6 sm:p-7">
          <div data-testid="athlete-settings-block">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink">Базовые настройки</h3>
              <Badge tone="outline">Auth MVP</Badge>
            </div>

            <div className="mt-4 grid gap-4">
              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Тип кабинета
                </p>
                <p className="mt-3 text-base font-semibold text-ink">{accountTitle}</p>
              </div>

              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Email для входа
                </p>
                <p className="mt-3 text-base font-semibold text-ink">{user.email}</p>
              </div>

              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Телефон
                </p>
                <p className="mt-3 text-base font-semibold text-ink">
                  {user.phone ?? 'Не добавлен'}
                </p>
              </div>

              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Хранилище сессии
                </p>
                <p className="mt-3 text-base font-semibold text-ink">Zustand + localStorage</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{AUTH_STORAGE_KEY}</p>
              </div>

              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="text-sm leading-relaxed text-muted">
                  Редактирование профиля и настроек появится в следующих фазах.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
