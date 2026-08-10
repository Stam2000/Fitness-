-- AlterTable
ALTER TABLE "SetLog" ADD COLUMN     "variationName" TEXT;

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "cycleIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "variationChoices" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "ExerciseVariation" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" TEXT NOT NULL,
    "restSeconds" INTEGER NOT NULL,
    "weightHint" TEXT,
    "equipment" TEXT[],
    "notes" TEXT,
    "imageUrl" TEXT,
    "imageTaskId" TEXT,

    CONSTRAINT "ExerciseVariation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ExerciseVariation" ADD CONSTRAINT "ExerciseVariation_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
