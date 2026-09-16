/*
 * Тесты SlotCard — общая карточка слота на главной (Phase 28.13, вид эталона — 38.81).
 *
 * Проверяем: подпись мест со склонением из словаря и КРАСНАЯ при ≤ LOW_SPOTS
 * (реестр № 124), tone-ротация по index%3, watermark номера, CTA «К записи»
 * (кнопка ui/Button + сторож входа через onSelect снаружи — путь к записи цел),
 * nowrap на time/price, line-clamp на name, room-skip при пустом значении,
 * нейтральный контракт {eyebrow, name, sport, ...}, без подъёма при наведении.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SlotCard } from '@/components/ui/SlotCard';
import { LOW_SPOTS } from '@/lib/slot-spots';

type SlotProps = Parameters<typeof SlotCard>[0];

function makeProps(overrides: Partial<SlotProps> = {}): SlotProps {
  return {
    eyebrow: 'Персональная услуга',
    name: 'Тренер Иванов',
    sport: 'Бокс',
    availableSpots: 4,
    startTime: '19:00',
    endTime: '20:00',
    price: 1500,
    venueLabel: 'Клуб Альфа',
    room: 'Зал 1',
    index: 0,
    slotId: 1,
    onSelect: vi.fn(),
    ctaAriaName: 'К записи: Тренер Иванов',
    ...overrides,
  };
}

describe('SlotCard', () => {
  it('capacity-pill: склонение «1 место»', () => {
    render(<SlotCard {...makeProps({ availableSpots: 1 })} />);
    expect(screen.getByText(/Свободно 1 место/i)).toBeInTheDocument();
  });

  it('capacity-pill: склонение «3 места»', () => {
    render(<SlotCard {...makeProps({ availableSpots: 3 })} />);
    expect(screen.getByText(/Свободно 3 места/i)).toBeInTheDocument();
  });

  it('capacity-pill: склонение «10 мест»', () => {
    render(<SlotCard {...makeProps({ availableSpots: 10 })} />);
    expect(screen.getByText(/Свободно 10 мест/i)).toBeInTheDocument();
  });

  it('подпись мест: при остатке ≤ LOW_SPOTS — красная, выше — зелёная (реестр № 124)', () => {
    const { rerender } = render(<SlotCard {...makeProps({ availableSpots: LOW_SPOTS })} />);

    expect(screen.getByText(/Свободно/i).className).toMatch(/text-red/);
    expect(screen.getByText(/Свободно/i).className).not.toMatch(/lime/);

    rerender(<SlotCard {...makeProps({ availableSpots: 1 })} />);
    expect(screen.getByText(/Свободно/i).className).toMatch(/text-red/);

    rerender(<SlotCard {...makeProps({ availableSpots: LOW_SPOTS + 1 })} />);
    expect(screen.getByText(/Свободно/i).className).toMatch(/text-lime-hov/);
    expect(screen.getByText(/Свободно/i).className).not.toMatch(/red/);
  });

  it('склонение мест — из словаря PLURAL, включая «11 мест» и «21 место»', () => {
    const { rerender } = render(<SlotCard {...makeProps({ availableSpots: 11 })} />);
    expect(screen.getByText(/Свободно 11 мест/)).toBeInTheDocument();

    rerender(<SlotCard {...makeProps({ availableSpots: 21 })} />);
    expect(screen.getByText(/Свободно 21 место/)).toBeInTheDocument();
  });

  it('tone-ротация: index=0 → tone-lime, index=1 → tone-orange, index=2 → tone-blank, index=3 → tone-lime', () => {
    const tones = [0, 1, 2, 3].map((i) => {
      const { container } = render(<SlotCard {...makeProps({ index: i })} />);
      const article = container.querySelector('article');
      return article?.className ?? '';
    });
    expect(tones[0]).toContain('tone-lime');
    expect(tones[1]).toContain('tone-orange');
    expect(tones[2]).toContain('tone-blank');
    expect(tones[3]).toContain('tone-lime');
  });

  it('watermark рендерит (index+1).padStart(2,"0")', () => {
    const { rerender } = render(<SlotCard {...makeProps({ index: 0 })} />);
    expect(screen.getByText('01')).toBeInTheDocument();

    rerender(<SlotCard {...makeProps({ index: 11 })} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('CTA «К записи» — кликабельная button, вызывает onSelect(slotId)', () => {
    const onSelect = vi.fn();
    render(<SlotCard {...makeProps({ slotId: 42, onSelect })} />);
    const cta = screen.getByRole('button', { name: /к записи/i });
    expect(cta).toBeInTheDocument();
    fireEvent.click(cta);
    expect(onSelect).toHaveBeenCalledWith(42);
  });

  it('CTA aria-label берётся из ctaAriaName', () => {
    render(<SlotCard {...makeProps({ ctaAriaName: 'К записи: Утреннее плавание' })} />);
    expect(screen.getByRole('button', { name: 'К записи: Утреннее плавание' })).toBeInTheDocument();
  });

  it('нет nested clickable: <article> — не button и не link', () => {
    const { container } = render(<SlotCard {...makeProps()} />);
    const article = container.querySelector('article');
    expect(article).not.toBeNull();
    expect(article?.tagName.toLowerCase()).toBe('article');
    expect(article?.getAttribute('role')).not.toBe('button');
  });

  it('time и price имеют класс slot-box-val (nowrap+clamp)', () => {
    const { container } = render(
      <SlotCard {...makeProps({ startTime: '19:50', endTime: '20:40', price: 20000 })} />,
    );
    const vals = container.querySelectorAll('.slot-box-val');
    expect(vals.length).toBe(2);
    vals.forEach((v) => {
      expect(v.className).toContain('slot-box-val');
    });
  });

  it('room=undefined → строка не рендерится', () => {
    const { container } = render(<SlotCard {...makeProps({ room: undefined })} />);
    expect(container.querySelector('.slot-room')).toBeNull();
  });

  it('room передан → строка рендерится', () => {
    const { container } = render(<SlotCard {...makeProps({ room: 'Зал 7' })} />);
    expect(container.querySelector('.slot-room')).not.toBeNull();
    expect(screen.getByText('Зал 7')).toBeInTheDocument();
  });

  it('name имеет класс slot-name + line-clamp-2', () => {
    const longName = 'Очень длинное имя тренера которое не должно ломать высоту карточки';
    const { container } = render(<SlotCard {...makeProps({ name: longName })} />);
    const nameEl = container.querySelector('.slot-name');
    expect(nameEl).not.toBeNull();
    expect(nameEl?.textContent).toBe(longName);
    expect(nameEl?.className).toMatch(/line-clamp-2/);
  });

  it('eyebrow приходит из props (тренерский вариант)', () => {
    render(<SlotCard {...makeProps({ eyebrow: 'Персональная услуга' })} />);
    expect(screen.getByText('Персональная услуга')).toBeInTheDocument();
  });

  it('eyebrow приходит из props (клубный вариант)', () => {
    render(<SlotCard {...makeProps({ eyebrow: 'Групповое занятие' })} />);
    expect(screen.getByText('Групповое занятие')).toBeInTheDocument();
  });

  it('sport приходит из props и рендерится в .slot-sport', () => {
    const { container } = render(<SlotCard {...makeProps({ sport: 'Кроссфит' })} />);
    const sportEl = container.querySelector('.slot-sport');
    expect(sportEl?.textContent).toBe('Кроссфит');
  });

  it('venueLabel рендерится в .slot-venue-name', () => {
    const { container } = render(<SlotCard {...makeProps({ venueLabel: 'Самарский бассейн' })} />);
    const venueEl = container.querySelector('.slot-venue-name');
    expect(venueEl?.textContent).toBe('Самарский бассейн');
  });

  // --- Вид эталона (38.81) ---

  it('CTA — кнопка дизайн-системы: радиус rounded-button, зелёная обводка, не pill', () => {
    render(<SlotCard {...makeProps()} />);
    const cls = screen.getByRole('button', { name: /к записи/i }).className;

    expect(cls).toMatch(/rounded-button|rounded-\[9px\]/);
    expect(cls).toMatch(/border-lime/);
    expect(cls).not.toMatch(/rounded-pill/);
  });

  it('карточка: радиус 18, обводка зеленеет при наведении, подъёма нет', () => {
    const { container } = render(<SlotCard {...makeProps()} />);
    const cls = container.querySelector('article')?.className ?? '';

    expect(cls).toContain('rounded-[18px]');
    expect(cls).toContain('hover:border-lime');
    expect(cls).not.toMatch(/translate/);
  });

  it('hero-зона на bg-card-2, время и цена display-шрифтом с tabular-nums', () => {
    const { container } = render(<SlotCard {...makeProps()} />);

    expect(container.querySelector('.slot-hero')?.className).toContain('bg-card-2');
    for (const value of container.querySelectorAll('.slot-box-val')) {
      expect(value.className).toContain('font-display');
    }
  });
});
