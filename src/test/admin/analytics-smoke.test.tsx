/**
 * Smoke-тест Recharts: проверяем что базовые chart-компоненты
 * рендерятся без ошибок в среде jsdom.
 * ResponsiveContainer не используем в тестах — jsdom не поддерживает layout.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';

/* Recharts использует ResizeObserver — в jsdom его нет, мокаем */
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
  }
});

describe('Recharts smoke', () => {
  it('LineChart рендерится без ошибок', async () => {
    const { LineChart, Line, XAxis, YAxis } = await import('recharts');

    const data = [
      { date: '2026-04-10', count: 3 },
      { date: '2026-04-11', count: 7 },
      { date: '2026-04-12', count: 5 },
    ];

    const { container } = render(
      <LineChart width={400} height={300} data={data}>
        <XAxis dataKey="date" />
        <YAxis />
        <Line type="monotone" dataKey="count" stroke="#d85a32" />
      </LineChart>,
    );

    /* Recharts рендерит SVG внутри wrapper */
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('BarChart рендерится без ошибок', async () => {
    const { BarChart, Bar, XAxis, YAxis } = await import('recharts');

    const data = [
      { name: 'Футбол', count: 12 },
      { name: 'Бокс', count: 8 },
    ];

    const { container } = render(
      <BarChart width={400} height={300} data={data}>
        <XAxis dataKey="name" />
        <YAxis />
        <Bar dataKey="count" fill="#0c6f73" />
      </BarChart>,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
