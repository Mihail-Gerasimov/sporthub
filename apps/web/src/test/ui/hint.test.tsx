// Тесты подсказки `Hint` (фаза 38, шаг 38.51).
//
// Подсказка — не декорация, а доступное описание: текст обязан быть привязан
// к триггеру через `aria-describedby` ВСЕГДА, а не только пока пузырь виден, —
// экранный диктор читает описание с элемента, не с экрана. Видимый пузырь —
// для зрячих: по наведению, по фокусу с клавиатуры и по касанию; `Escape` его гасит.
//
// ⚠️ Касание на телефоне порождает вслед за собой эмулированные `mouseenter`
// и `focus`: без защиты второе касание закрывало бы пузырь и тут же открывало
// снова. Случай ниже это проверяет — он единственный, где важен ПОРЯДОК событий.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Hint } from '@/components/ui/Hint';

function renderHint() {
  return render(
    <Hint text="Клуб проверен площадкой">
      <button type="button">Проверен</button>
    </Hint>,
  );
}

describe('Hint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('связывает триггер с текстом через aria-describedby ещё до показа', () => {
    renderHint();

    const trigger = screen.getByRole('button', { name: 'Проверен' });

    expect(trigger).toHaveAccessibleDescription('Клуб проверен площадкой');
    // Пузырь скрыт: описание доступно диктору, а на экране пока ничего.
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });

  it('показывает пузырь по наведению и прячет, когда курсор ушёл', () => {
    renderHint();

    const trigger = screen.getByRole('button', { name: 'Проверен' });

    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toBeVisible();

    fireEvent.mouseLeave(trigger);
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });

  it('показывает пузырь по фокусу с клавиатуры и прячет по потере фокуса', () => {
    renderHint();

    const trigger = screen.getByRole('button', { name: 'Проверен' });

    act(() => trigger.focus());
    expect(screen.getByRole('tooltip')).toBeVisible();

    act(() => trigger.blur());
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });

  it('Escape гасит пузырь, не снимая фокус с триггера', () => {
    renderHint();

    const trigger = screen.getByRole('button', { name: 'Проверен' });

    act(() => trigger.focus());
    expect(screen.getByRole('tooltip')).toBeVisible();

    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
    expect(trigger).toHaveFocus();
  });

  it('Escape гасит пузырь, открытый наведением, — даже без фокуса внутри', () => {
    renderHint();

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Проверен' }));
    expect(screen.getByRole('tooltip')).toBeVisible();

    // Клавиша уходит в документ: курсор над триггером, фокус — где угодно.
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });

  it('касание открывает пузырь, второе касание закрывает — эмулированные события мыши не мешают', () => {
    renderHint();

    const trigger = screen.getByRole('button', { name: 'Проверен' });

    // Первое касание: touchstart, затем браузер эмулирует mouseenter и focus.
    fireEvent.touchStart(trigger);
    fireEvent.mouseEnter(trigger);
    act(() => trigger.focus());
    expect(screen.getByRole('tooltip')).toBeVisible();

    // Второе касание — та же хвостовая эмуляция; пузырь обязан закрыться и остаться закрытым.
    fireEvent.touchStart(trigger);
    fireEvent.mouseEnter(trigger);
    act(() => trigger.focus());
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible();
  });

  it('у правого края окна пузырь прижимается к краю, а не уезжает за него', () => {
    // jsdom геометрию не считает: правый край пузыря подставляется за границу окна.
    const measure = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 900, right: 1100, width: 200, top: 0, bottom: 20 } as DOMRect);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });

    try {
      renderHint();
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'Проверен' }));

      expect(screen.getByRole('tooltip')).toHaveAttribute('data-align', 'end');

      // Ушёл курсор — положение сброшено к центру: следующий замер идёт с нуля.
      fireEvent.mouseLeave(screen.getByRole('button', { name: 'Проверен' }));
      expect(screen.getByRole('tooltip', { hidden: true })).toHaveAttribute('data-align', 'center');
    } finally {
      measure.mockRestore();
    }
  });

  it('текст подсказки — один элемент: описание и пузырь не дублируются', () => {
    renderHint();

    expect(screen.getAllByText('Клуб проверен площадкой')).toHaveLength(1);
  });
});
