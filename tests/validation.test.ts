import { describe, expect, it } from "vitest";
import { createSessionRequestSchema, parsedEditIntentSchema } from "../lib/validation/schemas";

describe("validation schemas", () => {
  it("defaults a new session to diagram mode", () => {
    const parsed = createSessionRequestSchema.parse({ title: "Architecture sketch" });
    expect(parsed.initialMode).toBe("diagram");
  });

  it("accepts a typed parsed edit intent", () => {
    const parsed = parsedEditIntentSchema.parse({
      mode: "diagram",
      actionType: "rename",
      targetType: "node",
      targetSelectors: ["API Gateway"],
      attributes: { label: "Edge Router" },
      confidence: 0.92,
      rawPrompt: "Rename API Gateway to Edge Router"
    });

    expect(parsed.attributes).toEqual({ label: "Edge Router" });
  });
});
