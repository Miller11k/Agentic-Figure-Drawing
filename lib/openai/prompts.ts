import type { DiagramModel, DiagramSpec, DiagramTargetAnalysis, EditingAnalysis, EditorMode } from "@/types";
import { supportedDiagramIconPromptCatalog } from "@/lib/diagram/icon-catalog";

export const JSON_ONLY_INSTRUCTION =
  "Return only valid JSON. Do not include markdown fences, commentary, or extra text.";

const AGENTIC_BEHAVIOR_INSTRUCTION = [
  "AGENTIC BEHAVIOR REQUIREMENTS:",
  "- Act as a multi-step reasoning system, even if only one response is returned.",
  "- Internally decompose the task into: interpretation -> structuring -> validation -> optimization.",
  "- Always optimize for EDITABILITY over visual approximation.",
  "- Prefer explicit structure over implicit inference.",
  "- When ambiguity exists, choose the most standard diagram convention and note assumptions in reasoningSummary.",
  "- Never collapse distinct semantic elements into a single node.",
  "- Every meaningful visual or semantic element must map to a structured object: node, edge, or group.",
  "- Prefer localized repairs and refinements over full regeneration.",
  "- Preserve stable ids whenever possible."
].join("\n");

const EDGE_READABILITY_LAYOUT_INSTRUCTION = [
  "EDGE READABILITY AND ROUTING REQUIREMENTS:",
  "- Minimize unnecessary edge crossings.",
  "- Minimize overlapping arrows and connector segments.",
  "- Avoid routing edges through nodes, labels, group titles, or lane headers.",
  "- Separate parallel edges so they remain distinguishable.",
  "- Prefer orthogonal or elbow routing when it improves readability.",
  "- Use extra spacing around dense hubs and decision nodes.",
  "- Route connectors around groups and containers instead of through them when possible.",
  "- Favor layouts that reduce visual ambiguity over strict visual symmetry."
].join("\n");

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
  '- Edge attributes may include raw Draw.io style, strokeColor, dashed, rounded, edgeStyle, endArrow, startArrow, strokeWidth, labelBackgroundColor, labelBorderColor, labelPosition, connectorSpacing, and label placement hints.',
  '- Group attributes may include raw Draw.io swimlane/container style, fillColor, strokeColor, dashed, collapsible, and region/lane semantics.',
  "Preserve edge labels, visual regions, lanes, icons, cloud/user/database/document/queue/input/output/decision/start/end shapes, arrow styles, dashed lines, and nested/grouped regions whenever visible.",
  "Use layoutHints to request readability when useful: avoidOverlaps, preserveVisualLayout, labelPadding, regionPadding, preferredDirection, edgeRouting, fitToContent, minimizeEdgeCrossings, separateParallelEdges, connectorSpacing, routeAroundGroups, avoidEdgeLabelCollisions, and hubSpacing."
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
  "- During validation, verify that every icon/type matches the node label, diagram family, and surrounding relationships. Correct wrong icons by returning nodeTypes and nodeIcons for existing node ids only.",
  "ICON SELECTION PRIORITY:",
  "1. Exact semantic match from catalog",
  "2. Closest functional equivalent",
  "3. Generic diagram primitive only if necessary",
  "4. Custom icon as a last resort",
  "ICON VALIDATION:",
  "- Every node.type must be justified by its label, connections, and diagram context.",
  "- If semantic correctness conflicts with visual similarity, prefer semantic correctness.",
  "EXAMPLES:",
  '- "User" -> actor icon, not rectangle.',
  '- "Database" -> cylinder, not generic box.',
  '- "Decision" -> diamond, never rectangle.'
].join("\n");

