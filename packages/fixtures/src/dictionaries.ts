// Справочник видов спорта — зафиксированный набор.
//
// Раньше сверка контрактов поднималась на КОПИИ рабочего каталога `data/`: справочник
// видов спорта в эталоне не пустой, а `seedTestData` его не писал. Зависимость выглядела
// безобидной ровно до того момента, когда каталога данных не станет — после переезда
// на базу его удаляют, и сверку стало бы невозможно запустить. А она — главный признак
// того, что переезд ничего не сломал.
//
// Поэтому набор зафиксирован здесь дословно, каким он был на момент съёмки эталона.
// Менять его нельзя без пересъёмки эталона: любая правка сдвинет ответы `GET /api/sports`
// и всего, что показывает направления.
//
// Шаг 38.80: у каждого вида — цвет на карте (`color`, `#rrggbb`), эталон переснят.
// Шесть цветов — из легенды карты макета (`prosport/src/app/App.tsx`, `catColors`:
// кроссфит, йога, плавание, единоборства, зал, танцы). Бокса, пилатеса и борьбы
// у макета нет — их цвета взяты из его же палитры секторов (`SeatingWidgetFull.tsx`:
// amber, emerald, indigo), а не выдуманы; заменить — правка одной строки здесь.

import type { Sport } from '@sporthub/types';

export const fixtureSports: Sport[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Йога',
    slug: 'yoga',
    description: 'Практики для гибкости, дыхания и баланса в спокойном ритме.',
    icon: '🧘',
    imageUrl: '/images/sports/yoga.jpg',
    isPopular: true,
    color: '#8b5cf6',
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Бокс',
    slug: 'boxing',
    description: 'Тренировки на технику ударов, координацию и выносливость.',
    icon: '🥊',
    imageUrl: '/images/sports/boxing.jpg',
    isPopular: true,
    color: '#f59e0b',
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Плавание',
    slug: 'swimming',
    description: 'Групповые и индивидуальные занятия в бассейне для любого уровня.',
    icon: '🏊',
    imageUrl: '/images/sports/swimming.jpg',
    isPopular: true,
    color: '#3b82f6',
  },
  {
    id: 4,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Кроссфит',
    slug: 'crossfit',
    description: 'Интенсивные функциональные тренировки с прогрессией нагрузки.',
    icon: '🏋️',
    imageUrl: '/images/sports/crossfit.jpg',
    isPopular: true,
    color: '#ef4444',
  },
  {
    id: 5,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Танцы',
    slug: 'dance',
    description: 'Современные танцевальные направления для взрослых и подростков.',
    icon: '💃',
    imageUrl: '/images/sports/dance.jpg',
    isPopular: true,
    color: '#ec4899',
  },
  {
    id: 6,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Тренажёрный зал',
    slug: 'gym',
    description: 'Силовые и общефизические тренировки в зале с программой под цель.',
    icon: '🏋️‍♂️',
    imageUrl: '/images/sports/gym.jpg',
    isPopular: true,
    color: '#6b7280',
  },
  {
    id: 7,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Единоборства',
    slug: 'martial-arts',
    description: 'Группы по технике, выносливости и самообороне.',
    icon: '🥋',
    imageUrl: '/images/sports/martial-arts.jpg',
    isPopular: false,
    color: '#f97316',
  },
  {
    id: 8,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Пилатес',
    slug: 'pilates',
    description: 'Мягкая работа с осанкой, центром тела и контролем движения.',
    icon: '🤸',
    imageUrl: '/images/sports/pilates.jpg',
    isPopular: true,
    color: '#10b981',
  },
  {
    id: 9,
    createdAt: '2026-04-18T18:07:36.053Z',
    name: 'Борьба',
    slug: 'wrestling',
    description: 'Тренировки по технике борьбы, контролю соперника и общей физической подготовке.',
    icon: '',
    imageUrl: '',
    isPopular: true,
    color: '#6366f1',
  },
];
