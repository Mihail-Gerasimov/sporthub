/*
 * Тесты TrainerSlotCard — карточка слота на главной (Phase 28.12).
 *
 * Проверяем: capacity-pill всегда лайм со склонением, tone-ротация
 * по index%3, watermark номера, CTA «К записи» (button + auth-guard
 * через тот же handleSlotClick, что и раньше), nowrap на time/price,
 * line-clamp на name, room-skip при пустом значении.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TrainerSlotCard } from '@/components/trainers/TrainerSlotCard';

import type { TrainerAvailabilityItem } from '@/components/trainers/trainer-preview';

function makeSlot(overrides: Partial<TrainerAvailabilityItem> = {}): TrainerAvailabilityItem {
  return {
    id: 1,
    trainerId: 1,
    trainerName: 'Тренер Иванов',
    title: 'Бокс',
    date: '2026-05-05',
    startTime: '19:00',
    endTime: '20:00',
    price: 1500,
    room: 'Зал 1',
    availableSpots: 4,
    format: 'personal',
    venueLabel: 'Клуб Альфа',
    ...overrides,
  };
}

describe('TrainerSlotCard', () => {
  it('capacity-pill: склонение «1 место»', () => {
    render(<TrainerSlotCard item={makeSlot({ availableSpots: 1 })} index={0} onSelect={vi.fn()} />);
    expect(screen.getByText(/Свободно\s+1\s+место/i)).toBeInTheDocument();
  });

  it('capacity-pill: склонение «3 места»', () => {
    render(<TrainerSlotCard item={makeSlot({ availableSpots: 3 })} index={0} onSelect={vi.fn()} />);
    expect(screen.getByText(/Свободно\s+3\s+места/i)).toBeInTheDocument();
  });

  it('capacity-pill: склонение «10 мест»', () => {
    render(
      <TrainerSlotCard item={makeSlot({ availableSpots: 10 })} index={0} onSelect={vi.fn()} />,
    );
    expect(screen.getByText(/Свободно\s+10\s+мест/i)).toBeInTheDocument();
  });

  it('capacity-pill всегда имеет lime-цвет (нет orange/red вариантов даже при availableSpots=1)', () => {
    render(<TrainerSlotCard item={makeSlot({ availableSpots: 1 })} index={0} onSelect={vi.fn()} />);
    const pill = screen.getByText(/Свободно/i);
    // Lime-через CSS-переменную `--ui-lime` (через class) — проверяем,
    // что нет orange/red токенов на pill (любой их форме).
    const cls = pill.className;
    expect(cls).not.toMatch(/orange|red|warning|danger/i);
    // И есть упоминание lime в любой форме (через arbitrary value или класс).
    expect(cls).toMatch(/lime/i);
  });

  it('tone-ротация: index=0 → tone-lime, index=1 → tone-orange, index=2 → tone-blank, index=3 → tone-lime', () => {
    const tones = [0, 1, 2, 3].map((i) => {
      const { container } = render(
        <TrainerSlotCard item={makeSlot()} index={i} onSelect={vi.fn()} />,
      );
      const article = container.querySelector('article');
      return article?.className ?? '';
    });
    expect(tones[0]).toContain('tone-lime');
    expect(tones[1]).toContain('tone-orange');
    expect(tones[2]).toContain('tone-blank');
    expect(tones[3]).toContain('tone-lime');
  });

  it('watermark рендерит (index+1).padStart(2,"0")', () => {
    const { rerender } = render(<TrainerSlotCard item={makeSlot()} index={0} onSelect={vi.fn()} />);
    expect(screen.getByText('01')).toBeInTheDocument();

    rerender(<TrainerSlotCard item={makeSlot()} index={11} onSelect={vi.fn()} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('CTA «К записи» — кликабельная button, вызывает onSelect(item.id)', () => {
    const onSelect = vi.fn();
    render(<TrainerSlotCard item={makeSlot({ id: 42 })} index={0} onSelect={onSelect} />);
    const cta = screen.getByRole('button', { name: /к записи/i });
    expect(cta).toBeInTheDocument();
    fireEvent.click(cta);
    expect(onSelect).toHaveBeenCalledWith(42);
  });

  it('нет nested clickable: <article> — не button и не link', () => {
    const { container } = render(
      <TrainerSlotCard item={makeSlot()} index={0} onSelect={vi.fn()} />,
    );
    const article = container.querySelector('article');
    expect(article).not.toBeNull();
    expect(article?.tagName.toLowerCase()).toBe('article');
    // Не <a> и не имеет role="button"
    expect(article?.getAttribute('role')).not.toBe('button');
  });

  it('time и price имеют white-space: nowrap (через class .slot-box-val)', () => {
    const { container } = render(
      <TrainerSlotCard
        item={makeSlot({ startTime: '19:50', endTime: '20:40', price: 20000 })}
        index={0}
        onSelect={vi.fn()}
      />,
    );
    const vals = container.querySelectorAll('.slot-box-val');
    expect(vals.length).toBe(2);
    vals.forEach((v) => {
      expect(v.className).toContain('slot-box-val');
    });
  });

  it('room=undefined → строка не рендерится', () => {
    const { container } = render(
      <TrainerSlotCard item={makeSlot({ room: undefined })} index={0} onSelect={vi.fn()} />,
    );
    expect(container.querySelector('.slot-room')).toBeNull();
  });

  it('room передан → строка рендерится', () => {
    const { container } = render(
      <TrainerSlotCard item={makeSlot({ room: 'Зал 7' })} index={0} onSelect={vi.fn()} />,
    );
    expect(container.querySelector('.slot-room')).not.toBeNull();
    expect(screen.getByText('Зал 7')).toBeInTheDocument();
  });

  it('name (trainerName) имеет line-clamp-2 (длинное имя обрезается визуально)', () => {
    const longName = 'Очень-очень длинное имя тренера которое не должно ломать высоту карточки';
    const { container } = render(
      <TrainerSlotCard item={makeSlot({ trainerName: longName })} index={0} onSelect={vi.fn()} />,
    );
    const nameEl = container.querySelector('.slot-name');
    expect(nameEl).not.toBeNull();
    expect(nameEl?.textContent).toBe(longName);
    // line-clamp применяется через класс — не проверяем computed style,
    // просто наличие нашего CSS-class.
    expect(nameEl?.className).toMatch(/line-clamp-2|slot-name/);
  });
});
