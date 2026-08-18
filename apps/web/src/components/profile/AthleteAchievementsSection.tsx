import { Badge, Card } from '@/components/ui';

import type {
  AthleteAchievement,
  AthleteAchievementProgressSummary,
} from '@/components/profile/athlete-achievements';

type AthleteAchievementsSectionProps = {
  achievements: AthleteAchievement[];
  progressSummary: AthleteAchievementProgressSummary;
};

export function AthleteAchievementsSection({
  achievements,
  progressSummary,
}: AthleteAchievementsSectionProps) {
  const unlockedAchievements = achievements.filter((achievement) => achievement.unlocked);
  const inProgressAchievements = achievements.filter((achievement) => !achievement.unlocked);

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Система прогресса
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink">Ачивки спортсмена</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="success">{progressSummary.unlockedAchievementsCount} открыто</Badge>
          {progressSummary.hasActiveBookingSignal ? (
            <Badge tone="teal">Активная запись учтена</Badge>
          ) : null}
          <Badge tone="outline">{progressSummary.overallProgressPercent}% общего прогресса</Badge>
        </div>
      </div>

      <div className="mt-6 rounded-card border border-line bg-canvas p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Общий прогресс</p>
          <span className="text-sm font-medium text-muted">
            {progressSummary.overallProgressPercent}%
          </span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-pill bg-panel">
          <div
            className="h-full rounded-pill bg-accent transition-[width]"
            style={{ width: `${progressSummary.overallProgressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink">Открытые ачивки</h3>
          <Badge tone="outline">{unlockedAchievements.length}</Badge>
        </div>

        {unlockedAchievements.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {unlockedAchievements.map((achievement) => (
              <div key={achievement.id} className="rounded-card border border-line bg-canvas p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-ink">{achievement.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {achievement.description}
                    </p>
                  </div>
                  <Badge tone="success">Готово</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-card border border-line bg-canvas p-4">
            <p className="text-sm leading-relaxed text-muted">
              Пока нет открытых ачивок. Прогресс начнёт наполняться по мере активности.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink">Ачивки в процессе</h3>
          <Badge tone="outline">{inProgressAchievements.length}</Badge>
        </div>

        {inProgressAchievements.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {inProgressAchievements.map((achievement) => {
              const progressPercent = Math.round((achievement.current / achievement.target) * 100);

              return (
                <div key={achievement.id} className="rounded-card border border-line bg-canvas p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-ink">{achievement.title}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {achievement.description}
                      </p>
                    </div>
                    <Badge tone="teal">
                      {achievement.current}/{achievement.target}
                    </Badge>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-pill bg-panel">
                    <div
                      className="h-full rounded-pill bg-teal transition-[width]"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-card border border-line bg-canvas p-4">
            <p className="text-sm leading-relaxed text-muted">
              Все MVP-ачивки уже открыты. Новые достижения добавим в следующих фазах.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
