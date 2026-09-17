-- Add new nullable columns first
ALTER TABLE "QuestProgress" ADD COLUMN "slot" TEXT;
ALTER TABLE "QuestProgress" ADD COLUMN "statKey" TEXT;
ALTER TABLE "QuestProgress" ADD COLUMN "statAmount" INTEGER;
ALTER TABLE "QuestProgress" ADD COLUMN "requirementsJson" TEXT;
ALTER TABLE "QuestProgress" ADD COLUMN "progressJson" TEXT;

-- Backfill slot from the existing fixed quest types (only two ever existed)
UPDATE "QuestProgress" SET "slot" = 'daily' WHERE "questType" = 'daily_reps';
UPDATE "QuestProgress" SET "slot" = 'weekly' WHERE "questType" = 'weekly_workouts';

-- Make slot required now that every row has a value
ALTER TABLE "QuestProgress" ALTER COLUMN "slot" SET NOT NULL;

-- Replace the old unique constraint (profileId, questType, periodKey) with
-- (profileId, slot, periodKey), since questType now varies per period
-- (randomly picked from a pool) instead of being one of two fixed values.
DROP INDEX "QuestProgress_profileId_questType_periodKey_key";
CREATE UNIQUE INDEX "QuestProgress_profileId_slot_periodKey_key" ON "QuestProgress"("profileId", "slot", "periodKey");
