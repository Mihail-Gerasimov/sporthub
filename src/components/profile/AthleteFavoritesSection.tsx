import { Badge, Card } from '@/components/ui';
import { buildDictMap, formatCityDisplay } from '@/lib/utils';

import type { AthleteFavoriteTrainer } from '@/components/profile/athlete-favorites';
import type { Club, Specialty } from '@/types';

type AthleteFavoritesSectionProps = {
  favoriteClubs: Club[];
  favoriteTrainers: AthleteFavoriteTrainer[];
  /** Справочник специализаций для резолвинга specialtyIds → имена */
  specialties?: Specialty[];
};

export function AthleteFavoritesSection({
  favoriteClubs,
  favoriteTrainers,
  specialties = [],
}: AthleteFavoritesSectionProps) {
  // Справочник для O(1) lookup specialtyId → name
  const specialtyMap = buildDictMap(specialties);
  const hasFavorites = favoriteClubs.length > 0 || favoriteTrainers.length > 0;

  return (
    <section data-testid="athlete-favorites-section">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Saved picks
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Избранное</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="outline">{favoriteClubs.length} клубов</Badge>
          <Badge tone="teal">{favoriteTrainers.length} тренеров</Badge>
        </div>
      </div>

      {hasFavorites ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card className="min-w-0 p-6 sm:p-7" data-testid="athlete-favorite-clubs-card">
            <div data-testid="athlete-favorite-clubs">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-ink">Избранные клубы</h3>
                <Badge tone="outline">{favoriteClubs.length}</Badge>
              </div>

              <div className="mt-4 grid gap-4">
                {favoriteClubs.map((club) => (
                  <div key={club.id} className="rounded-card border border-line bg-canvas p-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="outline">{formatCityDisplay(club.city)}</Badge>
                      {club.isFeatured ? <Badge tone="success">Featured</Badge> : null}
                    </div>
                    <p className="mt-4 text-lg font-semibold text-ink">{club.name}</p>
                    <p className="mt-2 line-clamp-3 break-all text-sm leading-relaxed text-muted">
                      {club.shortDescription}
                    </p>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                      {club.address}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="min-w-0 p-6 sm:p-7" data-testid="athlete-favorite-trainers-card">
            <div data-testid="athlete-favorite-trainers">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-ink">Избранные тренеры</h3>
                <Badge tone="outline">{favoriteTrainers.length}</Badge>
              </div>

              <div className="mt-4 grid gap-4">
                {favoriteTrainers.map((trainer) => (
                  <div key={trainer.id} className="rounded-card border border-line bg-canvas p-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="teal">{trainer.reasonLabel}</Badge>
                    </div>
                    <p className="mt-4 text-lg font-semibold text-ink">{trainer.name}</p>
                    <p className="mt-2 line-clamp-3 break-all text-sm leading-relaxed text-muted">
                      {trainer.bio}
                    </p>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                      {trainer.specialtyIds
                        .map((id) => specialtyMap.get(id)?.name ?? `#${id}`)
                        .join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="mt-6 p-5 sm:p-6">
          <p className="text-sm leading-relaxed text-muted">
            Пока нет сохранённых клубов и тренеров. Этот блок заполнится по мере развития
            MVP-избранного.
          </p>
        </Card>
      )}
    </section>
  );
}
