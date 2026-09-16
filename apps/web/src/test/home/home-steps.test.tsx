// Тесты секции «Три шага» (шаг 38.71).
//
// Секция статична, поэтому проверяется контракт разметки: три шага по порядку,
// номера из позиции, заголовки — решение заказчика «третий шаг без дневника»
// закреплено буквально: слов «дневник» и «челлендж» в секции нет.

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomeSteps } from '@/components/home/HomeSteps';
import { STEPS } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';

describe('HomeSteps', () => {
  it('якорь и подпись секции — из записи словаря секций', () => {
    render(<HomeSteps />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.steps.label });

    expect(section.id).toBe(HOME_SECTIONS.steps.id);
  });

  it('секция с заголовком и тремя шагами по порядку', () => {
    render(<HomeSteps />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.steps.label });
    const steps = within(section).getAllByRole('listitem');

    expect(steps).toHaveLength(3);
    // Заголовки — из словаря `home-copy`, по порядку словаря.
    expect(
      steps.map((step) => within(step).getByRole('heading', { level: 3 }).textContent),
    ).toEqual(STEPS.items.map((item) => item.title));
  });

  it('номера шагов — из словаря, в его порядке, и скрыты от диктора', () => {
    const { container } = render(<HomeSteps />);

    const numbers = [...container.querySelectorAll('[aria-hidden="true"]')]
      .map((node) => node.textContent)
      .filter((text) => /^\d\d$/.test(text ?? ''));

    expect(numbers).toEqual(STEPS.items.map((step) => step.number));
  });

  it('иконка шага берётся по ключу записи: у каждого шага своя, ни одна не повторяется', () => {
    render(<HomeSteps />);

    const items = screen.getAllByRole('listitem');
    const icons = items.map((item) => item.querySelector('svg')?.innerHTML ?? '');

    expect(items).toHaveLength(STEPS.items.length);
    expect(new Set(icons).size).toBe(STEPS.items.length);
  });

  it('заголовки шагов — .t-h3 словаря обычным регистром; номера — крупные приглушённые (38.109)', () => {
    const { container } = render(<HomeSteps />);

    // Класс словаря типографики, а не литералы кегля: одно объявление — в globals.css.
    for (const heading of screen.getAllByRole('heading', { level: 3 })) {
      expect(heading.className).toContain('t-h3');
      expect(heading.className).not.toContain('uppercase');
    }

    const numbers = [...container.querySelectorAll('[aria-hidden="true"]')].filter((node) =>
      /^\d\d$/.test(node.textContent ?? ''),
    );

    expect(numbers).toHaveLength(STEPS.items.length);
    for (const number of numbers) {
      expect(number.className).toMatch(/text-\[40px\]/);
      expect(number.className).toMatch(/text-ink\/\[0\.05\]/);
    }
  });

  it('третий шаг — без дневника и челленджей (решение заказчика)', () => {
    render(<HomeSteps />);

    const text = screen.getByRole('region', { name: HOME_SECTIONS.steps.label }).textContent ?? '';

    expect(text).not.toMatch(/дневник/i);
    expect(text).not.toMatch(/челлендж/i);
    // Вместо них — то, что есть: история занятий в кабинете и отзыв после посещения.
    expect(text).toMatch(/отзыв/i);
    // Посещение отмечает провайдер, не спортсмен (ревью 38.71): шаг говорит «приходи».
    expect(text).not.toMatch(/отмечай посещен/i);
  });

  it('у каждого шага есть иконка, скрытая от диктора, — контент несёт текст', () => {
    render(<HomeSteps />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.steps.label });

    expect(section.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
  });
});
