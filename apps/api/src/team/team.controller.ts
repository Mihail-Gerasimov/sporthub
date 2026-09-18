import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { pageQuerySchema, partnerAdInputSchema, teamEventInputSchema } from '@sporthub/domain';
import { z } from 'zod';
import { CurrentUser } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/domain-error';
import { TeamRepository } from './team.repository';
import { TeamService } from './team.service';

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError('Некорректные данные');
  return result.data;
};
const id = (raw: string) => parse(z.coerce.number().int().positive(), raw);

@Controller('team')
export class TeamController {
  constructor(private readonly service: TeamService, private readonly repo: TeamRepository) {}

  @Get('events')
  async events(@CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    return this.service.listEvents(session.user.id, page.offset, page.limit);
  }
  @Post('events')
  createEvent(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.repo.createEvent(session.user.id, parse(teamEventInputSchema, body));
  }
  @Patch('events/:id')
  updateEvent(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.service.changeEvent(id(rawId), session, parse(teamEventInputSchema.partial(), body));
  }
  @Delete('events/:id')
  deleteEvent(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.service.changeEvent(id(rawId), session);
  }
  @Post('events/:id/join')
  join(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.service.join(id(rawId), session.user.id);
  }
  @Get('events/:id/participants')
  participants(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    return this.service.participants(id(rawId), session.user.id, page.offset, page.limit);
  }
  @Delete('events/:id/join')
  leave(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.repo.leave(id(rawId), session.user.id);
  }
  @Get('partner-ads')
  async ads(@Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    return this.service.listAds(page.offset, page.limit);
  }
  @Post('partner-ads')
  createAd(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.repo.createAd(session.user.id, parse(partnerAdInputSchema, body));
  }
  @Patch('partner-ads/:id')
  async updateAd(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Body() body: unknown) {
    const ad = await this.repo.ad(id(rawId));
    if (!ad) throw new NotFoundError('Объявление не найдено');
    if (ad.ownerId !== session.user.id && session.user.accountKind !== 'admin') throw new ForbiddenError('Недостаточно прав');
    return this.repo.updateAd(ad.id, parse(partnerAdInputSchema.partial(), body));
  }
  @Post('partner-ads/:id/contact')
  contact(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Body() body: unknown) {
    const value = parse(z.object({ message: z.string().trim().min(1).max(1000) }), body);
    return this.service.contact(id(rawId), session.user.id, value.message);
  }
  @Get('contact-requests')
  async requests(@CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    const [items, total] = await this.repo.listRequests(session.user.id, page.offset, page.limit);
    return { items, total, ...page };
  }
  @Patch('contact-requests/:id')
  resolve(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Body() body: unknown) {
    const value = parse(z.object({ status: z.enum(['accepted', 'declined']) }), body);
    return this.service.resolveRequest(id(rawId), session, value.status);
  }
}
