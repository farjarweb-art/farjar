-- AlterTable
ALTER TABLE "ServiceDevice" ADD COLUMN     "benefits" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "code" TEXT,
ADD COLUMN     "imagePublicId" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "mechanism" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "scopePriced" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceDeviceLink" ADD COLUMN     "autoInclude" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceReport" ADD COLUMN     "gpsAccuracy" DOUBLE PRECISION,
ADD COLUMN     "gpsAt" TIMESTAMP(3),
ADD COLUMN     "gpsLat" DOUBLE PRECISION,
ADD COLUMN     "gpsLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "ownership" TEXT,
ADD COLUMN     "urgency" "Urgency" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "ServiceZone" ADD COLUMN     "regions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SiteService" ADD COLUMN     "priceEmergency" DECIMAL(10,3),
ADD COLUMN     "priceUrgent" DECIMAL(10,3);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceDevice_code_key" ON "ServiceDevice"("code");

-- AddForeignKey
ALTER TABLE "ServiceDevice" ADD CONSTRAINT "ServiceDevice_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ServiceDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

