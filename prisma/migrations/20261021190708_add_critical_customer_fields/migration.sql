-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "critical_reason" TEXT,
ADD COLUMN     "is_critical" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "customers_is_critical_idx" ON "customers"("is_critical");
