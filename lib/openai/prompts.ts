import type { DiagramModel, DiagramSpec, DiagramTargetAnalysis, EditingAnalysis, EditorMode } from "@/types";

export const JSON_ONLY_INSTRUCTION =
  "Return only valid JSON. Do not include markdown fences, commentary, or extra text.";

export function parseEditIntentPrompt(prompt: string, mode: EditorMode) {
  return {
    systemPrompt: [
      "You parse user editing prompts for a stateful diagram and image editing app.",
      "Map the request into the required ParsedEditIntent schema.",
      "Use actionType and targetType values exactly from the schema.",
      "Set confidence from 0 to 1.",
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ prompt, mode })
  };
}

export function analyzeDiagramTargetsPrompt(diagramModel: DiagramModel, parsedIntent: unknown) {
  return {
    systemPrompt: [
      "You identify candidate diagram targets for a structured edit intent.",
      "Use existing stable ids and labels from the DiagramModel.",
      "Return matchedTargets, unmatchedSelectors, ambiguityFlags, and notes.",
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ diagramModel, parsedIntent })
  };
}

export function planDiagramEditsPrompt(
  diagramModel: DiagramModel,
  parsedIntent: unknown,
  targetAnalysis: DiagramTargetAnalysis
) {
  return {
    systemPrompt: [
      "You produce a concrete editing analysis for a Draw.io-compatible diagram.",
      "Prefer localized structural edits over full regeneration.",
      "Preserve unchanged ids, labels, and connector integrity.",
      "Return the EditingAnalysis schema.",
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ diagramModel, parsedIntent, targetAnalysis })
  };
}

export function generateDiagramSpecPrompt(prompt: string) {
  return {
    systemPrompt: [
      "You convert a natural-language diagram request into a structured DiagramSpec.",
      "Prefer semantic structure and stable labels over visual flourish.",
      "Do not invent unnecessary nodes.",
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ prompt })
  };
}

export function diagramXmlFromSpecPrompt(diagramSpec: DiagramSpec) {
  return {
    systemPrompt: [
      "You generate clean Draw.io / diagrams.net XML for a structured DiagramSpec.",
      "Prioritize round-trip editability, stable ids, and simple geometry.",
      "Return JSON with one string field named xml.",
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ diagramSpec })
  };
}

export function transformDiagramXmlPrompt(existingXml: string, editPlan: EditingAnalysis) {
  return {
    systemPrompt: [
      "You apply a structured edit plan to existing Draw.io XML.",
      "Preserve unchanged elements whenever possible.",
      "Return JSON with one string field named xml.",
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ existingXml, editPlan })
  };
}

export function validateAndRepairDiagramXmlPrompt(xml: string) {
  return {
    systemPrompt: [
      "You validate Draw.io / diagrams.net XML and repair malformed structure when needed.",
      "Return the original XML if it is already valid.",
      "Return JSON with fields xml, repairApplied, and notes.",
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ xml })
  };
}

export function summarizeArtifactChangesPrompt(before: unknown, after: unknown, context: unknown) {
  return {
    systemPrompt: [
      "You summarize the user-visible change between two artifact states.",
      "Be concise and concrete. Return plain text only."
    ].join("\n"),
    userPrompt: JSON.stringify({ before, after, context })
  };
}
