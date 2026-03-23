'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { useFilterStore } from '@/stores/useFilterStore';
import { useUIStore } from '@/stores/useUIStore';

const sports = [
  { id: 1, label: 'Йога' },
  { id: 3, label: 'Плавание' },
  { id: 8, label: 'Пилатес' },
];

export function StoreShowcase() {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const setSearch = useFilterStore((state) => state.setSearch);
  const setSport = useFilterStore((state) => state.setSport);
  const resetFilters = useFilterStore((state) => state.resetFilters);

  const isAuthModalOpen = useUIStore((state) => state.isAuthModalOpen);
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const closeAuthModal = useUIStore((state) => state.closeAuthModal);

  const selectedSport = sports.find((sport) => sport.id === selectedSportId);

  return (
    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Client state
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Zustand store preview</h2>
          </div>
          <Badge tone="teal">Step 5.2</Badge>
        </div>

        <Input
          label="Поисковый запрос"
          value={searchQuery}
          placeholder="Например, бокс или бассейн"
          icon={<span className="text-base text-muted">⌕</span>}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />

        <div className="space-y-3">
          <p className="text-sm font-medium text-muted">Выбранный спорт</p>
          <div className="flex flex-wrap gap-2">
            {sports.map((sport) => (
              <Chip
                key={sport.id}
                active={selectedSportId === sport.id}
                onClick={() => {
                  setSport(selectedSportId === sport.id ? null : sport.id);
                }}
              >
                {sport.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Badge tone="outline">
            search: {searchQuery.trim().length > 0 ? searchQuery : 'пусто'}
          </Badge>
          <Badge tone="accent">sport: {selectedSport ? selectedSport.label : 'не выбран'}</Badge>
        </div>

        <Button variant="ghost" onClick={resetFilters}>
          Сбросить filter store
        </Button>
      </Card>

      <Card elevated className="space-y-5 bg-panel-strong">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Cross-component state
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">UI store wiring</h2>
        </div>

        <div className="flex flex-wrap gap-3">
          <Badge tone={isAuthModalOpen ? 'success' : 'warning'}>
            auth: {isAuthModalOpen ? 'open' : 'closed'}
          </Badge>
          <Badge tone="outline">Кнопка «Войти» в header открывает это состояние</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button fullWidth variant="secondary" onClick={openAuthModal}>
            Открыть auth state
          </Button>
          <Button fullWidth variant="outline" onClick={closeAuthModal}>
            Закрыть auth state
          </Button>
        </div>

        <p className="text-sm leading-relaxed text-muted">
          На этом шаге модалки ещё нет. Здесь мы только фиксируем и проверяем реактивное клиентское
          состояние перед сборкой поиска, фильтров и auth flow.
        </p>
      </Card>
    </section>
  );
}
