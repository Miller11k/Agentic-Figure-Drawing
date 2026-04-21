import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJsonCandidate, parseStructuredJson, safeParseStructuredJson } from "../lib/openai/json";

const schema = z.object({
  name: z.string()
});

describe("OpenAI structured JSON helpers", () => {
  it("extracts fenced JSON before validating", () => {
    const parsed = parseStructuredJson("```json\n{\"name\":\"diagram\"}\n```", schema);
    expect(parsed.name).toBe("diagram");
  });

  it("extracts a JSON object from surrounding text", () => {
    expect(extractJsonCandidate("Here is the result: {\"name\":\"image\"}")).toBe("{\"name\":\"image\"}");
  });

  it("returns safe parse errors without throwing", () => {
    const parsed = safeParseStructuredJson("{\"name\":42}", schema);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("schema validation");
  });
});
