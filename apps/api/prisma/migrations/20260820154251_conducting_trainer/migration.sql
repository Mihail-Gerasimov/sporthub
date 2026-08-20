-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "conducted_by_trainer_id" INTEGER;

-- AlterTable
ALTER TABLE "schedule" ADD COLUMN     "conducted_by_trainer_id" INTEGER;

-- CreateIndex
CREATE INDEX "bookings_conducted_by_trainer_id_idx" ON "bookings"("conducted_by_trainer_id");

-- CreateIndex
CREATE INDEX "schedule_conducted_by_trainer_id_idx" ON "schedule"("conducted_by_trainer_id");

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_conducted_by_trainer_id_fkey" FOREIGN KEY ("conducted_by_trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_conducted_by_trainer_id_fkey" FOREIGN KEY ("conducted_by_trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
