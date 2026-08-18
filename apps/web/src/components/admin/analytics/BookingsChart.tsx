/**
 * График записей за период — LineChart из Recharts.
 * Ось X — даты, ось Y — количество записей.
 */
'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { Card, Skeleton } from '@/components/ui';

type BookingsChartProps = {
  data: Array<{ date: string; count: number }>;
  isLoading: boolean;
};

export function BookingsChart({ data, isLoading }: BookingsChartProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="font-display text-lg font-semibold text-ink">Записи за период</h3>

      {isLoading ? (
        <Skeleton data-testid="chart-skeleton" className="h-[300px] w-full" />
      ) : data.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center">
          <p className="text-sm text-muted">Нет данных за выбранный период</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
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
            <Line
              type="monotone"
              dataKey="count"
              name="Записи"
              stroke="var(--ui-accent)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--ui-accent)' }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
