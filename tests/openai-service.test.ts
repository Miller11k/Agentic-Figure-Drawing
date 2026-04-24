import { describe, expect, it } from "vitest";
import { OpenAIWorkflowServiceImpl } from "../lib/openai/service";
import type { OpenAIClientAdapter } from "../lib/openai/types";

function fakeAdapter(text: string): OpenAIClientAdapter {
  return {
    async generateText() {
      return {
        text,
        modelUsed: "test-model",
        tokenUsage: { totalTokens: 10 }
      };
    },
    async generateTextFromImage() {
      return {
        text,
        modelUsed: "test-model",
        tokenUsage: { totalTokens: 10 }
      };
    },
    async generateImage() {
      return {
        image: Buffer.from("image"),
        mimeType: "image/png",
        modelUsed: "test-image-model"
      };
    },
    async editImage() {
      return {
        image: Buffer.from("edited"),
        mimeType: "image/png",
        modelUsed: "test-image-model"
      };
    }
  };
}

describe("OpenAI workflow service wrappers", () => {
  it("validates ParsedEditIntent responses", async () => {
    const service = new OpenAIWorkflowServiceImpl(
      fakeAdapter(
        JSON.stringify({
          mode: "diagram",
          actionType: "rename",
          targetType: "node",
          targetSelectors: ["API Gateway"],
          attributes: { label: "Edge Router" },
          confidence: 0.91,
          rawPrompt: "Rename API Gateway to Edge Router"
        })
      )
    );

    const intent = await service.parseEditIntent("Rename API Gateway to Edge Router", "diagram");
    expect(intent.attributes).toEqual({ label: "Edge Router" });
  });

  it("rejects malformed structured wrapper output", async () => {
    const service = new OpenAIWorkflowServiceImpl(fakeAdapter(JSON.stringify({ mode: "diagram" })));

    const intent = await service.parseEditIntent("Rename something", "diagram");
    expect(intent).toMatchObject({
      mode: "diagram",
      actionType: "edit",
      targetType: "diagram",
      rawPrompt: "Rename something"
    });
  });

  it("rejects empty structured wrapper output with a stage-specific error", async () => {
    const service = new OpenAIWorkflowServiceImpl(fakeAdapter(""));

    await expect(service.generateDiagramSpec("Create a diagram")).rejects.toThrow(
      "generateDiagramSpec returned an empty response"
    );
  });

  it("normalizes common ParsedEditIntent schema drift", async () => {
    const service = new OpenAIWorkflowServiceImpl(
      fakeAdapter(
        JSON.stringify({
          intent: {
            mode: "diagram",
            action: "delete",
            type: "shape",
            target: "API Gateway",
            confidence: "87",
            prompt: "Delete API Gateway"
          }
        })
      )
    );

    const intent = await service.parseEditIntent("Delete API Gateway", "diagram");

    expect(intent).toMatchObject({
      actionType: "remove",
      targetType: "node",
      targetSelectors: ["API Gateway"],
      confidence: 0.87
    });
  });

  it("normalizes diagram specs with alternate edge and wrapper keys", async () => {
    const service = new OpenAIWorkflowServiceImpl(
      fakeAdapter(
        JSON.stringify({
          spec: {
            name: "Tiny",
            type: "architecture",
            nodes: [{ name: "Client" }, { name: "API" }],
            edges: [{ from: "Client", to: "API" }]
          }
        })
      )
    );

    const spec = await service.generateDiagramSpec("Tiny");

    expect(spec).toMatchObject({
      title: "Tiny",
      diagramType: "architecture",
      nodes: [{ label: "Client" }, { label: "API" }],
      edges: [{ sourceId: "Client", targetId: "API" }],
      groups: [],
      layoutHints: {},
      styleHints: {}
    });
  });

  it("expands diagram-type prompts as plain text", async () => {
    const service = new OpenAIWorkflowServiceImpl(fakeAdapter("Create a detailed architecture diagram with labeled edges."));

    await expect(service.expandDiagramPrompt("Show my app", "System architecture")).resolves.toContain(
      "architecture diagram"
    );
  });

  it("infers arbitrary diagram types from freeform prompts", async () => {
    const service = new OpenAIWorkflowServiceImpl(
      fakeAdapter(
        JSON.stringify({
          diagramType: "BPMN-style swimlane workflow",
          confidence: 0.93,
          reasoningSummary: "The prompt asks for roles, handoffs, approvals, and process states.",
          expertFraming: "Use swimlanes, start/end events, task blocks, gateways, data stores, and labeled handoff edges."
        })
      )
    );

    await expect(service.inferDiagramType("Map the claims approval process across teams")).resolves.toMatchObject({
      diagramType: "BPMN-style swimlane workflow",
      confidence: 0.93
    });
  });

  it("infers diagram type and expanded prompt in one fast wrapper call", async () => {
    const service = new OpenAIWorkflowServiceImpl(
      fakeAdapter(
        JSON.stringify({
          diagramType: "UML sequence diagram",
          confidence: 0.9,
          reasoningSummary: "The prompt asks for ordered actor interactions.",
          expertFraming: "Use actors, lifelines, calls, returns, and activation semantics.",
          expandedPrompt: "Create a UML sequence diagram with actors, lifelines, labeled calls, return messages, and readable spacing."
        })
      )
    );

    await expect(service.inferAndExpandDiagramPrompt("Show login between app, API, and auth service")).resolves.toMatchObject({
      diagramType: "UML sequence diagram",
      expandedPrompt: expect.stringContaining("lifelines")
    });
  });

  it("normalizes XML response aliases", async () => {
    const service = new OpenAIWorkflowServiceImpl(fakeAdapter(JSON.stringify({ diagramXml: "<mxfile><root></root></mxfile>" })));

    await expect(
      service.transformDiagramXml("<mxfile><root></root></mxfile>", {
        parsedIntent: {
          mode: "diagram",
          actionType: "edit",
          targetType: "diagram",
          targetSelectors: [],
          attributes: {},
          confidence: 0.5,
          rawPrompt: "edit"
        },
        matchedTargets: [],
        ambiguityFlags: [],
        selectedOperationPlan: [],
        validationNotes: [],
        executionRoute: "diagram-xml"
      })
    ).resolves.toContain("<mxfile>");
  });
});
