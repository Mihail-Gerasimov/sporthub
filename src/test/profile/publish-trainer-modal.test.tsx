// Тесты модалки публикации тренера (Step 13.4 / Step 14.6)
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublishTrainerModal } from '@/components/profile/PublishTrainerModal';
import type { TrainerFormState } from '@/lib/schemas/publish';

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
  };
  const editInitialData: TrainerFormState = {
    firstName: 'Марина',
    lastName: 'Соколова',
    city: 'Самара',
    address: 'ул. Лесная, 23к1',
    bio: 'Тренер по плаванию с акцентом на технику, дыхание и подготовку к любительским стартам.',
    experience: '9',
    sport: 'Плавание',
    specializations: ['Персональные тренировки'],
    workFormat: 'В клубе',
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
        discipline: 'Плавание',
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

  function fillValidTrainerForm() {
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Александр' } });
    fireEvent.change(screen.getByLabelText('Фамилия'), { target: { value: 'Иванов' } });
    fireEvent.change(screen.getByLabelText('Город'), { target: { value: 'Москва' } });
    fireEvent.change(screen.getByLabelText('Адрес / локация'), {
      target: { value: 'ул. Спортивная, 10' },
    });
    fireEvent.change(screen.getByLabelText('О себе'), {
      target: {
        value:
          'Опытный тренер по боксу с большим стажем, который работает с новичками и готовит спортсменов к турнирам.',
      },
    });
    fireEvent.change(screen.getByLabelText('Опыт (лет)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Основной вид спорта'), {
      target: { value: 'Бокс' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Персональные тренировки' }));
    fireEvent.click(screen.getByRole('button', { name: 'В клубе' }));
    fireEvent.change(screen.getByLabelText('Название услуги'), {
      target: { value: 'Персональная тренировка' },
    });
    fireEvent.change(screen.getByLabelText('Описание услуги'), {
      target: { value: 'Индивидуальное занятие по технике, защите и работе на лапах.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Индивидуальная' }));

    const priceInputs = screen.getAllByLabelText('Цена (₽)');
    fireEvent.change(priceInputs[0], { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText('Длительность (мин)'), {
      target: { value: '60' },
    });
    fireEvent.change(screen.getByLabelText('Укажите адрес проведения тренировки'), {
      target: { value: 'Зал №3' },
    });
    fireEvent.change(screen.getByLabelText('Название занятия'), {
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
    fireEvent.change(priceInputs[1], { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText('Кол-во мест'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText('Зал'), {
      target: { value: 'Зал единоборств' },
    });
    fireEvent.change(screen.getByLabelText('Направление'), {
      target: { value: 'Бокс' },
    });
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
    expect(screen.getByLabelText('Название занятия')).toHaveValue('Техника кроля');
  });

  it('рендерит секцию «Основная информация» с полями firstName, lastName, city, address, bio, experience', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Основная информация')).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toBeInTheDocument();
    expect(screen.getByLabelText('Фамилия')).toBeInTheDocument();
    expect(screen.getByLabelText('Город')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес / локация')).toBeInTheDocument();
    expect(screen.getByLabelText('О себе')).toBeInTheDocument();
    expect(screen.getByLabelText('Опыт (лет)')).toBeInTheDocument();
  });

  it('рендерит кнопку «Добавить фото»', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeInTheDocument();
  });

  it('рендерит секцию «Специализация» с полями sport, тип, workFormat', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Специализация')).toBeInTheDocument();
    expect(screen.getByLabelText('Основной вид спорта')).toBeInTheDocument();
    expect(screen.getByText('Тип')).toBeInTheDocument();
    expect(screen.getByText('Формат работы')).toBeInTheDocument();
  });

  it('рендерит секцию «Связать себя с клубом» с опциональным select', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Связать себя с клубом')).toBeInTheDocument();
    expect(screen.getByText(/Вы можете указать спортивный клуб/)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(2);
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

  it('рендерит секцию «Услуга тренера» с полями offering', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Услуга тренера')).toBeInTheDocument();
    expect(screen.getByLabelText('Название услуги')).toBeInTheDocument();
    expect(screen.getByLabelText('Описание услуги')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Цена (₽)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Длительность (мин)')).toBeInTheDocument();
    expect(screen.getByLabelText('Укажите адрес проведения тренировки')).toBeInTheDocument();
  });

  it('рендерит секции «Стартовое расписание» и «Дополнительные возможности»', () => {
    render(<PublishTrainerModal {...defaultProps} />);

    expect(screen.getByText('Стартовое расписание')).toBeInTheDocument();
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

  it('отправляет реальный payload и закрывает модалку после успешного submit', async () => {
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
      workFormat: 'В клубе',
    });
    expect(payload).not.toHaveProperty('certificates');
    expect(payload).not.toHaveProperty('gallery');
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSuccess).toHaveBeenCalledWith('Тренер опубликован. Кабинет обновлён.');
  });

  it('в режиме edit отправляет PATCH на entity endpoint и сохраняет slot id в payload', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse(
        {
          success: true,
          data: { trainer: { id: 1 } },
        },
        200,
      ),
    );

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
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(requestInit?.body));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/trainers/1',
      expect.objectContaining({
        method: 'PATCH',
      }),
    );
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
    expect(screen.getByLabelText('Название занятия')).toHaveValue('Мягкая растяжка в воде');
  });
});
