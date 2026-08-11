-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('PUSH', 'WHATSAPP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'VIP');

-- CreateTable
CREATE TABLE "public"."Listing" (
    "id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "marketAveragePrice" DOUBLE PRECISION,
    "dealScore" INTEGER NOT NULL,
    "city" TEXT,
    "url" TEXT NOT NULL,
    "rawDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "status" "public"."NotificationStatus" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "fcmDeviceToken" TEXT,
    "subscriptionPlan" "public"."SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expoPushToken" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserFilter" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "city" TEXT,
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "keywords" TEXT[],
    "minDealScore" INTEGER NOT NULL DEFAULT 70,
    "notifyTelegram" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "notifyWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_dealScore_createdAt_idx" ON "public"."Listing"("dealScore" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Listing_dealScore_idx" ON "public"."Listing"("dealScore" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Listing_externalId_key" ON "public"."Listing"("externalId" ASC);

-- CreateIndex
CREATE INDEX "Listing_platform_city_idx" ON "public"."Listing"("platform" ASC, "city" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Listing_platform_externalId_key" ON "public"."Listing"("platform" ASC, "externalId" ASC);

-- CreateIndex
CREATE INDEX "NotificationLog_channel_status_idx" ON "public"."NotificationLog"("channel" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "NotificationLog_listingId_idx" ON "public"."NotificationLog"("listingId" ASC);

-- CreateIndex
CREATE INDEX "NotificationLog_userId_idx" ON "public"."NotificationLog"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "public"."User"("phoneNumber" ASC);

-- CreateIndex
CREATE INDEX "UserFilter_isActive_category_idx" ON "public"."UserFilter"("isActive" ASC, "category" ASC);

-- CreateIndex
CREATE INDEX "UserFilter_userId_idx" ON "public"."UserFilter"("userId" ASC);

-- AddForeignKey
ALTER TABLE "public"."NotificationLog" ADD CONSTRAINT "NotificationLog_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserFilter" ADD CONSTRAINT "UserFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