const STRUCTURAL_COMPLETENESS_INSTRUCTION = [
  "STRUCTURAL COMPLETENESS REQUIREMENTS:",
  "- Every meaningful noun in the prompt should map to at least one node or group.",
  "- Every meaningful verb, transition, or action should map to an edge or relationship when applicable.",
  "- Every conditional should map to a decision node with labeled branches when appropriate.",
  "- Every boundary, role, phase, system, or region should be represented as a group when that boundary matters.",
  "EDGE SEMANTICS:",
  "- All edges must be directional unless explicitly undirected.",
  "- Prefer labeled edges when the relationship is not obvious from context.",
  '- Encode protocols, actions, data flow, or transitions in edge labels when relevant, such as "HTTP Request", "Auth Token", "Publishes Event", or "Reads From".',
  "LAYOUT INTELLIGENCE:",
  "- Infer layout direction such as top-down or left-right from the diagram type and prompt.",
  "- Group related nodes spatially.",
  "- Minimize unnecessary edge crossings and overlapping connectors.",
  "- Avoid routing edges directly through nodes, group labels, or dense text regions.",
  "- Separate parallel edges so they remain visually distinguishable.",
  "- Prefer orthogonal or elbow routing when it improves readability.",
  "- Reserve extra whitespace around hubs, decision points, and heavily connected nodes.",
  "- Align nodes consistently within groups and lanes.",
  "FAILURE MODE:",
  "- If the prompt is underspecified, generate a minimal but valid diagram with standard assumptions.",
  "- Never return empty nodes, edges, groups, layoutHints, or styleHints unless truly inapplicable."
].join("\n");

