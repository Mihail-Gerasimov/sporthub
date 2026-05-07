/**
 * Phase 30.3: smoke-тест skeleton'а админ-панели.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AdminSectionLoading from '@/components/admin/AdminSectionLoading';

describe('AdminSectionLoading (Phase 30.3)', () => {
  it('рендерится с data-testid="admin-section-loading"', () => {
    render(<AdminSectionLoading />);

    expect(screen.getByTestId('admin-section-loading')).toBeInTheDocument();
  });
});
