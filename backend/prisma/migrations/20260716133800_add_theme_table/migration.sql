-- CreateTable
-- This table was created directly on the original database at some point outside the
-- migration history (never captured in a migration file), so it silently worked there but
-- was missing when deploying to a genuinely fresh database. Backfilling it here, positioned
-- just before the migration that first depends on it (20260716133817_add_store_theme_translations).
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "vars" JSONB NOT NULL,
    "css" TEXT NOT NULL DEFAULT '',
    "sections" JSONB,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Theme_storeId_idx" ON "Theme"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_storeId_slug_key" ON "Theme"("storeId", "slug");

-- AddForeignKey
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
