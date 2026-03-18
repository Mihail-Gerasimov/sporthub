import { Rating } from '@/components/ui';
import { AUTH_STORAGE_KEY, type AuthSessionUser } from '@/stores/useAuthStore';
import { Badge, Card } from '@/components/ui';
import { formatDate } from '@/lib/utils';

import type { AthleteReviewItem } from '@/components/profile/athlete-review-items';

type AthleteFeedbackSettingsSectionProps = {
  accountTitle: string;
  reviewItems: AthleteReviewItem[];
  user: AuthSessionUser;
};

export function AthleteFeedbackSettingsSection({
  accountTitle,
  reviewItems,
  user,
}: AthleteFeedbackSettingsSectionProps) {
  return (
    <Card className="p-6 sm:p-8" data-testid="athlete-feedback-settings-section">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
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
        <div data-testid="athlete-reviews-block">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-ink">Мои отзывы</h3>
            <Badge tone="outline">{reviewItems.length}</Badge>
          </div>

          {reviewItems.length > 0 ? (
            <div className="mt-4 grid gap-4">
              {reviewItems.map((reviewItem) => (
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
                  <p className="mt-3 text-sm leading-7 text-muted">{reviewItem.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-card border border-line bg-canvas p-5">
              <p className="text-sm leading-7 text-muted">
                Ты ещё не оставлял отзывы. После новых оценок клубов и тренеров они появятся здесь.
              </p>
            </div>
          )}
        </div>

        <div data-testid="athlete-settings-block">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-ink">Базовые настройки</h3>
            <Badge tone="outline">Auth MVP</Badge>
          </div>

          <div className="mt-4 grid gap-4">
            <div className="rounded-card border border-line bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Тип кабинета
              </p>
              <p className="mt-3 text-base font-semibold text-ink">{accountTitle}</p>
            </div>

            <div className="rounded-card border border-line bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Email для входа
              </p>
              <p className="mt-3 text-base font-semibold text-ink">{user.email}</p>
            </div>

            <div className="rounded-card border border-line bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Телефон
              </p>
              <p className="mt-3 text-base font-semibold text-ink">{user.phone ?? 'Не добавлен'}</p>
            </div>

            <div className="rounded-card border border-line bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Хранилище сессии
              </p>
              <p className="mt-3 text-base font-semibold text-ink">Zustand + localStorage</p>
              <p className="mt-2 text-sm leading-7 text-muted">{AUTH_STORAGE_KEY}</p>
            </div>

            <div className="rounded-card border border-line bg-canvas p-4">
              <p className="text-sm leading-7 text-muted">
                Редактирование профиля и настроек появится в следующих фазах.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
