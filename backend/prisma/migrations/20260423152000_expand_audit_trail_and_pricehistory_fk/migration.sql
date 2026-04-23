ALTER TABLE "AuditTrail"
  ADD COLUMN IF NOT EXISTS "operation" TEXT,
  ADD COLUMN IF NOT EXISTS "entityType" TEXT,
  ADD COLUMN IF NOT EXISTS "oldValue" JSONB,
  ADD COLUMN IF NOT EXISTS "newValue" JSONB,
  ADD COLUMN IF NOT EXISTS "diff" JSONB;

CREATE INDEX IF NOT EXISTS "AuditTrail_operation_idx" ON "AuditTrail"("operation");
CREATE INDEX IF NOT EXISTS "AuditTrail_entityType_entityId_idx" ON "AuditTrail"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "PriceHistory_changedBy_idx" ON "PriceHistory"("changedBy");

UPDATE "PriceHistory" p
SET "changedBy" = NULL
WHERE p."changedBy" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "AdminUser" a
    WHERE a."id" = p."changedBy"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PriceHistory_changedBy_fkey'
  ) THEN
    ALTER TABLE "PriceHistory"
      ADD CONSTRAINT "PriceHistory_changedBy_fkey"
      FOREIGN KEY ("changedBy")
      REFERENCES "AdminUser"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;
