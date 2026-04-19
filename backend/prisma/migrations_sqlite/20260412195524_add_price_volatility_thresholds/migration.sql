-- CreateTable
CREATE TABLE "PriceVolatilityThreshold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tcg" TEXT,
    "editionId" TEXT,
    "thresholdPercent" REAL NOT NULL DEFAULT 10.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceVolatilityThreshold_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PriceVolatilityThreshold_tcg_idx" ON "PriceVolatilityThreshold"("tcg");

-- CreateIndex
CREATE INDEX "PriceVolatilityThreshold_editionId_idx" ON "PriceVolatilityThreshold"("editionId");
