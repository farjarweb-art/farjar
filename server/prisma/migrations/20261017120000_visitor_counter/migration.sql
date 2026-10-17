-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- عدد الزوار يبدأ بحيث يكون أول زائر رقم 666
INSERT INTO "Counter" ("key", "value", "updatedAt") VALUES ('visitors', 665, NOW())
ON CONFLICT ("key") DO NOTHING;
