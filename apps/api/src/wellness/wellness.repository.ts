import { Injectable } from '@nestjs/common';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';

@Injectable()
export class WellnessRepository {
  constructor(private readonly prisma: PrismaTransactionRunner) {}
  workouts(userId: number, offset: number, limit: number) {
    const where = { userId };
    return Promise.all([
      this.prisma.client.workoutEntry.findMany({ where, include: { exercises: true }, orderBy: { occurredAt: 'desc' }, skip: offset, take: limit }),
      this.prisma.client.workoutEntry.count({ where }),
    ]);
  }
  workout(id: number) { return this.prisma.client.workoutEntry.findUnique({ where: { id } }); }
  createWorkout(userId: number, data: { occurredAt: Date; title: string; notes?: string; durationMinutes?: number; exercises: object[] }) {
    const { exercises, ...entry } = data;
    return this.prisma.client.workoutEntry.create({ data: { ...entry, userId, exercises: { create: exercises as never } }, include: { exercises: true } });
  }
  deleteWorkout(id: number) { return this.prisma.client.workoutEntry.delete({ where: { id } }); }
  foods(userId: number, offset: number, limit: number) {
    const where = { userId };
    return Promise.all([
      this.prisma.client.foodEntry.findMany({ where, orderBy: { eatenAt: 'desc' }, skip: offset, take: limit }),
      this.prisma.client.foodEntry.count({ where }),
    ]);
  }
  createFood(userId: number, data: object) { return this.prisma.client.foodEntry.create({ data: { userId, ...data } as never }); }
  food(id: number) { return this.prisma.client.foodEntry.findUnique({ where: { id } }); }
  deleteFood(id: number) { return this.prisma.client.foodEntry.delete({ where: { id } }); }
  target(userId: number) { return this.prisma.client.nutritionTarget.findUnique({ where: { userId } }); }
  setTarget(userId: number, data: object) { return this.prisma.client.nutritionTarget.upsert({ where: { userId }, create: { userId, ...data } as never, update: data as never }); }
}
