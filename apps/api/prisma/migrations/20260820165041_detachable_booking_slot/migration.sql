-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_schedule_id_fkey";

-- AlterTable
ALTER TABLE "bookings" ALTER COLUMN "schedule_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
