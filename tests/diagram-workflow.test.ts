import { beforeEach, describe, expect, it, vi } from "vitest";

const createVersionStep = vi.fn(async () => ({ id: "version_diagram" }));
const updateVersionStructuredState = vi.fn(async () => ({}));
const persistArtifactForVersion = vi.fn(async (input: { artifactType: string; fileName: string }) => ({
  id: `${input.artifactType}_${input.fileName}`,
  ...input
}));
const generateImage = vi.fn(async () => ({
  image: Buffer.from("visual-draft"),
  mimeType: "image/png",
  modelUsed: "gemini-test"
}));
const generateDiagramSpec = vi.fn(async () => ({
  title: "System",
  diagramType: "architecture",
  nodes: [{ id: "web", label: "Web", type: "service" }],
  edges: [],
  groups: [],
  layoutHints: {},
  styleHints: {}
}));
const generateDiagramSpecFromImage = vi.fn(async () => ({
  title: "System",
  diagramType: "architecture",
  nodes: [{ id: "api", label: "API", type: "service" }],
  edges: [],
  groups: [],
  layoutHints: {},
  styleHints: {}
}));

vi.mock("@/lib/session", () => ({
  createVersionStep,
  updateVersionStructuredState
}));

vi.mock("@/lib/storage", () => ({
  persistArtifactForVersion
}));

vi.mock("@/lib/trace", () => ({
  summarizeForTrace: (value: unknown) => JSON.stringify(value),
  runTracedStage: async (_input: unknown, operation: () => Promise<unknown>) => ({ result: await operation() })
}));

vi.mock("@/lib/google", () => ({
  getGoogleImageModelConfig: () => ({ imageModel: "gemini-test" }),
  googleImageClient: {
    generateImage
  }
}));

vi.mock("@/lib/openai", () => ({
  getOpenAIModelConfig: () => ({ textModel: "text-test", imageModel: "image-test" }),
  openAIWorkflowService: {
    inferAndExpandDiagramPrompt: vi.fn(async (prompt: string) => ({
      diagramType: "architecture",
      confidence: 0.9,
      reasoningSummary: "architecture request",
      expertFraming: "use services and data flow",
      expandedPrompt: prompt
    })),
    generateDiagramSpec,
    generateDiagramSpecFromImage,
    verifyDiagramAgainstPrompt: vi.fn(async () => ({
      matchesIntent: true,
      confidence: 0.9,
      issues: [],
      correctionSummary: "",
      safeCorrections: {
        nodeLabels: {},
        edgeLabels: {},
        groupLabels: {},
        nodeTypes: {},
        nodeIcons: {},
        notes: []
      }
    }))
  }
}));

vi.mock("@/lib/diagram", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/diagram")>();
  return {
    ...actual,
    createDiagramModelFromSpec: vi.fn((spec: { nodes: Array<{ id: string; label: string; type?: string }> }) => ({
      nodes: spec.nodes.map((node) => ({
        id: node.id,
        stableId: node.id,
        label: node.label,
        type: node.type,
        boundingBox: { x: 80, y: 80, width: 160, height: 72 },
        style: {},
        data: {}
      })),
      edges: [],
      groups: [],
      layoutMetadata: {},
      styleMetadata: {},
      normalized: {}
    }))
  };
});

vi.mock("@/lib/xml", () => ({
  createDrawioXmlFromModel: vi.fn(() => "<mxfile><diagram><mxGraphModel><root /></mxGraphModel></diagram></mxfile>"),
  parseDrawioXmlToDiagramModel: vi.fn(),
  validateAndRepairDrawioXml: vi.fn((xml: string) => ({
    valid: true,
    xml,
    repairApplied: false,
    errors: [],
    notes: []
  }))
}));

vi.mock("@/lib/diagram/svg", () => ({
  createDiagramSvgFromModel: vi.fn(() => "<svg xmlns=\"http://www.w3.org/2000/svg\" />")
}));

vi.mock("@/lib/diagram/rasterize", () => ({
  rasterizeSvgToPng: vi.fn(async () => undefined)
}));

vi.mock("@/lib/diagram/icon-catalog", () => ({
  supportedDiagramIconPromptCatalog: () => "service,database,user"
}));

describe("diagram workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DIAGRAM_IMAGE_PROVIDER;
    delete process.env.IMAGE_GENERATION_PROVIDER;
  });

  it("uses direct OpenAI DiagramSpec generation when OpenAI is selected as the diagram provider", async () => {
    const { runDiagramGenerationPipeline } = await import("../lib/workflows/diagram");

    const result = await runDiagramGenerationPipeline({
      sessionId: "session_1",
      prompt: "Map a web app architecture",
      imageProvider: "openai"
    });

    expect(generateImage).not.toHaveBeenCalled();
    expect(generateDiagramSpec).toHaveBeenCalledWith("Map a web app architecture");
    expect(generateDiagramSpecFromImage).not.toHaveBeenCalled();
    expect(result.visualDraftArtifactId).toBeUndefined();
    expect(result.diagramModel.nodes[0].id).toBe("web");
  });

  it("falls back to direct OpenAI DiagramSpec generation if the Gemini visual draft fails", async () => {
    generateImage.mockRejectedValueOnce(new Error("missing Gemini key"));
    const { runDiagramGenerationPipeline } = await import("../lib/workflows/diagram");

    const result = await runDiagramGenerationPipeline({
      sessionId: "session_1",
      prompt: "Map a web app architecture",
      imageProvider: "gemini"
    });

    expect(generateImage).toHaveBeenCalled();
    expect(generateDiagramSpec).toHaveBeenCalled();
    expect(generateDiagramSpecFromImage).not.toHaveBeenCalled();
    expect(result.diagramModel.nodes[0].id).toBe("web");
    expect(updateVersionStructuredState).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          visualDraftError: "missing Gemini key"
        })
      })
    );
  });

  it("reconstructs editable diagrams from reference images", async () => {
    const { runDiagramImageReconstructionPipeline } = await import("../lib/workflows/diagram");

    const result = await runDiagramImageReconstructionPipeline({
      sessionId: "session_1",
      prompt: "rebuild this as editable boxes and arrows",
      image: Buffer.from("reference"),
      mimeType: "image/png",
      fileName: "reference.png"
    });

    expect(generateDiagramSpecFromImage).toHaveBeenCalledWith(
      Buffer.from("reference"),
      "rebuild this as editable boxes and arrows",
      "editable reference reconstruction",
      "image/png"
    );
    expect(persistArtifactForVersion).toHaveBeenCalledWith(expect.objectContaining({ artifactType: "source" }));
    expect(persistArtifactForVersion).toHaveBeenCalledWith(expect.objectContaining({ artifactType: "diagram_xml" }));
    expect(result).toMatchObject({
      versionId: "version_diagram",
      artifactId: "diagram_xml_reconstructed.drawio",
      repairApplied: false
    });
  });
});
