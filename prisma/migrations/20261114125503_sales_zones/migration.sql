-- AlterTable
ALTER TABLE "customer_addresses" ADD COLUMN     "zone_id" UUID;

-- CreateTable
CREATE TABLE "sales_zones" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "province" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_localities" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "province" VARCHAR(100) NOT NULL,
    "locality" VARCHAR(150) NOT NULL,
    "label" VARCHAR(150),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zone_localities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_zones_province_name_key" ON "sales_zones"("province", "name");

-- CreateIndex
CREATE INDEX "zone_localities_zone_id_idx" ON "zone_localities"("zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "zone_localities_province_locality_key" ON "zone_localities"("province", "locality");

-- CreateIndex
CREATE INDEX "customer_addresses_zone_id_idx" ON "customer_addresses"("zone_id");

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "sales_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_localities" ADD CONSTRAINT "zone_localities_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "sales_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
