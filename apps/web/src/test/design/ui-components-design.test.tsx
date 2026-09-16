/**
 * Контракт дизайна базовых UI-компонентов — правила эталона ПРОСПОРТ (шаг 38.14).
 *
 * ⚠️ Переписан тем же коммитом, что классы `Button`/`Badge`/`Chip`/`Card`: прежний
 * набор утверждал минимализм фазы 31 («тени нигде»), а дизайн фазы 38 держит тень
 * ровно в двух местах — свечение solid-кнопки и подложка карточки. Тест утверждает
 * ГДЕ тень есть и где её нет, а не «нигде»: иначе он молчал бы и на кнопке без
 * свечения, и на бейдже с тенью.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';

describe('UI-компоненты под дизайн ПРОСПОРТ', () => {
  describe('Button', () => {
    it('solid-primary — единственный вариант со свечением и подъёмом', () => {
      render(<Button variant="primary">Записаться</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('shadow-glow');
      expect(button.className).toContain('hover:-translate-y-px');
    });

    it.each(['secondary', 'outline', 'ghost'] as const)(
      'вариант %s — без тени и без подъёма: меняются обводка, фон и цвет',
      (variant) => {
        render(<Button variant={variant}>Подробнее</Button>);
        const button = screen.getByRole('button');
        expect(button.className).not.toMatch(/\bshadow-/);
        expect(button.className).not.toContain('translate');
      },
    );

    it('подпись — display-шрифтом в верхнем регистре, обводка 2px, радиус 12px как в макете', () => {
      render(<Button>Найти</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('font-display');
      expect(button.className).toContain('uppercase');
      expect(button.className).toContain('border-2');
      // 38.14a: радиус кнопок — 12px из макета (решение заказчика), не pill.
      expect(button.className).toContain('rounded-button');
      expect(button.className).not.toContain('rounded-pill');
    });

    it('трекинг подписи не превышает 0.05em', () => {
      render(<Button>Найти</Button>);
      const trackingMatch = screen.getByRole('button').className.match(/tracking-\[([0-9.]+)em\]/);
      expect(trackingMatch).not.toBeNull();
      expect(parseFloat(trackingMatch![1])).toBeLessThanOrEqual(0.05);
    });

    it('цвета — только токенами: ни hex, ни оттенков Tailwind в классах', () => {
      render(<Button>Найти</Button>);
      expect(screen.getByRole('button').className).not.toMatch(
        /#[0-9a-f]{3,8}|-(red|green|gray)-\d/i,
      );
    });

    // Ревью 38.80: путь к странице обязан быть ссылкой, а вид — тем же, что у кнопки:
    // второй «кнопки-ссылки» со своими классами быть не должно.
    it('с `href` — ссылка next/link в тех же классах варианта и размера, без `type`', () => {
      render(
        <Button href="/clubs/atlant" variant="primary" size="xs">
          Подробнее
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'Подробнее' });
      expect(link).toHaveAttribute('href', '/clubs/atlant');
      expect(link).not.toHaveAttribute('type');
      expect(link.className).toContain('shadow-glow');
      expect(link.className).toContain('font-display');
      expect(link.className).toContain('rounded-[9px]');
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('ссылка не ждёт: `href` с `loading` — без спиннера и без aria-busy (ревью 38.80)', () => {
      render(
        <Button href="/clubs/atlant" loading>
          Подробнее
        </Button>,
      );
      const link = screen.getByRole('link', { name: 'Подробнее' });
      expect(link).not.toHaveAttribute('aria-busy');
      expect(link.querySelector('.animate-spin')).toBeNull();
      expect(link.textContent).not.toContain('Загрузка');
    });

    it('размер xs — мини-кнопка слоя над картой и строк расписания: радиус 9, обводка 1px, 12px', () => {
      render(<Button size="xs">Закрыть</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('rounded-[9px]');
      expect(button.className).toContain('text-[12px]');
      expect(button.className).not.toContain('border-2');
      expect(button.className).not.toContain('rounded-button');
    });

    it('вариант soft — мягкая зелёная подложка с тёмно-зелёным текстом, без тени', () => {
      render(<Button variant="soft">Записаться</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-lime-soft');
      expect(button.className).toContain('text-lime-hov');
      expect(button.className).not.toMatch(/\bshadow-/);
    });
  });

  describe('Badge', () => {
    it('трекинг не превышает 0.10em и нет тени', () => {
      render(<Badge>Тест</Badge>);
      const badge = screen.getByText('Тест');
      const trackingMatch = badge.className.match(/tracking-\[([0-9.]+)em\]/);
      expect(trackingMatch).not.toBeNull();
      expect(parseFloat(trackingMatch![1])).toBeLessThanOrEqual(0.1);
      expect(badge.className).not.toMatch(/\bshadow-/);
    });

    it('positive-тон — тёмно-зелёный текст на мягкой зелёной подложке (читаемость)', () => {
      render(<Badge tone="accent">Новый</Badge>);
      const badge = screen.getByText('Новый');
      expect(badge.className).toContain('bg-lime-soft');
      expect(badge.className).toContain('text-lime-hov');
    });

    it('тон pending — золотой, для очередей «ждёт решения» (38.54)', () => {
      render(<Badge tone="pending">Новая, на проверке</Badge>);
      const badge = screen.getByText('Новая, на проверке');
      expect(badge.className).toContain('text-gold');
      expect(badge.className).toContain('bg-gold/10');
      expect(badge.className).not.toContain('lime');
    });
  });

  describe('Chip', () => {
    it('активный чип — зелёная заливка с тёмным текстом, без тени', () => {
      render(<Chip active>Фильтр</Chip>);
      const chip = screen.getByRole('button');
      expect(chip.className).toContain('bg-lime');
      expect(chip.className).toContain('text-ink');
      expect(chip.className).not.toMatch(/\bshadow-/);
      expect(chip).toHaveAttribute('aria-pressed', 'true');
    });

    it('чип категории эталона (38.77): радиус 10, подложка холста, 12px 700, строчными', () => {
      render(<Chip>Фильтр</Chip>);
      const chip = screen.getByRole('button');
      expect(chip.className).toContain('rounded-[10px]');
      expect(chip.className).toContain('bg-bg');
      expect(chip.className).toContain('text-[12px]');
      expect(chip.className).toContain('font-bold');
      expect(chip.className).toContain('px-[13px]');
      expect(chip.className).toContain('py-[7px]');
      expect(chip.className).not.toContain('uppercase');
      expect(chip.className).not.toContain('rounded-pill');
      expect(chip).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('Card', () => {
    it('по умолчанию — подложка-тень карточки, при наведении — плавающая, без подъёма', () => {
      render(<Card data-testid="card">Содержимое</Card>);
      const card = screen.getByTestId('card');
      expect(card.className).toContain('shadow-card');
      expect(card.className).toContain('hover:shadow-floating');
      expect(card.className).not.toContain('translate');
    });

    it('elevated — плавающая тень всегда', () => {
      render(
        <Card data-testid="card" elevated>
          Содержимое
        </Card>,
      );
      expect(screen.getByTestId('card').className).toContain('shadow-floating');
    });
  });
});
