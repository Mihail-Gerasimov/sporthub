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

  it('иконки шагов — lucide по ключу записи, как в макете: лупа, календарь, столбики (не галочка)', () => {
    render(<HomeSteps />);

    const items = screen.getAllByRole('listitem');
    const icons = items.map((item) => item.querySelector('svg')?.innerHTML ?? '');

    expect(items).toHaveLength(STEPS.items.length);
    expect(new Set(icons).size).toBe(STEPS.items.length);
    // Лупа — круг и ручка; календарь — рамка и «ушки»; третий — три столбика `bar-chart-2`.
    expect(icons[0]).toMatch(/<circle/);
    expect(icons[1]).toMatch(/<rect/);
    expect((icons[2].match(/<line/g) ?? []).length).toBe(3);
    expect(icons[2]).not.toMatch(/<circle/);
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
      // DM Mono макета (38.113), не display-шрифт.
      expect(number.className).toMatch(/\bfont-mono\b/);
      expect(number.className).not.toMatch(/font-display/);
      expect(number.className).toMatch(/text-\[40px\]/);
      expect(number.className).toMatch(/text-ink\/\[0\.05\]/);
    }
  });

  it('отступы секции и шапки — числами макета: 64 сверху, 56 снизу, шапка 44 (аудит 38.71)', () => {
    render(<HomeSteps />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.steps.label });

    expect(section.className).toMatch(/\bpt-16\b/);
    expect(section.className).toMatch(/\bpb-14\b/);
    expect(section.className).not.toMatch(/py-1[46]/);
    expect(section.querySelector('.mb-11')).not.toBeNull();
    // Бокс иконки — ближайший к 8 % макета токен подложки, не 12 %.
    const box = section.querySelector('svg')?.parentElement;

    expect(box?.className).toContain('bg-tint-lime');
    expect(box?.className).not.toContain('bg-lime-soft');
    // Значок — графика: яркий зелёный макета, как у плиток «Возможности».
    expect(box?.className).toMatch(/\btext-lime\b/);
  });

  it('тексты шагов — слово в слово из словаря, третий про дневник и челленджи (Э14)', () => {
    render(<HomeSteps />);

    for (const step of STEPS.items) {
      expect(screen.getByText(step.body)).toBeInTheDocument();
    }
    expect(STEPS.items[1].title).toBe('Забронируй онлайн');
    expect(STEPS.items[2].body).toMatch(/дневник/);
  });

  it('у каждого шага есть иконка, скрытая от диктора, — контент несёт текст', () => {
    render(<HomeSteps />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.steps.label });

    expect(section.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
  });
});
