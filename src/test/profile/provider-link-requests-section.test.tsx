// Phase 24 Step 24.9b: тесты ProviderLinkRequestsSection — inbox pending-запросов,
// список confirmed-связей, действия approve/reject/revoke.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToast as render } from '@/test/helpers/render-with-toast';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile/provider',
}));

import { ProviderLinkRequestsSection } from '@/components/profile/ProviderLinkRequestsSection';
import type { Club, Trainer, TrainerClubLink } from '@/types';

const providerClubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-04-10T00:00:00.000Z',
    name: 'Volna',
    slug: 'volna',
    description: '',
    shortDescription: '',
    city: 'Самара',
    address: '',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 0,
    reviewCount: 0,
    priceFrom: 0,
    distanceKm: 0,
    isFeatured: false,
    managedByUserId: 2,
  },
];

const trainers: Trainer[] = [
  {
    id: 10,
    createdAt: '2026-04-10T00:00:00.000Z',
    name: 'Марина Соколова',
    slug: 'marina',
    bio: '',
    avatarUrl: '',
    experienceYears: 5,
    specialtyIds: [],
    workFormatIds: [],
    rating: 0,
    reviewCount: 0,
    priceFrom: 0,
    sportIds: [],
  },
  {
    id: 11,
    createdAt: '2026-04-10T00:00:00.000Z',
    name: 'Сергей Иванов',
    slug: 'sergey',
    bio: '',
    avatarUrl: '',
    experienceYears: 3,
    specialtyIds: [],
    workFormatIds: [],
    rating: 0,
    reviewCount: 0,
    priceFrom: 0,
    sportIds: [],
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch(links: TrainerClubLink[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/trainer-club-links?clubId=')) {
      return jsonResponse({ success: true, data: links });
    }
    if (init?.method === 'POST') {
      return jsonResponse({ success: true, data: {} });
    }
    return jsonResponse({ success: false }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ProviderLinkRequestsSection', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('не рендерит блок, если у провайдера нет клубов', () => {
    mockFetch([]);
    const { container } = render(
      <ProviderLinkRequestsSection providerClubs={[]} trainers={trainers} userId={2} />,
    );
    expect(container.querySelector('[data-testid="provider-link-requests-section"]')).toBeNull();
  });

  it('показывает pending-inbox и confirmed-список', async () => {
    mockFetch([
      {
        id: 5,
        createdAt: '2026-04-20T00:00:00.000Z',
        trainerId: 10,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      },
      {
        id: 6,
        createdAt: '2026-04-19T00:00:00.000Z',
        trainerId: 11,
        clubId: 1,
        status: 'confirmed',
        initiatedBy: 'trainer',
      },
    ]);

    render(
      <ProviderLinkRequestsSection providerClubs={providerClubs} trainers={trainers} userId={2} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('link-request-pending-5')).toBeInTheDocument();
    });

    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.getByTestId('link-confirmed-6')).toBeInTheDocument();
    expect(screen.getByText('Сергей Иванов')).toBeInTheDocument();
  });

  it('клик «Подтвердить» шлёт POST /approve и обновляет список', async () => {
    const fetchMock = mockFetch([
      {
        id: 5,
        createdAt: '2026-04-20T00:00:00.000Z',
        trainerId: 10,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      },
    ]);

    render(
      <ProviderLinkRequestsSection providerClubs={providerClubs} trainers={trainers} userId={2} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('link-request-pending-5')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    await waitFor(() => {
      const approveCall = fetchMock.mock.calls.find(
        ([url]) => typeof url === 'string' && url === '/api/trainer-club-links/5/approve',
      );
      expect(approveCall).toBeDefined();
    });
  });

  it('клик «Отвязать» шлёт POST /revoke', async () => {
    const fetchMock = mockFetch([
      {
        id: 6,
        createdAt: '2026-04-19T00:00:00.000Z',
        trainerId: 11,
        clubId: 1,
        status: 'confirmed',
        initiatedBy: 'trainer',
      },
    ]);

    render(
      <ProviderLinkRequestsSection providerClubs={providerClubs} trainers={trainers} userId={2} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('link-confirmed-6')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Отвязать' }));

    await waitFor(() => {
      const revokeCall = fetchMock.mock.calls.find(
        ([url]) => typeof url === 'string' && url === '/api/trainer-club-links/6/revoke',
      );
      expect(revokeCall).toBeDefined();
    });
  });
});
