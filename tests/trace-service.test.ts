import { beforeEach, describe, expect, it, vi } from "vitest";

const traceStore = new Map<string, { id: string; startedAt: Date; status: string }>();

const mockPrisma = {
  openAITrace: {
    create: vi.fn(async ({ data }) => {
      const trace = {
        id: "trace_1",
        startedAt: new Date("2026-04-21T12:00:00.000Z"),
        status: data.status ?? "pending",
        ...data
      };
      traceStore.set(trace.id, trace);
      return trace;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }) => {
      const trace = traceStore.get(where.id);

      if (!trace) {
        throw new Error("Trace not found");
      }

      return { startedAt: trace.startedAt };
    }),
    update: vi.fn(async ({ where, data }) => {
      const existing = traceStore.get(where.id);

      if (!existing) {
        throw new Error("Trace not found");
      }

      const updated = { ...existing, ...data };
      traceStore.set(where.id, updated);
      return updated;
    }),
    findMany: vi.fn(async () => Array.from(traceStore.values()))
  }
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma
}));

describe("trace service", () => {
  beforeEach(() => {
    traceStore.clear();
    vi.clearAllMocks();
  });

  it("creates and finishes a traced stage", async () => {
    const { runTracedStage } = await import("../lib/trace/service");

    const traced = await runTracedStage(
      {
        sessionId: "session_1",
        versionId: "version_1",
        pipelineName: "diagram-editing",
        stageName: "parse-edit-intent",
        inputSummary: "rename prompt",
        modelUsed: "test-model"
      },
      async () => ({ ok: true })
    );

    expect(traced.traceId).toBe("trace_1");
    expect(mockPrisma.openAITrace.create).toHaveBeenCalledOnce();
    expect(mockPrisma.openAITrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "trace_1" },
        data: expect.objectContaining({ status: "success" })
      })
    );
  });

  it("records error status when a stage fails", async () => {
    const { runTracedStage } = await import("../lib/trace/service");

    await expect(
      runTracedStage(
        {
          sessionId: "session_1",
          pipelineName: "image-editing",
          stageName: "edit-image",
          inputSummary: "edit prompt"
        },
        async () => {
          throw new Error("OpenAI failed");
        }
      )
    ).rejects.toThrow("OpenAI failed");

    expect(mockPrisma.openAITrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "error",
          errorMessage: "OpenAI failed"
        })
      })
    );
  });
});
