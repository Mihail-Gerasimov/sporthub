// Тесты модалки публикации клуба (Step 13.3)
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PublishClubModal } from '@/components/profile/PublishClubModal';

describe('PublishClubModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
  };

  it('рендерит заголовок модалки', () => {
    render(<PublishClubModal {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('h2')).toHaveTextContent('Опубликовать клуб');
  });

  // --- Секция «Основная информация» ---

  it('рендерит секцию «Основная информация» с полями name, city, address, description, phone, email', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Основная информация')).toBeInTheDocument();
    expect(screen.getByLabelText('Название клуба')).toBeInTheDocument();
    expect(screen.getByLabelText('Город')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес')).toBeInTheDocument();
    expect(screen.getByLabelText('Краткое описание')).toBeInTheDocument();
    expect(screen.getByLabelText('Телефон')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  // --- Секция «Фото и визуал» ---

  it('рендерит секцию «Фото и визуал» со stub-пометкой', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Фото и визуал')).toBeInTheDocument();
    // Stub-пометка
    expect(screen.getByText(/Загрузка фото будет доступна позже/)).toBeInTheDocument();
  });

  // --- Секция «Направления» ---

  it('рендерит секцию «Направления клуба»', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Направления клуба')).toBeInTheDocument();
  });

  // --- Секция «Теги и удобства» ---

  it('рендерит секцию «Теги и удобства» с полем цены', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Теги и удобства')).toBeInTheDocument();
    expect(screen.getByLabelText('Цена от (₽)')).toBeInTheDocument();
  });

  // --- Секция «Стартовое расписание» ---

  it('рендерит секцию «Стартовое расписание» с placeholder', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Стартовое расписание')).toBeInTheDocument();
  });

  // --- Секция «Дополнительные возможности» ---

  it('рендерит секцию «Дополнительные возможности» со stub-полями', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Дополнительные возможности')).toBeInTheDocument();
  });

  // --- Stub-элементы ---

  it('stub-элементы маркированы как «Скоро»', () => {
    render(<PublishClubModal {...defaultProps} />);

    // В модалке должны быть stub-пометки для future-полей
    const stubLabels = screen.getAllByText(/Скоро/);
    expect(stubLabels.length).toBeGreaterThanOrEqual(1);
  });

  // --- Footer ---

  it('рендерит кнопки «Создать публикацию» и «Отмена» в footer', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Создать публикацию' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });

  // --- Валидация (Step 13.5) ---

  it('показывает ошибки при пустом submit', () => {
    render(<PublishClubModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    // Должны появиться сообщения об ошибках для обязательных полей
    expect(screen.getByText('Укажите название клуба')).toBeInTheDocument();
    expect(screen.getByText('Укажите город')).toBeInTheDocument();
    expect(screen.getByText('Необходимо выбрать хотя бы 1 направление')).toBeInTheDocument();
  });
});
