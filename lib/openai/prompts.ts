import type { DiagramModel, DiagramSpec, DiagramTargetAnalysis, EditingAnalysis, EditorMode } from "@/types";
import { supportedDiagramIconPromptCatalog } from "@/lib/diagram/icon-catalog";

export const JSON_ONLY_INSTRUCTION =
  "Return only valid JSON. Do not include markdown fences, commentary, or extra text.";

const DIAGRAM_TYPE_INFERENCE_SCHEMA_INSTRUCTION = [
  "Diagram type inference JSON shape:",
  "{",
  '  "diagramType": string,',
  '  "confidence": number from 0 to 1,',
  '  "reasoningSummary": string,',
  '  "expertFraming": string',
  "}",
  "diagramType should be a concise expert diagram category, not restricted to a preset list.",
  "expertFraming should describe the conventions, primitives, layout priorities, and expected semantic structures for that diagram type."
].join("\n");

const EXPANDED_DIAGRAM_PROMPT_SCHEMA_INSTRUCTION = [
  "Expanded diagram prompt JSON shape:",
  "{",
  '  "diagramType": string,',
  '  "confidence": number from 0 to 1,',
  '  "reasoningSummary": string,',
  '  "expertFraming": string,',
  '  "expandedPrompt": string',
  "}",
  "diagramType should be a concise expert diagram category, not restricted to a preset list.",
  "expandedPrompt should be a detailed but efficient downstream image-generation prompt with diagram-type-specific primitives, labels, grouping, edge semantics, and layout rules."
].join("\n");

const PARSED_EDIT_INTENT_SCHEMA_INSTRUCTION = [
  "ParsedEditIntent JSON shape:",
  "{",
  '  "mode": "diagram" | "image",',
  '  "actionType": "add" | "remove" | "rename" | "recolor" | "move" | "connect" | "disconnect" | "generate" | "edit",',
  '  "targetType": "node" | "edge" | "group" | "region" | "diagram" | "image",',
  '  "targetSelectors": string[],',
  '  "attributes": object,',
  '  "spatialHints": optional object,',
  '  "confidence": number from 0 to 1,',
  '  "rawPrompt": string',
  "}",
  "Always include targetSelectors and attributes, even when they are empty."
].join("\n");

const DIAGRAM_SPEC_SCHEMA_INSTRUCTION = [
  "DiagramSpec JSON shape:",
  "{",
  '  "title": string,',
  '  "diagramType": string,',
  '  "nodes": [{ "id"?: string, "label": string, "type"?: string, "groupId"?: string, "attributes"?: object }],',
  '  "edges": [{ "id"?: string, "sourceId": string, "targetId": string, "label"?: string, "attributes"?: object }],',
  '  "groups": [{ "id"?: string, "label": string, "nodeIds": string[], "attributes"?: object }],',
  '  "layoutHints": object,',
  '  "styleHints": object',
  "}",
  "Always include nodes, edges, groups, layoutHints, and styleHints."
].join("\n");

const SUPPORTED_ICON_CATALOG_INSTRUCTION = [
  "Supported editable icon/type catalog:",
  supportedDiagramIconPromptCatalog()
].join("\n");

