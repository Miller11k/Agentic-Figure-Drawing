import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openAIWorkflowService } from "../lib/openai/service";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

loadEnvFile(".env");

if (!process.env.OPENAI_API_KEY && existsSync("openai_secret_key")) {
  process.env.OPENAI_API_KEY = readFileSync("openai_secret_key", "utf8").trim();
}

const runLiveSmoke = process.env.LIVE_OPENAI_SMOKE === "1";

describe.skipIf(!runLiveSmoke)("live OpenAI schema smoke", () => {
  it("parses real OpenAI structured outputs through service normalizers", async () => {
    const intent = await openAIWorkflowService.parseEditIntent(
      "Rename API Gateway to Edge Router",
      "diagram"
    );
    const spec = await openAIWorkflowService.generateDiagramSpec(
      "Create a tiny two-node web app diagram with a client and API."
    );

    expect(intent.mode).toBe("diagram");
    expect(intent.actionType).toBe("rename");
    expect(intent.targetType).toBe("node");
    expect(intent.targetSelectors.length).toBeGreaterThan(0);
    expect(spec.nodes.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(spec.edges)).toBe(true);
    expect(Array.isArray(spec.groups)).toBe(true);
  }, 120_000);
});
