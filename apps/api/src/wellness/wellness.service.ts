import { Injectable } from '@nestjs/common';
import { ForbiddenError, NotFoundError } from '../common/domain-error';
import { WellnessRepository } from './wellness.repository';

@Injectable()
export class WellnessService {
  constructor(private readonly repo: WellnessRepository) {}
  async workouts(userId: number, offset: number, limit: number) {
    const [items, total] = await this.repo.workouts(userId, offset, limit);
    return { items, total, offset, limit };
  }
  async foods(userId: number, offset: number, limit: number) {
    const [items, total] = await this.repo.foods(userId, offset, limit);
    return { items, total, offset, limit };
  }
  async deleteWorkout(id: number, userId: number, admin: boolean) {
    const item = await this.repo.workout(id);
    if (!item) throw new NotFoundError('Тренировка не найдена');
    if (item.userId !== userId && !admin) throw new ForbiddenError('Недостаточно прав');
    await this.repo.deleteWorkout(id);
    return { deleted: 1 };
  }
  async deleteFood(id: number, userId: number, admin: boolean) {
    const item = await this.repo.food(id);
    if (!item) throw new NotFoundError('Приём пищи не найден');
    if (item.userId !== userId && !admin) throw new ForbiddenError('Недостаточно прав');
    await this.repo.deleteFood(id);
    return { deleted: 1 };
  }
}