const VISUAL_SEGMENTATION_INSTRUCTION = [
  "VISUAL SEGMENTATION REQUIREMENTS:",
  "- Treat the reference image as a composition of discrete components:",
  "  1. Text regions -> node labels, edge labels, or group labels",
  "  2. Icons or pictures -> image/icon nodes",
  "  3. Lines and arrows -> edges",
  "  4. Containers, lanes, and regions -> groups",
  "- Perform implicit segmentation and separate adjacent visual units unless they clearly form one component.",
  "CONNECTOR RECONSTRUCTION:",
  "- Reconstruct edges by tracing arrowheads, line styles, and visual endpoints.",
  "- Infer direction from arrowheads and connector conventions.",
  "- Preserve dashed vs solid and other visible line semantics in edge attributes.",
  "- If the source image contains cluttered or overlapping connectors, preserve the semantic relationships while reconstructing a cleaner editable routing plan.",
  "TEXT HANDLING:",
  "- All visible text must become structured text in node.label, edge.label, or group.label.",
  "- Never leave meaningful text trapped only inside image blobs when it can be extracted structurally.",
  "GEOMETRY PRESERVATION:",
  "- Preserve approximate relative positioning through layoutHints and geometry hints.",
  "- Set preserveVisualLayout=true when reconstructing from images.",
  "STRICT RULE:",
  "- The resulting DiagramSpec must be fully editable without referring back to the original image."
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

const EDIT_INTENT_RESOLUTION_INSTRUCTION = [
  "INTENT RESOLUTION RULES:",
  '- If the user says "change X to Y", prefer actionType="rename" when the target persists and only its label/name changes.',
  "- If the user implies a replacement of semantics or iconography rather than only label text, represent that in attributes.",
  "- If the user implies spatial movement or repositioning, include spatialHints.",
  "- If the request implies multiple edits, break it into atomic operations in a stable execution order.",
  "- If ambiguity exists, choose the most likely interpretation and include ambiguityFlags explaining what was uncertain.",
  "STRICTNESS:",
  "- Never drop parts of the user's request.",
  "- Always preserve rawPrompt exactly.",
  "- Prefer minimal edits that satisfy the request while preserving existing structure."
].join("\n");

const SEMANTIC_VALIDATION_INSTRUCTION = [
  "SEMANTIC VALIDATION CHECKLIST:",
  "- Are all required entities present?",
  "- Are relationships correct and directional?",
  "- Are decision branches logically complete when a decision exists?",
  "- Are any nodes duplicated unnecessarily?",
  "- Are any required edges missing?",
  "- Are there unnecessary edge crossings or overlapping connectors that materially reduce readability?",
  "- Are edge labels readable and placed away from visual collisions when possible?",
  "LABEL QUALITY RULES:",
  "- Labels must be meaningful, non-placeholder, non-generic, domain-appropriate, and readable.",
  '- Avoid vague labels like "Process", "Step", or "Thing" unless that is truly the intended domain label.',
  "CRITICAL:",
  "- Prefer fixing labels, node types, edge routing guidance, and minor semantics over restructuring.",
  "- Never recommend full regeneration for minor defects."
].join("\n");

export function parseEditIntentPrompt(prompt: string, mode: EditorMode) {
  return {
    systemPrompt: [
      "You parse user editing prompts for a stateful diagram and image editing app.",
      "Map the request into the required ParsedEditIntent schema.",
      "Use actionType and targetType values exactly from the schema.",
      "Set confidence from 0 to 1.",
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDIT_INTENT_RESOLUTION_INSTRUCTION,
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
      "Prefer the smallest set of targets that completely satisfies the edit intent.",
      "When multiple plausible targets exist, preserve ambiguity in ambiguityFlags rather than hallucinating certainty.",
      AGENTIC_BEHAVIOR_INSTRUCTION,
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
      "Break multi-part requests into atomic operations in execution order.",
      "Return the EditingAnalysis schema.",
      AGENTIC_BEHAVIOR_INSTRUCTION,
      PARSED_EDIT_INTENT_SCHEMA_INSTRUCTION,
      EDIT_INTENT_RESOLUTION_INSTRUCTION,
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
      "Optimize the diagram for readability: minimize edge crossings, avoid overlapping arrows, and keep connector routing legible.",
      "When multiple reasonable layouts exist, choose the one with the fewest connector intersections and the clearest group boundaries.",
      "Use layoutHints to encourage orthogonal routing, extra spacing around dense areas, and separation of parallel edges when useful.",
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDGE_READABILITY_LAYOUT_INSTRUCTION,
      MAJOR_DIAGRAM_SUPPORT_INSTRUCTION,
      ICON_FIDELITY_INSTRUCTION,
      STRUCTURAL_COMPLETENESS_INSTRUCTION,
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
      "Preserve semantic layout, but improve readability where possible by reducing unnecessary edge overlaps and crossings during reconstruction.",
      "If the source image contains messy or visually ambiguous connector routing, preserve the relationships while choosing a cleaner editable routing plan.",
      "Set layoutHints to request an optimized readable layout with avoidOverlaps=true, preserveVisualLayout=true, fitToContent=true, generous regionPadding, edgeRouting='orthogonal', minimizeEdgeCrossings=true, separateParallelEdges=true, routeAroundGroups=true, avoidEdgeLabelCollisions=true, and hubSpacing='generous'.",
      "Keep ids stable, short, and descriptive. Do not describe the image; return the DiagramSpec JSON only.",
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDGE_READABILITY_LAYOUT_INSTRUCTION,
      VISUAL_SEGMENTATION_INSTRUCTION,
      MAJOR_DIAGRAM_SUPPORT_INSTRUCTION,
      ICON_FIDELITY_INSTRUCTION,
      STRUCTURAL_COMPLETENESS_INSTRUCTION,
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
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDGE_READABILITY_LAYOUT_INSTRUCTION,
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
      "The expandedPrompt must explicitly request connector routing that minimizes edge crossings, avoids overlapping arrows where possible, and keeps lines out of text-heavy areas.",
      "The expandedPrompt must include relevant editable primitives: start/end terminators, input/output blocks, decisions, data stores, regions/swimlanes, icons/images, typed connectors, edge labels, and layout priorities when appropriate for the inferred type.",
      "Prefer orthogonal or elbow connectors in structured diagrams when they reduce clutter and improve readability.",
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDGE_READABILITY_LAYOUT_INSTRUCTION,
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
      "Explicitly request connector routing that minimizes edge crossings, avoids overlapping arrows, separates parallel flows, and routes around groups and dense text areas when possible.",
      "Prefer orthogonal connectors for architecture, flowchart, process, and infrastructure diagrams when that improves readability.",
      "Do not generate XML or JSON. Return plain text only.",
      "The expanded prompt should be concise enough for a downstream DiagramSpec generator, but much more explicit than the user's original request.",
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDGE_READABILITY_LAYOUT_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ diagramType, prompt })
  };
}

