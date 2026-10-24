-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "adjustedAt" TIMESTAMP(3),
ADD COLUMN     "adjustedByName" TEXT,
ADD COLUMN     "adjustmentNote" TEXT,
ADD COLUMN     "finalTotal" DECIMAL(10,3),
ADD COLUMN     "manualDiscount" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "onsiteDevices" JSONB NOT NULL DEFAULT '[]';

