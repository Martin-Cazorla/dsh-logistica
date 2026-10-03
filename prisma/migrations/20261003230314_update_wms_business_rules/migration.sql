/*
  Warnings:

  - You are about to drop the column `address` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `order_items` table. All the data in the column will be lost.
  - You are about to drop the column `delivery_address` on the `orders` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[customer_number]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[cuit]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `cuit` to the `customers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customer_number` to the `customers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `legal_name` to the `customers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `bultos` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total_units` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `address_id` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TaxCondition" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'CONSUMIDOR_FINAL');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ARS', 'USD');

-- CreateEnum
CREATE TYPE "PaymentTerm" AS ENUM ('CUENTA_CORRIENTE', 'CONTADO', 'DEPOSITO');

-- DropIndex
DROP INDEX "customers_code_key";

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "address",
DROP COLUMN "code",
ADD COLUMN     "cuit" VARCHAR(20) NOT NULL,
ADD COLUMN     "customer_number" VARCHAR(50) NOT NULL,
ADD COLUMN     "legal_name" VARCHAR(200) NOT NULL,
ADD COLUMN     "tax_condition" "TaxCondition" NOT NULL DEFAULT 'RESPONSABLE_INSCRIPTO',
ADD COLUMN     "transport_id" UUID;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "quantity",
ADD COLUMN     "bultos" INTEGER NOT NULL,
ADD COLUMN     "total_units" INTEGER NOT NULL,
ADD COLUMN     "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "delivery_address",
ADD COLUMN     "address_id" UUID NOT NULL,
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'ARS',
ADD COLUMN     "delivery_date_from" DATE,
ADD COLUMN     "delivery_date_to" DATE,
ADD COLUMN     "payment_term" "PaymentTerm" NOT NULL DEFAULT 'CUENTA_CORRIENTE',
ADD COLUMN     "seller_id" UUID,
ADD COLUMN     "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "total_bultos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transport_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "unit_price" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "units_per_box" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "transports" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "business_hours" VARCHAR(150),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "province" VARCHAR(100) NOT NULL,
    "zip_code" VARCHAR(20) NOT NULL,
    "business_hours" VARCHAR(150),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_customer_number_key" ON "customers"("customer_number");

-- CreateIndex
CREATE UNIQUE INDEX "customers_cuit_key" ON "customers"("cuit");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_transport_id_fkey" FOREIGN KEY ("transport_id") REFERENCES "transports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "customer_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_transport_id_fkey" FOREIGN KEY ("transport_id") REFERENCES "transports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
