// Phase 24 Step 24.13: тесты общего ReliabilityBadge.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReliabilityBadge } from '@/components/ui/ReliabilityBadge';
import type { ReliabilityResult } from '@/lib/reliability';

function makeResult(overrides: Partial<ReliabilityResult>): ReliabilityResult {
  return {
    totalRelevant: 0,
    completedCount: 0,
    noShowCount: 0,
    lateCancelCount: 0,
    rejectedByProviderCount: 0,
    completionRate: 1,
    badge: null,
    isNewUser: true,
    ...overrides,
  };
}

describe('ReliabilityBadge', () => {
  it('для isNewUser=true показывает «Новый»', () => {
    render(<ReliabilityBadge reliability={makeResult({ isNewUser: true })} />);
    expect(screen.getByTestId('reliability-badge-new')).toBeInTheDocument();
  });

  it('для надёжного (badge=null, isNewUser=false) скрывает бейдж', () => {
    const { container } = render(
      <ReliabilityBadge reliability={makeResult({ isNewUser: false, badge: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('для warning показывает жёлтый бейдж', () => {
    render(
      <ReliabilityBadge
        reliability={makeResult({
          isNewUser: false,
          badge: 'warning',
          completionRate: 0.8,
          completedCount: 8,
          totalRelevant: 10,
        })}
      />,
    );
    expect(screen.getByTestId('reliability-badge-warning')).toHaveTextContent(/80%/);
  });

  it('для danger показывает красный бейдж', () => {
    render(
      <ReliabilityBadge
        reliability={makeResult({
          isNewUser: false,
          badge: 'danger',
          completionRate: 0.5,
          completedCount: 5,
          totalRelevant: 10,
        })}
      />,
    );
    const badge = screen.getByTestId('reliability-badge-danger');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/50%/);
  });

  it('showDetails добавляет числа completed/total', () => {
    render(
      <ReliabilityBadge
        showDetails
        reliability={makeResult({
          isNewUser: false,
          badge: 'warning',
          completionRate: 0.8,
          completedCount: 8,
          totalRelevant: 10,
        })}
      />,
    );
    expect(screen.getByTestId('reliability-badge-warning')).toHaveTextContent('8 из 10');
  });

  it('compact для isNewUser показывает краткую форму', () => {
    render(<ReliabilityBadge compact reliability={makeResult({ isNewUser: true })} />);
    expect(screen.getByTestId('reliability-badge-new')).toHaveTextContent('Новый');
  });
});
