-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ApiKeyRotationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apiKeyId" TEXT NOT NULL,
    "oldKeyHash" TEXT NOT NULL,
    "newKeyHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "rotatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedBy" TEXT,
    CONSTRAINT "ApiKeyRotationLog_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiKeyRotationLog_rotatedBy_fkey" FOREIGN KEY ("rotatedBy") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

-- CreateTable
CREATE TABLE "DeadLetterQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhookJobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    CONSTRAINT "DeadLetterQueue_webhookJobId_fkey" FOREIGN KEY ("webhookJobId") REFERENCES "WebhookJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeadLetterQueue_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_name_keyType_key" ON "ApiKey"("name", "keyType");

-- CreateIndex
CREATE INDEX "ApiKey_keyType_isActive_idx" ON "ApiKey"("keyType", "isActive");

-- CreateIndex
CREATE INDEX "ApiKeyRotationLog_apiKeyId_idx" ON "ApiKeyRotationLog"("apiKeyId");

-- CreateIndex
CREATE INDEX "ApiKeyRotationLog_rotatedBy_idx" ON "ApiKeyRotationLog"("rotatedBy");

-- CreateIndex
CREATE INDEX "WebhookJob_provider_status_idx" ON "WebhookJob"("provider", "status");

-- CreateIndex
CREATE INDEX "WebhookJob_status_nextRetryAt_idx" ON "WebhookJob"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeadLetterQueue_webhookJobId_key" ON "DeadLetterQueue"("webhookJobId");

-- CreateIndex
CREATE INDEX "DeadLetterQueue_provider_idx" ON "DeadLetterQueue"("provider");

-- CreateIndex
CREATE INDEX "DeadLetterQueue_resolvedBy_idx" ON "DeadLetterQueue"("resolvedBy");
