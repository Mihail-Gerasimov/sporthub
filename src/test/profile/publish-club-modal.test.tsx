// Тесты модалки публикации клуба (Step 13.3 / Step 14.6 / Step 23.8)
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublishClubModal } from '@/components/profile/PublishClubModal';
import type { TagSelectorItem } from '@/components/profile/TagSelector';
import type { ClubFormState } from '@/lib/schemas/publish';

/** Мок-справочники для TagSelector */
const mockSports: TagSelectorItem[] = [
  { id: 1, name: 'Йога' },
  { id: 2, name: 'Бокс' },
  { id: 3, name: 'Плавание' },
];

const mockTags: TagSelectorItem[] = [
  { id: 1, name: 'Для начинающих' },
  { id: 2, name: 'Для детей' },
];

const mockAmenities: TagSelectorItem[] = [
  { id: 1, name: 'Парковка' },
  { id: 2, name: 'Душевые' },
];

describe('PublishClubModal', () => {
  const fetchMock = vi.fn();
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    userId: 2,
    sports: mockSports,
    tags: mockTags,
    amenities: mockAmenities,
  };
  const editInitialData: ClubFormState = {
    name: 'Volna Aquatic Club',
    city: 'Самара',
    address: 'ул. Лесная, 23к1',
    description:
      'Клуб с бассейном 25 м, студией восстановления и рабочим расписанием для взрослых и детей.',
    phone: '+7 (846) 200-11-01',
    email: 'hello@volna-club.ru',
    priceFrom: '900',
    sportIds: [3],
    tagIds: [1],
    amenityIds: [1],
    vk: '',
    telegram: '',
    facebook: '',
    scheduleSlots: [
      {
        id: 15,
        title: 'Утреннее плавание',
        date: '2026-04-02',
        startTime: '08:00',
        endTime: '09:00',
        price: '1100',
        capacity: '12',
        location: 'Большой бассейн',
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

  /** Заполняет форму через TagSelector (клик «+ Добавить» → клик по option) */
  function selectTagSelectorItem(sectionLabel: string, itemName: string) {
    const section = screen.getByText(sectionLabel).closest('section') ?? document.body;
    const addButton = Array.from(section.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === '+ Добавить',
    );
    if (addButton) fireEvent.click(addButton);
    const option = screen.getByRole('option', { name: itemName });
    fireEvent.click(option);
  }

  function fillValidClubForm() {
    fireEvent.change(screen.getByLabelText('Название клуба'), {
      target: { value: 'FitZone Studio' },
    });
    fireEvent.change(screen.getByLabelText('Город'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('Адрес'), {
      target: { value: 'ул. Спортивная, 10' },
    });
    fireEvent.change(screen.getByLabelText('Описание о вашем клубе'), {
      target: {
        value:
          'Современный фитнес-клуб с тренажёрным залом, групповыми программами и стабильным расписанием для новичков.',
      },
    });
    fireEvent.change(screen.getByLabelText('Телефон'), {
      target: { value: '+7 999 123-45-67' },
    });
    fireEvent.change(screen.getByLabelText('Укажите минимальную стоимость услуги «от»'), {
      target: { value: '500' },
    });
    // Выбор направления через TagSelector
    selectTagSelectorItem('Направления клуба', 'Йога');
    // Заполняем слот расписания
    fireEvent.change(screen.getByLabelText('Укажите название тренировочного слота'), {
      target: { value: 'Утренняя йога' },
    });
    fireEvent.change(screen.getByLabelText('Дата'), {
      target: { value: '2026-04-01' },
    });
    fireEvent.change(screen.getByLabelText('Начало'), {
      target: { value: '08:00' },
    });
    fireEvent.change(screen.getByLabelText('Окончание'), {
      target: { value: '09:00' },
    });
    fireEvent.change(screen.getByLabelText('Укажите цену данной тренировки'), {
      target: { value: '900' },
    });
    fireEvent.change(screen.getByLabelText('Кол-во мест'), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByLabelText('Место проведения'), {
      target: { value: 'Зал №1' },
    });
    // Направление auto-select: при одном sportId (Йога) useEffect в ScheduleSlotsEditor
    // автоматически ставит sportId = 1 во всех слотах
  }

  it('рендерит заголовок модалки', () => {
    render(<PublishClubModal {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('h2')).toHaveTextContent('Опубликовать клуб');
  });

  it('в режиме edit меняет title и primary-кнопку, а форму заполняет через initialData', () => {
    render(
      <PublishClubModal {...defaultProps} mode="edit" entityId={1} initialData={editInitialData} />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('h2')).toHaveTextContent('Редактировать клуб');
    expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeInTheDocument();
    expect(screen.getByLabelText('Название клуба')).toHaveValue('Volna Aquatic Club');
    expect(screen.getByLabelText('Телефон')).toHaveValue('+7 (846) 200-11-01');
    expect(screen.getByLabelText('Укажите название тренировочного слота')).toHaveValue(
      'Утреннее плавание',
    );
  });

  it('рендерит секцию «Основная информация» с обновлёнными лейблами', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Основная информация')).toBeInTheDocument();
    expect(screen.getByLabelText('Название клуба')).toBeInTheDocument();
    expect(screen.getByLabelText('Город')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес')).toBeInTheDocument();
    expect(screen.getByLabelText('Описание о вашем клубе')).toBeInTheDocument();
    expect(screen.getByLabelText('Укажите минимальную стоимость услуги «от»')).toBeInTheDocument();
  });

  it('рендерит секцию «Контактная информация» с phone, email, vk, telegram, facebook', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Контактная информация')).toBeInTheDocument();
    expect(screen.getByLabelText('Телефон')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('ВКонтакте')).toBeInTheDocument();
    expect(screen.getByLabelText('Telegram')).toBeInTheDocument();
    expect(screen.getByLabelText('Facebook')).toBeInTheDocument();
  });

  it('рендерит кнопку «Добавить фото»', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeInTheDocument();
  });

  it('рендерит секции TagSelector: «Направления клуба», «Добавить теги», «Удобства клуба»', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Направления клуба')).toBeInTheDocument();
    expect(screen.getByText('Добавить теги')).toBeInTheDocument();
    expect(screen.getByText('Удобства клуба')).toBeInTheDocument();
  });

  it('рендерит секцию «Добавить тренировочный слот» с обновлённым подзаголовком', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByText('Добавить тренировочный слот')).toBeInTheDocument();
    expect(screen.getByText('Добавьте от 1 до 3 тренировочных слотов')).toBeInTheDocument();
  });

  it('stub-элементы маркированы как «Скоро»', () => {
    render(<PublishClubModal {...defaultProps} />);

    const stubLabels = screen.getAllByText(/Скоро/);
    expect(stubLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('рендерит кнопки «Создать публикацию» и «Отмена» в footer', () => {
    render(<PublishClubModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Создать публикацию' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });

  it('показывает notice при клике на «Добавить фото»', () => {
    render(<PublishClubModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Добавить фото' }));
    expect(screen.getByText(/Функционал загрузки фото находится в разработке/)).toBeInTheDocument();
  });

  it('показывает ошибки при пустом submit', () => {
    render(<PublishClubModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    expect(screen.getByText('Укажите название клуба')).toBeInTheDocument();
    expect(screen.getByText('Необходимо выбрать хотя бы 1 направление')).toBeInTheDocument();
    expect(screen.getByText('Проверьте обязательные поля формы')).toBeInTheDocument();
  });

  it('выбор через TagSelector обновляет form-state и отправляет корректные id', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({ success: true, data: { club: { id: 10 } } }, 201),
    );

    render(<PublishClubModal {...defaultProps} />);
    fillValidClubForm();
    // Добавляем тег и удобство через TagSelector
    selectTagSelectorItem('Добавить теги', 'Для начинающих');
    selectTagSelectorItem('Удобства клуба', 'Парковка');

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(requestInit?.body));

    expect(payload.sportIds).toEqual([1]); // Йога
    expect(payload.tagIds).toEqual([1]); // Для начинающих
    expect(payload.amenityIds).toEqual([1]); // Парковка
  });

  it('отправляет vk/telegram/facebook в payload', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({ success: true, data: { club: { id: 10 } } }, 201),
    );

    render(<PublishClubModal {...defaultProps} />);
    fillValidClubForm();
    fireEvent.change(screen.getByLabelText('ВКонтакте'), {
      target: { value: 'vk.com/fitzone' },
    });
    fireEvent.change(screen.getByLabelText('Telegram'), {
      target: { value: '@fitzone' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(requestInit?.body));

    expect(payload.vk).toBe('vk.com/fitzone');
    expect(payload.telegram).toBe('@fitzone');
    expect(payload.facebook).toBe('');
  });

  it('vk/telegram/facebook пустые — submit проходит', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({ success: true, data: { club: { id: 10 } } }, 201),
    );

    render(<PublishClubModal {...defaultProps} />);
    fillValidClubForm();

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSuccess).toHaveBeenCalledWith('Клуб опубликован. Кабинет обновлён.');
  });

  it('phone пустой — валидация блокирует submit', () => {
    render(<PublishClubModal {...defaultProps} />);

    // Заполним всё кроме телефона
    fireEvent.change(screen.getByLabelText('Название клуба'), {
      target: { value: 'Test Club' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    expect(screen.getByText('Укажите телефон')).toBeInTheDocument();
  });

  it('в режиме edit отправляет PATCH на entity endpoint и сохраняет slot id в payload', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          success: true,
          data: { club: { id: 1 } },
        },
        200,
      ),
    );

    render(
      <PublishClubModal {...defaultProps} mode="edit" entityId={1} initialData={editInitialData} />,
    );

    fireEvent.change(screen.getByLabelText('Название клуба'), {
      target: { value: 'Volna Aquatic Club Premium' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(requestInit?.body));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/clubs/1',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );
    expect(payload.name).toBe('Volna Aquatic Club Premium');
    expect(payload.scheduleSlots[0].id).toBe(15);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSuccess).toHaveBeenCalledWith(
      'Изменения клуба сохранены. Кабинет обновлён.',
    );
  });

  it('показывает ошибку API и не закрывает модалку', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          success: false,
          error: 'Не удалось создать клуб',
        },
        500,
      ),
    );

    render(<PublishClubModal {...defaultProps} />);

    fillValidClubForm();
    fireEvent.click(screen.getByRole('button', { name: 'Создать публикацию' }));

    await waitFor(() => {
      expect(screen.getByText('Не удалось создать клуб')).toBeInTheDocument();
    });

    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  it('в режиме edit показывает ошибку API и не закрывает модалку', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          success: false,
          error: 'Не удалось обновить клуб',
        },
        500,
      ),
    );

    render(
      <PublishClubModal {...defaultProps} mode="edit" entityId={1} initialData={editInitialData} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => {
      expect(screen.getByText('Не удалось обновить клуб')).toBeInTheDocument();
    });

    expect(defaultProps.onClose).not.toHaveBeenCalled();
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  it('после close/reopen в режиме create сбрасывает несохранённое состояние формы', () => {
    const view = render(<PublishClubModal {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Название клуба'), {
      target: { value: 'Черновик клуба' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    view.rerender(<PublishClubModal {...defaultProps} open={false} />);
    view.rerender(<PublishClubModal {...defaultProps} open={true} />);

    expect(screen.getByLabelText('Название клуба')).toHaveValue('');
  });
});
