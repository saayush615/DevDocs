-- CreateTable
CREATE TABLE "UsageDaily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "queryCount" INTEGER NOT NULL DEFAULT 0,
    "uploadCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageDaily_userId_date_key" ON "UsageDaily"("userId", "date");

-- AddForeignKey
ALTER TABLE "UsageDaily" ADD CONSTRAINT "UsageDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
