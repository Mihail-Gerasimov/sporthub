// Тесты UI-редактора слотов расписания (Step 13.7)
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ScheduleSlotForm } from '@/components/profile/PublishClubModal';
import { ScheduleSlotsEditor } from '@/components/profile/ScheduleSlotsEditor';

/** Хелпер: пустой слот */
function emptySlot(): ScheduleSlotForm {
  return {
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    price: '',
    capacity: '',
    location: '',
    discipline: '',
  };
}

describe('ScheduleSlotsEditor', () => {
  const defaultProps = {
    slots: [emptySlot()],
    onChange: vi.fn(),
  };

  it('рендерит один слот по умолчанию', () => {
    render(<ScheduleSlotsEditor {...defaultProps} />);

    expect(screen.getByText('Слот 1')).toBeInTheDocument();
  });

  it('рендерит поля слота: название, дата, время начала, время окончания, цена, кол-во мест, локация, направление', () => {
    render(<ScheduleSlotsEditor {...defaultProps} />);

    expect(screen.getByLabelText('Название занятия')).toBeInTheDocument();
    expect(screen.getByLabelText('Дата')).toBeInTheDocument();
    expect(screen.getByLabelText('Начало')).toBeInTheDocument();
    expect(screen.getByLabelText('Окончание')).toBeInTheDocument();
    expect(screen.getByLabelText('Цена (₽)')).toBeInTheDocument();
    expect(screen.getByLabelText('Кол-во мест')).toBeInTheDocument();
    expect(screen.getByLabelText('Зал')).toBeInTheDocument();
    expect(screen.getByLabelText('Направление')).toBeInTheDocument();
  });

  it('кнопка «Добавить слот» вызывает onChange с новым слотом', () => {
    const onChange = vi.fn();
    render(<ScheduleSlotsEditor slots={[emptySlot()]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Добавить слот/ }));

    expect(onChange).toHaveBeenCalledOnce();
    const newSlots = onChange.mock.calls[0][0];
    expect(newSlots).toHaveLength(2);
  });

  it('добавление третьего слота работает', () => {
    const onChange = vi.fn();
    render(<ScheduleSlotsEditor slots={[emptySlot(), emptySlot()]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Добавить слот/ }));

    expect(onChange).toHaveBeenCalledOnce();
    const newSlots = onChange.mock.calls[0][0];
    expect(newSlots).toHaveLength(3);
  });

  it('скрывает кнопку добавления при достижении maxSlots (по умолчанию 3)', () => {
    render(
      <ScheduleSlotsEditor slots={[emptySlot(), emptySlot(), emptySlot()]} onChange={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /Добавить слот/ })).not.toBeInTheDocument();
  });

  it('удаление слота вызывает onChange без удалённого слота', () => {
    const onChange = vi.fn();
    render(<ScheduleSlotsEditor slots={[emptySlot(), emptySlot()]} onChange={onChange} />);

    // Удаляем первый слот
    const deleteButtons = screen.getAllByRole('button', { name: /Удалить/ });
    fireEvent.click(deleteButtons[0]);

    expect(onChange).toHaveBeenCalledOnce();
    const newSlots = onChange.mock.calls[0][0];
    expect(newSlots).toHaveLength(1);
  });

  it('не показывает кнопку удаления когда остался 1 слот', () => {
    render(<ScheduleSlotsEditor slots={[emptySlot()]} onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Удалить/ })).not.toBeInTheDocument();
  });

  it('рендерит несколько слотов с заголовками «Слот 1», «Слот 2»', () => {
    render(<ScheduleSlotsEditor slots={[emptySlot(), emptySlot()]} onChange={vi.fn()} />);

    expect(screen.getByText('Слот 1')).toBeInTheDocument();
    expect(screen.getByText('Слот 2')).toBeInTheDocument();
  });

  it('поддерживает кастомный maxSlots', () => {
    render(
      <ScheduleSlotsEditor slots={[emptySlot(), emptySlot()]} onChange={vi.fn()} maxSlots={2} />,
    );

    expect(screen.queryByRole('button', { name: /Добавить слот/ })).not.toBeInTheDocument();
  });
});
