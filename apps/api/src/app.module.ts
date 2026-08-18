// Корневой модуль бэкенда.
// Слой данных подключается один раз глобально; доменные сервисы — здесь же,
// пока их немного. По мере роста они разъедутся по своим модулям.

import { Module } from '@nestjs/common';

import { AccessService } from './access/access.service';
import { BookingService } from './bookings/booking.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { LogService } from './logs/log.service';
import { NotificationService } from './notifications/notification.service';
import { SlotContextService } from './schedule/slot-context.service';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    AccessService,
    SlotContextService,
    NotificationService,
    LogService,
    BookingService,
  ],
})
export class AppModule {}
