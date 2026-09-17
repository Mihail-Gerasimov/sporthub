/**
 * Правая колонка героя по макету (шаг 38.116; `HomePage.tsx:403-456`): карточка клуба
 * с фото сверху, бейдж «Верифицирован», имя и рейтинг с отзывами поверх; ниже
 * «Ближайшие занятия» строками — время моно, название, тренер, справа кнопка:
 * первое занятие — «Записаться», мало мест — «🔥 N места» красным, остальные —
 * «N мест». Логика наша: занятия дня клуба героя (сегодня, не началось, места),
 * каждая кнопка ведёт на запись `/booking/{id}`; без фото — заглушка, без занятий —
 * честное пустое состояние в том же каркасе. Плавающие виджеты макета не переносятся.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FocusCard } from '@/components/home/FocusCard';
import type { UpcomingSessionItem } from '@/components/schedule';
import { FOCUS } from '@/lib/home-copy';
import { LOW_SPOTS_TONE } from '@/lib/slot-spots';
import type { Club } from '@sporthub/types';

const club: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'CrossFit Garage',
  slug: 'crossfit-garage',
  description: 'Кроссфит-бокс',
  shortDescription: 'Кроссфит-бокс у метро.',
  city: 'Самара',
  address: 'Хамовники',
  phone: '',
  email: '',
  website: '',
  coordinates: { lat: 53.2, lng: 50.1 },
  sportIds: [3],
  imageUrls: ['/images/clubs/garage.jpg'],
  amenityIds: [],
  tagIds: [],
  rating: 4.9,
  reviewCount: 214,
  priceFrom: 900,
  distanceKm: 1.8,
  verifiedAt: '2026-09-15T10:00:00.000Z',
};

const session = (id: number, extra: Partial<UpcomingSessionItem> = {}): UpcomingSessionItem => ({
  id,
  title: `Занятие ${id}`,
  clubId: 1,
  clubName: 'CrossFit Garage',
  trainerName: `Тренер ${id}`,
  sportId: 1,
  date: '2026-09-16',
  startTime: `1${id}:00`,
  endTime: `1${id}:45`,
  price: 500,
  availableSpots: 8,
  ...extra,
});

describe('FocusCard (38.116 — по макету)', () => {
  it('карточка клуба: фото 200 с затемнением токеном, бейдж «Верифицирован», имя, рейтинг с отзывами и адресом', () => {
    render(<FocusCard club={club} sessions={[session(1)]} dateLabel="16 сентября" />);

    const card = screen.getByRole('complementary', { name: FOCUS.eyebrow });

    // `alt=""` — фото декоративное (имя стоит заголовком), у диктора роли нет.
    expect(card.querySelector('img')).toHaveAttribute('src', '/images/clubs/garage.jpg');
    expect(card.querySelector('.h-\\[200px\\]')).not.toBeNull();
    // Затемнение — свой токен героя (`HomePage.tsx:414`: 85% снизу до 55%), не витринный.
    expect(card.querySelector('[class*="--ui-decor-photo-shade-hero"]')).not.toBeNull();
    expect(within(card).getByText(FOCUS.verified)).toBeInTheDocument();
    expect(
      within(card).getByRole('heading', { level: 3, name: 'CrossFit Garage' }),
    ).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Рейтинг: 4.9 из 5' })).toBeInTheDocument();
    expect(within(card).getByText('(214) · Хамовники')).toBeInTheDocument();
    // Рейтинг и время — моноширинным (макет: DM Mono).
    expect(within(card).getByText('4.9').className).toContain('font-mono');
  });

  it('без verifiedAt бейджа нет; без фото — заглушка, а не битая картинка', () => {
    render(
      <FocusCard
        club={{ ...club, verifiedAt: undefined, imageUrls: [] }}
        sessions={[]}
        dateLabel="16 сентября"
      />,
    );

    expect(screen.queryByText(FOCUS.verified)).not.toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Фото клуба')).toBeInTheDocument();
  });

  it('«Ближайшие занятия» — до трёх строк: время моно, название, тренер; кнопка по состоянию, каждая ведёт на запись', () => {
    render(
      <FocusCard
        club={club}
        sessions={[session(1), session(2), session(3, { availableSpots: 2 }), session(4)]}
        dateLabel="16 сентября"
      />,
    );

    expect(screen.getByText(FOCUS.upcoming)).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('11:00').className).toContain('font-mono');
    expect(within(rows[0]).getByText('Занятие 1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Тренер 1')).toBeInTheDocument();

    // Первое — «Записаться» зелёным мягким; остальные — «N мест»; мало мест — красным с огоньком.
    const first = screen.getByRole('link', { name: `${FOCUS.cta}: Занятие 1, 11:00` });
    expect(first).toHaveAttribute('href', '/booking/1');
    expect(first).toHaveTextContent(FOCUS.cta);
    const plain = screen.getByRole('link', { name: `${FOCUS.cta}: Занятие 2, 12:00` });
    expect(plain).toHaveTextContent('8 мест');
    const low = screen.getByRole('link', { name: `${FOCUS.cta}: Занятие 3, 13:00` });
    expect(low).toHaveTextContent('2 места');
    expect(low.className).toContain(LOW_SPOTS_TONE);
    // Кнопка строки — размер `2xs` по числам макета (`HomePage.tsx:448`, ревью Э14):
    // 27 высоты, радиус 8, подпись 10px — не `xs` карты (32/9/12).
    for (const button of [first, plain, low]) {
      expect(button.className).toContain('min-h-[27px]');
      expect(button.className).toContain('rounded-lg');
      expect(button.className).toContain('text-[10px]');
    }
  });

  it('без занятий — тот же каркас: фото и имя клуба на месте, вместо строк — подсказка с датой, ссылок на запись нет', () => {
    render(<FocusCard club={club} sessions={[]} dateLabel="16 сентября" />);

    expect(screen.getByRole('heading', { level: 3, name: 'CrossFit Garage' })).toBeInTheDocument();
    expect(screen.getByText(FOCUS.upcoming)).toBeInTheDocument();
    expect(screen.getByText(FOCUS.emptyHint('16 сентября'))).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('пустой каталог — клуба нет: тёмная зона с «Слоты скоро появятся», подсказка с датой', () => {
    render(<FocusCard sessions={[]} dateLabel="16 сентября" />);

    expect(screen.getByRole('heading', { level: 3, name: FOCUS.emptyTitle })).toBeInTheDocument();
    expect(screen.getByText(FOCUS.emptyHint('16 сентября'))).toBeInTheDocument();
    expect(screen.queryByText(FOCUS.verified)).not.toBeInTheDocument();
  });

  it('плавающих виджетов макета нет: ни «Запись подтверждена», ни «Моя статистика»', () => {
    render(<FocusCard club={club} sessions={[session(1)]} dateLabel="16 сентября" />);

    expect(screen.queryByText(/Запись подтверждена/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Моя статистика/)).not.toBeInTheDocument();
    // Ошибка загрузки фото падает в заглушку.
    fireEvent.error(document.querySelector('img') as HTMLImageElement);
    expect(screen.getByText('Фото клуба')).toBeInTheDocument();
  });
});
