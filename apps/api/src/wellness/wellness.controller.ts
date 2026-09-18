import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { nutritionTargetSchema, pageQuerySchema, workoutInputSchema } from '@sporthub/domain';
import { z } from 'zod';
import { CurrentUser } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { ValidationError } from '../common/domain-error';
import { WellnessRepository } from './wellness.repository';
import { WellnessService } from './wellness.service';

const parse = <T>(schema: z.ZodType<T>, raw: unknown): T => {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError('Некорректные данные');
  return result.data;
};
const id = (raw: string) => parse(z.coerce.number().int().positive(), raw);
const foodSchema = z.object({
  eatenAt: z.coerce.date(),
  name: z.string().trim().min(1).max(200),
  calories: z.number().int().nonnegative().max(20000),
  proteinGrams: z.number().nonnegative().optional(),
  fatGrams: z.number().nonnegative().optional(),
  carbsGrams: z.number().nonnegative().optional(),
});

@Controller('wellness')
export class WellnessController {
  constructor(private readonly service: WellnessService, private readonly repo: WellnessRepository) {}
  @Get('workouts')
  workouts(@CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    return this.service.workouts(session.user.id, page.offset, page.limit);
  }
  @Post('workouts')
  createWorkout(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.repo.createWorkout(session.user.id, parse(workoutInputSchema, body));
  }
  @Delete('workouts/:id')
  deleteWorkout(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.service.deleteWorkout(id(rawId), session.user.id, session.user.accountKind === 'admin');
  }
  @Get('food')
  foods(@CurrentUser() session: SessionContext, @Query() query: unknown) {
    const page = parse(pageQuerySchema, query);
    return this.service.foods(session.user.id, page.offset, page.limit);
  }
  @Post('food')
  createFood(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.repo.createFood(session.user.id, parse(foodSchema, body));
  }
  @Delete('food/:id')
  deleteFood(@Param('id') rawId: string, @CurrentUser() session: SessionContext) {
    return this.service.deleteFood(id(rawId), session.user.id, session.user.accountKind === 'admin');
  }
  @Get('nutrition-target')
  target(@CurrentUser() session: SessionContext) { return this.repo.target(session.user.id); }
  @Put('nutrition-target')
  setTarget(@CurrentUser() session: SessionContext, @Body() body: unknown) {
    return this.repo.setTarget(session.user.id, parse(nutritionTargetSchema, body));
  }
}
