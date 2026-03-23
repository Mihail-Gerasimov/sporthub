/**
 * Контракт дизайн-токенов — проверяет, что globals.css содержит
 * все обязательные CSS-переменные и @theme маппинг.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { getProjectRoot } from '@/lib/projectPaths';

const globalsCss = readFileSync(resolve(getProjectRoot(), 'src/app/globals.css'), 'utf-8');

describe('Дизайн-токены (globals.css)', () => {
  // --- Палитра ---
  const paletteVars = [
    '--ui-canvas',
    '--ui-panel',
    '--ui-panel-strong',
    '--ui-ink',
    '--ui-muted',
    '--ui-line',
    '--ui-accent',
    '--ui-accent-strong',
    '--ui-accent-soft',
    '--ui-teal',
    '--ui-success',
    '--ui-warning',
    '--ui-danger',
  ];

  it.each(paletteVars)('содержит переменную палитры %s', (varName) => {
    expect(globalsCss).toContain(varName);
  });

  // --- Радиусы ---
  it('содержит токен радиуса карточки', () => {
    expect(globalsCss).toMatch(/--ui-radius-card:\s*.+;/);
  });

  it('радиус карточки не превышает 20px (минимализм)', () => {
    const match = globalsCss.match(/--ui-radius-card:\s*(\d+)px/);
    expect(match).not.toBeNull();
    const value = parseInt(match![1], 10);
    expect(value).toBeLessThanOrEqual(20);
  });

  // --- Тени ---
  it('содержит токен тени карточки', () => {
    expect(globalsCss).toMatch(/--ui-shadow-card:\s*.+;/);
  });

  it('тень карточки использует мягкие значения (blur ≤ 24px)', () => {
    // Формат: X Y blur spread rgba(...)
    const match = globalsCss.match(/--ui-shadow-card:\s*\d+\s+(\d+)px\s+(\d+)px/);
    expect(match).not.toBeNull();
    const blur = parseInt(match![2], 10);
    expect(blur).toBeLessThanOrEqual(24);
  });

  // --- Типографика ---
  it('содержит токен шрифтов display и body', () => {
    expect(globalsCss).toContain('--ui-font-display');
    expect(globalsCss).toContain('--ui-font-body');
  });

  // --- @theme маппинг ---
  it('содержит @theme inline блок с цветовыми маппингами', () => {
    expect(globalsCss).toContain('@theme inline');
    expect(globalsCss).toContain('--color-canvas');
    expect(globalsCss).toContain('--color-ink');
    expect(globalsCss).toContain('--color-accent');
  });

  // --- Body ---
  it('body не содержит более одного radial-gradient (минимализм)', () => {
    // Считаем radial-gradient в CSS body-блоке
    const bodyMatch = globalsCss.match(/body\s*\{[\s\S]*?\}/);
    expect(bodyMatch).not.toBeNull();
    const bodyBlock = bodyMatch![0];
    const radialCount = (bodyBlock.match(/radial-gradient/g) || []).length;
    expect(radialCount).toBeLessThanOrEqual(1);
  });
});
