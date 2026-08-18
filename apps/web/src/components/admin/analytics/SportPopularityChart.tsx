/**
 * График популярных видов спорта — BarChart из Recharts.
 * Ось X — виды спорта, ось Y — количество записей.
 */
'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import { Card, Skeleton } from '@/components/ui';

type SportPopularityChartProps = {
  data: Array<{ sportName: string; count: number }>;
  isLoading: boolean;
};

export function SportPopularityChart({ data, isLoading }: SportPopularityChartProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="font-display text-lg font-semibold text-ink">Популярные виды спорта</h3>

      {isLoading ? (
        <Skeleton data-testid="chart-skeleton" className="h-[300px] w-full" />
      ) : data.length === 0 ? (
        <div className="flex h-[300px] items-center justify-center">
          <p className="text-sm text-muted">Нет данных за выбранный период</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-line)" />
            <XAxis
              dataKey="sportName"
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
            <Bar dataKey="count" name="Записи" fill="var(--ui-teal)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
