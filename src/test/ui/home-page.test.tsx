import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Home from '@/app/page';

describe('Home page', () => {
  it('рендерит собранную главную с ключевыми секциями', async () => {
    render(await Home());

    expect(screen.getByRole('heading', { name: 'Найди спорт в своём ритме' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Поиск по клубам и занятиям' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Клубы на карте и в списке' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Популярное рядом' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ближайшие занятия' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'MVP в разработке' })).not.toBeInTheDocument();
  });
});
