-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "sourcingCountry" TEXT NOT NULL DEFAULT 'US',
ADD COLUMN     "sourcingCurrency" TEXT NOT NULL DEFAULT 'USD';
