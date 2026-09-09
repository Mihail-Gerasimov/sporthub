// Корневой модуль бэкенда.
// Слой данных подключается один раз глобально; доменные сервисы — здесь же,
// пока их немного. По мере роста они разъедутся по своим модулям.

import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AccessService } from './access/access.service';
import { SessionGuard } from './auth/session.guard';
import { SessionService } from './auth/session.service';
import { BookingService } from './bookings/booking.service';
import { BOOKING_CONTROLLERS } from './bookings/bookings.controller';
import { BookingsGateway } from './bookings/bookings.gateway';
import { CatalogQueryService } from './catalog/catalog-query.service';
import { CATALOG_CONTROLLERS } from './catalog/catalog.controller';
import { CLUB_CONTROLLERS } from './catalog/clubs.controller';
import { LinkService } from './links/link.service';
import { LINK_CONTROLLERS } from './links/links.controller';
import { ADMIN_CONTROLLERS } from './admin/admin.controller';
import { ANALYTICS_CONTROLLERS } from './analytics/analytics.controller';
import { AUTH_CONTROLLERS } from './auth/auth.controller';
import { GEO_CONTROLLERS } from './geo/geo.controller';
import { LOG_CONTROLLERS } from './logs/logs.controller';
import { MODERATION_CONTROLLERS } from './moderation/moderation.controller';
import { NOTE_CONTROLLERS } from './notes/notes.controller';
import { NOTIFICATION_CONTROLLERS } from './notifications/notifications.controller';
import { USER_ACCOUNT_CONTROLLERS } from './users/users-account.controller';
import { REVIEW_CONTROLLERS } from './reviews/reviews.controller';
import { SCHEDULE_CONTROLLERS } from './schedule/schedule.controller';
import { DICTIONARY_CONTROLLERS } from './dictionaries/dictionaries.controller';
import { ApiResponseInterceptor } from './common/api-response.interceptor';
import { DomainErrorFilter } from './common/domain-error.filter';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { LogService } from './logs/log.service';
import { NotificationService } from './notifications/notification.service';
import { PublicationService } from './publications/publication.service';
import { SlotContextService } from './schedule/slot-context.service';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [
    HealthController,
    ...DICTIONARY_CONTROLLERS,
    ...CATALOG_CONTROLLERS,
    ...BOOKING_CONTROLLERS,
    ...CLUB_CONTROLLERS,
    ...SCHEDULE_CONTROLLERS,
    ...REVIEW_CONTROLLERS,
    ...LINK_CONTROLLERS,
    ...NOTIFICATION_CONTROLLERS,
    ...USER_ACCOUNT_CONTROLLERS,
    ...NOTE_CONTROLLERS,
    ...AUTH_CONTROLLERS,
    ...LOG_CONTROLLERS,
    ...MODERATION_CONTROLLERS,
    ...ANALYTICS_CONTROLLERS,
    ...ADMIN_CONTROLLERS,
    ...GEO_CONTROLLERS,
  ],
  providers: [
    // Формат ответа и разбор ошибок — общие для всех контроллеров.
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
    // ⚠️ Закрыто по умолчанию: маршрут без пометки `@Public` требует сессии.
    // Регистрация именно здесь, а не в каждом модуле, и есть суть решения —
    // маршрут, добавленный завтра, окажется закрыт сам.
    { provide: APP_GUARD, useClass: SessionGuard },
    HealthService,
    AccessService,
    SlotContextService,
    NotificationService,
    LogService,
    BookingService,
    PublicationService,
    BookingsGateway,
    CatalogQueryService,
    LinkService,
    SessionService,
  ],
})
export class AppModule {}
