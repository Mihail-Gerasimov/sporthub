// Полоса постраничности — один компонент на все списки проекта (шаг 37.67).
//
// ⚠️ Проверяется ГРАНИЦА, а не середина. Середина пагинатора работает всегда:
// пять страниц, третья открыта, рядом соседи. Ломается он по краям — на первой
// странице стрелка «назад» обязана быть недоступна, на последней «вперёд»,
// а при пустом списке страница остаётся ровно одна, иначе полоса предложила бы
// уйти туда, где ничего нет.
//
// ⚠️ Отдельно проверяется подпись «Показано X–Y из N»: она называет то, что
// человек ВИДИТ. Последняя страница почти всегда короче размера страницы,
// и подпись, посчитанная от размера, обещала бы строки, которых на экране нет.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PaginationBar, type PaginationShape } from '@/components/ui';

/** Полоса с разумными умолчаниями: тест называет только то, что проверяет. */
function renderBar(
  overrides: Partial<{
    page: number;
    pageSize: number;
    total: number;
    shownCount: number;
    onPageChange: (page: number) => void;
    shape: PaginationShape;
    rangeTestId: string;
    className: string;
  }> = {},
) {
  const onPageChange = overrides.onPageChange ?? vi.fn();
  const page = overrides.page ?? 1;
  const pageSize = overrides.pageSize ?? 15;
  const total = overrides.total ?? 52;

  render(
    <PaginationBar
      page={page}
      pageSize={pageSize}
      total={total}
      shownCount={
        overrides.shownCount ?? Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize))
      }
      onPageChange={onPageChange}
      shape={overrides.shape ?? 'boxed'}
      rangeTestId={overrides.rangeTestId}
      className={overrides.className}
    />,
  );

  return { onPageChange };
}

/** Какие номера страниц сейчас предлагает полоса. */
function visibleNumbers(): number[] {
  return screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '')
    .filter((label) => label.startsWith('Страница '))
    .map((label) => Number(label.replace('Страница ', '')));
}

describe('PaginationBar: границы', () => {
  it('пустой список оставляет ровно одну страницу и гасит обе стрелки', () => {
    renderBar({ total: 0, shownCount: 0 });

    expect(visibleNumbers()).toEqual([1]);
    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
  });

  it('список короче страницы — тоже одна страница', () => {
    renderBar({ total: 7, shownCount: 7 });

    expect(visibleNumbers()).toEqual([1]);
    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
  });

  it('на первой странице «назад» недоступна, «вперёд» доступна', () => {
    renderBar({ page: 1, total: 52 });

    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeEnabled();
  });

  it('на последней странице «вперёд» недоступна, «назад» доступна', () => {
    // 52 строки по 15 — четыре страницы, последняя неполная.
    renderBar({ page: 4, total: 52, shownCount: 7 });

    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeEnabled();
  });

  it('ровное деление не заводит лишнюю пустую страницу', () => {
    // 45 строк по 15 — ровно три, а не четыре с пустой на конце.
    renderBar({ page: 3, total: 45 });

    expect(visibleNumbers()).toEqual([1, 2, 3]);
    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
  });

  it('текущая страница помечена для экранного диктора', () => {
    renderBar({ page: 2, total: 52 });

    expect(screen.getByRole('button', { name: 'Страница 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Страница 1' })).not.toHaveAttribute('aria-current');
  });
});

describe('PaginationBar: окно номеров при многих страницах', () => {
  it('в начале длинного списка показаны первые пять номеров', () => {
    renderBar({ page: 1, total: 300 });

    expect(visibleNumbers()).toEqual([1, 2, 3, 4, 5]);
  });

  it('в середине окно стоит вокруг текущей', () => {
    renderBar({ page: 10, total: 300 });

    expect(visibleNumbers()).toEqual([8, 9, 10, 11, 12]);
  });

  it('у конца окно прижимается к последней, а не укорачивается', () => {
    // 300 строк по 15 — двадцать страниц. На двадцатой ряд обязан остаться
    // из пяти кнопок: иначе он схлопывался бы к краю и прыгал по ширине.
    renderBar({ page: 20, total: 300 });

    expect(visibleNumbers()).toEqual([16, 17, 18, 19, 20]);
  });
});

