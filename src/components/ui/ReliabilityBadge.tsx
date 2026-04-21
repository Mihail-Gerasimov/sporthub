// Phase 24 Step 24.13: общий бейдж рейтинга надёжности для атлета, клуба и тренера.
// Строится на основе ReliabilityResult из src/lib/reliability.ts.
// Логика видимости:
//   isNewUser=true → «Новый» (нейтрально, без числовых деталей)
//   badge='warning' → жёлтый «Умеренно надёжен»
//   badge='danger'  → красный «Низкая надёжность»
//   иначе (≥90% и >=5 completed) → бейдж скрыт (возвращает null)
import type { ReliabilityResult } from '@/lib/reliability';
import { Badge } from '@/components/ui/Badge';

export interface ReliabilityBadgeProps {
  reliability: ReliabilityResult;
  /** Раскрывать ли числовые данные (completed / no_show). Для owner/admin поверхностей. */
  showDetails?: boolean;
  /** Минимальный компактный режим — без description-текста. */
  compact?: boolean;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function ReliabilityBadge({
  reliability,
  showDetails = false,
  compact = false,
}: ReliabilityBadgeProps) {
  if (reliability.isNewUser) {
    return (
      <Badge tone="outline" data-testid="reliability-badge-new">
        {compact ? 'Новый' : 'Новый пользователь'}
      </Badge>
    );
  }

  if (reliability.badge === null) {
    // Надёжен → бейдж не показываем; оставляем null, чтобы layout не прыгал.
    return null;
  }

  const tone = reliability.badge === 'danger' ? 'danger' : 'warning';
  const label = reliability.badge === 'danger' ? 'Низкая надёжность' : 'Умеренно надёжен';
  const percent = formatPercent(reliability.completionRate);
  const detailText = showDetails
    ? ` · ${reliability.completedCount} из ${reliability.totalRelevant}`
    : '';

  return (
    <Badge tone={tone} data-testid={`reliability-badge-${reliability.badge}`}>
      {label} ({percent}
      {detailText})
    </Badge>
  );
}
