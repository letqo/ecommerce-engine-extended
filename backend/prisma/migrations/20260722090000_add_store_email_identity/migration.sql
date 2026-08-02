-- AlterTable
ALTER TABLE "Store" ADD COLUMN "emailFromName" TEXT;
ALTER TABLE "Store" ADD COLUMN "emailFromAddress" TEXT;
ALTER TABLE "Store" ALTER COLUMN "name" SET DEFAULT 'Store';
