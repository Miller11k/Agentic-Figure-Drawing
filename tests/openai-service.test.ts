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

    await expect(service.parseEditIntent("Rename something", "diagram")).rejects.toThrow(
      "schema validation"
    );
  });
});
