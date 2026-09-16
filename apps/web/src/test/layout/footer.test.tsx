/**
 * Подвал (шаг 38.61): тёмная плашка, логотип ссылкой на главную, ссылки из словаря
 * навигации, копирайт с именем площадки и годом из часов; блока «Статус» нет.
 */
import { BRAND_NAME } from '@sporthub/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Footer } from '@/components/layout/Footer';
import { FOOTER_NAV } from '@/lib/navigation';

describe('Footer', () => {
  it('ссылки — ровно пункты словаря, с теми же адресами', () => {
    render(<Footer />);
    const nav = screen.getByRole('navigation', { name: 'Навигация в подвале' });
    const links = [...nav.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(FOOTER_NAV.map((i) => i.label));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(FOOTER_NAV.map((i) => i.href));
    // Прежних целей в никуда — `#about`, `#contacts` — нет.
    expect(links.some((a) => /#about|#contacts/.test(a.getAttribute('href') ?? ''))).toBe(false);
  });

  it('логотип ведёт на главную и стоит на тёмной плашке', () => {
    render(<Footer />);
    const footer = screen.getByRole('contentinfo', { name: 'Подвал сайта' });
    expect(footer.className).toContain('bg-plate');
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
    // Хвост словомарки на плашке — светлый: тон логотипа следует за фоном подвала.
    expect(screen.getByText('СПОРТ').className).toContain('text-plate-ink');
  });

  it('копирайт — имя площадки и текущий год; блока «Статус» и признаний нет', () => {
    render(<Footer />);
    expect(screen.getByText(`© ${new Date().getFullYear()} ${BRAND_NAME}`)).toBeInTheDocument();
    expect(screen.queryByText('Статус')).not.toBeInTheDocument();
    expect(screen.queryByText(/заглушки/)).not.toBeInTheDocument();
  });
});
