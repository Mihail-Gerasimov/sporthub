import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthModal } from '@/components/auth/AuthModal';
import { AppShell } from '@/components/layout/AppShell';
import { useUIStore } from '@/stores/useUIStore';

describe('AuthModal', () => {
  beforeEach(() => {
    useUIStore.setState({
      isAuthModalOpen: false,
    });
  });

  it('открывается из Header и закрывается по кнопке и overlay', () => {
    render(
      <AppShell>
        <div>Контент страницы</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(screen.getByRole('dialog', { name: 'Войти или создать профиль' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть модальное окно' }));

    expect(
      screen.queryByRole('dialog', { name: 'Войти или создать профиль' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    fireEvent.click(screen.getByTestId('modal-overlay'));

    expect(
      screen.queryByRole('dialog', { name: 'Войти или создать профиль' }),
    ).not.toBeInTheDocument();
  });

  it('переключает табы и требует выбор типа аккаунта в каждом сценарии', () => {
    useUIStore.setState({
      isAuthModalOpen: true,
    });

    render(<AuthModal />);

    expect(screen.getByRole('tab', { name: 'Вход' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Продолжить вход' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Спортсмен' }));

    expect(screen.getByRole('button', { name: 'Продолжить вход' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));

    expect(screen.getByRole('tab', { name: 'Регистрация' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('Имя')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Представитель спортивных услуг' }));

    expect(screen.getByRole('button', { name: 'Создать аккаунт' })).not.toBeDisabled();
  });
});