const RICH_DIAGRAM_ATTR_INSTRUCTION = [
  "When visual detail exists, encode it in attributes so the Draw.io serializer and canvas can preserve it:",
  '- Node attributes may include raw Draw.io style, shape, icon, fillColor, strokeColor, fontColor, dashed, opacity, swimlane, image, imageAspect, and geometry hints.',
  '- Use node type values from the supported editable icon/type catalog whenever one fits.',
  '- If no supported icon fits the domain object, use type="custom-icon" and set attributes.icon, attributes.customIconPrompt, attributes.customIconReason, attributes.shape="image", and an editable Draw.io image-style raw string.',
  '- Prefer editable shape semantics: start/end/terminator as ellipse/terminator, input/output as parallelogram, decision as rhombus/diamond, data stores as cylinder, documents as document, regions as swimlane/group, and icons/images as image/icon nodes.',
  '- Edge attributes may include raw Draw.io style, strokeColor, dashed, rounded, edgeStyle, endArrow, startArrow, strokeWidth, and label placement hints.',
  '- Group attributes may include raw Draw.io swimlane/container style, fillColor, strokeColor, dashed, collapsible, and region/lane semantics.',
  "Preserve edge labels, visual regions, lanes, icons, cloud/user/database/document/queue/input/output/decision/start/end shapes, arrow styles, dashed lines, and nested/grouped regions whenever visible.",
  "Use layoutHints to request readability when useful: avoidOverlaps, preserveVisualLayout, labelPadding, regionPadding, preferredDirection, edgeRouting, and fitToContent."
].join("\n");

const MAJOR_DIAGRAM_SUPPORT_INSTRUCTION = [
  "Support the major diagram families and symbol sets commonly expected in flagship diagramming tools:",
  "- Flowcharts: process, decision, terminator, input/output, documents, connectors, off-page connectors, loops, and labeled branches.",
  "- UML: sequence diagrams, class diagrams, state machines, activity-style flows, actors, lifelines, activation bars, classes, interfaces, packages, inheritance, composition, and dependencies.",
  "- ER and database diagrams: entities, tables, attributes, primary/foreign keys, cardinality labels, relationships, data stores, schemas, and junction tables.",
  "- Project/product diagrams: Gantt charts, milestones, journey maps, user flows, wireframes, UI components, screens, forms, and annotations.",
  "- Architecture diagrams: C4 context/container/component diagrams, API/system architecture, security/auth flows, trust boundaries, DevOps/CI-CD pipelines, and evaluation workflows.",
  "- Infrastructure diagrams: networks, routers, switches, firewalls, load balancers, subnets, gateways, VPNs, DNS, services, queues, caches, storage, and cloud AWS/GCP/Azure-style icon semantics.",
  "Represent every detected element as an editable structured object with an id, label, type, attributes, optional groupId, geometry/layout hints, and explicit relationships through edges.",
  "Use groups for containers, packages, swimlanes, trust boundaries, cloud accounts, VPCs, regions, phases, actors, timelines, and UI screens.",
  "Use typed connectors with direction, labels, arrow styles, dashed/solid styles, dependency/inheritance/composition semantics, cardinality, protocol names, events, data flow, and condition labels when visible or implied.",
  "Prefer full-fidelity structured editability over decorative flattening: icons and images should become typed icon/image nodes, not background art."
].join("\n");

const ICON_FIDELITY_INSTRUCTION = [
  "Icon fidelity requirements:",
  "- Choose the correct semantic icon or typed shape for each element during initial generation and image extraction.",
  "- Cloud/vendor-style diagrams must distinguish user, client, server, API/service, database, object storage, queue/topic, cache, router, switch, firewall, load balancer, gateway, cloud, VPC/subnet/region, and external system icons.",
  "- UML, ER, flowchart, Gantt, wireframe, security, and journey diagrams should use the conventional symbol for the diagram family rather than generic rectangles.",
  "- Store icon semantics in node.type and attributes.icon. Store Draw.io-compatible style in attributes.raw or attributes.shape when a known diagrams.net shape is appropriate.",
  "- Check the supported editable icon/type catalog before choosing a generic shape. Use the closest supported icon when it communicates the meaning accurately.",
  '- If the supported catalog does not fit, use a custom icon node: type="custom-icon", attributes.icon as a short human-readable icon name, attributes.customIconPrompt as a concise prompt for a generated icon/graphic, attributes.customIconReason explaining why the catalog was insufficient, and attributes.raw using an editable image placeholder style.',
  "- Custom icons are allowed for domain-specific equipment, product logos, specialized scientific/engineering symbols, medical/industrial devices, or app-specific graphics when standard diagram icons would be misleading.",
  "- During validation, verify that every icon/type matches the node label, diagram family, and surrounding relationships. Correct wrong icons by returning nodeTypes and nodeIcons for existing node ids only."
].join("\n");

