DO $$
DECLARE
  default_store_id TEXT;
BEGIN
  SELECT "id"
  INTO default_store_id
  FROM "Store"
  ORDER BY "createdAt" ASC
  LIMIT 1;

  IF default_store_id IS NULL THEN
    RAISE EXCEPTION 'Cannot enforce non-null storeId without at least one Store row';
  END IF;

  UPDATE "Listing" SET "storeId" = default_store_id WHERE "storeId" IS NULL;
  UPDATE "Cart" SET "storeId" = default_store_id WHERE "storeId" IS NULL;
  UPDATE "Order" SET "storeId" = default_store_id WHERE "storeId" IS NULL;

  ALTER TABLE "Listing" ALTER COLUMN "storeId" SET NOT NULL;
  ALTER TABLE "Cart" ALTER COLUMN "storeId" SET NOT NULL;
  ALTER TABLE "Order" ALTER COLUMN "storeId" SET NOT NULL;
END $$;
