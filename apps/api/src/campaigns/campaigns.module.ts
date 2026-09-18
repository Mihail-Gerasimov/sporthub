import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';
import { AccessService } from '../access/access.service';

@Module({ controllers: [CampaignsController], providers: [CampaignsRepository, CampaignsService, AccessService] })
export class CampaignsModule {}
