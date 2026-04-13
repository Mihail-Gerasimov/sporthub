/**
 * График активности платформы — AreaChart из Recharts.
 * Данные из логов Phase 20: количество действий по дням.
 */
'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { Card, Skeleton } from '@/components/ui';

type PlatformActivityChartProps = {
  data: Array<{ date: string; count: number }>;
  isLoading: boolean;
};

export function PlatformActivityChart({ data, isLoading }: PlatformActivityChartProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="font-display text-lg font-semibold text-ink">Активность платформы</h3>

      {isLoading ? (
        <Skeleton data-testid="chart-skeleton" className="h-[300px] w-full" />
      ) : data.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center">
          <p className="text-sm text-muted">Нет данных за выбранный период</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-line)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--ui-line)' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--ui-line)' }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--ui-panel)',
                border: '1px solid var(--ui-line)',
                borderRadius: '8px',
                fontSize: '13px',
              }}
              labelStyle={{ color: 'var(--ui-ink)', fontWeight: 600 }}
            />
            <Area
              type="monotone"
              dataKey="count"
              name="Действия"
              stroke="var(--ui-teal)"
              fill="var(--ui-teal)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