const TARGET_ANALYSIS_SCHEMA_INSTRUCTION = [
  "Target analysis JSON shape:",
  "{",
  '  "matchedTargets": [{ "id": string, "targetType": "node" | "edge" | "group" | "region" | "diagram" | "image", "label"?: string, "confidence": number, "reason": string }],',
  '  "unmatchedSelectors": string[],',
  '  "ambiguityFlags": string[],',
  '  "notes": string[]',
  "}",
  "Only use ids that exist in the supplied DiagramModel."
].join("\n");

const EDITING_ANALYSIS_SCHEMA_INSTRUCTION = [
  "EditingAnalysis JSON shape:",
  "{",
  '  "parsedIntent": ParsedEditIntent,',
  '  "matchedTargets": matched target array,',
  '  "ambiguityFlags": string[],',
  '  "selectedOperationPlan": [{ "operation": allowed actionType, "targetIds": string[], "attributes": object, "notes"?: string }],',
  '  "validationNotes": string[],',
  '  "fallbackBehavior"?: string,',
  '  "executionRoute": "diagram-xml" | "diagram-model" | "image-generation" | "image-edit"',
  "}",
  "Always include arrays and objects even when empty."
].join("\n");

export function parseEditIntentPrompt(prompt: string, mode: EditorMode) {
  return {
    systemPrompt: [
      "You parse user editing prompts for a stateful diagram and image editing app.",
      "Map the request into the required ParsedEditIntent schema.",
      "Use actionType and targetType values exactly from the schema.",
      "Set confidence from 0 to 1.",
      PARSED_EDIT_INTENT_SCHEMA_INSTRUCTION,
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
      TARGET_ANALYSIS_SCHEMA_INSTRUCTION,
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
      PARSED_EDIT_INTENT_SCHEMA_INSTRUCTION,
      EDITING_ANALYSIS_SCHEMA_INSTRUCTION,
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
      "Do not invent unnecessary nodes, but do preserve meaningful visual regions, icons, edge labels, and shape types.",
      MAJOR_DIAGRAM_SUPPORT_INSTRUCTION,
      ICON_FIDELITY_INSTRUCTION,
      SUPPORTED_ICON_CATALOG_INSTRUCTION,
      DIAGRAM_SPEC_SCHEMA_INSTRUCTION,
      RICH_DIAGRAM_ATTR_INSTRUCTION,
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ prompt })
  };
}

export function generateDiagramSpecFromImagePrompt(prompt: string, diagramType?: string) {
  return {
    systemPrompt: [
      "You inspect a generated diagram reference image and convert it into an editable structured DiagramSpec.",
      "Use the user's expanded prompt as semantic ground truth and the image as visual/layout guidance.",
      "Capture distinct nodes, groups, edge directions, edge labels, icons, shapes, and obvious visual hierarchy.",
      "Aim for a near 1:1 editable reconstruction of the reference image: block types, edge types, regions/lane boundaries, icons, colors, arrow styles, dashed/solid lines, nested groups, and visible labels.",
      "Prefer common editable diagram shapes: start/end terminators, input/output parallelograms, process/service blocks, database/data-store cylinders, queue/cache/storage, cloud, user/actor, decision diamonds, function, external system, document, image/icon, topic, and region/swimlane groups.",
      "Do not collapse specialized shapes into generic rectangles when a clearer editable primitive is visible.",
      "Preserve all visible edge labels and put labels in edge.label, not only in freeform notes.",
      "Make region/group membership explicit in groupId and groups.nodeIds. Regions must not obscure contained node labels.",
      "Set layoutHints to request an optimized readable layout with avoidOverlaps=true, preserveVisualLayout=true, fitToContent=true, generous regionPadding, and edgeRouting='orthogonal'.",
      "Keep ids stable, short, and descriptive. Do not describe the image; return the DiagramSpec JSON only.",
      MAJOR_DIAGRAM_SUPPORT_INSTRUCTION,
      ICON_FIDELITY_INSTRUCTION,
      SUPPORTED_ICON_CATALOG_INSTRUCTION,
      DIAGRAM_SPEC_SCHEMA_INSTRUCTION,
      RICH_DIAGRAM_ATTR_INSTRUCTION,
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ prompt, diagramType })
  };
}

