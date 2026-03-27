// Тесты модалки публикации тренера (Step 13.4)
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PublishTrainerModal } from '@/components/profile/PublishTrainerModal';

describe('PublishTrainerModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    clubs: [
      { id: 1, name: 'FitZone Studio' },
      { id: 2, name: 'PowerGym' },
    ],
  };

  it('рендерит заголовок модалки', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('h2')).toHaveTextContent('Опубликовать тренера');
  });

  // --- Секция «Основная информация» ---

  it('рендерит секцию «Основная информация» с полями firstName, lastName, city, address, bio, experience', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Основная информация')).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toBeInTheDocument();
    expect(screen.getByLabelText('Фамилия')).toBeInTheDocument();
    expect(screen.getByLabelText('Город')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес / локация')).toBeInTheDocument();
    expect(screen.getByLabelText('О себе')).toBeInTheDocument();
    expect(screen.getByLabelText('Опыт (лет)')).toBeInTheDocument();
  });

  // --- Секция «Фото» ---

  it('рендерит кнопку «Добавить фото»', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeInTheDocument();
  });

  // --- Секция «Специализация» ---

  it('рендерит секцию «Специализация» с полями sport, тип, workFormat', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Специализация')).toBeInTheDocument();
    expect(screen.getByLabelText('Основной вид спорта')).toBeInTheDocument();
    expect(screen.getByText('Тип')).toBeInTheDocument();
    expect(screen.getByText('Формат работы')).toBeInTheDocument();
  });

  // --- Секция «Связать себя с клубом» ---

  it('рендерит секцию «Связать себя с клубом» с опциональным select', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Связать себя с клубом')).toBeInTheDocument();
    expect(screen.getByText(/Вы можете указать спортивный клуб/)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it('отображает переданные клубы в select привязки', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    const selects = screen.getAllByRole('combobox');
    const clubSelect = selects.find((s) => s.textContent?.includes('Без привязки к клубу'));
    expect(clubSelect).toBeDefined();
    expect(clubSelect).toHaveTextContent('FitZone Studio');
    expect(clubSelect).toHaveTextContent('PowerGym');
  });

  // --- Секция «Услуга тренера» ---

  it('рендерит секцию «Услуга тренера» с полями offering', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Услуга тренера')).toBeInTheDocument();
    expect(screen.getByLabelText('Название услуги')).toBeInTheDocument();
    expect(screen.getByLabelText('Описание услуги')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Цена (₽)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Длительность (мин)')).toBeInTheDocument();
    expect(screen.getByLabelText('Укажите адрес проведения тренировки')).toBeInTheDocument();
  });

  // --- Секция «Стартовое расписание» ---

  it('рендерит секцию «Стартовое расписание» с placeholder', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Стартовое расписание')).toBeInTheDocument();
  });

  // --- Секция «Дополнительные возможности» ---

  it('рендерит секцию «Дополнительные возможности» со stub-полями', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Дополнительные возможности')).toBeInTheDocument();
  });

  // --- Stub-элементы ---

  it('stub-элементы маркированы как «Скоро»', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    const stubLabels = screen.getAllByText(/Скоро/);
    expect(stubLabels.length).toBeGreaterThanOrEqual(1);
  });

  // --- Footer ---

  it('рендерит кнопки «Создать публикацию» и «Отмена» в footer', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Создать публикацию' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });

  // --- Фото-stub ---

  it('показывает notice при клике на «Добавить фото»', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Добавить фото' }));
    expect(screen.getByText(/Функционал загрузки фото находится в разработке/)).toBeInTheDocument();
  });

  // --- Валидация ---

  it('показывает ошибки при пустом submit', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    expect(screen.getByText('Укажите имя')).toBeInTheDocument();
    expect(screen.getByText('Укажите фамилию')).toBeInTheDocument();
    expect(screen.getByText('Выберите минимум 1 специализацию')).toBeInTheDocument();
  });

  // --- Primary action stub ---

  it('показывает notice после успешной валидации вместо сохранения', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Александр' } });
    fireEvent.change(screen.getByLabelText('Фамилия'), { target: { value: 'Иванов' } });
    fireEvent.change(screen.getByLabelText('Город'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('О себе'), {
      target: { value: 'Опытный тренер' },
    });
    fireEvent.change(screen.getByLabelText('Опыт (лет)'), { target: { value: '5' } });

    fireEvent.change(screen.getByLabelText('Основной вид спорта'), {
      target: { value: 'Бокс' },
    });

    fireEvent.click(screen.getByText('Персональные тренировки'));

    fireEvent.click(screen.getByText('В клубе'));

    fireEvent.change(screen.getByLabelText('Название услуги'), {
      target: { value: 'Персональная тренировка' },
    });
    const priceInputs = screen.getAllByLabelText('Цена (₽)');
    fireEvent.change(priceInputs[0], { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText('Длительность (мин)'), {
      target: { value: '60' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    expect(
      screen.getByText(/Сохранение публикации будет доступно в следующей фазе/),
    ).toBeInTheDocument();
  });
});