export function diagramXmlFromSpecPrompt(diagramSpec: DiagramSpec) {
  return {
    systemPrompt: [
      "You generate clean Draw.io / diagrams.net XML for a structured DiagramSpec.",
      "Prioritize round-trip editability, stable ids, and simple geometry.",
      "Prefer editable shapes, groups, and connectors over flattened visual hacks.",
      "Respect layoutHints related to edge routing, connector spacing, and edge crossing minimization whenever possible.",
      "Return JSON with one string field named xml.",
      'Required JSON shape: { "xml": string }',
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDGE_READABILITY_LAYOUT_INSTRUCTION,
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
      "Treat major connector clutter, overlapping arrows, and excessive edge crossings as meaningful readability defects.",
      "If safeCorrections are insufficient to fully fix routing, use notes to recommend improved layoutHints such as minimizeEdgeCrossings, separateParallelEdges, connectorSpacing, and orthogonal routing.",
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
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDGE_READABILITY_LAYOUT_INSTRUCTION,
      SEMANTIC_VALIDATION_INSTRUCTION,
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
      "Do not rewrite unrelated parts of the diagram.",
      "Respect routing and layout-related edit attributes when present, especially those that reduce connector overlap and edge crossings.",
      "Return JSON with one string field named xml.",
      'Required JSON shape: { "xml": string }',
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDGE_READABILITY_LAYOUT_INSTRUCTION,
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
      "Prefer the smallest repair that restores validity and editability.",
      "When multiple valid repairs exist, prefer the one that preserves connector readability and minimizes visual clutter.",
      "Return JSON with fields xml, repairApplied, and notes.",
      'Required JSON shape: { "xml": string, "repairApplied": boolean, "notes": string[] }',
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDGE_READABILITY_LAYOUT_INSTRUCTION,
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

export function refineDiagramSpecPrompt(diagramSpec: DiagramSpec, prompt?: string, diagramType?: string) {
  return {
    systemPrompt: [
      "You refine an existing DiagramSpec to improve readability, semantic clarity, layout structure, and labeling quality.",
      "Do not add or remove core nodes unless absolutely necessary.",
      "Do improve ambiguous labels, edge descriptions, node typing, grouping quality, and layoutHints.",
      "Prefer normalization and refinement over structural churn.",
      "Actively improve routing readability by reducing unnecessary edge crossings, overlapping arrows, and dense connector clutter when possible without changing core semantics.",
      "Return updated DiagramSpec JSON only.",
      AGENTIC_BEHAVIOR_INSTRUCTION,
      EDGE_READABILITY_LAYOUT_INSTRUCTION,
      SEMANTIC_VALIDATION_INSTRUCTION,
      MAJOR_DIAGRAM_SUPPORT_INSTRUCTION,
      ICON_FIDELITY_INSTRUCTION,
      STRUCTURAL_COMPLETENESS_INSTRUCTION,
      SUPPORTED_ICON_CATALOG_INSTRUCTION,
      DIAGRAM_SPEC_SCHEMA_INSTRUCTION,
      RICH_DIAGRAM_ATTR_INSTRUCTION,
      JSON_ONLY_INSTRUCTION
    ].join("\n"),
    userPrompt: JSON.stringify({ diagramSpec, prompt, diagramType })
  };
}