import { Badge, Card } from '@/components/ui';
import { formatDate } from '@/lib/utils';

import type { AthleteHistoryItem } from '@/components/profile/athlete-history';

type AthleteHistorySectionProps = {
  historyItems: AthleteHistoryItem[];
};

function getPersonalTrainingLabel(count: number) {
  if (count === 1) {
    return '1 персональная тренировка';
  }

  if (count >= 2 && count <= 4) {
    return `${count} персональные тренировки`;
  }

  return `${count} персональных тренировок`;
}

export function AthleteHistorySection({ historyItems }: AthleteHistorySectionProps) {
  const visitedClubsCount = new Set(
    historyItems.flatMap((item) => (item.clubId === null ? [] : [item.clubId])),
  ).size;
  const personalTrainingsCount = historyItems.filter(
    (item) => item.formatLabel === 'Персональная тренировка',
  ).length;

  return (
    <Card className="p-6 sm:p-8" data-testid="athlete-history-section">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Activity archive
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink">История</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="outline">{historyItems.length} завершено</Badge>
          <Badge tone="outline">{visitedClubsCount} клубов</Badge>
          <Badge tone="teal">{getPersonalTrainingLabel(personalTrainingsCount)}</Badge>
        </div>
      </div>

      {historyItems.length > 0 ? (
        <div className="mt-6 grid gap-4">
          {historyItems.map((historyItem) => (
            <div
              key={historyItem.id}
              className="grid gap-4 rounded-card border border-line bg-canvas p-4 md:grid-cols-[1.4fr_1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="outline">{historyItem.formatLabel}</Badge>
                  <Badge tone="success">{historyItem.reviewStatusLabel}</Badge>
                </div>

                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {historyItem.clubName}
                </p>
                <p className="mt-2 text-xl font-semibold text-ink">{historyItem.title}</p>
                <p className="mt-2 text-sm leading-7 text-muted">{historyItem.trainerName}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Дата и время
                </p>
                <p className="mt-2 text-base font-semibold text-ink">
                  {formatDate(historyItem.date, {
                    day: 'numeric',
                    month: 'long',
                  })}
                </p>
                <p className="mt-1 text-sm leading-7 text-muted">{historyItem.startTime}</p>
              </div>

              <div className="flex items-start md:justify-end">
                <Badge tone="outline">Завершено</Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-card border border-line bg-canvas p-5">
          <p className="text-sm leading-7 text-muted">
            История пока пустая. Завершённые занятия и связанные отзывы появятся здесь
            автоматически.
          </p>
        </div>
      )}
    </Card>
  );
}
