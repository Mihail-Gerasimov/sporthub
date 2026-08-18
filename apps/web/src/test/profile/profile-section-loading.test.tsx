/**
 * Phase 30.2: smoke-тест skeleton'а ЛК.
 * Проверяет что компонент рендерится без ошибок и имеет ожидаемый testid.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ProfileSectionLoading from '@/components/profile/ProfileSectionLoading';

describe('ProfileSectionLoading (Phase 30.2)', () => {
  it('рендерится с data-testid="profile-section-loading"', () => {
    render(<ProfileSectionLoading />);

    expect(screen.getByTestId('profile-section-loading')).toBeInTheDocument();
  });
});
