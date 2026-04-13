/**
 * Таблица-рейтинг топ публикаций: top 10 по количеству записей.
 * Сортировка применена серверно.
 */
'use client';

import { Badge, Card, Skeleton } from '@/components/ui';

type TopEntity = {
  id: number;
  name: string;
  type: 'club' | 'trainer';
  bookings: number;
  rating: number;
};

type TopEntitiesTableProps = {
  data: TopEntity[];
  isLoading: boolean;
};

const TYPE_LABELS: Record<TopEntity['type'], string> = {
  club: 'Клуб',
  trainer: 'Тренер',
};

const TYPE_TONES: Record<TopEntity['type'], 'accent' | 'teal'> = {
  club: 'accent',
  trainer: 'teal',
};

export function TopEntitiesTable({ data, isLoading }: TopEntitiesTableProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="font-display text-lg font-semibold text-ink">Топ публикаций</h3>

      {isLoading ? (
        <Skeleton data-testid="chart-skeleton" className="h-[300px] w-full" />
      ) : data.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center">
          <p className="text-sm text-muted">Нет данных за выбранный период</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="pb-3 pr-4 font-semibold text-muted">#</th>
                <th className="pb-3 pr-4 font-semibold text-muted">Название</th>
                <th className="pb-3 pr-4 font-semibold text-muted">Тип</th>
                <th className="pb-3 pr-4 text-right font-semibold text-muted">Записи</th>
                <th className="pb-3 text-right font-semibold text-muted">Рейтинг</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entity, index) => (
                <tr key={`${entity.type}-${entity.id}`} className="border-b border-line/50">
                  <td className="py-3 pr-4 font-mono text-xs text-muted">{index + 1}</td>
                  <td className="py-3 pr-4 font-medium text-ink">{entity.name}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={TYPE_TONES[entity.type]}>{TYPE_LABELS[entity.type]}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold text-ink">{entity.bookings}</td>
                  <td className="py-3 text-right text-muted">{entity.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
