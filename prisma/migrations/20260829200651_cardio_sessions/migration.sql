-- CreateTable
CREATE TABLE "CardioSession" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'treadmill',
    "speedKmh" DOUBLE PRECISION NOT NULL,
    "inclinePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minutes" DOUBLE PRECISION NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "calories" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CardioSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardioSession_userId_performedAt_idx" ON "CardioSession"("userId", "performedAt");

-- AddForeignKey
ALTER TABLE "CardioSession" ADD CONSTRAINT "CardioSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
