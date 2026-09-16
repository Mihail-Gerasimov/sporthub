/**
 * Подвал (шаг 38.61): тёмная плашка, логотип ссылкой на главную, ссылки из словаря
 * навигации, копирайт с именем площадки и годом из часов; блока «Статус» нет.
 * Шаг 38.108: ссылки — тот же словарь, что шапка (Клубы · Тренеры · Командные · Маркет);
 * «Лента» из подвала макета (`HomePage.tsx` ~899) не переносится — один словарь,
 * а третья ссылка на «раздел в разработке» ничего бы не добавила (названо).
 */
import { BRAND_NAME } from '@sporthub/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Footer } from '@/components/layout/Footer';
import { FOOTER_NAV } from '@/lib/navigation';
import { useFilterStore } from '@/stores/useFilterStore';

describe('Footer', () => {
  it('«Тренеры» в подвале переключает режим стора на клике, как в шапке (38.79c)', () => {
    useFilterStore.setState({ discoveryMode: 'clubs' });
    render(<Footer />);
    fireEvent.click(screen.getByRole('link', { name: 'Тренеры' }));
    expect(useFilterStore.getState().discoveryMode).toBe('trainers');
  });

  it('ссылки — ровно пункты словаря, с теми же адресами', () => {
    render(<Footer />);
    const nav = screen.getByRole('navigation', { name: 'Навигация в подвале' });
    const links = [...nav.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(FOOTER_NAV.map((i) => i.label));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(FOOTER_NAV.map((i) => i.href));
    // Прежних целей в никуда — `#about`, `#contacts` — нет.
    expect(links.some((a) => /#about|#contacts/.test(a.getAttribute('href') ?? ''))).toBe(false);
  });

  it('подвал — ровно шапка макета: без «Ленты» и без секций витрины (38.108)', () => {
    render(<Footer />);
    const nav = screen.getByRole('navigation', { name: 'Навигация в подвале' });
    expect([...nav.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'Клубы',
      'Тренеры',
      'Командные',
      'Маркет',
    ]);
  });

  // Аудит главной 17.09, п. 17: контейнер подвала был 1440/24, макет и все секции — 1320/24.
  it('контейнер подвала — HomeContainer 1320/24, как у секций, а не 1440', () => {
    render(<Footer />);
    const footer = screen.getByRole('contentinfo', { name: 'Подвал сайта' });
    const container = footer.firstElementChild as HTMLElement;
    expect(container.className).toContain('max-w-[1320px]');
    expect(container.className).toContain('px-6');
    expect(footer.innerHTML).not.toContain('max-w-[1440px]');
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
