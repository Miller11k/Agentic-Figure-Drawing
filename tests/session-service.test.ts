import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  version: {
    update: vi.fn(async (input) => ({ id: input.where.id, ...input.data })),
    findFirstOrThrow: vi.fn(async () => ({
      id: "target_version",
      sessionId: "session_1",
      mode: "diagram",
      prompt: "original prompt",
      parsedIntent: "{\"mode\":\"diagram\"}",
      editingAnalysis: "{\"route\":\"diagram\"}",
      diagramModel: "{\"nodes\":[]}",
      imageMetadata: null,
      previewArtifactId: "preview_1",
      artifacts: [
        {
          type: "diagram_xml",
          storagePath: "session/target/diagram.drawio",
          mimeType: "application/xml",
          bytes: 12,
          checksum: "abc",
          metadata: "{\"role\":\"output\"}"
        }
      ]
    })),
    create: vi.fn(async () => ({ id: "revert_version" }))
  },
  promptEditMetadata: {
    updateMany: vi.fn(async () => ({ count: 1 }))
  },
  session: {
    findUniqueOrThrow: vi.fn(async () => ({ currentVersionId: "current_version" })),
    update: vi.fn(async () => ({}))
  },
  artifact: {
    create: vi.fn(async () => ({}))
  }
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback) => callback(tx))
  }
}));

describe("session service hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs prompt metadata when structured version state is updated", async () => {
    const { updateVersionStructuredState } = await import("../lib/session/service");

    await updateVersionStructuredState({
      versionId: "version_1",
      parsedIntent: { mode: "diagram" },
      editingAnalysis: { route: "diagram-model" }
    });

    expect(tx.version.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "version_1" },
        data: expect.objectContaining({
          parsedIntent: "{\"mode\":\"diagram\"}",
          editingAnalysis: "{\"route\":\"diagram-model\"}"
        })
      })
    );
    expect(tx.promptEditMetadata.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { versionId: "version_1" },
        data: expect.objectContaining({
          parsedIntent: "{\"mode\":\"diagram\"}",
          editingAnalysis: "{\"route\":\"diagram-model\"}"
        })
      })
    );
  });

  it("moves the current version pointer when reverting without creating history", async () => {
    const { revertSessionToVersion } = await import("../lib/session/service");

    const result = await revertSessionToVersion("session_1", "target_version");

    expect(result.id).toBe("target_version");
    expect(tx.version.create).not.toHaveBeenCalled();
    expect(tx.artifact.create).not.toHaveBeenCalled();
    expect(tx.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session_1" },
        data: { currentVersionId: "target_version" }
      })
    );
  });
});
