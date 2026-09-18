import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { pageQuerySchema } from '@sporthub/domain';
import { z } from 'zod';
import { CurrentUser } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { ValidationError } from '../common/domain-error';
import { PassesRepository } from './passes.repository';
import { PassesService } from './passes.service';

const parse = <T>(schema: z.ZodType<T>, raw: unknown): T => {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError('Некорректные данные');
  return result.data;
};
const id = (raw: string) => parse(z.coerce.number().int().positive(), raw);
const planSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  price: z.number().int().nonnegative(),
  durationDays: z.number().int().positive().max(3650),
  visitLimit: z.number().int().positive().optional(),
});

@Controller('passes')
export class PassesController {
  constructor(private readonly service: PassesService, private readonly repo: PassesRepository) {}
  @Get('plans')
  plans(@CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    return this.service.plans(session.user.id, page.offset, page.limit);
  }
  @Post('plans')
  create(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.repo.createPlan(session.user.id, parse(planSchema, body));
  }
  @Patch('plans/:id')
  update(@Param('id') rawId: string, @CurrentUser() session: SessionContext, @Body() body: unknown) {
    const schema = planSchema.partial().extend({ status: z.enum(['draft', 'published', 'archived']).optional() });
    return this.service.updatePlan(id(rawId), session, parse(schema, body));
  }
  @Post('plans/:id/subscribe')
  subscribe(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.service.subscribe(session.user.id, id(rawId));
  }
  @Get('subscriptions')
  subscriptions(@CurrentUser() session: SessionContext) { return this.repo.subscriptions(session.user.id); }
  @Post('subscriptions/:id/cancel')
  cancel(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.service.cancel(id(rawId), session);
  }
}
