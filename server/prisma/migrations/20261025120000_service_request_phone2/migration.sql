-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "phone2" TEXT,
ADD COLUMN     "phone2Whatsapp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneWhatsapp" BOOLEAN NOT NULL DEFAULT true;
