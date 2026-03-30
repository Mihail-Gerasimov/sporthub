// Секция «Мои публикации» кабинета провайдера — единый список клубов и тренеров.
'use client';

import Link from 'next/link';

import { Badge, Card } from '@/components/ui';
import type { Club, Trainer } from '@/types';

type ProviderPublicationsSectionProps = {
  clubs: Club[];
  trainers: Trainer[];
};

/** Склонение слова «отзыв» по количеству */
function pluralizeReviews(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod100 >= 11 && mod100 <= 19) return `${count} отзывов`;
  if (mod10 === 1) return `${count} отзыв`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} отзыва`;

  return `${count} отзывов`;
}

/** Карточка публикации (клуб или тренер) */
function PublicationCard({
  name,
  type,
  rating,
  reviewCount,
  href,
}: {
  name: string;
  type: 'Клуб' | 'Тренер';
  rating: number;
  reviewCount: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      aria-label={name}
      className="group rounded-card border border-line bg-canvas p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-ink group-hover:text-accent">{name}</h3>
        <Badge tone={type === 'Клуб' ? 'success' : 'outline'}>{type}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm text-muted">
        <span className="font-semibold text-ink">{rating}</span>
        <span>{pluralizeReviews(reviewCount)}</span>
      </div>
    </Link>
  );
}

export function ProviderPublicationsSection({ clubs, trainers }: ProviderPublicationsSectionProps) {
  const hasPublications = clubs.length > 0 || trainers.length > 0;

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold text-ink">Мои публикации</h2>

      {hasPublications ? (
        <div data-testid="provider-publications-list" className="mt-6 grid gap-4 md:grid-cols-2">
          {clubs.map((club) => (
            <PublicationCard
              key={`club-${club.id}`}
              name={club.name}
              type="Клуб"
              rating={club.rating}
              reviewCount={club.reviewCount}
              href={`/clubs/${club.slug}`}
            />
          ))}

          {trainers.map((trainer) => (
            <PublicationCard
              key={`trainer-${trainer.id}`}
              name={trainer.name}
              type="Тренер"
              rating={trainer.rating}
              reviewCount={trainer.reviewCount}
              href={`/trainers/${trainer.slug}`}
            />
          ))}
        </div>
      ) : (
        <p
          data-testid="provider-publications-empty"
          className="mt-4 text-sm leading-relaxed text-muted"
        >
          У вас пока нет публикаций
        </p>
      )}
    </Card>
  );
}
