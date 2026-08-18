import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Rating } from '@/components/ui/Rating';

describe('Rating', () => {
  it('рендерит read-only рейтинг с понятной подписью', () => {
    render(<Rating value={4} />);

    expect(screen.getByLabelText('Рейтинг: 4 из 5')).toBeInTheDocument();
  });

  it('в интерактивном режиме сообщает выбранное значение', () => {
    const handleChange = vi.fn();

    render(<Rating value={2} interactive onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Оценить на 4 из 5' }));

    expect(handleChange).toHaveBeenCalledWith(4);
  });
});
