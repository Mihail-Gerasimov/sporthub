import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceRepository } from './marketplace.repository';
import { MarketplaceService } from './marketplace.service';

@Module({ controllers: [MarketplaceController], providers: [MarketplaceRepository, MarketplaceService] })
export class MarketplaceModule {}