describe('PaginationBar: подпись диапазона', () => {
  it('пустой список говорит «Показано 0 из 0»', () => {
    renderBar({ total: 0, shownCount: 0, rangeTestId: 'range' });

    expect(screen.getByTestId('range')).toHaveTextContent('Показано 0 из 0');
  });

  it('первая страница называет первый и последний номер строки', () => {
    renderBar({ page: 1, total: 52, rangeTestId: 'range' });

    expect(screen.getByTestId('range')).toHaveTextContent('Показано 1–15 из 52');
  });

  it('средняя страница считает диапазон от сдвига', () => {
    renderBar({ page: 3, total: 52, rangeTestId: 'range' });

    expect(screen.getByTestId('range')).toHaveTextContent('Показано 31–45 из 52');
  });

  it('последняя неполная страница называет столько, сколько показано', () => {
    renderBar({ page: 4, total: 52, shownCount: 7, rangeTestId: 'range' });

    expect(screen.getByTestId('range')).toHaveTextContent('Показано 46–52 из 52');
  });

  it('короткая выдача не обещает строк, которых нет', () => {
    // Сервер вернул меньше, чем помещается на страницу: подпись обязана
    // назвать выданное, а не `page * pageSize`.
    renderBar({ page: 1, total: 52, shownCount: 4, rangeTestId: 'range' });

    expect(screen.getByTestId('range')).toHaveTextContent('Показано 1–4 из 52');
  });

  it('без `rangeTestId` признака в разметке нет', () => {
    renderBar({ total: 52 });

    expect(screen.queryByTestId('range')).not.toBeInTheDocument();
  });
});

describe('PaginationBar: нажатия', () => {
  it('номер отдаёт наверх свою страницу', () => {
    const { onPageChange } = renderBar({ page: 1, total: 300 });

    fireEvent.click(screen.getByRole('button', { name: 'Страница 4' }));

    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('стрелки двигают на соседнюю страницу', () => {
    const { onPageChange } = renderBar({ page: 5, total: 300 });

    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущая страница' }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 6);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 4);
  });

  it('нажатие по текущей странице не молчит — обработчик зовётся с тем же номером', () => {
    // Полоса не решает за страницу, стоит ли перезапрашивать: это её дело.
    const { onPageChange } = renderBar({ page: 2, total: 300 });

    fireEvent.click(screen.getByRole('button', { name: 'Страница 2' }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('недоступная стрелка не зовёт обработчик', () => {
    const { onPageChange } = renderBar({ page: 1, total: 52 });

    fireEvent.click(screen.getByRole('button', { name: 'Предыдущая страница' }));

    expect(onPageChange).not.toHaveBeenCalled();
  });
});

describe('PaginationBar: два вида', () => {
  it('вид меняет внешность кнопки, а не её поведение', () => {
    const { unmount } = render(
      <PaginationBar
        page={1}
        pageSize={15}
        total={52}
        shownCount={15}
        onPageChange={vi.fn()}
        shape="boxed"
      />,
    );

    const boxed = screen.getByRole('button', { name: 'Страница 1' }).className;

    unmount();

    render(
      <PaginationBar
        page={1}
        pageSize={15}
        total={52}
        shownCount={15}
        onPageChange={vi.fn()}
        shape="pill"
      />,
    );

    const pill = screen.getByRole('button', { name: 'Страница 1' }).className;

    // Панель — плитка со скруглением 8px, кабинет — таблетка. Оба канона живые,
    // и подмена одного другим была бы правкой дизайна, а не уборкой дубля.
    expect(boxed).toContain('rounded-[8px]');
    expect(pill).toContain('rounded-pill');
    expect(boxed).not.toContain('rounded-pill');
  });

  it('отбивку от списка задаёт вызывающий, а не вид', () => {
    const { container } = render(
      <PaginationBar
        page={1}
        pageSize={15}
        total={52}
        shownCount={15}
        onPageChange={vi.fn()}
        shape="pill"
        className="px-1 pt-1.5"
      />,
    );

    expect(container.firstElementChild).toHaveClass('px-1', 'pt-1.5');
  });
});
