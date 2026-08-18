// Контекст слота: сам слот плюс всё, что к нему привязано — услуга, клуб,
// тренер и клуб, в котором тренер ведёт занятие.
//
// Это сервис, а не метод репозитория: он собирает данные пяти доменов сразу.
// Репозиторий обязан отвечать за одну коллекцию, иначе в фазе базы такой метод
// не превратится в обычный запрос.

import { Inject, Injectable } from "@nestjs/common";
import type { Club, Offering, Schedule, Trainer } from "@sporthub/types";

import type {
  OfferingsRepository,
  TrainerClubLinksRepository,
} from "../repositories/catalog.repository";
import {
  OFFERINGS_REPOSITORY,
  TRAINER_CLUB_LINKS_REPOSITORY,
} from "../repositories/catalog.repository";
import type {
  ClubsRepository,
  ScheduleRepository,
  TrainersRepository,
} from "../repositories/entities.repository";
import {
  CLUBS_REPOSITORY,
  SCHEDULE_REPOSITORY,
  TRAINERS_REPOSITORY,
} from "../repositories/entities.repository";

export type SlotContext = {
  affiliatedClub: Club | null;
  club: Club | null;
  offering: Offering | null;
  schedule: Schedule;
  trainer: Trainer | null;
};

@Injectable()
export class SlotContextService {
  constructor(
    @Inject(SCHEDULE_REPOSITORY) private readonly schedule: ScheduleRepository,
    @Inject(OFFERINGS_REPOSITORY)
    private readonly offerings: OfferingsRepository,
    @Inject(CLUBS_REPOSITORY) private readonly clubs: ClubsRepository,
    @Inject(TRAINERS_REPOSITORY) private readonly trainers: TrainersRepository,
    @Inject(TRAINER_CLUB_LINKS_REPOSITORY)
    private readonly links: TrainerClubLinksRepository,
  ) {}

  async getContext(scheduleId: number): Promise<SlotContext | null> {
    const slot = await this.schedule.findById(scheduleId);

    if (!slot) {
      return null;
    }

    const offering =
      slot.offeringId !== undefined
        ? await this.offerings.findById(slot.offeringId)
        : null;

    const club =
      slot.clubId !== undefined
        ? await this.clubs.findById(slot.clubId)
        : offering?.ownerType === "club"
          ? await this.clubs.findById(offering.ownerId)
          : null;

    const trainer =
      slot.trainerId !== undefined
        ? await this.trainers.findById(slot.trainerId)
        : offering?.ownerType === "trainer"
          ? await this.trainers.findById(offering.ownerId)
          : null;

    // Клуб, где тренер ведёт занятие, выводится через подтверждённую связь.
    let affiliatedClub: Club | null = null;

    if (offering?.ownerType === "club") {
      affiliatedClub = club;
    } else if (
      offering?.ownerType === "trainer" &&
      offering.trainerClubLinkId !== undefined
    ) {
      const link = await this.links.findById(offering.trainerClubLinkId);
      affiliatedClub =
        link && link.status === "confirmed"
          ? await this.clubs.findById(link.clubId)
          : null;
    }

    return { affiliatedClub, club, offering, schedule: slot, trainer };
  }

  /** Кто отвечает за клуб. Нужен для адресации уведомлений провайдеру. */
  async findClubManager(clubId: number | undefined): Promise<number | null> {
    if (clubId === undefined) return null;

    return (await this.clubs.findById(clubId))?.managedByUserId ?? null;
  }

  /** Кто отвечает за тренера. */
  async findTrainerManager(
    trainerId: number | undefined,
  ): Promise<number | null> {
    if (trainerId === undefined) return null;

    return (await this.trainers.findById(trainerId))?.managedByUserId ?? null;
  }
}
