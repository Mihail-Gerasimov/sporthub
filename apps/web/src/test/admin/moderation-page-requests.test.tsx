// Какие адреса дёргает раздел модерации (шаг 36.22).
//
// ⚠️ Это тест ПОДКЛЮЧЕНИЯ, а не вёрстки, и разница здесь принципиальная.
// Главный класс дефектов фазы 35 выглядел так: отбор сделан на сервере, покрыт
// тестами бэкенда и не доехал до браузера — страница по-прежнему просила ВСЁ
// и разбиралась сама. Такая страница на экране выглядит правильно, и тест,
// который смотрит на бейджи, зеленеет.
//
// Поэтому проверяется не «есть ли бейдж», а какой адрес и с каким параметром
// страница на самом деле запросила. Диверсия д-21 — «раздел модерации просит все
// публикации и отбирает признак в памяти» — обязана уронить этот набор.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModerationPage } from '@/components/admin/ModerationPage';

/** Виды спорта приходят страницей-сервером, для отбора здесь не важны. */
const SPORTS = [{ id: 3, name: 'Плавание' }];

/** Общая часть публикации: поля, которые страница не разглядывает. */
const base = {
  city: 'Самара',
  sportIds: [3],
  createdAt: '2026-01-03T00:00:00.000Z',
  managedByUserId: 2,
};

/** Скрытая модератором публикация, которую владелец уже исправил. */
const FIXED = {
  ...base,
  id: 1,
  name: 'Волна',
  type: 'club' as const,
  status: 'hidden',
  hideReason: 'Жалобы',
  hiddenKind: 'moderation' as const,
  awaitingRecheck: true,
};

/** Обычная живая публикация: признака повторной проверки на ней нет. */
const PLAIN = {
  ...base,
  id: 2,
  name: 'Железо',
  type: 'club' as const,
  status: 'published',
  awaitingRecheck: false,
};

/** Новая публикация, ждущая ПЕРВОЙ проверки, — это другое событие. */
const FRESH = {
  ...base,
  id: 3,
  name: 'Новичок',
  type: 'club' as const,
  status: 'pending',
  awaitingRecheck: false,
};

/** Что отвечает сервер на любой вопрос. Тесты подменяют перед рендером. */
let served: unknown[] = [];

/** Адреса, по которым страница сходила. */
let calls: string[] = [];

const publicationCalls = () => calls.filter((url) => url.startsWith('/api/publications'));

const okJson = (data: unknown, total: number) => ({
  ok: true,
  json: () => Promise.resolve({ success: true, data, total, offset: 0, limit: 15 }),
});

describe('Раздел модерации — адреса запросов', () => {
  beforeEach(() => {
    calls = [];
    served = [FIXED, PLAIN];
    global.fetch = vi.fn((input: unknown) => {
      const url = String(input);

      calls.push(url);

      if (url.startsWith('/api/cities')) return Promise.resolve(okJson([], 0));

      // ⚠️ Сервер отвечает ОДИНАКОВО на любой вопрос — обеими публикациями.
      // Это нарочно: страница, отбирающая признак в памяти, показала бы после
      // включения отбора одну карточку и «прошла» бы проверку по картинке.
      // Здесь единственный честный свидетель — сам адрес запроса.
      return Promise.resolve(okJson(served, served.length));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('первый запрос идёт без параметра отбора — старый вид раздела не изменился', async () => {
    render(<ModerationPage sports={SPORTS} />);

    await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));
    expect(publicationCalls()[0]).not.toContain('awaitingRecheck');
  });

  it('отбор уходит В ЗАПРОС: адрес несёт awaitingRecheck=true', async () => {
    render(<ModerationPage sports={SPORTS} />);
    await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText('Повторная проверка'), {
      target: { value: 'awaiting' },
    });

    await waitFor(() => {
      expect(publicationCalls().at(-1)).toContain('awaitingRecheck=true');
    });
  });

  it('диверсия д-21: страница не отбирает признак в памяти', async () => {
    render(<ModerationPage sports={SPORTS} />);
    await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));

    const before = publicationCalls().length;

    fireEvent.change(screen.getByLabelText('Повторная проверка'), {
      target: { value: 'awaiting' },
    });

    // Первое: смена отбора обязана породить НОВЫЙ запрос. Страница, разбирающаяся
    // сама, никуда бы не пошла — ей хватило бы уже полученного среза.
    await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(before));

    // Второе: выдачу определяет сервер. Он ответил обеими публикациями — обе
    // и показаны. Пропади вторая карточка — значит отбор случился в браузере.
    await waitFor(() => expect(screen.getByText('Железо')).toBeInTheDocument());
    expect(screen.getByText('Волна')).toBeInTheDocument();
  });

  it('отбор складывается с остальными, а не заменяет их', async () => {
    // Отбор по типу и отбор по повторной проверке — разные вопросы; новый
    // параметр не имеет права тихо отменить уже выбранный.
    render(<ModerationPage sports={SPORTS} />);
    await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText('Тип публикации'), { target: { value: 'club' } });
    fireEvent.change(screen.getByLabelText('Повторная проверка'), {
      target: { value: 'awaiting' },
    });

    await waitFor(() => {
      const last = publicationCalls().at(-1) ?? '';

      expect(last).toContain('type=club');
      expect(last).toContain('awaitingRecheck=true');
    });
  });

  it('признак виден на карточке и только на своей', async () => {
    render(<ModerationPage sports={SPORTS} />);

    await waitFor(() => expect(screen.getByText('Волна')).toBeInTheDocument());
    expect(screen.getByText('Исправлено, ждёт проверки')).toBeInTheDocument();
    // Ровно один: у обычной публикации признака нет.
    expect(screen.getAllByText('Исправлено, ждёт проверки')).toHaveLength(1);
    // Вид скрытия читается из словаря `@sporthub/domain`, а не из текста причины.
    expect(screen.getByText('Скрыто модератором')).toBeInTheDocument();
  });

  it('«новая публикация» и «исправлено» — разные подписи, их нельзя спутать', async () => {
    // ⚠️ Терминологическая ловушка. `status === 'pending'` — это НОВАЯ публикация,
    // ждущая первой проверки. «Исправлено, ждёт проверки» — скрытая модератором
    // и починенная владельцем. Прежняя подпись «На проверке» годилась и туда,
    // и сюда, а модератору это две разные очереди.
    served = [FRESH];
    render(<ModerationPage sports={SPORTS} />);

    await waitFor(() => expect(screen.getByText('Новичок')).toBeInTheDocument());
    expect(screen.getByText('Новая, на проверке')).toBeInTheDocument();
    expect(screen.queryByText('Исправлено, ждёт проверки')).not.toBeInTheDocument();
  });
});
