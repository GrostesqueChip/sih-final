-- Photographs and supporting documents attached to a test session
CREATE TABLE "SessionAttachment" (
    "id" TEXT NOT NULL,
    "testSessionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "caption" TEXT,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SessionAttachment_testSessionId_idx" ON "SessionAttachment"("testSessionId");

ALTER TABLE "SessionAttachment" ADD CONSTRAINT "SessionAttachment_testSessionId_fkey" FOREIGN KEY ("testSessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
