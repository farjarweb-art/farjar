-- CreateEnum
CREATE TYPE "ServiceAudience" AS ENUM ('HOME', 'BUSINESS');

-- CreateEnum
CREATE TYPE "ServiceRequestType" AS ENUM ('INSPECTION', 'INSPECTION_REPORT', 'DIAGNOSIS', 'REPAIR_QUOTE', 'REPAIR', 'PREVENTIVE', 'CONTRACT');

-- CreateEnum
CREATE TYPE "PriceTier" AS ENUM ('INSIDE_AMMAN', 'OUTSIDE_AMMAN');

-- CreateEnum
CREATE TYPE "VisitFeePolicy" AS ENUM ('DEDUCTIBLE', 'SEPARATE');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'COMPANY', 'FACTORY', 'WAREHOUSE', 'WORKSHOP');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('NEW', 'PENDING_CONFIRMATION', 'CONFIRMED', 'TECH_ASSIGNED', 'VISIT_IN_PROGRESS', 'INSPECTED', 'REPORT_IN_PROGRESS', 'REPORT_SENT', 'AWAITING_APPROVAL', 'REPAIR_APPROVED', 'REPAIR_IN_PROGRESS', 'WORK_DONE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceQuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "SiteService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "includes" TEXT NOT NULL DEFAULT '',
    "audiences" "ServiceAudience"[],
    "requestTypes" "ServiceRequestType"[],
    "priceInside" DECIMAL(10,3) NOT NULL,
    "priceOutside" DECIMAL(10,3) NOT NULL,
    "travelFee" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "visitFeePolicy" "VisitFeePolicy" NOT NULL DEFAULT 'SEPARATE',
    "terms" TEXT NOT NULL DEFAULT '',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SiteService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProblem" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isOther" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServiceProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "fee" DECIMAL(10,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceDeviceLink" (
    "serviceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT false,
    "fee" DECIMAL(10,3),

    CONSTRAINT "ServiceDeviceLink_pkey" PRIMARY KEY ("serviceId","deviceId")
);

-- CreateTable
CREATE TABLE "ServiceZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "PriceTier" NOT NULL,
    "travelFee" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBundle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceInside" DECIMAL(10,3) NOT NULL,
    "priceOutside" DECIMAL(10,3) NOT NULL,
    "terms" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "ref" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'NEW',
    "requestType" "ServiceRequestType" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "clientType" "ClientType" NOT NULL,
    "propertyType" TEXT NOT NULL,
    "zoneId" TEXT,
    "zoneName" TEXT NOT NULL,
    "tier" "PriceTier" NOT NULL,
    "area" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "description" TEXT NOT NULL,
    "problemLocation" TEXT,
    "notes" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "services" JSONB NOT NULL,
    "problems" JSONB NOT NULL DEFAULT '[]',
    "devices" JSONB NOT NULL DEFAULT '[]',
    "priceLines" JSONB NOT NULL,
    "total" DECIMAL(10,3) NOT NULL,
    "visitFeePolicy" "VisitFeePolicy" NOT NULL,
    "needsApproval" BOOLEAN NOT NULL DEFAULT false,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "technicianId" TEXT,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequestMedia" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'customer',
    "url" TEXT NOT NULL,
    "publicId" TEXT,
    "originalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequestMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromStatus" "ServiceRequestStatus",
    "toStatus" "ServiceRequestStatus",
    "note" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceReport" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "findings" TEXT NOT NULL DEFAULT '',
    "devicesUsed" TEXT NOT NULL DEFAULT '',
    "recommendations" TEXT NOT NULL DEFAULT '',
    "repairsNeeded" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceQuote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(12,3) NOT NULL,
    "visitFeeDeduction" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "validUntil" TIMESTAMP(3),
    "status" "ServiceQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ServiceDeviceToServiceProblem" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ServiceDeviceToServiceProblem_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ServiceBundleToSiteService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ServiceBundleToSiteService_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteService_slug_key" ON "SiteService"("slug");

-- CreateIndex
CREATE INDEX "SiteService_active_deletedAt_idx" ON "SiteService"("active", "deletedAt");

-- CreateIndex
CREATE INDEX "ServiceProblem_serviceId_idx" ON "ServiceProblem"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_number_key" ON "ServiceRequest"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_ref_key" ON "ServiceRequest"("ref");

-- CreateIndex
CREATE INDEX "ServiceRequest_customerId_idx" ON "ServiceRequest"("customerId");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- CreateIndex
CREATE INDEX "ServiceRequest_scheduledAt_idx" ON "ServiceRequest"("scheduledAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_createdAt_idx" ON "ServiceRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequestMedia_requestId_idx" ON "ServiceRequestMedia"("requestId");

-- CreateIndex
CREATE INDEX "ServiceRequestEvent_requestId_createdAt_idx" ON "ServiceRequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceReport_requestId_key" ON "ServiceReport"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuote_requestId_number_key" ON "ServiceQuote"("requestId", "number");

-- CreateIndex
CREATE INDEX "_ServiceDeviceToServiceProblem_B_index" ON "_ServiceDeviceToServiceProblem"("B");

-- CreateIndex
CREATE INDEX "_ServiceBundleToSiteService_B_index" ON "_ServiceBundleToSiteService"("B");

-- AddForeignKey
ALTER TABLE "ServiceProblem" ADD CONSTRAINT "ServiceProblem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SiteService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDeviceLink" ADD CONSTRAINT "ServiceDeviceLink_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SiteService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDeviceLink" ADD CONSTRAINT "ServiceDeviceLink_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "ServiceDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestMedia" ADD CONSTRAINT "ServiceRequestMedia_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestEvent" ADD CONSTRAINT "ServiceRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceReport" ADD CONSTRAINT "ServiceReport_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceQuote" ADD CONSTRAINT "ServiceQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServiceDeviceToServiceProblem" ADD CONSTRAINT "_ServiceDeviceToServiceProblem_A_fkey" FOREIGN KEY ("A") REFERENCES "ServiceDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServiceDeviceToServiceProblem" ADD CONSTRAINT "_ServiceDeviceToServiceProblem_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServiceBundleToSiteService" ADD CONSTRAINT "_ServiceBundleToSiteService_A_fkey" FOREIGN KEY ("A") REFERENCES "ServiceBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ServiceBundleToSiteService" ADD CONSTRAINT "_ServiceBundleToSiteService_B_fkey" FOREIGN KEY ("B") REFERENCES "SiteService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

