-- CreateEnum
CREATE TYPE "ComplianceProfile" AS ENUM ('NONE', 'COSMETICS', 'ELECTRONICS', 'TOYS_CHILDREN', 'FOOD_CONTACT', 'TEXTILE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SupplierKey" ADD VALUE 'PRINTFUL';
ALTER TYPE "SupplierKey" ADD VALUE 'GELATO';
ALTER TYPE "SupplierKey" ADD VALUE 'BIGBUY';
ALTER TYPE "SupplierKey" ADD VALUE 'WOO_BRIDGE';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "complianceProfile" "ComplianceProfile" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "complianceData" JSONB,
ADD COLUMN     "complianceProfile" "ComplianceProfile",
ADD COLUMN     "supplierKey" "SupplierKey";

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "supplierVariantRef" TEXT;

-- CreateTable
CREATE TABLE "StoreSupplier" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplierKey" "SupplierKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreSupplier_storeId_enabled_idx" ON "StoreSupplier"("storeId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSupplier_storeId_supplierKey_key" ON "StoreSupplier"("storeId", "supplierKey");

-- AddForeignKey
ALTER TABLE "StoreSupplier" ADD CONSTRAINT "StoreSupplier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

