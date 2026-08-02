-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'AUTO_APPROVED', 'NEEDS_REVIEW', 'APPROVED', 'DENIED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "shippedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DamageClaim" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photos" TEXT[],
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,
    "aiAssessment" TEXT,
    "aiConfident" BOOLEAN,
    "refundId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DamageClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DamageClaim_orderId_idx" ON "DamageClaim"("orderId");

-- CreateIndex
CREATE INDEX "DamageClaim_status_idx" ON "DamageClaim"("status");

-- AddForeignKey
ALTER TABLE "DamageClaim" ADD CONSTRAINT "DamageClaim_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
