import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import TrainerDetailPage from '@/app/trainers/[id]/page';

describe('Trainer detail page', () => {
  it('рендерит публичную страницу тренера с ключевыми секциями', async () => {
    render(await TrainerDetailPage({ params: Promise.resolve({ id: '1' }) }));

    /* Имя тренера из данных */
    expect(screen.getByRole('heading', { name: 'Марина Соколова' })).toBeInTheDocument();
    /* Ключевые секции страницы */
    expect(screen.getByRole('heading', { name: 'Услуги тренера' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расписание' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Отзывы' })).toBeInTheDocument();
  });

  it('отдаёт notFound для несуществующего тренера', async () => {
    await expect(
      TrainerDetailPage({ params: Promise.resolve({ id: '999' }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('отдаёт notFound для невалидного id', async () => {
    await expect(
      TrainerDetailPage({ params: Promise.resolve({ id: 'abc' }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });
});
