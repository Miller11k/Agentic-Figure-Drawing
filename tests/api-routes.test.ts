import { describe, expect, it, vi } from "vitest";

const mockCreateSession = vi.fn(async () => ({
  session: { id: "clsession123456789012345678", title: "Test Session", currentVersionId: "clversion123456789012345678" },
  initialVersion: { id: "clversion123456789012345678" }
}));

const mockGetSessionHistory = vi.fn(async () => ({
  id: "clsession123456789012345678",
  title: "Test Session",
  currentVersionId: "clversion123456789012345678",
  createdAt: new Date("2026-04-21T12:00:00.000Z"),
  updatedAt: new Date("2026-04-21T12:00:00.000Z"),
  versions: [
    {
      id: "clversion123456789012345678",
      sessionId: "clsession123456789012345678",
      parentVersionId: null,
      stepType: "create",
      mode: "diagram",
      prompt: null,
      parsedIntent: null,
      editingAnalysis: null,
      diagramModel: null,
      imageMetadata: null,
      metadata: null,
      previewArtifactId: null,
      createdAt: new Date("2026-04-21T12:00:00.000Z"),
      artifacts: []
    }
  ],
  artifacts: [],
  traces: []
}));

const mockRevertSessionToVersion = vi.fn(async () => ({ id: "clrevert123456789012345678" }));

vi.mock("@/lib/session", () => ({
  createSession: mockCreateSession,
  getSessionHistory: mockGetSessionHistory,
  revertSessionToVersion: mockRevertSessionToVersion,
  toSessionStep: (version: { id: string; sessionId: string; mode: "diagram" | "image"; createdAt: Date }) => ({
    sessionId: version.sessionId,
    versionId: version.id,
    parentVersionId: null,
    stepType: "create",
    mode: version.mode,
    artifactPointers: [],
    timestamp: version.createdAt.toISOString()
  }),
  createVersionStep: vi.fn(async () => ({ id: "cluploadversion123456789012" }))
}));

const workflowResult = {
  versionId: "clworkflowversion1234567890",
  artifactId: "clartifact1234567890123456"
};

vi.mock("@/lib/workflows", () => ({
  runDiagramImportPipeline: vi.fn(async () => ({
    ...workflowResult,
    diagramModel: { nodes: [], edges: [], groups: [], layoutMetadata: {}, styleMetadata: {}, normalized: {} },
    xml: "<mxfile><diagram><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/></root></mxGraphModel></diagram></mxfile>",
    repairApplied: false,
    notes: []
  })),
  runDiagramGenerationPipeline: vi.fn(async () => ({
    ...workflowResult,
    diagramSpec: { title: "Generated", diagramType: "system", nodes: [], edges: [], groups: [], layoutHints: {}, styleHints: {} },
    diagramModel: { nodes: [], edges: [], groups: [], layoutMetadata: {}, styleMetadata: {}, normalized: {} },
    xml: "<mxfile />",
    repairApplied: false
  })),
  runDiagramDirectEditPipeline: vi.fn(async () => ({
    ...workflowResult,
    diagramModel: { nodes: [], edges: [], groups: [], layoutMetadata: {}, styleMetadata: {}, normalized: {} },
    xml: "<mxfile />",
    operations: [{ type: "rename-node", nodeId: "node_a", label: "A" }]
  })),
  runImageGenerationPipeline: vi.fn(async () => ({
    ...workflowResult,
    parsedIntent: {
      mode: "image",
      actionType: "generate",
      targetType: "image",
      targetSelectors: [],
      attributes: {},
      confidence: 1,
      rawPrompt: "image"
    },
    mimeType: "image/png",
    bytes: 4
  })),
  runImageEditingPipeline: vi.fn(async () => ({
    ...workflowResult,
    parsedIntent: {
      mode: "image",
      actionType: "edit",
      targetType: "image",
      targetSelectors: [],
      attributes: {},
      confidence: 1,
      rawPrompt: "edit"
    },
    mimeType: "image/png",
    bytes: 6
  })),
  runDiagramEditingPipeline: vi.fn(async () => workflowResult)
}));

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("backend API routes", () => {
  it("creates a session", async () => {
    const { POST } = await import("../app/api/session/create/route");
    const response = await POST(jsonRequest({ title: "Test Session", initialMode: "diagram" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.session.id).toBe("clsession123456789012345678");
  });

  it("imports a diagram", async () => {
    const { POST } = await import("../app/api/diagram/import/route");
    const response = await POST(
      jsonRequest({
        sessionId: "clsession123456789012345678",
        xml: "<mxfile><diagram><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/></root></mxGraphModel></diagram></mxfile>",
        fileName: "sample.drawio"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.artifactId).toBe("clartifact1234567890123456");
  });

  it("generates a diagram", async () => {
    const { POST } = await import("../app/api/diagram/generate/route");
    const response = await POST(
      jsonRequest({
        sessionId: "clsession123456789012345678",
        prompt: "Create an API diagram"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.diagramSpec.title).toBe("Generated");
  });

  it("runs a direct diagram edit", async () => {
    const { POST } = await import("../app/api/diagram/direct-edit/route");
    const response = await POST(
      jsonRequest({
        sessionId: "clsession123456789012345678",
        diagramModel: { nodes: [], edges: [], groups: [], layoutMetadata: {}, styleMetadata: {}, normalized: {} },
        operations: [{ type: "rename-node", nodeId: "node_a", label: "Renamed" }]
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.operations).toHaveLength(1);
  });

  it("generates an image", async () => {
    const { POST } = await import("../app/api/image/generate/route");
    const response = await POST(
      jsonRequest({
        sessionId: "clsession123456789012345678",
        prompt: "Generate a system diagram hero image"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.mimeType).toBe("image/png");
  });

  it("edits an image with an optional mask", async () => {
    const { POST } = await import("../app/api/image/edit/route");
    const response = await POST(
      jsonRequest({
        sessionId: "clsession123456789012345678",
        prompt: "Make the selected region blue",
        imageBase64: Buffer.from("image").toString("base64"),
        maskBase64: Buffer.from("mask").toString("base64")
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.bytes).toBe(6);
  });

  it("retrieves session history", async () => {
    const { GET } = await import("../app/api/session/[sessionId]/route");
    const response = await GET(new Request("http://localhost/api/session/clsession123456789012345678"), {
      params: { sessionId: "clsession123456789012345678" }
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.steps).toHaveLength(1);
  });
});
