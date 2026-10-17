-- AlterTable
ALTER TABLE "ServiceProblem" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "quoteRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceQuote" ADD COLUMN     "title" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "extra" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "SiteService" ADD COLUMN     "deliverables" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "formFields" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "optionsLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "priceOnRequest" BOOLEAN NOT NULL DEFAULT false;

