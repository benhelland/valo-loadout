-- CreateEnum
CREATE TYPE "LinkedAccountStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ERROR', 'CAPTCHA_BLOCKED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('DISCORD_WEBHOOK');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weapons" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" TEXT,
    "displayIconUrl" TEXT,

    CONSTRAINT "weapons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_tiers" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "devName" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "highlightColor" TEXT,
    "displayIconUrl" TEXT,

    CONSTRAINT "content_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "themes" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "displayIconUrl" TEXT,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skins" (
    "id" TEXT NOT NULL,
    "weaponId" TEXT,
    "displayName" TEXT NOT NULL,
    "contentTierId" TEXT,
    "themeId" TEXT,
    "displayIconUrl" TEXT,
    "colorFamily" TEXT,
    "firstSeenInSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skin_levels" (
    "id" TEXT NOT NULL,
    "skinId" TEXT NOT NULL,
    "levelIndex" INTEGER NOT NULL,
    "displayIconUrl" TEXT,
    "videoUrl" TEXT,
    "levelItem" TEXT,

    CONSTRAINT "skin_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skin_chromas" (
    "id" TEXT NOT NULL,
    "skinId" TEXT NOT NULL,
    "displayIconUrl" TEXT,
    "fullRenderUrl" TEXT,
    "swatchUrl" TEXT,
    "colorFamily" TEXT,
    "videoUrl" TEXT,

    CONSTRAINT "skin_chromas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skin_vibe_tags" (
    "skinId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "skin_vibe_tags_pkey" PRIMARY KEY ("skinId","tag")
);

-- CreateTable
CREATE TABLE "buddies" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "displayIconUrl" TEXT,

    CONSTRAINT "buddies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buddy_levels" (
    "id" TEXT NOT NULL,
    "buddyId" TEXT NOT NULL,
    "charmLevel" INTEGER NOT NULL,
    "displayIconUrl" TEXT,

    CONSTRAINT "buddy_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loadouts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isShareable" BOOLEAN NOT NULL DEFAULT false,
    "shareSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loadouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loadout_items" (
    "id" TEXT NOT NULL,
    "loadoutId" TEXT NOT NULL,
    "weaponId" TEXT NOT NULL,
    "skinId" TEXT NOT NULL,
    "levelId" TEXT,
    "chromaId" TEXT,
    "buddyId" TEXT,

    CONSTRAINT "loadout_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skinId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linked_riot_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedSessionToken" TEXT NOT NULL,
    "region" TEXT,
    "status" "LinkedAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "discordWebhookUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "nextPollAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linked_riot_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skin_sighting_stats" (
    "linkedRiotAccountId" TEXT NOT NULL,
    "skinId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "skin_sighting_stats_pkey" PRIMARY KEY ("linkedRiotAccountId","skinId")
);

-- CreateTable
CREATE TABLE "notifications_sent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skinId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_sent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "skins_weaponId_idx" ON "skins"("weaponId");

-- CreateIndex
CREATE INDEX "skins_contentTierId_idx" ON "skins"("contentTierId");

-- CreateIndex
CREATE INDEX "skins_themeId_idx" ON "skins"("themeId");

-- CreateIndex
CREATE INDEX "skin_levels_skinId_idx" ON "skin_levels"("skinId");

-- CreateIndex
CREATE INDEX "skin_chromas_skinId_idx" ON "skin_chromas"("skinId");

-- CreateIndex
CREATE INDEX "skin_vibe_tags_tag_idx" ON "skin_vibe_tags"("tag");

-- CreateIndex
CREATE INDEX "buddy_levels_buddyId_idx" ON "buddy_levels"("buddyId");

-- CreateIndex
CREATE UNIQUE INDEX "loadouts_shareSlug_key" ON "loadouts"("shareSlug");

-- CreateIndex
CREATE INDEX "loadouts_userId_idx" ON "loadouts"("userId");

-- CreateIndex
CREATE INDEX "loadout_items_skinId_idx" ON "loadout_items"("skinId");

-- CreateIndex
CREATE UNIQUE INDEX "loadout_items_loadoutId_weaponId_key" ON "loadout_items"("loadoutId", "weaponId");

-- CreateIndex
CREATE INDEX "wishlist_items_userId_idx" ON "wishlist_items"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_userId_skinId_key" ON "wishlist_items"("userId", "skinId");

-- CreateIndex
CREATE INDEX "linked_riot_accounts_nextPollAt_idx" ON "linked_riot_accounts"("nextPollAt");

-- CreateIndex
CREATE INDEX "linked_riot_accounts_userId_idx" ON "linked_riot_accounts"("userId");

-- CreateIndex
CREATE INDEX "notifications_sent_userId_skinId_sentAt_idx" ON "notifications_sent"("userId", "skinId", "sentAt");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skins" ADD CONSTRAINT "skins_weaponId_fkey" FOREIGN KEY ("weaponId") REFERENCES "weapons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skins" ADD CONSTRAINT "skins_contentTierId_fkey" FOREIGN KEY ("contentTierId") REFERENCES "content_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skins" ADD CONSTRAINT "skins_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_levels" ADD CONSTRAINT "skin_levels_skinId_fkey" FOREIGN KEY ("skinId") REFERENCES "skins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_chromas" ADD CONSTRAINT "skin_chromas_skinId_fkey" FOREIGN KEY ("skinId") REFERENCES "skins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_vibe_tags" ADD CONSTRAINT "skin_vibe_tags_skinId_fkey" FOREIGN KEY ("skinId") REFERENCES "skins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buddy_levels" ADD CONSTRAINT "buddy_levels_buddyId_fkey" FOREIGN KEY ("buddyId") REFERENCES "buddies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loadouts" ADD CONSTRAINT "loadouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loadout_items" ADD CONSTRAINT "loadout_items_loadoutId_fkey" FOREIGN KEY ("loadoutId") REFERENCES "loadouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loadout_items" ADD CONSTRAINT "loadout_items_weaponId_fkey" FOREIGN KEY ("weaponId") REFERENCES "weapons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loadout_items" ADD CONSTRAINT "loadout_items_skinId_fkey" FOREIGN KEY ("skinId") REFERENCES "skins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loadout_items" ADD CONSTRAINT "loadout_items_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "skin_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loadout_items" ADD CONSTRAINT "loadout_items_chromaId_fkey" FOREIGN KEY ("chromaId") REFERENCES "skin_chromas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loadout_items" ADD CONSTRAINT "loadout_items_buddyId_fkey" FOREIGN KEY ("buddyId") REFERENCES "buddies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_skinId_fkey" FOREIGN KEY ("skinId") REFERENCES "skins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_riot_accounts" ADD CONSTRAINT "linked_riot_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_sighting_stats" ADD CONSTRAINT "skin_sighting_stats_linkedRiotAccountId_fkey" FOREIGN KEY ("linkedRiotAccountId") REFERENCES "linked_riot_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skin_sighting_stats" ADD CONSTRAINT "skin_sighting_stats_skinId_fkey" FOREIGN KEY ("skinId") REFERENCES "skins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_sent" ADD CONSTRAINT "notifications_sent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_sent" ADD CONSTRAINT "notifications_sent_skinId_fkey" FOREIGN KEY ("skinId") REFERENCES "skins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
