import { Module } from '@nestjs/common';
import { PassesController } from './passes.controller';
import { PassesRepository } from './passes.repository';
import { PassesService } from './passes.service';

@Module({ controllers: [PassesController], providers: [PassesRepository, PassesService] })
export class PassesModule {}
