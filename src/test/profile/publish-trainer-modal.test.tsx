// Тесты модалки публикации тренера (Step 13.4 / Step 14.6 / Step 23.8)
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublishTrainerModal } from '@/components/profile/PublishTrainerModal';
import type { TagSelectorItem } from '@/components/profile/TagSelector';
import type { TrainerFormState } from '@/lib/schemas/publish';

/** Мок-справочники для TagSelector */
const mockSports: TagSelectorItem[] = [
  { id: 1, name: 'Йога' },
  { id: 2, name: 'Бокс' },
  { id: 3, name: 'Плавание' },
];

const mockSpecialties: TagSelectorItem[] = [
  { id: 1, name: 'Подготовка к соревнованиям' },
  { id: 2, name: 'Реабилитация' },
];

const mockWorkFormats: TagSelectorItem[] = [
  { id: 1, name: 'В зале' },
  { id: 2, name: 'На выезде' },
  { id: 3, name: 'Онлайн' },
];

describe('PublishTrainerModal', () => {
  const fetchMock = vi.fn();
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    userId: 2,
    clubs: [
      { id: 1, name: 'FitZone Studio' },
      { id: 2, name: 'PowerGym' },
    ],
    sports: mockSports,
    specialties: mockSpecialties,
    workFormats: mockWorkFormats,
  };
  const editInitialData: TrainerFormState = {
    firstName: 'Марина',
    lastName: 'Соколова',
    city: 'Самара',
    address: 'ул. Лесная, 23к1',
    bio: 'Тренер по плаванию с акцентом на технику, дыхание и подготовку к любительским стартам.',
    experience: '9',
    sportIds: [3],
    specialtyIds: [1],
    workFormatIds: [1],
    phone: '+7 (846) 300-00-11',
    vk: '',
    telegram: '',
    facebook: '',
    offeringName: 'Персональная тренировка: Плавание',
    offeringDescription: 'Индивидуальная работа над техникой плавания и скоростью.',
    offeringFormat: 'Индивидуальная',
    offeringPrice: '1900',
    offeringDuration: '60',
    offeringLocation: 'Бассейн 1',
    clubId: 1,
    scheduleSlots: [
      {
        id: 1001,
        title: 'Техника кроля',
        date: '2026-04-04',
        startTime: '09:00',
        endTime: '10:00',
        price: '1900',
        capacity: '1',
        location: 'Бассейн 1',
        sportId: 3,
      },
    ],
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    defaultProps.onClose.mockReset();
    defaultProps.onSuccess.mockReset();
  });

  function createJsonResponse(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
      },
    });
  }

  /** Заполняет TagSelector: находит контейнер по лейблу → клик «+ Добавить» → клик по option */
  function selectTagSelectorItem(label: string, itemName: string) {
    // TagSelector обёрнут в div.flex.flex-col.gap-2 с первым child — span с лейблом
    const labelEl = screen.getByText(label);
    const container = labelEl.closest('.flex.flex-col') ?? document.body;
    const addButton = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === '+ Добавить',
    );
    if (addButton) fireEvent.click(addButton);
    const option = screen.getByRole('option', { name: itemName });
    fireEvent.click(option);
  }

  function fillValidTrainerForm() {
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Александр' } });
    fireEvent.change(screen.getByLabelText('Фамилия'), { target: { value: 'Иванов' } });
    // CitySuggestInput обновляет form.city только на blur (или при выборе подсказки),
    // поэтому после change эмулируем blur, чтобы родитель получил значение.
    fireEvent.change(screen.getByLabelText('Город'), { target: { value: 'Москва' } });
    fireEvent.blur(screen.getByLabelText('Город'));
    fireEvent.change(screen.getByLabelText('Адрес'), {
      target: { value: 'ул. Спортивная, 10' },
    });
    fireEvent.change(screen.getByLabelText('О себе'), {
      target: {
        value:
          'Опытный тренер по боксу с большим стажем, который работает с новичками и готовит спортсменов к турнирам.',
      },
    });
    fireEvent.change(screen.getByLabelText('Опыт (лет)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Телефон'), {
      target: { value: '+7 (846) 300-00-11' },
    });
    // Выбор через TagSelector
    selectTagSelectorItem('Виды спорта', 'Бокс');
    selectTagSelectorItem('Специализации', 'Подготовка к соревнованиям');
    selectTagSelectorItem('Формат работы', 'В зале');
    // Услуга тренера
    fireEvent.change(screen.getByLabelText('Название услуги'), {
      target: { value: 'Персональная тренировка' },
    });
    fireEvent.change(screen.getByLabelText('Описание услуги'), {
      target: { value: 'Индивидуальное занятие по технике, защите и работе на лапах.' },
    });
    // Формат услуги — через aria-pressed button
    fireEvent.click(screen.getByRole('button', { name: 'Индивидуальная' }));
    // Цена и длительность
    fireEvent.change(screen.getByLabelText('Укажите цену данной услуги'), {
      target: { value: '2000' },
    });
    fireEvent.change(screen.getByLabelText('Длительность (мин)'), {
      target: { value: '60' },
    });
    fireEvent.change(screen.getByLabelText('Укажите адрес проведения тренировки'), {
      target: { value: 'Зал №3' },
    });
    // Слот расписания
    fireEvent.change(screen.getByLabelText('Укажите название тренировочного слота'), {
      target: { value: 'Утренняя тренировка' },
    });
    fireEvent.change(screen.getByLabelText('Дата'), {
      target: { value: '2026-04-01' },
    });
    fireEvent.change(screen.getByLabelText('Начало'), {
      target: { value: '09:00' },
    });
    fireEvent.change(screen.getByLabelText('Окончание'), {
      target: { value: '10:00' },
    });
    fireEvent.change(screen.getByLabelText('Укажите цену данной тренировки'), {
      target: { value: '2000' },
    });
    fireEvent.change(screen.getByLabelText('Кол-во мест'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText('Место проведения'), {
      target: { value: 'Зал единоборств' },
    });
    // Направление auto-select: при одном sportId useEffect автоматически ставит sportId
  }

  it('рендерит заголовок модалки', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('h2')).toHaveTextContent('Опубликовать тренера');
  });

  it('в режиме edit меняет title и primary-кнопку, а форму заполняет через initialData', () => {
    render(
      <PublishTrainerModal
        {...defaultProps}
        mode="edit"
        entityId={1}
        initialData={editInitialData}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('h2')).toHaveTextContent('Редактировать тренера');
    expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toHaveValue('Марина');
    expect(screen.getByLabelText('Фамилия')).toHaveValue('Соколова');
    expect(screen.getByLabelText('Укажите название тренировочного слота')).toHaveValue(
      'Техника кроля',
    );
  });

  it('рендерит секцию «Основная информация» с полями firstName, lastName, city, address, bio, experience', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Основная информация')).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toBeInTheDocument();
    expect(screen.getByLabelText('Фамилия')).toBeInTheDocument();
    expect(screen.getByLabelText('Город')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес')).toBeInTheDocument();
    expect(screen.getByLabelText('О себе')).toBeInTheDocument();
    expect(screen.getByLabelText('Опыт (лет)')).toBeInTheDocument();
  });

  it('рендерит кнопку «Добавить фото»', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeInTheDocument();
  });

  it('рендерит секцию «Специализация» с TagSelector для sport, специализация, workFormat', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Специализация')).toBeInTheDocument();
    expect(screen.getByText('Виды спорта')).toBeInTheDocument();
    // «Специализация» как лейбл TagSelector (внутри секции «Специализация»)
    const specSection = screen.getByText('Специализация').closest('section');
    expect(specSection).not.toBeNull();
    expect(screen.getByText('Формат работы')).toBeInTheDocument();
  });

  it('рендерит секцию «Связать себя с клубом» с опциональным select', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Связать себя с клубом')).toBeInTheDocument();
    expect(screen.getByText(/Вы можете указать спортивный клуб/)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it('отображает переданные клубы в select привязки', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    const selects = screen.getAllByRole('combobox');
    const clubSelect = selects.find((select) =>
      select.textContent?.includes('Без привязки к клубу'),
    );
    expect(clubSelect).toBeDefined();
    expect(clubSelect).toHaveTextContent('FitZone Studio');
    expect(clubSelect).toHaveTextContent('PowerGym');
  });

  it('рендерит секцию «Контактная информация» с phone, vk, telegram, facebook', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Контактная информация')).toBeInTheDocument();
    expect(screen.getByLabelText('Телефон')).toBeInTheDocument();
    expect(screen.getByLabelText('ВКонтакте')).toBeInTheDocument();
    expect(screen.getByLabelText('Telegram')).toBeInTheDocument();
    expect(screen.getByLabelText('Facebook')).toBeInTheDocument();
  });

  it('рендерит секцию «Услуга тренера» с обновлёнными лейблами', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Услуга тренера')).toBeInTheDocument();
    expect(screen.getByLabelText('Название услуги')).toBeInTheDocument();
    expect(screen.getByLabelText('Описание услуги')).toBeInTheDocument();
    expect(screen.getByText('Формат предоставляемой услуги')).toBeInTheDocument();
    expect(screen.getByLabelText('Укажите цену данной услуги')).toBeInTheDocument();
    expect(screen.getByLabelText('Длительность (мин)')).toBeInTheDocument();
    expect(screen.getByLabelText('Укажите адрес проведения тренировки')).toBeInTheDocument();
  });

  it('«Формат предоставляемой услуги» — 3 кнопки с aria-pressed, одиночный выбор', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    const individualBtn = screen.getByRole('button', { name: 'Индивидуальная' });
    const gruppoBtn = screen.getByRole('button', { name: 'Групповая' });
    const miniBtn = screen.getByRole('button', { name: 'Мини-группа' });

    // Все изначально не выбраны
    expect(individualBtn).toHaveAttribute('aria-pressed', 'false');
    expect(gruppoBtn).toHaveAttribute('aria-pressed', 'false');
    expect(miniBtn).toHaveAttribute('aria-pressed', 'false');

    // Клик по «Индивидуальная» — выбирает
    fireEvent.click(individualBtn);
    expect(individualBtn).toHaveAttribute('aria-pressed', 'true');
    expect(gruppoBtn).toHaveAttribute('aria-pressed', 'false');

    // Клик по «Групповая» — переключает
    fireEvent.click(gruppoBtn);
    expect(gruppoBtn).toHaveAttribute('aria-pressed', 'true');
    expect(individualBtn).toHaveAttribute('aria-pressed', 'false');

    // Клик по выбранному — снимает выбор
    fireEvent.click(gruppoBtn);
    expect(gruppoBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('рендерит секции «Добавить тренировочный слот» и «Дополнительные возможности»', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Добавить тренировочный слот')).toBeInTheDocument();
    expect(screen.getByText('Добавьте от 1 до 3 тренировочных слотов')).toBeInTheDocument();
    expect(screen.getByText('Дополнительные возможности')).toBeInTheDocument();
  });

  it('stub-элементы маркированы как «Скоро»', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    const stubLabels = screen.getAllByText(/Скоро/);
    expect(stubLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('рендерит кнопки «Создать публикацию» и «Отмена» в footer', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Создать публикацию' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });

  it('показывает notice при клике на «Добавить фото»', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Добавить фото' }));
    expect(screen.getByText(/Функционал загрузки фото находится в разработке/)).toBeInTheDocument();
  });

  it('показывает ошибки при пустом submit', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    expect(screen.getByText('Укажите имя')).toBeInTheDocument();
    expect(screen.getByText('Укажите фамилию')).toBeInTheDocument();
    expect(screen.getByText('Выберите минимум 1 специализацию')).toBeInTheDocument();
    expect(screen.getByText('Проверьте обязательные поля формы')).toBeInTheDocument();
  });

  it('phone пустой — валидация блокирует submit', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Тест' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    expect(screen.getByText('Укажите телефон')).toBeInTheDocument();
  });

  it('vk/telegram/facebook пустые — submit проходит', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({ success: true, data: { trainer: { id: 11 } } }, 201),
    );

    render(<PublishTrainerModal {...defaultProps} />);
    fillValidTrainerForm();

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(requestInit?.body));

    expect(payload.vk).toBe('');
    expect(payload.telegram).toBe('');
    expect(payload.facebook).toBe('');
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSuccess).toHaveBeenCalledWith('Тренер опубликован. Кабинет обновлён.');
  });

  it('отправляет реальный payload с id из TagSelector', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          success: true,
          data: { trainer: { id: 11 } },
        },
        201,
      ),
    );

    render(<PublishTrainerModal {...defaultProps} />);

    fillValidTrainerForm();
    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(requestInit?.body));

    expect(payload).toMatchObject({
      firstName: 'Александр',
      lastName: 'Иванов',
      userId: 2,
      sportIds: [2], // Бокс
      specialtyIds: [1], // Подготовка к соревнованиям
      workFormatIds: [1], // В зале
      offeringFormat: 'Индивидуальная',
    });
    expect(payload).not.toHaveProperty('certificates');
    expect(payload).not.toHaveProperty('gallery');
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('в режиме edit отправляет PATCH на entity endpoint и сохраняет slot id в payload', async () => {
    // Phase 24 Step 24.9a: модалка на open'е делает GET /api/trainer-club-links (фоновый fetchLinks).
    // Разделяем fetch-mock: для links → пустой список, для trainer PATCH → success.
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/trainer-club-links')) {
        return createJsonResponse({ success: true, data: [] }, 200);
      }
      return createJsonResponse({ success: true, data: { trainer: { id: 1 } } }, 200);
    });

    render(
      <PublishTrainerModal
        {...defaultProps}
        mode="edit"
        entityId={1}
        initialData={editInitialData}
      />,
    );

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Марина PRO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        ([url]) => typeof url === 'string' && url.startsWith('/api/trainers/'),
      );
      expect(patchCalls).toHaveLength(1);
    });

    const patchCall = fetchMock.mock.calls.find(
      ([url]) => typeof url === 'string' && url.startsWith('/api/trainers/'),
    );
    const [, requestInit] = patchCall ?? [];
    const payload = JSON.parse(String(requestInit?.body));

    expect(patchCall?.[0]).toBe('/api/trainers/1');
    expect(patchCall?.[1]).toMatchObject({ method: 'PATCH' });
    expect(payload.firstName).toBe('Марина PRO');
    expect(payload.scheduleSlots[0].id).toBe(1001);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSuccess).toHaveBeenCalledWith(
      'Изменения тренера сохранены. Кабинет обновлён.',
    );
  });

  it('показывает ошибку API и не закрывает модалку', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          success: false,
          error: 'Не удалось создать тренера',
        },
        500,
      ),
    );

    render(<PublishTrainerModal {...defaultProps} />);

    fillValidTrainerForm();
    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    await waitFor(() => {
      expect(screen.getByText('Не удалось создать тренера')).toBeInTheDocument();
    });

    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  it('после close/reopen в режиме edit переинициализирует форму по новому initialData', () => {
    const view = render(
      <PublishTrainerModal
        {...defaultProps}
        mode="edit"
        entityId={1}
        initialData={editInitialData}
      />,
    );

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Черновик' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    view.rerender(
      <PublishTrainerModal
        {...defaultProps}
        open={false}
        mode="edit"
        entityId={1}
        initialData={editInitialData}
      />,
    );
    view.rerender(
      <PublishTrainerModal
        {...defaultProps}
        open={true}
        mode="edit"
        entityId={2}
        initialData={{
          ...editInitialData,
          firstName: 'Анна',
          lastName: 'Миронова',
          scheduleSlots: [
            {
              ...editInitialData.scheduleSlots[0],
              id: 2002,
              title: 'Мягкая растяжка в воде',
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText('Имя')).toHaveValue('Анна');
    expect(screen.getByLabelText('Фамилия')).toHaveValue('Миронова');
    expect(screen.getByLabelText('Укажите название тренировочного слота')).toHaveValue(
      'Мягкая растяжка в воде',
    );
  });

  // Phase 24 Step 24.9a: request-flow для привязки тренер↔клуб в edit-режиме.
  describe('Link-flow (edit mode)', () => {
    it('в edit-режиме показывает статус confirmed-link и кнопку «Отвязать от клуба»', async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith('/api/trainer-club-links')) {
          return createJsonResponse(
            {
              success: true,
              data: [
                {
                  id: 42,
                  createdAt: '2026-04-20T00:00:00.000Z',
                  trainerId: 1,
                  clubId: 1,
                  status: 'confirmed',
                  initiatedBy: 'trainer',
                },
              ],
            },
            200,
          );
        }
        return createJsonResponse({ success: true }, 200);
      });

      render(
        <PublishTrainerModal
          {...defaultProps}
          mode="edit"
          entityId={1}
          initialData={editInitialData}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(/работаете в клубе «FitZone Studio»/i)).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Отвязать от клуба' })).toBeInTheDocument();
    });

    it('в edit-режиме без активной связи позволяет отправить запрос клубу', async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith('/api/trainer-club-links') && init?.method === 'POST') {
          return createJsonResponse(
            {
              success: true,
              data: {
                id: 10,
                createdAt: '2026-04-21T00:00:00.000Z',
                trainerId: 1,
                clubId: 2,
                status: 'pending',
                initiatedBy: 'trainer',
              },
            },
            201,
          );
        }
        if (url.startsWith('/api/trainer-club-links')) {
          return createJsonResponse({ success: true, data: [] }, 200);
        }
        return createJsonResponse({ success: true }, 200);
      });

      render(
        <PublishTrainerModal
          {...defaultProps}
          mode="edit"
          entityId={1}
          initialData={editInitialData}
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Отправить запрос клубу' })).toBeInTheDocument();
      });

      const select = screen
        .getByTestId('trainer-club-link-section')
        .querySelector('select') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Отправить запрос клубу' }));

      await waitFor(() => {
        const postCall = fetchMock.mock.calls.find(
          ([url, init]) =>
            typeof url === 'string' &&
            url === '/api/trainer-club-links' &&
            (init as RequestInit | undefined)?.method === 'POST',
        );
        expect(postCall).toBeDefined();
      });
    });
  });

  // Phase 24 Step 24.10c: multi-offering editor в модалке тренера.
  describe('AdditionalOfferingsEditor (Step 24.10c)', () => {
    it('рендерит кнопку «+ Добавить услугу» и добавляет новую карточку по клику', () => {
      render(<PublishTrainerModal {...defaultProps} />);

      const addBtn = screen.getByRole('button', { name: '+ Добавить услугу' });
      expect(addBtn).toBeInTheDocument();

      fireEvent.click(addBtn);
      expect(screen.getByTestId('additional-offering-0')).toBeInTheDocument();
    });

    it('новая карточка начинается с attachmentMode=private (кнопка «Частно» активна)', () => {
      render(<PublishTrainerModal {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Добавить услугу' }));

      const card = screen.getByTestId('additional-offering-0');
      const privateBtn = card.querySelector('[aria-pressed="true"]');
      expect(privateBtn).toHaveTextContent('Частно');
    });

    it('кнопка «Удалить» убирает карточку', () => {
      render(<PublishTrainerModal {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: '+ Добавить услугу' }));
      expect(screen.getByTestId('additional-offering-0')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
      expect(screen.queryByTestId('additional-offering-0')).not.toBeInTheDocument();
    });
  });
});
