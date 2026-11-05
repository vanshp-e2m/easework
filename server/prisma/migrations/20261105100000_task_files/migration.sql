-- Documents can be uploaded files as well as web links.
ALTER TABLE "TaskLink" ALTER COLUMN "url" DROP NOT NULL,
ADD COLUMN "fileName" TEXT,
ADD COLUMN "fileSize" INTEGER,
ADD COLUMN "mimeType" TEXT,
ADD COLUMN "storageKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TaskLink_storageKey_key" ON "TaskLink"("storageKey");

-- Each row is either a link or a file.
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_url_or_file" CHECK (("url" IS NULL) <> ("storageKey" IS NULL));
