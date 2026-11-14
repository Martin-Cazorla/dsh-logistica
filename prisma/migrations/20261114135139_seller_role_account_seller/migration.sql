-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SELLER';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "account_seller_id" UUID;

-- CreateIndex
CREATE INDEX "customers_account_seller_id_idx" ON "customers"("account_seller_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_account_seller_id_fkey" FOREIGN KEY ("account_seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
