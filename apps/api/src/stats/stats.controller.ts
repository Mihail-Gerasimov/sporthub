// Сводные счётчики площадки для витрины — `GET /api/stats/overview` (фаза 38, шаг 38.30).
//
// Герой главной показывает четыре живых числа: спортсменов, тренеров, клубов,
// отзывов. До этого шага «N клубов» бралось из длины поднятого каталога — ради
// одного числа страница читала всю таблицу и делала это при каждом открытии.
// Здесь каждое число — `COUNT` в базе по тому же отбору, по которому витрина
// показывает публикации: скрытые не считаются, служебные записи людьми не считаются.
//
// ⚠️ Порог кэширования — назван, а не подразумевается. Четыре счёта на запрос:
// три по индексам (`status` у клубов и тренеров, первичный ключ у отзывов),
// один — обход таблицы людей (индекса по виду учётной записи нет намеренно,
// см. `UsersRepository.countByAccountKind`). На живой базе это единицы
// миллисекунд; главная — самая посещаемая страница, и при её нагрузке свыше
// ~50 запросов/с (замер фазы 37: 2334 запроса/с на очереди — запас есть)
// сюда ставится кэш на 60 секунд у самого маршрута. До того кэш — абстракция
// впрок: цифры героя не обязаны быть секундной точности, но и хранить их негде.

import { Controller, Get, Inject } from '@nestjs/common';
import type { PlatformOverview } from '@sporthub/types';

import { Public } from '../auth/access.decorators';
import type { ReviewsRepository, UsersRepository } from '../repositories/crud.repository';
import { REVIEWS_REPOSITORY, USERS_REPOSITORY } from '../repositories/crud.repository';
import type { ClubsRepository, TrainersRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';

// Форма ответа — `PlatformOverview` в `@sporthub/types`: её же читает витрина.
// Открыто гостю: это цифры героя главной, а главная открывается до входа.
@Public()
@Controller('stats')
export class StatsController {
  constructor(
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(REVIEWS_REPOSITORY) private readonly reviews: ReviewsRepository,
  ) {}

  @Get('overview')
  async overview(): Promise<PlatformOverview> {
    // Четыре независимых счёта — параллельно. Каждый — `COUNT` в базе,
    // список ради числа не поднимается (сторож в тесте).
    const [athletes, trainers, clubs, reviews] = await Promise.all([
      this.users.countByAccountKind('person'),
      this.trainers.count({ excludeHidden: true }),
      this.clubs.count({ excludeHidden: true }),
      this.reviews.count({}),
    ]);

    return { athletes, trainers, clubs, reviews };
  }
}

export const STATS_CONTROLLERS = [StatsController];
