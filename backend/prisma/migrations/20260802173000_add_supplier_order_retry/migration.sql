-- AlterTable
ALTER TABLE "SupplierOrder" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "failureNotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SupplierOrder_status_nextRetryAt_idx" ON "SupplierOrder"("status", "nextRetryAt");
