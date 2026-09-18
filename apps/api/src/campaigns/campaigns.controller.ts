import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { pageQuerySchema } from '@sporthub/domain';
import { z } from 'zod';
import { CurrentUser } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { ValidationError } from '../common/domain-error';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignsService } from './campaigns.service';

const parse = <T>(schema: z.ZodType<T>, raw: unknown): T => {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError('Некорректные данные');
  return result.data;
};
const campaignSchema = z.object({ title: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(2000) });

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly service: CampaignsService, private readonly repo: CampaignsRepository) {}
  @Get()
  list(@CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    return this.service.list(session.user.id, page.offset, page.limit);
  }
  @Post()
  create(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.service.create(session, parse(campaignSchema, body));
  }
  @Patch(':id')
  update(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.service.update(parse(z.coerce.number().int().positive(), rawId), session, parse(campaignSchema.partial(), body));
  }
  @Post(':id/send')
  send(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.service.send(parse(z.coerce.number().int().positive(), rawId), session);
  }
}
