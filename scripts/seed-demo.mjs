import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    value = value.replace(/^["']|["']$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function checksum(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function storeArtifact({ sessionId, versionId, artifactType, fileName, data }) {
  const storageRoot = process.env.ARTIFACT_STORAGE_ROOT ?? "./public/artifacts";
  const relativePath = path.join(sessionId, versionId, artifactType, fileName).replaceAll("\\", "/");
  const absolutePath = path.resolve(storageRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, data);
  return {
    storagePath: relativePath,
    bytes: data.byteLength,
    checksum: checksum(data)
  };
}

loadEnvFile(".env");

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./dev.db";
}

const prisma = new PrismaClient();

const diagramXml = readFileSync("public/samples/demo-architecture.drawio");
const sourceImage = readFileSync("public/samples/demo-source-image.svg");

const session = await prisma.session.create({
  data: {
    title: "Demo: stateful diagram and image editing"
  }
});

const initial = await prisma.version.create({
  data: {
    sessionId: session.id,
    stepType: "create",
    mode: "diagram",
    metadata: JSON.stringify({ seed: true, note: "Demo session created by scripts/seed-demo.mjs." })
  }
});

const importVersion = await prisma.version.create({
  data: {
    sessionId: session.id,
    parentVersionId: initial.id,
    stepType: "import",
    mode: "diagram",
    prompt: "Seeded Draw.io architecture import.",
    metadata: JSON.stringify({ seed: true, sample: "public/samples/demo-architecture.drawio" })
  }
});

const diagramStored = storeArtifact({
  sessionId: session.id,
  versionId: importVersion.id,
  artifactType: "diagram_xml",
  fileName: "demo-architecture.drawio",
  data: diagramXml
});

await prisma.artifact.create({
  data: {
    sessionId: session.id,
    versionId: importVersion.id,
    type: "diagram_xml",
    storagePath: diagramStored.storagePath,
    mimeType: "application/xml",
    bytes: diagramStored.bytes,
    checksum: diagramStored.checksum,
    metadata: JSON.stringify({ seed: true, role: "demo-diagram-source" })
  }
});

await prisma.promptEditMetadata.create({
  data: {
    sessionId: session.id,
    versionId: importVersion.id,
    rawPrompt: "Seeded Draw.io architecture import.",
    mode: "diagram",
    status: "success",
    requestPayload: JSON.stringify({ source: "seed-script" })
  }
});

const imageVersion = await prisma.version.create({
  data: {
    sessionId: session.id,
    parentVersionId: importVersion.id,
    stepType: "upload",
    mode: "image",
    prompt: "Seeded source image for localized mask editing.",
    imageMetadata: JSON.stringify({ seed: true, mimeType: "image/svg+xml", width: 960, height: 540 }),
    metadata: JSON.stringify({ seed: true, sample: "public/samples/demo-source-image.svg" })
  }
});

const imageStored = storeArtifact({
  sessionId: session.id,
  versionId: imageVersion.id,
  artifactType: "image",
  fileName: "demo-source-image.svg",
  data: sourceImage
});

await prisma.artifact.create({
  data: {
    sessionId: session.id,
    versionId: imageVersion.id,
    type: "image",
    storagePath: imageStored.storagePath,
    mimeType: "image/svg+xml",
    bytes: imageStored.bytes,
    checksum: imageStored.checksum,
    metadata: JSON.stringify({ seed: true, role: "demo-image-source" })
  }
});

await prisma.openAITrace.create({
  data: {
    sessionId: session.id,
    versionId: importVersion.id,
    pipelineName: "demo-seed",
    stageName: "seed-fixtures",
    inputSummary: "Seeded local Draw.io XML and SVG image fixtures.",
    outputSummary: "Created demo session, import version, upload version, and artifact records.",
    startedAt: new Date(),
    endedAt: new Date(),
    latencyMs: 0,
    status: "success",
    modelUsed: "none-local-seed",
    metadata: JSON.stringify({ openAIBacked: false, reason: "Local demonstration fixture only." })
  }
});

await prisma.session.update({
  where: { id: session.id },
  data: { currentVersionId: imageVersion.id }
});

console.log(JSON.stringify({
  sessionId: session.id,
  initialVersionId: initial.id,
  diagramVersionId: importVersion.id,
  imageVersionId: imageVersion.id,
  message: "Demo session seeded. Start the app and load this session id from the API/UI state if needed."
}, null, 2));

await prisma.$disconnect();
