ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'MANAGER';

CREATE TABLE IF NOT EXISTS "RolePermission" (
  "id" TEXT NOT NULL,
  "role" "AdminRole" NOT NULL,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_role_action_resource_key"
  ON "RolePermission"("role", "action", "resource");

CREATE INDEX IF NOT EXISTS "RolePermission_role_idx" ON "RolePermission"("role");
CREATE INDEX IF NOT EXISTS "RolePermission_resource_idx" ON "RolePermission"("resource");
