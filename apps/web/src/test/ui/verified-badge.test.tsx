// Тесты знака «проверено» (фаза 38, шаг 38.52).
//
// Знак — текст плюс подсказка, а не одна галочка: галочка без подписи была бы
// третьим дефектом дерева доступности того же класса, что нашла фаза 37 (ловушки
// раздела 7 файла фазы). Подпись зависит от вида лица — клуб или тренер —
// и берётся из одного словаря `Record<CatalogOwnerType, …>`: третий вид лица
// без своей строки не соберётся, это стережёт компилятор, а не тест.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { CATALOG_OWNER_TYPES } from '@sporthub/types';

describe('VerifiedBadge', () => {
  it('у клуба подпись «Клуб проверен», у тренера — «Тренер проверен»', () => {
    const { unmount } = render(<VerifiedBadge ownerType="club" />);

    expect(screen.getByTestId('verified-badge')).toHaveTextContent('Клуб проверен');

    unmount();
    render(<VerifiedBadge ownerType="trainer" />);

    expect(screen.getByTestId('verified-badge')).toHaveTextContent('Тренер проверен');
  });

  it('у каждого вида лица из словаря есть своя подпись, и они не совпадают', () => {
    const labels = CATALOG_OWNER_TYPES.map((ownerType) => {
      const { unmount } = render(<VerifiedBadge ownerType={ownerType} />);
      const label = screen.getByTestId('verified-badge').textContent ?? '';

      unmount();

      return label;
    });

    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(CATALOG_OWNER_TYPES.length);
  });

  it('доступен с клавиатуры и несёт подсказку описанием', () => {
    render(<VerifiedBadge ownerType="club" />);

    const badge = screen.getByTestId('verified-badge');

    // Знак — не кнопка, но подсказку обязан отдавать и с клавиатуры: значит, в порядке табуляции.
    expect(badge).toHaveAttribute('tabindex', '0');
    expect(badge).toHaveAccessibleDescription(/проверил/i);

    act(() => badge.focus());

    expect(screen.getByRole('tooltip')).toBeVisible();

    fireEvent.keyDown(badge, { key: 'Escape' });

    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });

  it('галочка декоративная: у иконки нет доступного имени, имя даёт подпись', () => {
    render(<VerifiedBadge ownerType="trainer" />);

    const badge = screen.getByTestId('verified-badge');
    const icon = badge.querySelector('svg');

    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
