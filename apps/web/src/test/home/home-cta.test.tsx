/**
 * Финальный призыв (шаг 38.75): тексты из словаря, H2 display-шрифтом с зелёной
 * второй строкой, гостю — модалка входа, вошедшему — кабинет, «Смотреть клубы» → выдача.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { HomeCta } from '@/components/home/HomeCta';
import { CTA } from '@/lib/home-copy';
import { catalogSectionHref } from '@/lib/catalog-sections';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

describe('HomeCta', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
  });

  it('тёмная секция со свечением токеном; рубрика, H2 и текст — из словаря', () => {
    render(<HomeCta />);
    // Подпись региона — из словаря секций, как у пункта меню (сторож anchors-exist, 38.89).
    const section = screen.getByRole('region', { name: HOME_SECTIONS.cta.label });
    // Якорь секции — из словаря, не литералом (ревью 38.65).
    expect(section.id).toBe(HOME_SECTIONS.cta.id);
    expect(section.className).toContain('bg-plate');
    expect(section.className).toContain('var(--ui-decor-plate-glow-center)');
    const h2 = screen.getByRole('heading', { level: 2 });
    expect(h2.className).toContain('t-cta');
    const lines = [...h2.querySelectorAll('span')];
    expect(lines.map((s) => s.textContent)).toEqual([...CTA.titleLines, CTA.titleAccent]);
    expect(lines[lines.length - 1].className).toContain('text-lime');
    expect(screen.getByText(CTA.body).className).toContain('text-plate-muted');
    // Строка под кнопками — дословно из макета (38.114), приглушённым текстом плашки.
    const footnote = screen.getByText(CTA.footnote);
    expect(footnote.className).toContain('text-plate-muted');
    expect(
      screen.getByRole('link', { name: CTA.secondary }).compareDocumentPosition(footnote) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('гостю «Создать аккаунт» открывает модалку входа; «Смотреть клубы» ведёт к выдаче', () => {
    render(<HomeCta />);
    fireEvent.click(screen.getByRole('button', { name: CTA.primary }));
    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
    expect(screen.getByRole('link', { name: CTA.secondary })).toHaveAttribute(
      'href',
      catalogSectionHref('results'),
    );
  });

  it('вошедшему вместо регистрации — ссылка в его кабинет', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { name: 'Марина Крылова', email: 'marina@studio.local' },
      isAuthenticated: true,
      accountKind: 'person',
      faces: [{ kind: 'club', id: 3, name: 'CrossFit Garage' }],
      activeFaceKey: 'club:3',
      status: 'ready',
    });
    render(<HomeCta />);
    expect(screen.queryByRole('button', { name: CTA.primary })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: CTA.primaryAuthenticated })).toHaveAttribute(
      'href',
      '/profile/club/3',
    );
  });
});
