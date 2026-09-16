/*
 * Тесты ClubCard — карточка клуба по эталону витрины (фаза 38, шаг 38.73;
 * `HomePage.tsx:85-118`, чек-лист эталона step-39…43).
 *
 * Форма — из макета: фото 180 с затемнением снизу, на нём имя, рейтинг со звездой,
 * число отзывов, пин и расстояние; слева сверху — категория, справа — плашка «от N».
 * Логика — наша (реестр № 86–94): вся карточка ведёт на СТРАНИЦУ клуба, а не в общий
 * каталог; бейдж «Новый», описание и лента тегов остаются; знак «проверено» по
 * `verifiedAt`; фото — из `imageUrls[0]`, без него — заглушка с пометкой `STUB:`.
 *
 * Подпись `aria-label="Карточка клуба: …"` — контракт единственности (сторож
 * `club-card-single`): вторая карточка с такой подписью — дубль.
 *
 * jsdom не считает layout (scrollWidth=0), поэтому ChipMarquee внутри карточки
 * попадёт в ветку no-loop. Для тестов это ОК — важна структура DOM и тексты.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClubCard } from '@/components/clubs/ClubCard';
import type { Club, Sport, Tag } from '@sporthub/types';

const sports: Pick<Sport, 'id' | 'name' | 'icon'>[] = [
  { id: 3, name: 'Плавание', icon: '🏊' },
  { id: 8, name: 'Пилатес', icon: '🤸' },
];

const tags: Tag[] = [
  { id: 1, name: 'Бассейн', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, name: 'Групповые', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 3, name: 'Детские секции', createdAt: '2026-01-01T00:00:00.000Z' },
];

const baseClub: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Volna Aquatic Club',
  slug: 'volna-aquatic-club',
  description: 'Клуб с бассейном и пилатесом',
  shortDescription: 'Бассейн и пилатес рядом с набережной.',
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  phone: '+7 (846) 200-11-01',
  email: 'hello@volna-club.ru',
  website: 'https://volna-club.ru',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  sportIds: [3, 8],
  imageUrls: [],
  amenityIds: [1],
  tagIds: [1, 2, 3],
  rating: 0,
  reviewCount: 0,
  priceFrom: 900,
  distanceKm: 1.8,
};

const ratedClub: Club = { ...baseClub, rating: 4.8, reviewCount: 12 };

/** Классы позиционирования у элементов строго между предком и потомком. */
function positionedAncestorsBetween(ancestor: HTMLElement, node: HTMLElement): string[] {
  const found: string[] = [];

  for (let el = node.parentElement; el !== null && el !== ancestor; el = el.parentElement) {
    if (/\b(relative|absolute|fixed|sticky)\b/.test(el.className)) found.push(el.className);
  }

  return found;
}

