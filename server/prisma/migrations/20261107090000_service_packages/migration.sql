-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('SERVICE', 'PACKAGE', 'ADDON');

-- AlterTable
ALTER TABLE "SiteService" ADD COLUMN     "icon" TEXT,
ADD COLUMN     "imagePublicId" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "includesEn" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kind" "ServiceKind" NOT NULL DEFAULT 'SERVICE',
ADD COLUMN     "nameEn" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "summaryEn" TEXT NOT NULL DEFAULT '';

