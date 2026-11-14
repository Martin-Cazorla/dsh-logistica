-- AlterTable
ALTER TABLE "customer_addresses" ADD COLUMN     "alias" VARCHAR(100),
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;
