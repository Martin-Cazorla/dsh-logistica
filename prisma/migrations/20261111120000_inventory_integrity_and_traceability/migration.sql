-- =============================================================================
-- Integridad de inventario y trazabilidad de picking / control
-- =============================================================================

-- 1) Consolidar registros duplicados con lot_number NULL antes de volverlo NOT NULL.
--    En PostgreSQL los NULL no colisionan en un índice UNIQUE, por lo que podían
--    existir varias filas (location_id, product_id, NULL).
WITH dup AS (
  SELECT location_id,
         product_id,
         (ARRAY_AGG(id ORDER BY created_at ASC))[1] AS keep_id,
         SUM(quantity) AS total_qty,
         SUM(reserved) AS total_reserved
  FROM "inventories"
  WHERE lot_number IS NULL
  GROUP BY location_id, product_id
  HAVING COUNT(*) > 1
)
UPDATE "inventories" i
SET quantity = dup.total_qty,
    reserved = dup.total_reserved
FROM dup
WHERE i.id = dup.keep_id;

WITH dup AS (
  SELECT location_id,
         product_id,
         (ARRAY_AGG(id ORDER BY created_at ASC))[1] AS keep_id
  FROM "inventories"
  WHERE lot_number IS NULL
  GROUP BY location_id, product_id
  HAVING COUNT(*) > 1
)
DELETE FROM "inventories" i
USING dup
WHERE i.lot_number IS NULL
  AND i.location_id = dup.location_id
  AND i.product_id = dup.product_id
  AND i.id <> dup.keep_id;

UPDATE "inventories" SET lot_number = 'SIN_LOTE' WHERE lot_number IS NULL;

-- AlterTable
ALTER TABLE "inventories" ALTER COLUMN "lot_number" SET NOT NULL,
ALTER COLUMN "lot_number" SET DEFAULT 'SIN_LOTE';

-- AlterTable (capacidad en m³ con decimales)
ALTER TABLE "locations" ALTER COLUMN "capacity" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "capacity" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "lot_number" VARCHAR(100),
ADD COLUMN     "notes" VARCHAR(255),
ADD COLUMN     "order_id" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "checked_at" TIMESTAMP(3),
ADD COLUMN     "checked_by_id" UUID,
ADD COLUMN     "checking_notes" TEXT,
ADD COLUMN     "picked_at" TIMESTAMP(3),
ADD COLUMN     "picking_started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "checked_qty" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "inventories_product_id_idx" ON "inventories"("product_id");

-- CreateIndex
CREATE INDEX "stock_movements_order_id_idx" ON "stock_movements"("order_id");

-- CreateIndex
CREATE INDEX "stock_movements_type_created_at_idx" ON "stock_movements"("type", "created_at");

-- CreateIndex
CREATE INDEX "orders_picker_id_status_idx" ON "orders"("picker_id", "status");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "order_items_picker_id_idx" ON "order_items"("picker_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_checked_by_id_fkey" FOREIGN KEY ("checked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- 2) Invariantes de negocio a nivel base de datos (última línea de defensa).
--    NOT VALID: se aplican a toda escritura nueva sin bloquear la migración si
--    existen datos históricos inconsistentes. Una vez saneados, ejecutar:
--      ALTER TABLE "inventories" VALIDATE CONSTRAINT "inventories_quantity_non_negative";
--      (ídem para el resto)
-- =============================================================================
ALTER TABLE "inventories"
  ADD CONSTRAINT "inventories_quantity_non_negative" CHECK (quantity >= 0) NOT VALID;

ALTER TABLE "inventories"
  ADD CONSTRAINT "inventories_reserved_non_negative" CHECK (reserved >= 0) NOT VALID;

ALTER TABLE "inventories"
  ADD CONSTRAINT "inventories_reserved_lte_quantity" CHECK (reserved <= quantity) NOT VALID;

ALTER TABLE "locations"
  ADD CONSTRAINT "locations_capacity_non_negative" CHECK (capacity >= 0) NOT VALID;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_positive" CHECK (quantity > 0) NOT VALID;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_bultos_positive" CHECK (bultos > 0) NOT VALID;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_picked_qty_range" CHECK (picked_qty >= 0 AND picked_qty <= bultos) NOT VALID;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_checked_qty_range" CHECK (checked_qty >= 0 AND checked_qty <= picked_qty) NOT VALID;
