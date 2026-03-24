// Секция «Отзывы на мои услуги» кабинета провайдера — отзывы на клубы и тренеров.
import { Badge, Card, Rating } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { Review } from '@/types';

type ProviderReviewsSectionProps = {
  reviews: Review[];
};

export function ProviderReviewsSection({ reviews }: ProviderReviewsSectionProps) {
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold text-ink">Отзывы на мои услуги</h2>

      {reviews.length > 0 ? (
        <div className="mt-6 grid gap-4">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-card border border-line bg-canvas p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="outline">{review.clubId ? 'Клуб' : 'Тренер'}</Badge>
                  <Badge tone="success">
                    {formatDate(review.createdAt, { day: 'numeric', month: 'long' })}
                  </Badge>
                </div>

                <Rating value={review.rating} />
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted">{review.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-muted">Нет отзывов</p>
      )}
    </Card>
  );
}
