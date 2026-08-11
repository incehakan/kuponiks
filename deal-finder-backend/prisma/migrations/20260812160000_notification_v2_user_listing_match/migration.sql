-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "UserFilter" ADD COLUMN "name" TEXT;

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN "reason" TEXT;

-- CreateTable
CREATE TABLE "UserListingMatch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "filterId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "dealScore" INTEGER NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserListingMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserListingMatch_userId_filterId_listingId_key" ON "UserListingMatch"("userId", "filterId", "listingId");

-- CreateIndex
CREATE INDEX "UserListingMatch_userId_matchedAt_idx" ON "UserListingMatch"("userId", "matchedAt");

-- CreateIndex
CREATE INDEX "UserListingMatch_userId_listingId_idx" ON "UserListingMatch"("userId", "listingId");

-- CreateIndex
CREATE INDEX "UserListingMatch_listingId_idx" ON "UserListingMatch"("listingId");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_listingId_channel_status_idx" ON "NotificationLog"("userId", "listingId", "channel", "status");

-- AddForeignKey
ALTER TABLE "UserListingMatch" ADD CONSTRAINT "UserListingMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserListingMatch" ADD CONSTRAINT "UserListingMatch_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "UserFilter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserListingMatch" ADD CONSTRAINT "UserListingMatch_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
