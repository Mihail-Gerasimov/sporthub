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

  it('рендерит секцию «Основная информация» с полями name, city, address, description, phone, email, priceFrom', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Основная информация')).toBeInTheDocument();
    expect(screen.getByLabelText('Название клуба')).toBeInTheDocument();
    expect(screen.getByLabelText('Город')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес')).toBeInTheDocument();
    expect(screen.getByLabelText('Краткое описание')).toBeInTheDocument();
    expect(screen.getByLabelText('Телефон')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Цена от (₽)')).toBeInTheDocument();
  });

  // --- Секция «Фото» ---

  it('рендерит кнопку «Добавить фото»', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeInTheDocument();
  });

  // --- Секция «Направления» ---

  it('рендерит секцию «Направления клуба»', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Направления клуба')).toBeInTheDocument();
  });

  // --- Секции «Добавить теги» и «Удобства клуба» ---

  it('рендерит секции «Добавить теги» и «Удобства клуба»', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Добавить теги')).toBeInTheDocument();
    expect(screen.getByText('Удобства клуба')).toBeInTheDocument();
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

    const stubLabels = screen.getAllByText(/Скоро/);
    expect(stubLabels.length).toBeGreaterThanOrEqual(1);
  });

  // --- Footer ---

  it('рендерит кнопки «Создать публикацию» и «Отмена» в footer', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Создать публикацию' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });

  // --- Фото-stub ---

  it('показывает notice при клике на «Добавить фото»', () => {
    render(<PublishClubModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Добавить фото' }));
    expect(screen.getByText(/Функционал загрузки фото находится в разработке/)).toBeInTheDocument();
  });

  // --- Валидация ---

  it('показывает ошибки при пустом submit', () => {
    render(<PublishClubModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    expect(screen.getByText('Укажите название клуба')).toBeInTheDocument();
    expect(screen.getByText('Укажите город')).toBeInTheDocument();
    expect(screen.getByText('Необходимо выбрать хотя бы 1 направление')).toBeInTheDocument();
  });

  // --- Primary action stub ---

  it('показывает notice после успешной валидации вместо сохранения', async () => {
    render(<PublishClubModal {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Название клуба'), {
      target: { value: 'FitZone Studio' },
    });
    fireEvent.change(screen.getByLabelText('Город'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('Адрес'), {
      target: { value: 'ул. Спортивная, 10' },
    });
    fireEvent.change(screen.getByLabelText('Краткое описание'), {
      target: { value: 'Отличный клуб' },
    });
    fireEvent.change(screen.getByLabelText('Телефон'), {
      target: { value: '+7 999 123-45-67' },
    });
    fireEvent.change(screen.getByLabelText('Цена от (₽)'), { target: { value: '500' } });

    fireEvent.click(screen.getByText('Йога'));

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    expect(
      screen.getByText(/Сохранение публикации будет доступно в следующей фазе/),
    ).toBeInTheDocument();
  });
});
