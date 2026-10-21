-- CreateEnum
CREATE TYPE "InboundStatus" AS ENUM ('PENDIENTE', 'RECIBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('DISTRIBUTOR', 'RETAILER', 'DIRECT_CONSUMER', 'LOGISTICS_PARTNER');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "contact_person" VARCHAR(150),
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "logistics_fee" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "type" "CustomerType" NOT NULL DEFAULT 'RETAILER';

-- CreateTable
CREATE TABLE "combo_components" (
    "id" UUID NOT NULL,
    "parent_product_id" UUID NOT NULL,
    "child_product_id" UUID NOT NULL,
    "quantity_per_combo" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "combo_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_containers" (
    "id" UUID NOT NULL,
    "container_number" VARCHAR(100) NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "InboundStatus" NOT NULL DEFAULT 'PENDIENTE',
    "arrival_date" TIMESTAMP(3),
    "discharge_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_container_items" (
    "id" UUID NOT NULL,
    "container_id" UUID NOT NULL,
    "product_id" UUID,
    "location_id" UUID,
    "sku" VARCHAR(100) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "quantity_bultos" INTEGER NOT NULL DEFAULT 0,
    "units_per_box" INTEGER NOT NULL DEFAULT 1,
    "total_units" INTEGER NOT NULL DEFAULT 0,
    "weight_per_bulto_kg" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "volume_per_bulto_m3" DECIMAL(10,4) NOT NULL DEFAULT 0.00,
    "sample_units" INTEGER NOT NULL DEFAULT 0,
    "image_url" VARCHAR(255),
    "notes" TEXT,
    "raw_components" JSONB,
    "is_controlled" BOOLEAN NOT NULL DEFAULT false,
    "controlled_by_id" UUID,
    "controlled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_container_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "combo_components_parent_product_id_child_product_id_key" ON "combo_components"("parent_product_id", "child_product_id");

-- CreateIndex
CREATE INDEX "customers_cuit_idx" ON "customers"("cuit");

-- CreateIndex
CREATE INDEX "customers_customer_number_idx" ON "customers"("customer_number");

-- AddForeignKey
ALTER TABLE "combo_components" ADD CONSTRAINT "combo_components_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_components" ADD CONSTRAINT "combo_components_child_product_id_fkey" FOREIGN KEY ("child_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_containers" ADD CONSTRAINT "inbound_containers_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_container_items" ADD CONSTRAINT "inbound_container_items_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "inbound_containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_container_items" ADD CONSTRAINT "inbound_container_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_container_items" ADD CONSTRAINT "inbound_container_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_container_items" ADD CONSTRAINT "inbound_container_items_controlled_by_id_fkey" FOREIGN KEY ("controlled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
