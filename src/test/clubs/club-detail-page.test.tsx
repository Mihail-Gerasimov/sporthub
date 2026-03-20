import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ClubDetailPage from '@/app/clubs/[id]/page';

describe('Club detail page', () => {
  it('рендерит публичную страницу клуба с ключевыми секциями', async () => {
    render(await ClubDetailPage({ params: Promise.resolve({ id: '1' }) }));

    expect(screen.getByRole('heading', { name: 'Volna Aquatic Club' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Направления клуба' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Тренеры клуба' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расписание на неделю' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Отзывы клуба' })).toBeInTheDocument();
    expect(screen.getAllByText('Фото клуба').length).toBeGreaterThan(0);
  });

  it('отдаёт notFound для несуществующего клуба', async () => {
    await expect(ClubDetailPage({ params: Promise.resolve({ id: '999' }) })).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });
});
