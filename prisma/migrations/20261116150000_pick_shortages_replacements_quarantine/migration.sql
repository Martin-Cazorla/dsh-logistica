-- CreateEnum
CREATE TYPE "PickShortReason" AS ENUM ('DAMAGED', 'NOT_FOUND', 'OTHER');

-- AlterTable
ALTER TABLE "pick_tasks" ADD COLUMN     "assigned_to_id" UUID,
ADD COLUMN     "notes" VARCHAR(255),
ADD COLUMN     "replaces_task_id" UUID,
ADD COLUMN     "short_reason" "PickShortReason";

-- AlterTable
ALTER TABLE "stock_adjustment_requests" ADD COLUMN     "held_qty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pick_task_id" UUID;

-- CreateIndex
CREATE INDEX "pick_tasks_replaces_task_id_idx" ON "pick_tasks"("replaces_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustment_requests_pick_task_id_key" ON "stock_adjustment_requests"("pick_task_id");

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pick_tasks" ADD CONSTRAINT "pick_tasks_replaces_task_id_fkey" FOREIGN KEY ("replaces_task_id") REFERENCES "pick_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_requests" ADD CONSTRAINT "stock_adjustment_requests_pick_task_id_fkey" FOREIGN KEY ("pick_task_id") REFERENCES "pick_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

