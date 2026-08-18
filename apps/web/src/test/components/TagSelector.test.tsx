/**
 * Тесты компонента TagSelector — единый UI «поиск + выбор + крестик».
 * Phase 23 — Step 23.6.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TagSelector } from '@/components/profile/TagSelector';

const mockItems = [
  { id: 1, name: 'Для начинающих' },
  { id: 2, name: 'Для детей' },
  { id: 3, name: 'Бассейн' },
  { id: 4, name: 'Парковка' },
  { id: 5, name: 'Душевые' },
];

describe('TagSelector', () => {
  it('рендерит лейбл и кнопку «+ Добавить» без выбранных', () => {
    render(<TagSelector label="Теги" items={mockItems} selectedIds={[]} onChange={vi.fn()} />);

    expect(screen.getByText('Теги')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /добавить/i })).toBeInTheDocument();
  });

  it('открывает поиск при клике на «+ Добавить»', () => {
    render(<TagSelector label="Теги" items={mockItems} selectedIds={[]} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));

    expect(screen.getByPlaceholderText(/поиск/i)).toBeInTheDocument();
    // Все невыбранные элементы видны
    expect(screen.getByText('Для начинающих')).toBeInTheDocument();
    expect(screen.getByText('Бассейн')).toBeInTheDocument();
  });

  it('фильтрует список по подстроке', () => {
    render(<TagSelector label="Теги" items={mockItems} selectedIds={[]} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));
    fireEvent.change(screen.getByPlaceholderText(/поиск/i), { target: { value: 'для' } });

    expect(screen.getByText('Для начинающих')).toBeInTheDocument();
    expect(screen.getByText('Для детей')).toBeInTheDocument();
    expect(screen.queryByText('Бассейн')).not.toBeInTheDocument();
    expect(screen.queryByText('Парковка')).not.toBeInTheDocument();
  });

  it('вызывает onChange при выборе элемента', () => {
    const onChange = vi.fn();

    render(<TagSelector label="Теги" items={mockItems} selectedIds={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));
    fireEvent.click(screen.getByText('Бассейн'));

    expect(onChange).toHaveBeenCalledWith([3]);
  });

  it('добавляет к существующим selectedIds при выборе', () => {
    const onChange = vi.fn();

    render(<TagSelector label="Теги" items={mockItems} selectedIds={[1]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));
    fireEvent.click(screen.getByText('Бассейн'));

    expect(onChange).toHaveBeenCalledWith([1, 3]);
  });

  it('показывает выбранные элементы чипами', () => {
    render(<TagSelector label="Теги" items={mockItems} selectedIds={[1, 3]} onChange={vi.fn()} />);

    expect(screen.getByText('Для начинающих')).toBeInTheDocument();
    expect(screen.getByText('Бассейн')).toBeInTheDocument();
  });

  it('удаляет элемент при клике по крестику', () => {
    const onChange = vi.fn();

    render(<TagSelector label="Теги" items={mockItems} selectedIds={[1, 3]} onChange={onChange} />);

    // Кнопки удаления — крестики рядом с чипами
    const removeButtons = screen.getAllByRole('button', { name: /удалить/i });
    // Первый крестик — для «Для начинающих» (id=1)
    fireEvent.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledWith([3]);
  });

  it('не показывает уже выбранные элементы в dropdown', () => {
    render(<TagSelector label="Теги" items={mockItems} selectedIds={[1, 3]} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));

    // Выбранные не должны быть в dropdown
    expect(screen.queryByRole('option', { name: 'Для начинающих' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Бассейн' })).not.toBeInTheDocument();
    // Невыбранные — должны быть
    expect(screen.getByText('Для детей')).toBeInTheDocument();
    expect(screen.getByText('Парковка')).toBeInTheDocument();
  });

  it('показывает empty state при отсутствии результатов поиска', () => {
    render(<TagSelector label="Теги" items={mockItems} selectedIds={[]} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));
    fireEvent.change(screen.getByPlaceholderText(/поиск/i), { target: { value: 'xyz' } });

    expect(screen.getByText(/ничего не найдено/i)).toBeInTheDocument();
  });

  it('multi: false — заменяет текущий при выборе нового', () => {
    const onChange = vi.fn();

    render(
      <TagSelector
        label="Формат"
        items={mockItems}
        selectedIds={[1]}
        onChange={onChange}
        multi={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));
    fireEvent.click(screen.getByText('Бассейн'));

    // При multi: false — заменяет, а не добавляет
    expect(onChange).toHaveBeenCalledWith([3]);
  });

  it('закрывает dropdown по Escape', () => {
    render(<TagSelector label="Теги" items={mockItems} selectedIds={[]} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /добавить/i }));
    expect(screen.getByPlaceholderText(/поиск/i)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByPlaceholderText(/поиск/i), { key: 'Escape' });
    expect(screen.queryByPlaceholderText(/поиск/i)).not.toBeInTheDocument();
  });

  it('disabled — кнопка «+ Добавить» недоступна', () => {
    render(
      <TagSelector label="Теги" items={mockItems} selectedIds={[]} onChange={vi.fn()} disabled />,
    );

    expect(screen.getByRole('button', { name: /добавить/i })).toBeDisabled();
  });
});
