-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "currentVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "stepType" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "prompt" TEXT,
    "parsedIntent" TEXT,
    "editingAnalysis" TEXT,
    "diagramModel" TEXT,
    "imageMetadata" TEXT,
    "metadata" TEXT,
    "previewArtifactId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "versions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "versions_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "versions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER,
    "checksum" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "artifacts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "artifacts_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "traces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "versionId" TEXT,
    "pipelineName" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "outputSummary" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "latencyMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "repairApplied" BOOLEAN NOT NULL DEFAULT false,
    "modelUsed" TEXT,
    "tokenUsage" TEXT,
    "errorMessage" TEXT,
    "metadata" TEXT,
    CONSTRAINT "traces_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "traces_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "prompt_edit_metadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "versionId" TEXT,
    "rawPrompt" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "parsedIntent" TEXT,
    "editingAnalysis" TEXT,
    "requestPayload" TEXT,
    "responsePayload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prompt_edit_metadata_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "prompt_edit_metadata_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "versions_sessionId_createdAt_idx" ON "versions"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "versions_parentVersionId_idx" ON "versions"("parentVersionId");

-- CreateIndex
CREATE INDEX "artifacts_sessionId_idx" ON "artifacts"("sessionId");

-- CreateIndex
CREATE INDEX "artifacts_versionId_idx" ON "artifacts"("versionId");

-- CreateIndex
CREATE INDEX "traces_sessionId_startedAt_idx" ON "traces"("sessionId", "startedAt");

-- CreateIndex
CREATE INDEX "traces_versionId_idx" ON "traces"("versionId");

-- CreateIndex
CREATE INDEX "prompt_edit_metadata_sessionId_createdAt_idx" ON "prompt_edit_metadata"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "prompt_edit_metadata_versionId_idx" ON "prompt_edit_metadata"("versionId");
