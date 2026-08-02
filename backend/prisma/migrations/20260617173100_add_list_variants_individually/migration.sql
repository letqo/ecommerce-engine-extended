/*
  Warnings:

  - You are about to drop the column `cjApiKey` on the `Store` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "listVariantsIndividually" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Store" DROP COLUMN "cjApiKey";
