-- One customer Order can now split into multiple independently-tracked parcels
-- (SupplierOrder), one per supplier. Fresh database, no existing orders to migrate,
-- so the old flat per-Order supplier/tracking fields are dropped outright rather than
-- carried alongside — see SUPPLIER_FULFILLMENT.md.

-- CreateEnum
CREATE TYPE "SupplierKey" AS ENUM ('CJ', 'ALIEXPRESS', 'MANUAL');

-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('AWAITING_MANUAL', 'SUBMITTED', 'SHIPPED', 'ERROR', 'CANCELLED');

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "trackingNumber",
DROP COLUMN "trackingUrl",
DROP COLUMN "cjOrderId",
DROP COLUMN "cjOrderStatus",
DROP COLUMN "aliexpressOrderId",
DROP COLUMN "aliexpressOrderStatus";

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "supplierOrderId" TEXT;

-- CreateTable
CREATE TABLE "SupplierOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storeId" TEXT,
    "supplierKey" "SupplierKey" NOT NULL,
    "supplierName" TEXT,
    "status" "SupplierOrderStatus" NOT NULL DEFAULT 'AWAITING_MANUAL',
    "externalOrderId" TEXT,
    "externalStatus" TEXT,
    "trackingNumber" TEXT,
    "trackingCarrier" TEXT,
    "trackingUrl" TEXT,
    "lastError" TEXT,
    "submittedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierOrder_storeId_status_idx" ON "SupplierOrder"("storeId", "status");

-- CreateIndex
CREATE INDEX "SupplierOrder_orderId_idx" ON "SupplierOrder"("orderId");

-- CreateIndex
CREATE INDEX "SupplierOrder_externalOrderId_idx" ON "SupplierOrder"("externalOrderId");

-- CreateIndex
CREATE INDEX "OrderItem_supplierOrderId_idx" ON "OrderItem"("supplierOrderId");

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
