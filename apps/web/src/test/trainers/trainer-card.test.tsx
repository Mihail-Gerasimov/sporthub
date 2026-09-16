/*
 * Тесты TrainerCard — карточка тренера по эталону витрины (фаза 38, шаг 38.74;
 * `HomePage.tsx:120-160`, чек-лист эталона step-45…48).
 *
 * Форма — из макета: белая карточка радиусом 18 с отступом 18, зелёная риска сверху,
 * аватар 56×56 с зелёной рамкой и точкой у доступного, имя, специализация, звезда
 * с рейтингом и отзывами, цена «от N», чип «Доступен сейчас». Логика — наша (реестр
 * № 97–108): чип считается от расписания дня, а не флагом; вся карточка ведёт на
 * СТРАНИЦУ тренера; «К записи» — отдельная ссылка на ближайшее окно; «Площадка /
 * Ближайшее окно», «N лет опыта», «Группа», sport-tag, лента специализаций и цитата
 * остаются; знак «проверено» по `verifiedAt`; hover имени — классом, не строкой.
 *
 * Подпись `aria-label="Карточка тренера: …"` — контракт единственности
 * (сторож `trainer-card-single`).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainerCard } from '@/components/trainers/TrainerCard';
import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

const baseTrainer: TrainerDirectoryItem = {
  id: 1,
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Тренер по плаванию.',
  avatarUrl: '/images/trainers/marina.jpg',
  experienceYears: 9,
  specialtyIds: [1],
  specialtyNames: ['Подготовка к соревнованиям'],
  rating: 0,
  reviewCount: 0,
  priceFrom: 1400,
  sportIds: [3],
  sports: [{ id: 3, name: 'Плавание', icon: '🏊' }],
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  distanceKm: 1.8,
  venueName: 'Volna Aquatic Club',
  venueLabel: 'Volna Aquatic Club',
  venueAddress: 'ул. Лесная, 23к1',
  primaryOfferingId: 101,
  primaryOfferingTitle: 'Персональная тренировка',
  primaryOfferingFormat: 'personal',
  nextSlotId: 1,
  nextSlotDate: '2026-03-18',
  nextSlotStartTime: '07:30',
  availableSlotsCount: 5,
  offeringTitles: ['Персональная тренировка'],
  offerings: [],
  searchText: 'марина соколова плавание volna aquatic club',
};

const busyTrainer: TrainerDirectoryItem = {
  ...baseTrainer,
  nextSlotId: null,
  nextSlotDate: null,
  nextSlotStartTime: null,
  availableSlotsCount: 0,
};

describe('TrainerCard (38.74)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('карточка — <article> с подписью «Карточка тренера: имя», без обёртки <a>', () => {
    render(<TrainerCard trainer={baseTrainer} />);

    const card = screen.getByRole('article', { name: 'Карточка тренера: Марина Соколова' });

    expect(card).toHaveAttribute('data-testid', 'trainer-card');
    expect(card.closest('a')).toBeNull();
  });

  it('две независимые ссылки: имя растянуто на карточку → страница тренера, «К записи» → окно', () => {
    render(<TrainerCard trainer={baseTrainer} />);

    const name = screen.getByRole('link', { name: 'Марина Соколова' });

    expect(name).toHaveAttribute('href', '/trainers/marina-sokolova');
    expect(name.className).toContain('after:absolute');
    // Hover имени — классом, а не собранной строкой (реестр № 108).
    expect(name.className).toContain('hover:text-lime-hov');
    // Подпись с именем: в ряду из шести карточек шесть «К записи» неразличимы для диктора.
    expect(screen.getByRole('link', { name: 'К записи: Марина Соколова' })).toHaveAttribute(
      'href',
      '/booking/1',
    );
  });

  it('без ближайшего окна «К записи» ведёт на профиль, а окно — «Слоты скоро появятся»', () => {
    render(<TrainerCard trainer={busyTrainer} />);

    expect(screen.getByRole('link', { name: /К записи/ })).toHaveAttribute(
      'href',
      '/trainers/marina-sokolova',
    );
    expect(screen.getByText('Слоты скоро появятся')).toBeInTheDocument();
  });

  it('чип «Доступен сейчас» — от расписания дня: есть свободное окно — чип, зелёная рамка и точка; нет — ничего', () => {
    const { unmount } = render(<TrainerCard trainer={baseTrainer} />);

    expect(screen.getByText('Доступен сейчас')).toBeInTheDocument();
    expect(screen.getByTestId('trainer-card')).toHaveAttribute('data-available', 'true');

    unmount();
    render(<TrainerCard trainer={busyTrainer} />);

    expect(screen.queryByText('Доступен сейчас')).not.toBeInTheDocument();
    expect(screen.getByTestId('trainer-card')).toHaveAttribute('data-available', 'false');
  });

  it('аватар 56×56 — из avatarUrl с именем в alt; без адреса или при ошибке — инициалы', () => {
    const { unmount } = render(<TrainerCard trainer={baseTrainer} />);

    const photo = screen.getByRole('img', { name: 'Марина Соколова' });

    expect(photo).toHaveAttribute('src', '/images/trainers/marina.jpg');

    fireEvent.error(photo);

    expect(screen.queryByRole('img', { name: 'Марина Соколова' })).not.toBeInTheDocument();
    expect(screen.getByText('МС')).toBeInTheDocument();

    unmount();
    render(<TrainerCard trainer={{ ...baseTrainer, avatarUrl: '' }} />);

    expect(screen.getByText('МС')).toBeInTheDocument();
  });

  it('специализация под именем — название первой услуги, иначе био', () => {
    const { unmount } = render(<TrainerCard trainer={baseTrainer} />);

    expect(screen.getByText('Персональная тренировка')).toBeInTheDocument();

    unmount();
    render(<TrainerCard trainer={{ ...baseTrainer, primaryOfferingTitle: null }} />);

    expect(screen.getAllByText('Тренер по плаванию.').length).toBeGreaterThan(0);
  });

  it('рейтинг со звездой и подписью для диктора, отзывы и цена; без рейтинга — «Новый»', () => {
    const { unmount } = render(
      <TrainerCard trainer={{ ...baseTrainer, rating: 4.9, reviewCount: 31 }} />,
    );

    expect(screen.getByRole('img', { name: 'Рейтинг: 4.9 из 5' })).toBeInTheDocument();
    expect(screen.getByText('(31)')).toBeInTheDocument();
    expect(screen.getByText(/^от\s+1\s?400/)).toBeInTheDocument();
    expect(screen.queryByTestId('trainer-card-new-badge')).not.toBeInTheDocument();

    unmount();
    render(<TrainerCard trainer={baseTrainer} />);

    expect(screen.getByTestId('trainer-card-new-badge')).toHaveTextContent('Новый');
    expect(screen.queryByRole('img', { name: /Рейтинг/ })).not.toBeInTheDocument();
  });

  it('наше остаётся: sport-tag, «N лет опыта», «Группа» по формату, площадка и окно, специализации лентой', () => {
    render(<TrainerCard trainer={{ ...baseTrainer, primaryOfferingFormat: 'mini_group' }} />);

    expect(screen.getByText('Плавание')).toBeInTheDocument();
    expect(screen.getByText('9 лет опыта')).toBeInTheDocument();
    expect(screen.getByText('Группа')).toBeInTheDocument();
    expect(screen.getByText('Площадка')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByText('Ближайшее окно')).toBeInTheDocument();
    expect(screen.getByText('Подготовка к соревнованиям')).toBeInTheDocument();
  });

  it('«Группа» не рисуется у персонального формата; без площадки — «Без привязки»', () => {
    render(
      <TrainerCard
        trainer={{ ...baseTrainer, venueName: null, venueLabel: '', venueAddress: '' }}
      />,
    );

    expect(screen.queryByText('Группа')).not.toBeInTheDocument();
    expect(screen.getByText('Без привязки')).toBeInTheDocument();
  });

  it('расстояние либо «N окон» со склонением из словаря', () => {
    const { unmount } = render(<TrainerCard trainer={baseTrainer} />);

    expect(screen.getByText('1.8 км')).toBeInTheDocument();

    unmount();
    render(<TrainerCard trainer={{ ...baseTrainer, distanceKm: null, availableSlotsCount: 3 }} />);

    expect(screen.getByText('3 окна')).toBeInTheDocument();
  });

  it('highlighted → атрибут и зелёная рамка', () => {
    render(<TrainerCard trainer={baseTrainer} highlighted />);

    expect(screen.getByTestId('trainer-card')).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByTestId('trainer-card').className).toContain('border-lime');
  });

  // Фаза 38, шаг 38.52: знак «проверено» — по полю `verifiedAt`, подпись по виду лица.
  it('у проверенного тренера стоит знак «Тренер проверен» с подсказкой; без verifiedAt знака нет', () => {
    const { unmount } = render(
      <TrainerCard trainer={{ ...baseTrainer, verifiedAt: '2026-09-15T10:00:00.000Z' }} />,
    );

    const badge = screen.getByTestId('verified-badge');

    expect(badge).toHaveTextContent('Тренер проверен');
    expect(badge).toHaveAccessibleDescription(/проверила администрация/i);

    unmount();
    render(<TrainerCard trainer={baseTrainer} />);

    expect(screen.queryByTestId('verified-badge')).not.toBeInTheDocument();
  });
});
