-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "videoUrl" TEXT,
ADD COLUMN     "videoTaskId" TEXT,
ADD COLUMN     "videoPrompt" TEXT;

-- AlterTable
ALTER TABLE "ExerciseVariation" ADD COLUMN     "videoUrl" TEXT,
ADD COLUMN     "videoTaskId" TEXT,
ADD COLUMN     "videoPrompt" TEXT;
