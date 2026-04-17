// Тесты dropdown направления в ScheduleSlotsEditor (Step 23.9)
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ScheduleSlotForm } from '@/lib/schemas/publish';
import { ScheduleSlotsEditor } from '@/components/profile/ScheduleSlotsEditor';

/** Пустой слот с sportId */
function emptySlot(overrides: Partial<ScheduleSlotForm> = {}): ScheduleSlotForm {
  return {
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    price: '',
    capacity: '',
    location: '',
    sportId: 0,
    ...overrides,
  };
}

/** Справочник видов спорта для передачи в компонент */
const mockSports = [
  { id: 1, name: 'Йога' },
  { id: 2, name: 'Бокс' },
  { id: 3, name: 'Плавание' },
];

describe('ScheduleSlotsEditor — dropdown направления (Step 23.9)', () => {
  it('рендерит select «Направление» вместо текстового input', () => {
    render(
      <ScheduleSlotsEditor
        slots={[emptySlot()]}
        onChange={vi.fn()}
        sportIds={[1, 2]}
        sports={mockSports}
      />,
    );

    // Должен быть select, а не input с label «Направление»
    const select = screen.getByLabelText('Направление');
    expect(select.tagName).toBe('SELECT');
  });

  it('показывает только спорты из sportIds публикации', () => {
    render(
      <ScheduleSlotsEditor
        slots={[emptySlot()]}
        onChange={vi.fn()}
        sportIds={[1, 3]}
        sports={mockSports}
      />,
    );

    const select = screen.getByLabelText('Направление');
    const options = select.querySelectorAll('option:not([value=""])');
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe('Йога');
    expect(options[1].textContent).toBe('Плавание');
  });

  it('auto-select при одном sportId и поле disabled', () => {
    const onChange = vi.fn();
    render(
      <ScheduleSlotsEditor
        slots={[emptySlot({ sportId: 2 })]}
        onChange={onChange}
        sportIds={[2]}
        sports={mockSports}
      />,
    );

    const select = screen.getByLabelText('Направление') as HTMLSelectElement;
    expect(select.value).toBe('2');
    expect(select).toBeDisabled();
  });

  it('при нескольких sportIds — select enabled, можно выбрать', () => {
    const onChange = vi.fn();
    render(
      <ScheduleSlotsEditor
        slots={[emptySlot()]}
        onChange={onChange}
        sportIds={[1, 2]}
        sports={mockSports}
      />,
    );

    const select = screen.getByLabelText('Направление') as HTMLSelectElement;
    expect(select).not.toBeDisabled();

    fireEvent.change(select, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledOnce();
    const updatedSlots = onChange.mock.calls[0][0];
    expect(updatedSlots[0].sportId).toBe(2);
  });

  it('при нескольких sportIds — показывает placeholder «Выберите направление»', () => {
    render(
      <ScheduleSlotsEditor
        slots={[emptySlot()]}
        onChange={vi.fn()}
        sportIds={[1, 2]}
        sports={mockSports}
      />,
    );

    const select = screen.getByLabelText('Направление') as HTMLSelectElement;
    const placeholder = select.querySelector('option[value=""]');
    expect(placeholder).toBeTruthy();
    expect(placeholder?.textContent).toContain('Выберите');
  });

  it('time inputs имеют step=600', () => {
    render(
      <ScheduleSlotsEditor
        slots={[emptySlot()]}
        onChange={vi.fn()}
        sportIds={[1]}
        sports={mockSports}
      />,
    );

    const startInput = screen.getByLabelText('Начало') as HTMLInputElement;
    const endInput = screen.getByLabelText('Окончание') as HTMLInputElement;
    expect(startInput.getAttribute('step')).toBe('600');
    expect(endInput.getAttribute('step')).toBe('600');
  });
});
