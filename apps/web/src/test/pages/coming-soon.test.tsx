/**
 * Страница «раздел в разработке» (шаг 38.56): заголовок, объяснение и путь назад.
 * Сюда ведут пункты меню «Командные» и «Маркет» — разделы вне фазы 38.
 */
import { BRAND_NAME } from '@sporthub/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ComingSoonPage, { metadata } from '@/app/coming-soon/page';
import { HEADER_NAV } from '@/lib/navigation';

describe('Страница /coming-soon', () => {
  it('говорит, что раздел в разработке, и ведёт на главную', () => {
    render(<ComingSoonPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Раздел в разработке' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
  });

  it('заголовок вкладки несёт имя площадки', () => {
    expect(metadata.title).toBe(`Раздел в разработке — ${BRAND_NAME}`);
  });

  it('разделы вне фазы — «Командные» и «Маркет» — ведут именно сюда, фиксированным адресом', () => {
    for (const label of ['Командные', 'Маркет']) {
      expect(HEADER_NAV.find((item) => item.label === label)?.href).toBe('/coming-soon');
    }
  });
});
