import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

@Module({
  controllers: [SocialController],
  providers: [SocialRepository, SocialService],
})
export class SocialModule {}
