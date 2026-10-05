-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "picker_id" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "total_weight_kg" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_picker_id_fkey" FOREIGN KEY ("picker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