export function inferDiagramTypePrompt(prompt: string) {
  return {
    systemPrompt: [
      "You infer the best expert diagram type from a user's freeform diagram-generation prompt.",
      "Do not choose from a fixed menu. Name the specific diagram type that best fits the user's intent.",
      "Examples include but are not limited to flowchart, UML sequence, UML class, ERD, state machine, Gantt, journey map, user flow, C4 context/container/component, network topology, AWS/GCP/Azure cloud architecture, database schema, API/system architecture, DevOps/CI-CD pipeline, security trust-boundary/auth flow, UI wireframe, BPMN-style process, data lineage, decision tree, control loop, circuit/block diagram, evaluation pipeline, and concept map.",
      "If multiple diagram types are implied, choose the primary type and mention secondary conventions in expertFraming.",
      "Use expertFraming to tell the downstream prompt expander what primitives, labels, regions, edge semantics, and layout rules matter for this type.",
      MAJOR_DIAGRAM_SUPPORT_INSTRUCTION,
      ICON_FIDELITY_INSTRUCTION,
      SUPPORTED_ICON_CATALOG_INSTRUCTION,
      DIAGRAM_TYPE_INFERENCE_SCHEMA_INSTRUCTION,
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ prompt })
  };
}

export function inferAndExpandDiagramPrompt(prompt: string) {
  return {
    systemPrompt: [
      "You infer the best expert diagram type from a user's freeform request and create the verbose expert prompt for diagram image generation.",
      "Do not choose from a fixed menu. Name the specific diagram type that best fits the user's intent.",
      "Preserve the user's intent while adding the diagram-type conventions a professional diagrammer would use.",
      "The expandedPrompt must request an optimized readable diagram with no overlapping labels, regions, lanes, node text, icons, or edge labels.",
      "The expandedPrompt must include relevant editable primitives: start/end terminators, input/output blocks, decisions, data stores, regions/swimlanes, icons/images, typed connectors, edge labels, and layout priorities when appropriate for the inferred type.",
      MAJOR_DIAGRAM_SUPPORT_INSTRUCTION,
      ICON_FIDELITY_INSTRUCTION,
      SUPPORTED_ICON_CATALOG_INSTRUCTION,
      "Keep expandedPrompt detailed enough for Gemini image generation and OpenAI visual extraction, but avoid unnecessary prose and examples that slow downstream calls.",
      EXPANDED_DIAGRAM_PROMPT_SCHEMA_INSTRUCTION,
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ prompt })
  };
}

export function expandDiagramTypePrompt(prompt: string, diagramType: string) {
  return {
    systemPrompt: [
      "You expand a user's short diagram request into a detailed generation prompt for a specific diagram type.",
      "Keep the user's intent, but add diagram-type-specific structure, expected nodes, edge labels, grouping guidance, and layout priorities.",
      "Explicitly request useful editable primitives where applicable: start/end terminators, input/output blocks, decisions, data stores, regions/swimlanes, icons, images, typed connectors, and readable edge labels.",
      "Require a clean optimized layout with no overlapping labels, no region/title collisions, and enough spacing for all node text and edge labels to remain readable.",
      "Do not generate XML or JSON. Return plain text only.",
      "The expanded prompt should be concise enough for a downstream DiagramSpec generator, but much more explicit than the user's original request."
    ].join("\n"),
    userPrompt: JSON.stringify({ diagramType, prompt })
  };
}

