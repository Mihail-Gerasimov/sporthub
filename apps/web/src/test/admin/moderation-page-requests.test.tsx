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

/**
 * Стенд адреса (шаг 37.54).
 *
 * ⚠️ Router здесь не просто заглушён, а ОТВЕЧАЕТ: `push`/`replace` меняют адрес,
 * и подписанный на него раздел перерисовывается. Заглушка-пустышка сделала бы
 * набор бессмысленным ровно в главном месте: раздел, чей отбор живёт в адресе,
 * после смены фильтра обязан сходить за данными заново, а с молчащим router'ом
 * он никуда бы не пошёл — и тест зеленел бы на неработающей странице.
 */
const { address, pushMock, replaceMock } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    query: '',
    /** Поставить адрес до отрисовки — так тест открывает раздел «по ссылке». */
    open(query: string) {
      state.query = query;
      listeners.forEach((notify) => notify());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };

  /** Из `/service-portal/moderation?type=club` берём только строку запроса. */
  const queryOf = (href: string) => href.split('?')[1] ?? '';

  return {
    address: state,
    pushMock: vi.fn((href: string) => state.open(queryOf(href))),
    replaceMock: vi.fn((href: string) => state.open(queryOf(href))),
  };
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');

  return {
    usePathname: () => '/service-portal/moderation',
    useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: vi.fn() }),
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          address.subscribe,
          () => address.query,
          () => address.query,
        ),
      ),
  };
});

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

/** Сколько всего строк «нашлось» на сервере: под проверку постраничности. */
let servedTotal: number | null = null;

