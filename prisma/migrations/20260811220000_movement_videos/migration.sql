-- Vidéos YouTube de démonstration téléchargées localement, rattachées au nom
-- normalisé du mouvement (partagées entre exercices, variantes et programmes).
CREATE TABLE "MovementVideo" (
    "id" TEXT NOT NULL,
    "movementName" TEXT NOT NULL,
    "movementKey" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT,
    "videoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'downloading',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovementVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MovementVideo_movementKey_idx" ON "MovementVideo"("movementKey");
