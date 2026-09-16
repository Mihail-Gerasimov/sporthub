// Тесты секции «Мои публикации» провайдер-кабинета (Step 12.5 / Step 14.7 / Step 15.6)
import { fireEvent, screen } from '@testing-library/react';
import { renderInFaceCabinet } from '@/test/helpers/cabinet';
import { describe, expect, it, vi } from 'vitest';

import { ProviderPublicationsSection } from '@/components/profile/ProviderPublicationsSection';
import type { Club, Trainer } from '@sporthub/types';

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna',
    description: '',
    shortDescription: '',
    city: 'Самара',
    address: '',
    phone: '',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [3],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.8,
    reviewCount: 10,
    priceFrom: 900,
    distanceKm: 1.8,
    managedByUserId: 2,
  },
];

const trainers: Trainer[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Марина Соколова',
    slug: 'marina',
    bio: '',
    avatarUrl: '',
    experienceYears: 9,
    specialtyIds: [],
    workFormatIds: [1],
    rating: 4.9,
    reviewCount: 3,
    priceFrom: 1400,
    sportIds: [3],
    managedByUserId: 2,
  },
];

describe('ProviderPublicationsSection', () => {
  it('рендерит карточки клубов и тренеров с типом и рейтингом', () => {
    renderInFaceCabinet(<ProviderPublicationsSection clubs={clubs} trainers={trainers} />);

    // Заголовок секции
    expect(screen.getByText('Мои публикации')).toBeInTheDocument();

    // Клуб
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByText('Клуб')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText(/10 отзыв/)).toBeInTheDocument();

    // Тренер
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.getByText('Тренер')).toBeInTheDocument();
    expect(screen.getByText('4.9')).toBeInTheDocument();
    expect(screen.getByText(/3 отзыв/)).toBeInTheDocument();
  });

  // Фаза 38, шаг 38.53: владелец видит знак проверки у себя в кабинете.
  it('проверенная публикация несёт знак «проверено» без своего фокуса — карточка целиком ссылка', () => {
    renderInFaceCabinet(
      <ProviderPublicationsSection
        clubs={[{ ...clubs[0], verifiedAt: '2026-09-15T10:00:00.000Z' }]}
        trainers={trainers}
      />,
    );

    const badges = screen.getAllByTestId('verified-badge');

    // Ровно один — у клуба; тренер в фикстуре не проверен.
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('Клуб проверен');
    expect(badges[0]).not.toHaveAttribute('tabindex');
    expect(screen.getByRole('link', { name: 'Volna Aquatic Club' })).toContainElement(badges[0]);
  });

  it('рендерит ссылки на детальные страницы', () => {
    renderInFaceCabinet(<ProviderPublicationsSection clubs={clubs} trainers={trainers} />);

    const clubLink = screen.getByRole('link', { name: /Volna Aquatic Club/ });
    const trainerLink = screen.getByRole('link', { name: /Марина Соколова/ });

    expect(clubLink).toHaveAttribute('href', '/clubs/volna');
    expect(trainerLink).toHaveAttribute('href', '/trainers/marina');
  });

  it('показывает пустое состояние при отсутствии публикаций', () => {
    renderInFaceCabinet(<ProviderPublicationsSection clubs={[]} trainers={[]} />);

    expect(screen.getByTestId('provider-publications-empty')).toHaveTextContent(
      'У вас пока нет публикаций',
    );
  });

  it('после появления нового клуба в props сразу рендерит карточку публикации', () => {
    const { rerender } = renderInFaceCabinet(
      <ProviderPublicationsSection clubs={[]} trainers={[]} />,
    );

    expect(screen.getByTestId('provider-publications-empty')).toBeInTheDocument();

    rerender(<ProviderPublicationsSection clubs={clubs} trainers={[]} />);

    expect(screen.getByTestId('provider-publications-list')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
  });

  it('после появления нового тренера в props сразу рендерит карточку публикации', () => {
    const { rerender } = renderInFaceCabinet(
      <ProviderPublicationsSection clubs={[]} trainers={[]} />,
    );

    expect(screen.getByTestId('provider-publications-empty')).toBeInTheDocument();

    rerender(<ProviderPublicationsSection clubs={[]} trainers={trainers} />);

    expect(screen.getByTestId('provider-publications-list')).toBeInTheDocument();
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
  });

  it('корректно работает с только клубами', () => {
    renderInFaceCabinet(<ProviderPublicationsSection clubs={clubs} trainers={[]} />);

    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.queryByText('Марина Соколова')).not.toBeInTheDocument();
  });

  it('корректно работает с только тренерами', () => {
    renderInFaceCabinet(<ProviderPublicationsSection clubs={[]} trainers={trainers} />);

    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.queryByText('Volna Aquatic Club')).not.toBeInTheDocument();
  });

  it('рендерит action «Редактировать» и прокидывает корректный entity-контекст', () => {
    const onEdit = vi.fn();

    renderInFaceCabinet(
      <ProviderPublicationsSection clubs={clubs} trainers={trainers} onEdit={onEdit} />,
    );

    const editButtons = screen.getAllByRole('button', { name: 'Редактировать' });

    expect(editButtons).toHaveLength(2);

    fireEvent.click(editButtons[0]);
    fireEvent.click(editButtons[1]);

    expect(onEdit).toHaveBeenNthCalledWith(1, 'club', 1);
    expect(onEdit).toHaveBeenNthCalledWith(2, 'trainer', 1);
  });

  it('сохраняет delete-flow после добавления action «Редактировать»', () => {
    const onDelete = vi.fn();
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderInFaceCabinet(
      <ProviderPublicationsSection clubs={clubs} trainers={trainers} onDelete={onDelete} />,
    );

    const deleteButtons = screen.getAllByRole('button', { name: 'Удалить' });

    expect(deleteButtons).toHaveLength(2);

    fireEvent.click(deleteButtons[0]);
    fireEvent.click(deleteButtons[1]);

    expect(confirmMock).toHaveBeenNthCalledWith(
      1,
      'Удалить публикацию? Это действие нельзя отменить.',
    );
    expect(confirmMock).toHaveBeenNthCalledWith(
      2,
      'Удалить публикацию? Это действие нельзя отменить.',
    );
    expect(onDelete).toHaveBeenNthCalledWith(1, 'club', 1);
    expect(onDelete).toHaveBeenNthCalledWith(2, 'trainer', 1);

    confirmMock.mockRestore();
  });

  it('скрытие МОДЕРАТОРОМ: подпись называет модерацию и показывает причину', () => {
    const hiddenClub: Club[] = [
      {
        ...clubs[0],
        status: 'hidden',
        hideReason: 'Нарушение правил',
        hiddenByUserId: 3,
        hiddenAt: '2026-04-14T10:00:00.000Z',
        hiddenKind: 'moderation',
      },
    ];

    renderInFaceCabinet(<ProviderPublicationsSection clubs={hiddenClub} trainers={[]} />);

    expect(screen.getByText('Скрыто модератором')).toBeInTheDocument();
    expect(screen.getByText('Нарушение правил')).toBeInTheDocument();
  });

  it('АРХИВ ВЛАДЕЛЬЦА: подпись не говорит про модератора и причину не показывает', () => {
    // ⚠️ Дефект, найденный браузерным прогоном приёмки. Карточка называла ЛЮБОЕ
    // скрытие «Скрыто администратором» — включая публикацию, которую владелец сам
    // убрал в архив. Различение было сделано на сервере и покрыто тестами,
    // а до этого экрана не дошло: главный класс ошибок фазы 35.
    //
    // Причина архива служебная («Убрано владельцем из каталога») и человеку ничего
    // не сообщает: он и так знает, что убрал публикацию сам.
    const archived: Club[] = [
      {
        ...clubs[0],
        status: 'hidden',
        hideReason: 'Убрано владельцем из каталога',
        hiddenByUserId: 2,
        hiddenAt: '2026-04-14T10:00:00.000Z',
        hiddenKind: 'owner_archive',
      },
    ];

    renderInFaceCabinet(<ProviderPublicationsSection clubs={archived} trainers={[]} />);

    expect(screen.getByText('Убрано владельцем')).toBeInTheDocument();
    expect(screen.queryByText('Скрыто модератором')).not.toBeInTheDocument();
    expect(screen.queryByText('Убрано владельцем из каталога')).not.toBeInTheDocument();
  });

  it('вид скрытия неизвестен — подпись строже, а не мягче', () => {
    // Ошибаться надо в сторону модерации: выдать чужое скрытие за собственный
    // архив хуже, чем наоборот.
    const unknown: Club[] = [
      {
        ...clubs[0],
        status: 'hidden',
        hideReason: 'Нарушение правил',
        hiddenByUserId: 3,
        hiddenAt: '2026-04-14T10:00:00.000Z',
      },
    ];

    renderInFaceCabinet(<ProviderPublicationsSection clubs={unknown} trainers={[]} />);

    expect(screen.getByText('Скрыто модератором')).toBeInTheDocument();
  });

  it('кнопка «Редактировать» доступна для hidden публикации', () => {
    const onEdit = vi.fn();
    const hiddenClub: Club[] = [
      {
        ...clubs[0],
        status: 'hidden',
        hideReason: 'Тест',
      },
    ];

    renderInFaceCabinet(
      <ProviderPublicationsSection clubs={hiddenClub} trainers={[]} onEdit={onEdit} />,
    );

    const editButton = screen.getByRole('button', { name: 'Редактировать' });

    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledWith('club', 1);
  });

  it('НЕ показывает badge скрытия для published публикации', () => {
    renderInFaceCabinet(<ProviderPublicationsSection clubs={clubs} trainers={trainers} />);

    expect(screen.queryByText('Скрыто модератором')).not.toBeInTheDocument();
  });
});
