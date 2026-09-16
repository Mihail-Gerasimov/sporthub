/**
 * «Сегодня в фокусе» (шаг 38.70): первое занятие, LIVE, до трёх строк расписания,
 * «Записаться» → /booking/{id}, счётчик со склонением, пустое состояние с датой.
 * Шаг 38.88: из героя к слотам ведёт ссылка «Все слоты» у счётчика — на якорь
 * секции слотов из словаря (тупик № 1: прежняя кнопка героя вела в никуда);
 * с 38.79c слоты живут на каталоге — адрес из `catalog-sections`.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FocusCard } from '@/components/home/FocusCard';
import type { UpcomingSessionItem } from '@/components/schedule';
import { FOCUS } from '@/lib/home-copy';
import { catalogSectionHref } from '@/lib/catalog-sections';

const session = (id: number, extra: Partial<UpcomingSessionItem> = {}): UpcomingSessionItem => ({
  id,
  title: `Занятие ${id}`,
  clubId: 1,
  clubName: 'Атлант',
  sportId: 1,
  date: '2026-09-16',
  startTime: `1${id}:00`,
  endTime: `1${id}:45`,
  price: 500,
  availableSpots: 8,
  ...extra,
});

describe('FocusCard', () => {
  it('первое занятие — в тёмной зоне: время, название, клуб и LIVE; «Записаться» ведёт на запись', () => {
    render(
      <FocusCard
        sessions={[session(1), session(2), session(3, { availableSpots: 2 }), session(4)]}
        dateLabel="16 сентября"
      />,
    );
    expect(screen.getByRole('complementary', { name: 'Сегодня в фокусе' })).toBeInTheDocument();
    // Время первого занятия — крупно в тёмной зоне (и ещё раз в строке расписания).
    expect(screen.getAllByText('11:00')[0].className).toContain('text-[40px]');
    expect(screen.getByRole('heading', { level: 3, name: 'Занятие 1' })).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Записаться: Занятие 1, 11:00' })).toHaveAttribute(
      'href',
      '/booking/1',
    );
  });

  it('расписание — не больше трёх строк; мало мест — красная подпись; счётчик считает все занятия дня', () => {
    render(
      <FocusCard
        sessions={[session(1), session(2), session(3, { availableSpots: 2 }), session(4)]}
        dateLabel="16 сентября"
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    const low = screen.getByRole('link', { name: 'Записаться: Занятие 3, 13:00' });
    // Подпись и порог — из lib/slot-spots: склонение верное, красная с двух мест.
    expect(low).toHaveTextContent('2 места');
    expect(low.className).toContain('text-red');
    expect(screen.getByText('4 занятия')).toBeInTheDocument();
    expect(screen.getByText('сегодня')).toBeInTheDocument();
  });

  it('вход к слотам из героя: ссылка «Все слоты» у счётчика ведёт на якорь слотов каталога из словаря', () => {
    render(<FocusCard sessions={[session(1)]} dateLabel="16 сентября" />);
    const link = screen.getByRole('link', { name: FOCUS.allSlots });
    expect(link).toHaveAttribute('href', catalogSectionHref('availability'));
    // Ссылка есть и без занятий: слоты и окна тренеров — ниже на странице.
  });

  it('без занятий ссылка к слотам остаётся — секция ниже покажет окна тренеров', () => {
    render(<FocusCard sessions={[]} dateLabel="16 сентября" />);
    expect(screen.getByRole('link', { name: FOCUS.allSlots })).toHaveAttribute(
      'href',
      catalogSectionHref('availability'),
    );
  });

  it('без занятий: «—:—», «Слоты скоро появятся», подсказка с датой, LIVE нет, счётчик «0 занятий»', () => {
    render(<FocusCard sessions={[]} dateLabel="16 сентября" />);
    expect(screen.getByText('—:—')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Слоты скоро появятся' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Проверь расписание на 16 сентября').length).toBeGreaterThan(0);
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    // Ссылок на запись нет — единственная ссылка ведёт к секции слотов (38.88).
    expect(screen.queryByRole('link', { name: /Записаться/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('0 занятий')).toBeInTheDocument();
  });

  it('верхняя зона — тёмная плашка без штриховки-заглушки: сокращённый background сбрасывал bg-plate', () => {
    render(<FocusCard sessions={[session(1)]} dateLabel="16 сентября" />);
    const zone = screen.getByRole('heading', { level: 3 }).parentElement?.parentElement;
    expect(zone?.className).toContain('bg-plate');
    expect(zone?.className).not.toContain('hero-bg-blank');
  });

  it('склонение из словаря: одно занятие', () => {
    render(<FocusCard sessions={[session(1)]} dateLabel="16 сентября" />);
    expect(screen.getByText('1 занятие')).toBeInTheDocument();
  });
});
