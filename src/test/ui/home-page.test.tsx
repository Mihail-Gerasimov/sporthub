import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Home from '@/app/page';

describe('Home page', () => {
  it('рендерит базовую заглушку проекта', async () => {
    render(await Home());

    expect(screen.getByText('SportHub')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'MVP в разработке' })).toBeInTheDocument();
    expect(
      screen.getByText(/Главная страница будет собрана в следующих шагах/i),
    ).toBeInTheDocument();
  });
});