export function diagramXmlFromSpecPrompt(diagramSpec: DiagramSpec) {
  return {
    systemPrompt: [
      "You generate clean Draw.io / diagrams.net XML for a structured DiagramSpec.",
      "Prioritize round-trip editability, stable ids, and simple geometry.",
      "Return JSON with one string field named xml.",
      'Required JSON shape: { "xml": string }',
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ diagramSpec })
  };
}

export function verifyDiagramAgainstPromptPrompt(prompt: string, diagramSpec: DiagramSpec, diagramType?: string) {
  return {
    systemPrompt: [
      "You verify whether a rendered diagram and its structured DiagramSpec match the user's intended diagram.",
      "Compare the expanded user prompt, the rendered diagram image when supplied, and the current DiagramSpec.",
      "Look for missing nodes, wrong labels, incorrect edge direction, missing edge labels, misplaced decisions, missing start/end/input/output/data-store primitives, region/lane mistakes, and logical inconsistencies.",
      "Audit every visible text element and every DiagramSpec label: node labels, edge labels, group/region titles, icon captions, datastore labels, decision text, start/end text, input/output labels, and any generated annotations.",
      "Every label must be valid, necessary, descriptive, domain-appropriate, and non-placeholder. Reject labels that are generic, redundant, misleading, too terse to be useful, malformed, misspelled, hallucinated, visually clipped, or inconsistent with the prompt.",
      "Decision labels should be phrased as clear conditions or questions. Edge labels should describe the relationship, event, data, call, transition, or condition when that meaning matters. Region labels should describe the boundary or responsibility, not repeat child labels.",
      "Remove unnecessary text and duplicate labels. Add missing labels only when they improve comprehension or are required by the requested diagram type.",
      "The generated diagram is usually mostly correct. Be conservative: identify minor semantic/label fixes without rebuilding the diagram.",
      "Never remove nodes, remove edges, rename ids, change source/target ids, change group membership, or rewrite the whole DiagramSpec.",
      "If the diagram is acceptable, return matchesIntent=true and empty safeCorrections.",
      "If there are meaningful but localized errors, return matchesIntent=false and include only safeCorrections keyed by existing node, edge, or group ids.",
      "Safe corrections are limited to node label changes, edge label changes/additions, group title changes, and node type clarifications. Leave everything else untouched.",
      "Icon corrections are allowed only through nodeIcons for existing node ids and must align with nodeTypes; do not add decorative icons that are not semantically useful.",
      "Label correctness is a semantic requirement, not a cosmetic-only change. Still avoid purely stylistic changes that do not improve meaning, validity, or readability.",
      "Return JSON only.",
      "Required JSON shape:",
      "{",
      '  "matchesIntent": boolean,',
      '  "confidence": number,',
      '  "issues": string[],',
      '  "correctionSummary": string,',
      '  "safeCorrections": {',
      '    "nodeLabels": { [existingNodeId: string]: string },',
      '    "edgeLabels": { [existingEdgeId: string]: string },',
      '    "groupLabels": { [existingGroupId: string]: string },',
      '    "nodeTypes": { [existingNodeId: string]: string },',
      '    "nodeIcons": { [existingNodeId: string]: string },',
      '    "notes": string[]',
      "  }",
      "}",
      MAJOR_DIAGRAM_SUPPORT_INSTRUCTION,
      ICON_FIDELITY_INSTRUCTION,
      SUPPORTED_ICON_CATALOG_INSTRUCTION,
      RICH_DIAGRAM_ATTR_INSTRUCTION,
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ prompt, diagramType, diagramSpec })
  };
}

export function transformDiagramXmlPrompt(existingXml: string, editPlan: EditingAnalysis) {
  return {
    systemPrompt: [
      "You apply a structured edit plan to existing Draw.io XML.",
      "Preserve unchanged elements whenever possible.",
      "Return JSON with one string field named xml.",
      'Required JSON shape: { "xml": string }',
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
      'Required JSON shape: { "xml": string, "repairApplied": boolean, "notes": string[] }',
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
