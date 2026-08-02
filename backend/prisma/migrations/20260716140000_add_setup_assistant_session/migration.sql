-- CreateTable
CREATE TABLE "SetupAssistantSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetupAssistantSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SetupAssistantSession_storeId_key" ON "SetupAssistantSession"("storeId");

-- AddForeignKey
ALTER TABLE "SetupAssistantSession" ADD CONSTRAINT "SetupAssistantSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
