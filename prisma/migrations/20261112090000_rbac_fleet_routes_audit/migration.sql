-- =============================================================================
-- RBAC (Peón), picking multiusuario con ruta unidireccional, control de stock
-- con aprobación, flota de camiones, hojas de ruta con doble control y
-- auditoría global inmutable.
-- =============================================================================

-- CreateEnum
CREATE TYPE "PickTaskStatus" AS ENUM ('PENDING', 'PICKED', 'SHORT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockRequestType" AS ENUM ('COUNT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RouteStopStatus" AS ENUM ('PENDING', 'LOADED', 'DELIVERED', 'PARTIAL', 'FAILED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'HELPER';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'RETURNED';

-- AlterEnum
ALTER TYPE "RouteStatus" ADD VALUE 'LOADING';

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "route_order" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "discount_amount" DECIMAL(14,2),
ADD COLUMN     "dispatched_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "subtotal_amount" DECIMAL(14,2),
ADD COLUMN     "tax_amount" DECIMAL(14,2),
ADD COLUMN     "total_volume_m3" DECIMAL(10,3) NOT NULL DEFAULT 0.000;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "discount_pct" DECIMAL(5,2),
ADD COLUMN     "line_total" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "routes" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "helper_id" UUID,
ADD COLUMN     "loading_started_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "total_bultos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_volume_m3" DECIMAL(10,3) NOT NULL DEFAULT 0.000,
ADD COLUMN     "total_weight_kg" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "truck_id" UUID;

-- CreateTable
CREATE TABLE "order_picker_assignments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_picker_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pick_tasks" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "inventory_id" UUID,
    "lot_number" VARCHAR(100) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "picked_qty" INTEGER NOT NULL DEFAULT 0,
    "status" "PickTaskStatus" NOT NULL DEFAULT 'PENDING',
    "picked_by_id" UUID,
    "picked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pick_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment_requests" (
    "id" UUID NOT NULL,
    "inventory_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_number" VARCHAR(100) NOT NULL,
    "type" "StockRequestType" NOT NULL,
    "system_qty" INTEGER NOT NULL,
    "counted_qty" INTEGER NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "status" "StockRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trucks" (
    "id" UUID NOT NULL,
    "brand" VARCHAR(80) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "plate" VARCHAR(20) NOT NULL,
    "capacity_m3" DECIMAL(10,3) NOT NULL,
    "max_load_kg" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trucks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "RouteStopStatus" NOT NULL DEFAULT 'PENDING',
    "expected_bultos" INTEGER NOT NULL,
    "loaded_bultos" INTEGER,
    "loaded_by_id" UUID,
    "loaded_at" TIMESTAMP(3),
    "delivered_bultos" INTEGER,
    "delivered_by_id" UUID,
    "delivered_at" TIMESTAMP(3),
    "recipient_name" VARCHAR(150),
    "notes" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "user_role" "UserRole",
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(100) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_picker_assignments_user_id_idx" ON "order_picker_assignments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_picker_assignments_order_id_user_id_key" ON "order_picker_assignments"("order_id", "user_id");

-- CreateIndex
CREATE INDEX "pick_tasks_order_id_status_idx" ON "pick_tasks"("order_id", "status");

-- CreateIndex
CREATE INDEX "pick_tasks_inventory_id_idx" ON "pick_tasks"("inventory_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_requests_status_created_at_idx" ON "stock_adjustment_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trucks_plate_key" ON "trucks"("plate");

-- CreateIndex
CREATE INDEX "route_stops_order_id_idx" ON "route_stops"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_route_id_order_id_key" ON "route_stops"("route_id", "order_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "orders_route_id_idx" ON "orders"("route_id");

-- CreateIndex
CREATE INDEX "routes_driver_id_status_idx" ON "routes"("driver_id", "status");

-- CreateIndex
CREATE INDEX "routes_helper_id_status_idx" ON "routes"("helper_id", "status");

-- CreateIndex
CREATE INDEX "routes_status_scheduled_date_idx" ON "routes"("status", "scheduled_date");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_picker_assignments" ADD CONSTRAINT "order_picker_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_picker_assignments" ADD CONSTRAINT "order_picker_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_picker_assignments" ADD CONSTRAINT "order_picker_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_picked_by_id_fkey" FOREIGN KEY ("picked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_helper_id_fkey" FOREIGN KEY ("helper_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_loaded_by_id_fkey" FOREIGN KEY ("loaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_delivered_by_id_fkey" FOREIGN KEY ("delivered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Invariantes de las nuevas tablas
-- =============================================================================
ALTER TABLE "pick_tasks"
  ADD CONSTRAINT "pick_tasks_quantity_positive" CHECK (quantity > 0),
  ADD CONSTRAINT "pick_tasks_picked_qty_range" CHECK (picked_qty >= 0 AND picked_qty <= quantity);

ALTER TABLE "trucks"
  ADD CONSTRAINT "trucks_capacity_positive" CHECK (capacity_m3 > 0 AND max_load_kg > 0);

ALTER TABLE "route_stops"
  ADD CONSTRAINT "route_stops_bultos_non_negative" CHECK (
    expected_bultos >= 0
    AND (loaded_bultos IS NULL OR loaded_bultos >= 0)
    AND (delivered_bultos IS NULL OR delivered_bultos >= 0)
  );

ALTER TABLE "stock_adjustment_requests"
  ADD CONSTRAINT "stock_requests_qty_non_negative" CHECK (system_qty >= 0 AND counted_qty >= 0);

-- =============================================================================
-- Backfill de datos existentes
-- =============================================================================

-- Volumen de pedidos existentes
UPDATE "orders" o
SET total_volume_m3 = COALESCE(sub.vol, 0)
FROM (
  SELECT oi.order_id, SUM(oi.bultos * p.volume_m3) AS vol
  FROM "order_items" oi
  JOIN "products" p ON p.id = oi.product_id
  GROUP BY oi.order_id
) sub
WHERE sub.order_id = o.id;

-- Picker principal existente -> asignación multiusuario
INSERT INTO "order_picker_assignments" (id, order_id, user_id, assigned_by_id, assigned_at)
SELECT gen_random_uuid(), o.id, o.picker_id, o.picker_id, COALESCE(o.picking_started_at, o.updated_at)
FROM "orders" o
WHERE o.picker_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Hojas de ruta existentes -> paradas
INSERT INTO "route_stops" (id, route_id, order_id, sequence, status, expected_bultos, created_at, updated_at)
SELECT gen_random_uuid(),
       o.route_id,
       o.id,
       ROW_NUMBER() OVER (PARTITION BY o.route_id ORDER BY o.created_at),
       CASE WHEN o.status = 'DELIVERED' THEN 'DELIVERED'::"RouteStopStatus" ELSE 'PENDING'::"RouteStopStatus" END,
       o.total_bultos,
       NOW(),
       NOW()
FROM "orders" o
WHERE o.route_id IS NOT NULL;

UPDATE "routes" r
SET total_bultos = sub.bultos,
    total_weight_kg = sub.kg,
    total_volume_m3 = sub.m3
FROM (
  SELECT route_id, SUM(total_bultos) AS bultos, SUM(total_weight_kg) AS kg, SUM(total_volume_m3) AS m3
  FROM "orders"
  WHERE route_id IS NOT NULL
  GROUP BY route_id
) sub
WHERE sub.route_id = r.id;

-- =============================================================================
-- Inmutabilidad del historial: audit_logs y stock_movements son append-only.
-- Cualquier UPDATE o DELETE (incluso desde psql) es rechazado por la BD.
-- =============================================================================
CREATE OR REPLACE FUNCTION wms_prevent_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es un registro histórico inmutable (operación % rechazada).', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION wms_prevent_history_mutation();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION wms_prevent_history_mutation();

CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION wms_prevent_history_mutation();

CREATE TRIGGER stock_movements_no_truncate
  BEFORE TRUNCATE ON "stock_movements"
  FOR EACH STATEMENT EXECUTE FUNCTION wms_prevent_history_mutation();
