/*
  Warnings:

  - Added the required column `family` to the `Exercise` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "agilityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "enduranceWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "family" TEXT,
ADD COLUMN     "progressionOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "strengthWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "vitalityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill existing rows with a temporary family (real values set by seed script after)
UPDATE "Exercise" SET "family" = lower("name") WHERE "family" IS NULL;

ALTER TABLE "Exercise" ALTER COLUMN "family" SET NOT NULL;

-- CreateTable
CREATE TABLE "PersonalRecord" (
    "id" SERIAL NOT NULL,
    "profileId" TEXT NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "maxReps" INTEGER NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterStats" (
    "id" SERIAL NOT NULL,
    "profileId" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endurance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vitality" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "agility" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discipline" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "CharacterStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalRecord_profileId_exerciseId_key" ON "PersonalRecord"("profileId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterStats_profileId_key" ON "CharacterStats"("profileId");

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterStats" ADD CONSTRAINT "CharacterStats_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