describe('Раздел модерации — адреса запросов', () => {
  beforeEach(() => {
    calls = [];
    served = [FIXED, PLAIN];
    servedTotal = null;
    // Раздел, открытый из меню: адрес чистый, история пустая.
    address.open('');
    pushMock.mockClear();
    replaceMock.mockClear();
    global.fetch = vi.fn((input: unknown) => {
      const url = String(input);

      calls.push(url);

      if (url.startsWith('/api/cities')) return Promise.resolve(okJson([], 0));

      // ⚠️ Сервер отвечает ОДИНАКОВО на любой вопрос — обеими публикациями.
      // Это нарочно: страница, отбирающая признак в памяти, показала бы после
      // включения отбора одну карточку и «прошла» бы проверку по картинке.
      // Здесь единственный честный свидетель — сам адрес запроса.
      return Promise.resolve(okJson(served, servedTotal ?? served.length));
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

  /**
   * Шаг 37.54: адрес — источник отбора.
   *
   * ⚠️ Здесь снова проверяется ПОДКЛЮЧЕНИЕ, а не картинка. Раздел, прочитавший
   * адрес и оставивший отбор в локальном состоянии, выглядит одинаково с рабочим:
   * фильтры на экране те же. Разница видна только в двух местах — какой адрес
   * запрошен у сервера и какой адрес получил браузер.
   */
  describe('адрес как источник отбора', () => {
    /** Разобранный запрос последнего (или первого) похода за публикациями. */
    const askedAt = (index: number) =>
      new URLSearchParams(publicationCalls()[index]?.split('?')[1] ?? '');

    it('открытие с ?type=club&id=42 просит у сервера ТУ САМУЮ публикацию', async () => {
      address.open('type=club&id=42');
      render(<ModerationPage sports={SPORTS} />);

      await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));

      const asked = askedAt(0);

      // Номер едет номером: перевода в слаг внутри панели не происходит.
      expect(asked.get('id')).toBe('42');
      expect(asked.get('type')).toBe('club');
      expect(asked.get('offset')).toBe('0');
    });

    it('наводка раздвигает отбор: публикацию не прячет ни состояние, ни город из адреса', async () => {
      address.open('type=club&id=42&status=published&city=Самара&search=нет&page=4');
      render(<ModerationPage sports={SPORTS} />);

      await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));

      const asked = askedAt(0);

      expect(asked.get('id')).toBe('42');
      expect(asked.get('status')).toBeNull();
      expect(asked.get('city')).toBeNull();
      expect(asked.get('search')).toBeNull();
      expect(asked.get('offset')).toBe('0');
    });

    it('мусор в адресе не роняет раздел и не уходит в запрос', async () => {
      address.open('type=venue&id=abc&status=deleted&sportId=nope&page=-2');
      render(<ModerationPage sports={SPORTS} />);

      // Раздел открылся: строки на месте, экрана ошибки нет.
      await waitFor(() => expect(screen.getByText('Волна')).toBeInTheDocument());

      const asked = askedAt(0);

      expect(asked.get('type')).toBeNull();
      expect(asked.get('id')).toBeNull();
      expect(asked.get('status')).toBeNull();
      expect(asked.get('sportId')).toBeNull();
      expect(asked.get('offset')).toBe('0');
    });

    it('смена фильтра меняет АДРЕС — кнопке «назад» есть куда возвращаться', async () => {
      render(<ModerationPage sports={SPORTS} />);
      await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));

      fireEvent.change(screen.getByLabelText('Тип публикации'), { target: { value: 'club' } });

      await waitFor(() =>
        expect(pushMock).toHaveBeenCalledWith('/service-portal/moderation?type=club'),
      );
      // И новый адрес доехал до запроса — это тот же путь, а не два разных.
      await waitFor(() => expect(publicationCalls().at(-1)).toContain('type=club'));
    });

    it('смена фильтра снимает наводку: человек уже не «пришёл из уведомления»', async () => {
      address.open('type=club&id=42');
      render(<ModerationPage sports={SPORTS} />);
      await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));

      fireEvent.change(screen.getByLabelText('Статус публикации'), { target: { value: 'hidden' } });

      await waitFor(() => {
        const href = String(pushMock.mock.calls.at(-1)?.[0] ?? '');

        expect(href).toContain('status=hidden');
        expect(href).not.toContain('id=42');
      });
    });

    it('страница уходит и в адрес, и в запрос', async () => {
      servedTotal = 40;
      render(<ModerationPage sports={SPORTS} />);
      await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));

      fireEvent.click(screen.getByLabelText('Следующая страница'));

      await waitFor(() => expect(String(pushMock.mock.calls.at(-1)?.[0])).toContain('page=2'));
      await waitFor(() => expect(publicationCalls().at(-1)).toContain('offset=15'));
    });

    it('поиск уходит в адрес заменой, а не записью в историю', async () => {
      // Набор текста — не шаг навигации: каждая буква в истории сделала бы
      // кнопку «назад» бесполезной. Поэтому поиск правит адрес `replace`-ом.
      render(<ModerationPage sports={SPORTS} />);
      await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));

      fireEvent.change(screen.getByLabelText('Поиск по названию'), {
        target: { value: 'volna' },
      });

      await waitFor(() =>
        expect(String(replaceMock.mock.calls.at(-1)?.[0])).toContain('search=volna'),
      );
      await waitFor(() => expect(publicationCalls().at(-1)).toContain('search=volna'));
      expect(pushMock).not.toHaveBeenCalled();
    });

    it('наведённая публикация помечена, а не просто лежит где-то в списке', async () => {
      address.open('type=club&id=1');
      render(<ModerationPage sports={SPORTS} />);

      await waitFor(() => expect(screen.getByText('Волна')).toBeInTheDocument());
      // Помечена ровно одна — та, ради которой пришли.
      expect(screen.getAllByText('Из уведомления')).toHaveLength(1);
    });

    it('пропавшая публикация даёт понятный ответ, а не пустой экран', async () => {
      address.open('type=club&id=999');
      render(<ModerationPage sports={SPORTS} />);

      await waitFor(() => expect(screen.getByText(/999/)).toBeInTheDocument());
      expect(screen.queryByText('Из уведомления')).not.toBeInTheDocument();
    });

    it('«весь раздел» возвращает чистый адрес', async () => {
      address.open('type=club&id=999');
      render(<ModerationPage sports={SPORTS} />);
      await waitFor(() => expect(publicationCalls().length).toBeGreaterThan(0));

      fireEvent.click(screen.getByRole('button', { name: 'Весь раздел' }));

      await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/service-portal/moderation'));
    });
  });
});
