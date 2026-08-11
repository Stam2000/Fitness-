-- Progression par blocs : durée de bloc (en cycles) décidée par l'IA,
-- chaînage des programmes (mésocycles) et archivage du bloc remplacé.
ALTER TABLE "Program" ADD COLUMN "blockCycles" INTEGER;
ALTER TABLE "Program" ADD COLUMN "blockNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Program" ADD COLUMN "previousProgramId" TEXT;
ALTER TABLE "Program" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Program_previousProgramId_key" ON "Program"("previousProgramId");

ALTER TABLE "Program" ADD CONSTRAINT "Program_previousProgramId_fkey"
  FOREIGN KEY ("previousProgramId") REFERENCES "Program"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
