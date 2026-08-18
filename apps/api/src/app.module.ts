// Корневой модуль бэкенда.
// Слой данных подключается один раз глобально; доменные сервисы — здесь же,
// пока их немного. По мере роста они разъедутся по своим модулям.

import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { AccessService } from './access/access.service';
import { BookingService } from './bookings/booking.service';
import { CATALOG_CONTROLLERS } from './catalog/catalog.controller';
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
  controllers: [HealthController, ...DICTIONARY_CONTROLLERS, ...CATALOG_CONTROLLERS],
  providers: [
    // Формат ответа и разбор ошибок — общие для всех контроллеров.
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
    HealthService,
    AccessService,
    SlotContextService,
    NotificationService,
    LogService,
    BookingService,
    PublicationService,
  ],
})
export class AppModule {}
