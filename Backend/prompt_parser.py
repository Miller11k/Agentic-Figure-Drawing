from __future__ import annotations

import re

try:
    from .editing_models import ParsedEditIntent
except ImportError:
    from editing_models import ParsedEditIntent


SPATIAL_TERMS = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "top",
    "bottom",
    "left",
    "right",
    "center",
    "middle",
    "background",
    "foreground",
]

COLOR_WORDS = {
    "black",
    "white",
    "red",
    "blue",
    "green",
    "yellow",
    "orange",
    "purple",
    "pink",
    "gray",
    "grey",
    "brown",
    "gold",
    "silver",
}

ACTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("remove", re.compile(r"\b(remove|delete|erase|clear)\b", re.IGNORECASE)),
    ("move", re.compile(r"\b(move|shift|reposition)\b", re.IGNORECASE)),
    ("resize", re.compile(r"\b(resize|enlarge|shrink|widen|narrow)\b", re.IGNORECASE)),
    ("text_update", re.compile(r"\b(rename|retitle|relabel|change text|update text)\b", re.IGNORECASE)),
    ("style_update", re.compile(r"\b(restyle|recolor|make|change|turn)\b", re.IGNORECASE)),
    ("add", re.compile(r"\b(add|insert|place|create)\b", re.IGNORECASE)),
]


def parse_edit_intent(prompt_text: str) -> ParsedEditIntent:
    prompt = " ".join(prompt_text.strip().split())
    lowered = prompt.lower()

    action = "generic_edit"
    for candidate, pattern in ACTION_PATTERNS:
        if pattern.search(prompt):
            action = candidate
            break

    spatial_qualifiers = [term for term in SPATIAL_TERMS if term in lowered]
    referenced_labels = _extract_labels(prompt)
    preserve_constraints = _extract_preserve_constraints(prompt)
    exclusions = _extract_exclusions(prompt)
    target_attributes = _extract_target_attributes(prompt, action)
    target_entity = _extract_target_entity(prompt, action, spatial_qualifiers)

    confidence = 0.55
    if target_entity:
        confidence += 0.15
    if spatial_qualifiers:
        confidence += 0.1
    if target_attributes:
        confidence += 0.1
    if referenced_labels:
        confidence += 0.1

    ambiguity_notes: list[str] = []
    if not target_entity:
        ambiguity_notes.append("Could not confidently isolate the target entity from the prompt.")
    if action == "generic_edit":
        ambiguity_notes.append("Edit action fell back to a generic edit classification.")

    return ParsedEditIntent(
        raw_prompt=prompt,
        action=action,
        target_entity=target_entity or "image region",
        target_attributes=target_attributes,
        preserve_constraints=preserve_constraints,
        spatial_qualifiers=spatial_qualifiers,
        referenced_labels=referenced_labels,
        exclusions=exclusions,
        confidence=min(0.98, confidence),
        ambiguity_notes=ambiguity_notes,
    )


def _extract_labels(prompt: str) -> list[str]:
    quoted = re.findall(r'"([^"]+)"|\'([^\']+)\'', prompt)
    labels = [first or second for first, second in quoted]

    between_match = re.search(r"between\s+(.+?)\s+and\s+(.+)", prompt, re.IGNORECASE)
    if between_match:
        labels.extend([between_match.group(1).strip(), between_match.group(2).strip()])

    return [label for label in labels if label]


def _extract_preserve_constraints(prompt: str) -> list[str]:
    patterns = [
        r"keep (.+?) unchanged",
        r"leave (.+?) unchanged",
        r"without changing (.+?)(?:$|,)",
        r"preserve (.+?)(?:$|,)",
    ]
    constraints: list[str] = []
    for pattern in patterns:
        constraints.extend(match.strip() for match in re.findall(pattern, prompt, re.IGNORECASE))
    return constraints


def _extract_exclusions(prompt: str) -> list[str]:
    patterns = [
        r"do not change (.+?)(?:$|,)",
        r"don't change (.+?)(?:$|,)",
        r"except (.+?)(?:$|,)",
    ]
    exclusions: list[str] = []
    for pattern in patterns:
        exclusions.extend(match.strip() for match in re.findall(pattern, prompt, re.IGNORECASE))
    return exclusions


def _extract_target_attributes(prompt: str, action: str) -> dict[str, str]:
    attributes: dict[str, str] = {}
    lowered = prompt.lower()

    for color in COLOR_WORDS:
        if re.search(rf"\b{re.escape(color)}\b", lowered):
            attributes["color"] = color
            break

    if action == "text_update":
        rename_match = re.search(
            r"(?:rename|relabel|change text|update text)\s+.+?\s+to\s+(.+)",
            prompt,
            re.IGNORECASE,
        )
        if rename_match:
            attributes["text"] = rename_match.group(1).strip().strip('"\'')

    if "blueprint" in lowered:
        attributes["style"] = "blueprint"
    elif "sketch" in lowered:
        attributes["style"] = "sketch"
    elif "watercolor" in lowered:
        attributes["style"] = "watercolor"

    darker_match = re.search(r"make .+? darker", lowered)
    lighter_match = re.search(r"make .+? lighter", lowered)
    if darker_match:
        attributes["tone"] = "darker"
    if lighter_match:
        attributes["tone"] = "lighter"

    return attributes


def _extract_target_entity(prompt: str, action: str, spatial_qualifiers: list[str]) -> str:
    lowered = prompt.lower()

    if action == "remove":
        match = re.search(r"(?:remove|delete|erase|clear)\s+(.+?)(?:\s+in|\s+on|\s+at|$)", lowered)
        if match:
            return _cleanup_target(match.group(1), spatial_qualifiers)
    if action == "text_update":
        match = re.search(r"(?:rename|relabel|change text|update text)\s+(.+?)(?:\s+to|$)", lowered)
        if match:
            return _cleanup_target(match.group(1), spatial_qualifiers)
    if action in {"style_update", "add", "move", "resize"}:
        match = re.search(
            r"(?:change|make|turn|restyle|recolor|add|insert|place|create|move|shift|reposition|resize|enlarge|shrink)\s+(.+?)(?:\s+to|\s+into|\s+with|\s+in|\s+on|\s+at|$)",
            lowered,
        )
        if match:
            return _cleanup_target(match.group(1), spatial_qualifiers)

    if "arrow" in lowered or "connector" in lowered:
        return "connector"
    if "box" in lowered or "node" in lowered:
        return "node"

    return ""


def _cleanup_target(target: str, spatial_qualifiers: list[str]) -> str:
    cleaned = target
    for qualifier in spatial_qualifiers:
        cleaned = cleaned.replace(qualifier, "")
    cleaned = re.sub(r"\b(the|a|an|this|that|these|those)\b", " ", cleaned)
    cleaned = re.sub(
        r"\b(" + "|".join(sorted(COLOR_WORDS | {"darker", "lighter", "bigger", "smaller", "blueprint", "sketch"})) + r")\b",
        " ",
        cleaned,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.")
    return cleaned
