import { Module } from '@nestjs/common';
import { WellnessController } from './wellness.controller';
import { WellnessRepository } from './wellness.repository';
import { WellnessService } from './wellness.service';

@Module({ controllers: [WellnessController], providers: [WellnessRepository, WellnessService] })
export class WellnessModule {}
