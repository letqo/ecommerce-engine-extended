-- CreateTable
CREATE TABLE "StoreTranslation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "aboutUs" TEXT,
    "shippingPolicy" TEXT,
    "returnPolicy" TEXT,
    "privacyPolicy" TEXT,
    "termsOfService" TEXT,
    "faqContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeTranslation" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "strings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThemeTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreTranslation_storeId_locale_key" ON "StoreTranslation"("storeId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeTranslation_themeId_locale_key" ON "ThemeTranslation"("themeId", "locale");

-- AddForeignKey
ALTER TABLE "StoreTranslation" ADD CONSTRAINT "StoreTranslation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeTranslation" ADD CONSTRAINT "ThemeTranslation_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