describe('ClubCard (38.73)', () => {
  beforeEach(() => {
    // Мокаем rAF — ChipMarquee внутри карточки не будет реально анимироваться.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('карточка — <article> с подписью «Карточка клуба: имя», без обёртки <a>', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);

    const card = screen.getByRole('article', { name: 'Карточка клуба: Volna Aquatic Club' });

    expect(card).toHaveAttribute('data-testid', 'club-card');
    expect(card.closest('a')).toBeNull();
  });

  it('вся карточка ведёт на страницу клуба: ссылка с именем растянута на карточку', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);

    const link = screen.getByRole('link', { name: 'Volna Aquatic Club' });

    expect(link).toHaveAttribute('href', '/clubs/volna-aquatic-club');
    // Растянутая ссылка: псевдоэлемент на всю карточку, а не обёртка `<a>`.
    expect(link.className).toContain('after:absolute');
    expect(link.className).toContain('after:inset-0');
  });

  it('между article и ссылкой нет позиционированных предков: `after:inset-0` растягивается от карточки (прогон 38.96)', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);

    const card = screen.getByRole('article', { name: 'Карточка клуба: Volna Aquatic Club' });
    const link = screen.getByRole('link', { name: 'Volna Aquatic Club' });

    // ⚠️ Геометрию jsdom не считает, поэтому — структура: псевдоэлемент считается от
    // ближайшего позиционированного предка. Прежде им был `div.absolute` низа фото,
    // и кликабельными были 70px из 350 — фото, описание и углы ссылкой не были.
    expect(positionedAncestorsBetween(card, link)).toEqual([]);
    expect(card.className).toMatch(/\brelative\b/);
    // Описание под фото — внутри той же карточки: растянутая ссылка накрывает и его.
    expect(within(card).getByText(baseClub.shortDescription)).toBeInTheDocument();
  });

  it('над растянутой ссылкой возвышается только знак «проверено»: категория и лента тегов — под ней (приёмка, проход 1)', () => {
    render(
      <ClubCard
        club={{ ...baseClub, verifiedAt: '2026-09-15T10:00:00.000Z' }}
        sports={sports}
        tags={tags}
      />,
    );

    const card = screen.getByRole('article', { name: 'Карточка клуба: Volna Aquatic Club' });
    // Всё, что стоит выше ссылки (`z-[2]`), — мёртвая зона для клика по карточке:
    // прежде это были блок категории и лента тегов. Исключение одно — знак с подсказкой.
    const raised = [...card.querySelectorAll<HTMLElement>('[class*="z-[2]"]')];

    expect(raised.length).toBeGreaterThan(0);
    for (const el of raised) {
      expect(
        el.querySelector('[data-testid="verified-badge"]') ??
          el.closest('[data-testid="verified-badge"]'),
      ).not.toBeNull();
      expect(el.textContent).not.toContain('Плавание');
    }
    expect(screen.getByText('Плавание').closest('[class*="z-[2]"]')).toBeNull();
  });

  it('лента чипов в карточке декоративная: под растянутой ссылкой drag недостижим — не вешается (ревью f07dc4d)', () => {
    const addTrack = vi.spyOn(HTMLDivElement.prototype, 'addEventListener');
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);

    const card = screen.getByRole('article', { name: 'Карточка клуба: Volna Aquatic Club' });
    const track = card.querySelector('.chip-track') as HTMLElement;

    expect(track).not.toBeNull();
    // Слушатели самой ленты (React вешает свои на корень для всех событий).
    const onTrack = addTrack.mock.calls
      .filter((_, i) => addTrack.mock.contexts[i] === track)
      .map(([type]) => type);
    expect(onTrack).not.toContain('pointerdown');
    expect(track.className).not.toContain('cursor-grab');
  });

  it('категория — первый вид спорта клуба из справочника', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);

    expect(screen.getByText('Плавание')).toBeInTheDocument();
  });

  it('цена «от N» одной нодой; расстояния нет ни в одном режиме — «0.0 км» было фальшивым числом (Д-17, 38.104)', () => {
    const { unmount } = render(
      <ClubCard club={{ ...baseClub, priceFrom: 1500, distanceKm: 2.4 }} sports={sports} />,
    );

    // Плашка цены — одной нодой: «от 1 500 ₽» читается диктором как одна фраза.
    expect(screen.getByText(/^от\s+1\s?500/)).toBeInTheDocument();
    expect(screen.queryByText(/км/)).not.toBeInTheDocument();

    unmount();
    render(<ClubCard club={{ ...baseClub, distanceKm: 2.4 }} sports={sports} variant="showcase" />);

    expect(screen.queryByText(/км/)).not.toBeInTheDocument();
  });

  describe('variant="showcase" — фото-плитка макета «Топовые залы» (38.104)', () => {
    it('та же карточка и подпись; на фото — категория, «от цена», имя, рейтинг с отзывами, знак; вся плитка — ссылка', () => {
      render(
        <ClubCard
          club={{
            ...baseClub,
            rating: 4.8,
            reviewCount: 64,
            verifiedAt: '2026-09-15T10:00:00.000Z',
          }}
          sports={sports}
          tags={tags}
          variant="showcase"
        />,
      );

      const card = screen.getByRole('article', { name: 'Карточка клуба: Volna Aquatic Club' });

      expect(card).toHaveAttribute('data-testid', 'club-card');
      expect(card).toHaveAttribute('data-variant', 'showcase');
      expect(within(card).getByText('Плавание')).toBeInTheDocument();
      expect(within(card).getByText(/^от\s+900/)).toBeInTheDocument();
      expect(within(card).getByRole('img', { name: 'Рейтинг: 4.8 из 5' })).toBeInTheDocument();
      expect(within(card).getByText('(64)')).toBeInTheDocument();
      expect(within(card).getByTestId('verified-badge')).toBeInTheDocument();

      const link = within(card).getByRole('link', { name: 'Volna Aquatic Club' });

      expect(link).toHaveAttribute('href', '/clubs/volna-aquatic-club');
      expect(link.className).toContain('after:inset-0');
      expect(positionedAncestorsBetween(card, link)).toEqual([]);
      // Имя — пресет `t-card-title` (38.109: Inter 700 19px), не display-капитель.
      const name = link.closest('h3') as HTMLElement;
      expect(name.className).toContain('t-card-title');
      expect(name.className).not.toMatch(/font-display|uppercase|t-h3|t-h4/);
    });

    it('описание, адрес и лента тегов в витрине не рисуются — они живут в API и на детальной', () => {
      render(<ClubCard club={baseClub} sports={sports} tags={tags} variant="showcase" />);

      const card = screen.getByRole('article', { name: 'Карточка клуба: Volna Aquatic Club' });

      expect(within(card).queryByText(baseClub.shortDescription)).not.toBeInTheDocument();
      expect(within(card).queryByText(baseClub.address)).not.toBeInTheDocument();
      expect(card.querySelector('.chip-track')).toBeNull();
      // Плитка — одна зона фото 180, без хвоста.
      expect(card.querySelector('.h-\\[180px\\]')).not.toBeNull();
    });

    it('без режима — каталожная карточка как прежде: описание, адрес и теги на месте', () => {
      render(<ClubCard club={baseClub} sports={sports} tags={tags} />);

      const card = screen.getByRole('article', { name: 'Карточка клуба: Volna Aquatic Club' });

      expect(card).toHaveAttribute('data-variant', 'catalog');
      // Имя в каталоге — тот же пресет `t-card-title` (макет: 19 на обеих).
      expect(
        within(card).getByRole('link', { name: 'Volna Aquatic Club' }).closest('h3')?.className,
      ).toContain('t-card-title');
      expect(within(card).getByText(baseClub.shortDescription)).toBeInTheDocument();
      expect(within(card).getByText(baseClub.address)).toBeInTheDocument();
      expect(card.querySelector('.chip-track')).not.toBeNull();
    });
  });

  it('рейтинг — одна звезда и число, для диктора подпись «Рейтинг: X из 5», рядом число отзывов', () => {
    render(<ClubCard club={ratedClub} sports={sports} tags={tags} />);

    expect(screen.getByRole('img', { name: 'Рейтинг: 4.8 из 5' })).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
    expect(screen.queryByTestId('club-card-new-badge')).not.toBeInTheDocument();
  });

  it('без рейтинга и отзывов — бейдж «Новый» вместо звезды', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);

    expect(screen.getByTestId('club-card-new-badge')).toHaveTextContent('Новый');
    expect(screen.queryByRole('img', { name: /Рейтинг/ })).not.toBeInTheDocument();
  });

  it('фото — из imageUrls[0], декоративное: имя рядом ссылкой, alt пустой', () => {
    render(
      <ClubCard
        club={{ ...baseClub, imageUrls: ['/images/clubs/volna-1.jpg'] }}
        sports={sports}
        tags={tags}
      />,
    );

    const photo = screen.getByTestId('club-card').querySelector('img');

    expect(photo).toHaveAttribute('src', '/images/clubs/volna-1.jpg');
    expect(photo).toHaveAttribute('alt', '');
    expect(screen.queryByText('Фото клуба')).not.toBeInTheDocument();
  });

  it('без фото — заглушка «Фото клуба»; сломанное фото падает в неё же', () => {
    const { unmount } = render(<ClubCard club={baseClub} sports={sports} tags={tags} />);

    expect(screen.getByText('Фото клуба')).toBeInTheDocument();

    unmount();
    render(
      <ClubCard
        club={{ ...baseClub, imageUrls: ['/images/clubs/missing.jpg'] }}
        sports={sports}
        tags={tags}
      />,
    );

    fireEvent.error(screen.getByTestId('club-card').querySelector('img') as HTMLImageElement);

    expect(screen.getByText('Фото клуба')).toBeInTheDocument();
  });

  it('highlighted → атрибут data-highlighted и зелёная рамка', () => {
    const { unmount } = render(<ClubCard club={baseClub} sports={sports} highlighted />);

    expect(screen.getByTestId('club-card')).toHaveAttribute('data-highlighted', 'true');
    expect(screen.getByTestId('club-card').className).toContain('border-lime');

    unmount();
    render(<ClubCard club={baseClub} sports={sports} />);

    expect(screen.getByTestId('club-card')).toHaveAttribute('data-highlighted', 'false');
  });

  it('описание и адрес остаются под фото', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);

    expect(screen.getByText('Бассейн и пилатес рядом с набережной.')).toBeInTheDocument();
    expect(screen.getByText('ул. Лесная, 23к1')).toBeInTheDocument();
  });

  it('резолвит tagIds в имена через справочник и не рисует неизвестные', () => {
    render(<ClubCard club={{ ...baseClub, tagIds: [1, 999, 2] }} sports={sports} tags={tags} />);

    expect(screen.getByText('Бассейн')).toBeInTheDocument();
    expect(screen.getByText('Групповые')).toBeInTheDocument();
    expect(screen.queryByText('#999')).not.toBeInTheDocument();
  });

  // Фаза 38, шаг 38.52: знак «проверено» — по полю `verifiedAt`, с подписью по виду лица.
  it('у проверенного клуба на фото стоит знак «Клуб проверен» с подсказкой; без verifiedAt знака нет', () => {
    const { unmount } = render(
      <ClubCard
        club={{ ...baseClub, verifiedAt: '2026-09-15T10:00:00.000Z' }}
        sports={sports}
        tags={tags}
      />,
    );

    const badge = screen.getByTestId('verified-badge');

    expect(badge).toHaveTextContent('Клуб проверен');
    expect(badge).toHaveAccessibleDescription(/проверила администрация/i);
    // Знак на карточке без своего фокуса: он стоит раньше ссылки с именем.
    expect(badge).not.toHaveAttribute('tabindex');
    expect(within(screen.getByTestId('club-card')).getByTestId('verified-badge')).toBe(badge);

    unmount();
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);

    expect(screen.queryByTestId('verified-badge')).not.toBeInTheDocument();
  });
});
