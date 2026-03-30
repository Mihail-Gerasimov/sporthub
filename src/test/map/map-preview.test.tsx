import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MapPreviewSection } from '@/components/map/MapPreviewSection';

describe('MapPreviewSection', () => {
  it('рендерит placeholder-блок карты с текстом «Карта — скоро здесь»', () => {
    render(<MapPreviewSection />);

    expect(screen.getByText('Карта — скоро здесь')).toBeInTheDocument();
  });

  it('содержит секцию с id="map-placeholder"', () => {
    render(<MapPreviewSection />);

    expect(screen.getByTestId('map-placeholder')).toBeInTheDocument();
  });
});
