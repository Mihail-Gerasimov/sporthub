// Переключатель лица услуг в кабинете (шаг 35.32).
//
// ⚠️ Решение 5.3 — ключевое для интерфейса, и проверяется здесь буквально:
// у кого лицо одно, у того выбора НЕТ В РАЗМЕТКЕ ВОВСЕ. Не «спрятан стилями»
// и не «показан неактивным»: 90% возможных ошибок «сказал не от того лица»
// снимается тем, что 90% людей переключателя никогда не увидят.
//
// Там, где лицо выводится из предмета (отзыв на твой клуб, чат по записи в твоём
// зале), переключателя нет и не будет: сторону система знает сама. Здесь он
// отвечает на другой вопрос — чей кабинет открыт, когда лиц несколько.
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { FaceSwitcher } from '@/components/profile/FaceSwitcher';
import type { ServiceFace } from '@/lib/service-faces';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';

const CLUB: ServiceFace = { kind: 'club', id: 3, name: 'CrossFit Garage' };
const CARD: ServiceFace = { kind: 'trainer', id: 7, name: 'Марина Крылова' };

function signIn(faces: ServiceFace[], activeFaceKey: string | null) {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: { id: 2, name: 'Марина Крылова', email: 'marina@studio.local' },
    isAuthenticated: true,
    accountKind: 'person',
    faces,
    activeFaceKey,
    status: 'ready',
  });
}

describe('FaceSwitcher', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('у человека с одним лицом выбора нет в разметке вовсе', () => {
    signIn([CLUB], 'club:3');

    const { container } = render(<FaceSwitcher />);

    expect(container).toBeEmptyDOMElement();
  });

  it('у человека без лиц услуг переключателя тоже нет', () => {
    signIn([], null);

    const { container } = render(<FaceSwitcher />);

    expect(container).toBeEmptyDOMElement();
  });

  it('у человека с двумя лицами показывает оба и отмечает текущее', () => {
    signIn([CLUB, CARD], 'club:3');

    render(<FaceSwitcher />);

    expect(screen.getByTestId('profile-face-switcher')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CrossFit Garage' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Марина Крылова' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('нажатие меняет лицо кабинета', () => {
    signIn([CLUB, CARD], 'club:3');

    render(<FaceSwitcher />);

    fireEvent.click(screen.getByRole('button', { name: 'Марина Крылова' }));

    expect(useAuthStore.getState().activeFaceKey).toBe('trainer:7');
    expect(screen.getByRole('button', { name: 'Марина Крылова' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
