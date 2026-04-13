from __future__ import annotations

import base64
import copy
import html
import io
import re
import urllib.parse
import xml.etree.ElementTree as ET
import zlib
from collections import deque
from itertools import count
from typing import Optional

from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError
try:
    import pytesseract
except ImportError:  # pragma: no cover - optional dependency
    pytesseract = None

try:
    from .diagram_xml import parse_editable_diagram_xml, serialize_diagram_model
    from .editing_models import (
        BoundingBox,
        DiagramConnector,
        DiagramElement,
        DiagramModel,
        ExtractedAsset,
        ModeState,
        ModelRoutingDecision,
        ParsedEditIntent,
        RegionSelection,
        SelectedRegion,
    )
    from .generation_backend import GenerationBackend, GenerationRequest
except ImportError:
    from diagram_xml import parse_editable_diagram_xml, serialize_diagram_model
    from editing_models import (
        BoundingBox,
        DiagramConnector,
        DiagramElement,
        DiagramModel,
        ExtractedAsset,
        ModeState,
        ModelRoutingDecision,
        ParsedEditIntent,
        RegionSelection,
        SelectedRegion,
    )
    from generation_backend import GenerationBackend, GenerationRequest


DIAGRAM_ELEMENT_KEYWORDS = {
    "node": {"node", "box", "rectangle", "container", "block", "computer", "server", "database", "icon"},
    "connector": {"edge", "arrow", "connector", "connection", "line"},
    "label": {"label", "text", "caption", "title"},
}
TEXT_ELEMENT_TYPES = {"label", "text"}


def _is_text_element(element: DiagramElement) -> bool:
    return element.element_type in TEXT_ELEMENT_TYPES


def looks_like_drawio(filename: str | None, payload: bytes) -> bool:
    name = (filename or "").lower()
    if name.endswith(".drawio") or name.endswith(".xml"):
        return True
    head = payload[:512].decode("utf-8", errors="ignore")
    return "<mxfile" in head or "<mxGraphModel" in head


def looks_like_editable_diagram_xml(filename: str | None, payload: bytes) -> bool:
    name = (filename or "").lower()
    if name.endswith(".diagram.xml") or name.endswith(".editable.xml"):
        return True
    head = payload[:512].decode("utf-8", errors="ignore")
    return "<editable-diagram" in head


def analyze_diagram_payload(
    payload: bytes,
    filename: str | None = None,
    *,
    mode_override: str | None = None,
    source_image_ref: str | None = None,
    generation_backend: Optional[GenerationBackend] = None,
) -> Optional[DiagramModel]:
    if mode_override == "image":
        return None

    if looks_like_editable_diagram_xml(filename, payload):
        model = parse_editable_diagram_xml(payload)
        return refresh_diagram_metadata(model)

    if looks_like_drawio(filename, payload):
        return parse_drawio_document(payload)

    try:
        image = Image.open(io.BytesIO(payload)).convert("RGBA")
    except UnidentifiedImageError:
        return None

    detected = detect_raster_diagram(
        image,
        source_image_ref=source_image_ref or "source-upload",
        generation_backend=generation_backend,
    )
    if detected is not None:
        if mode_override in {"diagram", "hybrid"}:
            return refresh_diagram_metadata(detected, current_mode=mode_override, user_override=True)
        return detected

    if mode_override == "diagram":
        return refresh_diagram_metadata(
            _build_image_backed_diagram(image, source_image_ref or "forced-diagram-upload"),
            current_mode="diagram",
            auto_mode="image",
            user_override=True,
        )
    return None


def build_diagram_from_prompt(prompt_text: str, width: int = 1024, height: int = 720) -> DiagramModel:
    cleaned = prompt_text.strip()
    raw_parts = [part.strip() for part in re.split(r"\s*->\s*|\n+", cleaned) if part.strip()]
    if len(raw_parts) == 1 and "," in cleaned:
        raw_parts = [part.strip() for part in cleaned.split(",") if part.strip()]
    if not raw_parts:
        raw_parts = ["Start"]

    elements: list[DiagramElement] = []
    connectors: list[DiagramConnector] = []
    spacing = max(180, width // max(2, len(raw_parts)))
    top = max(120, height // 3)

    for index, label in enumerate(raw_parts):
        x = 80 + (index * spacing)
        y = top if index % 2 == 0 else top + 120
        elements.append(
            DiagramElement(
                element_id=f"node-{index + 1}",
                element_type="node",
                bbox=BoundingBox(x=x, y=y, width=180, height=84),
                label=label,
                fill_color="#fff7ec",
                stroke_color="#d96c2f",
                text_color="#1f2b24",
                style={"shape": "rectangle", "source": "prompt_template"},
                semantic_class="prompt_node",
                confidence=1.0,
            )
        )
        if index > 0:
            connectors.append(
                DiagramConnector(
                    connector_id=f"connector-{index}",
                    source_element_id=f"node-{index}",
                    target_element_id=f"node-{index + 1}",
                    stroke_color="#2d7b67",
                    style={"source": "prompt_template"},
                    semantic_class="arrow",
                    confidence=1.0,
                )
            )

    return refresh_diagram_metadata(
        DiagramModel(
            elements=elements,
            connectors=connectors,
            assets=[],
            width=width,
            height=height,
            source_format="prompt",
            detection_confidence=1.0,
            notes=["Created a new editable diagram canvas from the prompt."],
        ),
        current_mode="diagram",
        auto_mode="diagram",
        user_override=True,
    )


def refresh_diagram_metadata(
    model: DiagramModel,
    *,
    current_mode: str | None = None,
    auto_mode: str | None = None,
    user_override: bool | None = None,
) -> DiagramModel:
    updated = copy.deepcopy(model)
    inferred_auto = auto_mode or (updated.mode_state.auto_detected_mode if updated.mode_state else _infer_mode_from_model(updated))
    inferred_current = current_mode or (updated.mode_state.current_mode if updated.mode_state else inferred_auto)
    override_flag = user_override if user_override is not None else (
        updated.mode_state.user_override if updated.mode_state else False
    )
    updated.mode_state = ModeState(
        current_mode=inferred_current,
        auto_detected_mode=inferred_auto,
        user_override=override_flag,
        canvas_width=updated.width,
        canvas_height=updated.height,
    )
    updated.xml_representation = serialize_diagram_model(updated)
    return updated


def diagram_model_to_structured_data(model: DiagramModel) -> dict[str, object]:
    refreshed = refresh_diagram_metadata(model)
    elements: list[dict[str, object]] = []
    for element in refreshed.elements:
        payload: dict[str, object] = {
            "id": element.element_id,
            "type": "text" if _is_text_element(element) else element.element_type,
            "semantic_class": element.semantic_class,
            "position": {"x": element.bbox.x, "y": element.bbox.y},
            "dimensions": {"width": element.bbox.width, "height": element.bbox.height},
            "style": {
                "fill": element.fill_color,
                "stroke": element.stroke_color,
                "text": element.text_color,
                **element.style,
            },
            "confidence": element.confidence,
            "editability": element.editability,
        }
        if _is_text_element(element):
            payload["content"] = element.label
        else:
            payload["label"] = element.label
        if element.asset_id:
            payload["asset_id"] = element.asset_id
        elements.append(payload)

    connectors = [
        {
            "id": connector.connector_id,
            "from": connector.source_element_id,
            "to": connector.target_element_id,
            "type": connector.semantic_class or "arrow",
            "label": connector.label,
            "anchor_points": [{"x": point[0], "y": point[1]} for point in connector.anchor_points],
            "style": {"stroke": connector.stroke_color, **connector.style},
            "confidence": connector.confidence,
        }
        for connector in refreshed.connectors
    ]

    assets = [
        {
            "asset_id": asset.asset_id,
            "decision": asset.decision,
            "source_bounds": asset.source_bbox.to_dict(),
            "mime_type": asset.mime_type,
            "source_image_ref": asset.source_image_ref,
            "confidence": asset.confidence,
        }
        for asset in refreshed.assets
    ]

    return {
        "elements": elements,
        "connectors": connectors,
        "assets": assets,
        "mode": refreshed.mode_state.to_dict() if refreshed.mode_state else None,
        "notes": refreshed.notes,
        "xml": refreshed.xml_representation,
    }


def parse_drawio_document(payload: bytes) -> DiagramModel:
    xml_text = payload.decode("utf-8", errors="ignore").strip()
    root = ET.fromstring(xml_text)

    if root.tag == "mxfile":
        diagram = root.find("./diagram")
        if diagram is None:
            raise ValueError("draw.io document did not contain a diagram node.")
        graph_xml = _decode_drawio_diagram(diagram)
        graph_root = ET.fromstring(graph_xml)
    elif root.tag == "mxGraphModel":
        graph_root = root
    else:
        raise ValueError("Unsupported diagram XML payload.")

    elements: list[DiagramElement] = []
    connectors: list[DiagramConnector] = []
    assets: list[ExtractedAsset] = []
    max_right = 0
    max_bottom = 0

    for cell in graph_root.findall(".//mxCell"):
        cell_id = cell.get("id")
        if not cell_id or cell_id in {"0", "1"}:
            continue

        geometry = cell.find("mxGeometry")
        bbox = _geometry_to_bbox(cell, geometry)
        max_right = max(max_right, bbox.x + bbox.width)
        max_bottom = max(max_bottom, bbox.y + bbox.height)

        style = _parse_style(cell.get("style", ""))
        label = _extract_cell_label(cell.get("value", ""))

        if cell.get("vertex") == "1":
            asset_id = None
            image_ref = style.get("image")
            if image_ref and image_ref.startswith("data:image/"):
                asset_id = f"asset-{cell_id}"
                assets.append(
                    ExtractedAsset(
                        asset_id=asset_id,
                        source_bbox=bbox,
                        decision="copy",
                        mime_type=image_ref.split(":", 1)[1].split(";", 1)[0],
                        asset_data_url=image_ref,
                        source_image_ref="drawio-inline",
                        confidence=0.99,
                        notes=["Embedded image asset preserved from draw.io XML."],
                    )
                )

            elements.append(
                DiagramElement(
                    element_id=cell_id,
                    element_type="text" if style.get("text") == "1" else "node",
                    bbox=bbox,
                    label=label,
                    fill_color=style.get("fillColor", "#ffffff"),
                    stroke_color=style.get("strokeColor", "#1f2b24"),
                    text_color=style.get("fontColor", "#1f2b24"),
                    style=style,
                    semantic_class=_semantic_class_from_style(style),
                    asset_id=asset_id,
                    confidence=0.99,
                )
            )
        elif cell.get("edge") == "1":
            connectors.append(
                DiagramConnector(
                    connector_id=cell_id,
                    source_element_id=cell.get("source"),
                    target_element_id=cell.get("target"),
                    anchor_points=_extract_edge_points(geometry),
                    label=label,
                    stroke_color=style.get("strokeColor", "#1f2b24"),
                    style=style,
                    semantic_class="arrow" if style.get("endArrow", "classic") != "none" else "line",
                    confidence=0.99,
                )
            )

    return refresh_diagram_metadata(
        DiagramModel(
            elements=elements,
            connectors=connectors,
            assets=assets,
            width=max(512, max_right + 60),
            height=max(512, max_bottom + 60),
            source_format="drawio",
            detection_confidence=0.99,
            notes=["Loaded structured diagram data from draw.io XML."],
        ),
        current_mode="diagram",
        auto_mode="diagram",
    )


def detect_raster_diagram(
    image: Image.Image,
    *,
    source_image_ref: str = "source-upload",
    generation_backend: Optional[GenerationBackend] = None,
) -> Optional[DiagramModel]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    white_ratio = _white_ratio(rgba)
    components = _connected_components(rgba)

    elements, text_notes = _extract_text_elements(rgba)
    text_regions = [element.bbox for element in elements if _is_text_element(element)]
    connectors: list[DiagramConnector] = []
    assets: list[ExtractedAsset] = []
    routing_metadata: list[ModelRoutingDecision] = []
    asset_counter = count(1)
    node_count = 0
    connector_count = 0
    label_count = len(elements)

    for index, component in enumerate(components):
        bbox = component["bbox"]
        if bbox.area() < 70:
            continue
        if any(_bbox_overlap_ratio(bbox, text_bbox) >= 0.5 for text_bbox in text_regions):
            continue

        fill_ratio = component["pixels"] / max(1, bbox.area())
        element_type = _classify_component(bbox, fill_ratio)
        if element_type is None:
            continue

        crop = rgba.crop((bbox.x, bbox.y, bbox.x + bbox.width, bbox.y + bbox.height))
        route = _route_component(crop, element_type, bbox, fill_ratio)
        routing_metadata.append(
            ModelRoutingDecision(
                target_id=f"component-{index}",
                target_type=element_type,
                decision=route["decision"],
                assigned_task=route["assigned_task"],
                assigned_model=route["assigned_model"],
                reason=route["reason"],
                confidence=route["confidence"],
                fallback_strategy=route["fallback"],
            )
        )

        asset_id = None
        if route["decision"] in {"copy", "generate"} and element_type != "connector":
            asset_id = f"asset-{next(asset_counter):03d}"
            asset_image = crop
            if route["decision"] == "generate" and generation_backend is not None:
                asset_image = _maybe_refine_asset(crop, generation_backend, route["assigned_model"])
            assets.append(
                ExtractedAsset(
                    asset_id=asset_id,
                    source_bbox=bbox,
                    decision=route["decision"],
                    mime_type="image/png",
                    asset_data_url=_image_to_data_url(asset_image),
                    source_image_ref=source_image_ref,
                    confidence=route["confidence"],
                    notes=[route["reason"]],
                )
            )

        if element_type == "connector":
            connector_count += 1
            connectors.append(
                DiagramConnector(
                    connector_id=f"connector-{index}",
                    source_element_id=None,
                    target_element_id=None,
                    anchor_points=_connector_points_from_bbox(bbox),
                    stroke_color="#1f2b24",
                    style={"source": "raster_heuristic"},
                    semantic_class="arrow",
                    confidence=route["confidence"],
                )
            )
            continue

        if element_type == "node":
            node_count += 1
        elements.append(
            DiagramElement(
                element_id=f"element-{index}",
                element_type="text" if element_type == "label" else element_type,
                bbox=bbox,
                label="",
                fill_color="#ffffff" if element_type == "node" else "#00000000",
                stroke_color="#1f2b24",
                text_color="#1f2b24",
                style={"shape": "rectangle", "source": "raster_heuristic"},
                semantic_class=_semantic_class_for_component(element_type, bbox, crop),
                asset_id=asset_id,
                confidence=route["confidence"],
            )
        )

    connectors = _link_connectors(elements, connectors)
    confidence = min(
        0.95,
        (0.25 if white_ratio > 0.45 else 0.0)
        + min(0.35, node_count * 0.09)
        + min(0.20, connector_count * 0.06)
        + min(0.10, label_count * 0.03),
    )

    if confidence < 0.38 or node_count == 0:
        return None

    auto_mode = "diagram" if confidence >= 0.72 else "hybrid"
    return refresh_diagram_metadata(
        DiagramModel(
            elements=elements,
            connectors=connectors,
            assets=assets,
            width=width,
            height=height,
            source_format="raster",
            detection_confidence=confidence,
            routing_metadata=routing_metadata,
            notes=[
                *text_notes,
                "Detected a diagram-like raster image using layout and connector heuristics.",
                "Copied image regions are preserved as draggable assets when fidelity matters more than primitive reconstruction.",
            ],
        ),
        current_mode=auto_mode,
        auto_mode=auto_mode,
    )


def select_diagram_regions(model: DiagramModel, intent: ParsedEditIntent) -> RegionSelection:
    matched_elements, matched_connectors = _match_diagram_targets(model, intent)
    if not matched_elements and not matched_connectors:
        return RegionSelection(
            regions=[],
            confidence=0.0,
            mask_type="hard",
            affected_element_ids=[],
            rationale="No diagram element matched the edit intent with enough confidence.",
        )

    regions = [
        SelectedRegion(
            bbox=element.bbox,
            confidence=min(0.98, intent.confidence + 0.1),
            mask_type="hard",
            reason=f"Matched diagram element {element.element_id} for target '{intent.target_entity}'.",
            element_id=element.element_id,
        )
        for element in matched_elements
    ]
    regions.extend(
        SelectedRegion(
            bbox=_connector_bbox(model, connector),
            confidence=min(0.98, intent.confidence + 0.08),
            mask_type="hard",
            reason=f"Matched connector {connector.connector_id} for target '{intent.target_entity}'.",
            element_id=connector.connector_id,
        )
        for connector in matched_connectors
    )

    return RegionSelection(
        regions=regions,
        confidence=max((region.confidence for region in regions), default=0.0),
        mask_type="hard",
        affected_element_ids=[region.element_id for region in regions if region.element_id],
        rationale="Diagram edit is restricted to matched structured elements and connectors.",
    )


def apply_prompt_to_diagram_model(model: DiagramModel, intent: ParsedEditIntent) -> tuple[DiagramModel, RegionSelection]:
    updated = copy.deepcopy(model)
    matched_elements, matched_connectors = _match_diagram_targets(updated, intent)
    selection = select_diagram_regions(updated, intent)
    if not matched_elements and not matched_connectors:
        return refresh_diagram_metadata(updated), selection

    if intent.action == "remove":
        matched_element_ids = {element.element_id for element in matched_elements}
        matched_connector_ids = {connector.connector_id for connector in matched_connectors}
        updated.elements = [element for element in updated.elements if element.element_id not in matched_element_ids]
        updated.connectors = [
            connector
            for connector in updated.connectors
            if connector.connector_id not in matched_connector_ids
            and connector.source_element_id not in matched_element_ids
            and connector.target_element_id not in matched_element_ids
        ]
        updated.notes.append(
            f"Removed {len(matched_element_ids) + len(matched_connector_ids)} structured diagram target(s)."
        )
        return refresh_diagram_metadata(updated), selection

    for element in matched_elements:
        _apply_prompt_attributes_to_element(element, intent)
    for connector in matched_connectors:
        _apply_prompt_attributes_to_connector(connector, intent)

    updated.notes.append("Applied prompt-driven structured diagram edit.")
    return refresh_diagram_metadata(updated), selection


def apply_element_update(
    model: DiagramModel,
    *,
    element_id: str,
    label: Optional[str] = None,
    fill_color: Optional[str] = None,
    stroke_color: Optional[str] = None,
    text_color: Optional[str] = None,
    x: Optional[int] = None,
    y: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    source_id: Optional[str] = None,
    target_id: Optional[str] = None,
    semantic_class: Optional[str] = None,
    delete: bool = False,
) -> DiagramModel:
    updated = copy.deepcopy(model)
    connector = updated.get_connector(element_id)
    if connector is not None:
        if delete:
            updated.connectors = [existing for existing in updated.connectors if existing.connector_id != element_id]
            updated.notes.append(f"Deleted diagram connector {element_id}.")
            return refresh_diagram_metadata(updated)
        if label is not None:
            connector.label = label
        if stroke_color is not None:
            connector.stroke_color = stroke_color
        if source_id is not None:
            connector.source_element_id = source_id
        if target_id is not None:
            connector.target_element_id = target_id
        if semantic_class is not None:
            connector.semantic_class = semantic_class
        updated.notes.append(f"Updated diagram connector {element_id}.")
        return refresh_diagram_metadata(updated)

    if delete:
        removed_ids = {element_id}
        updated.elements = [element for element in updated.elements if element.element_id not in removed_ids]
        updated.connectors = [
            connector
            for connector in updated.connectors
            if connector.source_element_id not in removed_ids and connector.target_element_id not in removed_ids
        ]
        updated.notes.append(f"Deleted diagram element {element_id}.")
        return refresh_diagram_metadata(updated)

    element = updated.get_element(element_id)
    if element is None:
        raise KeyError(f"Diagram element '{element_id}' was not found.")
    if label is not None:
        element.label = label
    if fill_color is not None:
        element.fill_color = fill_color
    if stroke_color is not None:
        element.stroke_color = stroke_color
    if text_color is not None:
        element.text_color = text_color
    if semantic_class is not None:
        element.semantic_class = semantic_class
    if any(value is not None for value in (x, y, width, height)):
        element.bbox = BoundingBox(
            x=element.bbox.x if x is None else int(x),
            y=element.bbox.y if y is None else int(y),
            width=max(10, element.bbox.width if width is None else int(width)),
            height=max(10, element.bbox.height if height is None else int(height)),
        )
    updated.notes.append(f"Updated diagram element {element_id}.")
    return refresh_diagram_metadata(updated)


def add_diagram_element(
    model: DiagramModel,
    *,
    element_type: str,
    label: str = "",
    x: int = 120,
    y: int = 120,
    width: int = 180,
    height: int = 84,
    fill_color: str = "#ffffff",
    stroke_color: str = "#1f2b24",
    text_color: str = "#1f2b24",
    source_id: Optional[str] = None,
    target_id: Optional[str] = None,
    semantic_class: str = "generic",
) -> DiagramModel:
    updated = copy.deepcopy(model)
    if element_type in {"connector", "edge", "arrow"}:
        connector_id = _next_identifier("connector", [connector.connector_id for connector in updated.connectors])
        updated.connectors.append(
            DiagramConnector(
                connector_id=connector_id,
                source_element_id=source_id,
                target_element_id=target_id,
                stroke_color=stroke_color,
                label=label,
                semantic_class=semantic_class or "arrow",
                confidence=1.0,
            )
        )
        updated.notes.append(f"Added connector {connector_id}.")
        return refresh_diagram_metadata(updated)

    element_id = _next_identifier("element", [element.element_id for element in updated.elements])
    updated.elements.append(
        DiagramElement(
            element_id=element_id,
            element_type=element_type,
            bbox=BoundingBox(x=x, y=y, width=max(40, width), height=max(30, height)),
            label=label,
            fill_color=fill_color,
            stroke_color=stroke_color,
            text_color=text_color,
            style={"shape": "rectangle", "source": "interactive_editor"},
            semantic_class=semantic_class,
            confidence=1.0,
        )
    )
    updated.notes.append(f"Added {element_type} element {element_id}.")
    return refresh_diagram_metadata(updated)


def render_diagram_model(model: DiagramModel) -> bytes:
    image = Image.new("RGBA", (model.width, model.height), "#ffffff")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    assets_by_id = {asset.asset_id: asset for asset in model.assets}

    for connector in model.connectors:
        points = _connector_points(model, connector)
        if len(points) >= 2:
            draw.line(points, fill=connector.stroke_color, width=3)
            _draw_arrow_head(draw, points[-2], points[-1], connector.stroke_color)
            if connector.label:
                midpoint = points[len(points) // 2]
                draw.text((midpoint[0] + 4, midpoint[1] + 4), connector.label, fill="#1f2b24", font=font)

    for element in sorted(model.elements, key=lambda current: current.z_index):
        x1 = element.bbox.x
        y1 = element.bbox.y
        x2 = x1 + element.bbox.width
        y2 = y1 + element.bbox.height

        if element.asset_id and element.asset_id in assets_by_id:
            asset_image = _data_url_to_image(assets_by_id[element.asset_id].asset_data_url)
            if asset_image is not None:
                asset_image = asset_image.resize((element.bbox.width, element.bbox.height))
                image.alpha_composite(asset_image, (x1, y1))
                draw.rounded_rectangle((x1, y1, x2, y2), radius=12, outline=element.stroke_color, width=2)
        elif _is_text_element(element):
            draw.text((x1, y1), element.label, fill=element.text_color, font=font)
        else:
            if element.style.get("shape") in {"ellipse", "circle"}:
                draw.ellipse((x1, y1, x2, y2), fill=element.fill_color, outline=element.stroke_color, width=3)
            else:
                draw.rounded_rectangle(
                    (x1, y1, x2, y2),
                    radius=12,
                    fill=element.fill_color,
                    outline=element.stroke_color,
                    width=3,
                )

        if element.label and not _is_text_element(element):
            draw.multiline_text((x1 + 10, y1 + 10), element.label, fill=element.text_color, font=font, spacing=4)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _decode_drawio_diagram(diagram_node: ET.Element) -> str:
    if list(diagram_node):
        return ET.tostring(list(diagram_node)[0], encoding="unicode")

    raw = (diagram_node.text or "").strip()
    if raw.startswith("<mxGraphModel"):
        return raw
    decoded = base64.b64decode(raw)
    inflated = zlib.decompress(decoded, -15)
    return urllib.parse.unquote(inflated.decode("utf-8"))


def _parse_style(style_text: str) -> dict[str, str]:
    style: dict[str, str] = {}
    for entry in style_text.split(";"):
        if not entry:
            continue
        if "=" in entry:
            key, value = entry.split("=", 1)
            style[key] = value
        else:
            style[entry] = "1"
    return style


def _extract_cell_label(value: str) -> str:
    cleaned = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    cleaned = re.sub(r"<[^>]+>", "", cleaned)
    return html.unescape(cleaned).strip()


def _geometry_to_bbox(cell: ET.Element, geometry: ET.Element | None) -> BoundingBox:
    if geometry is None:
        return BoundingBox(0, 0, 120, 60)
    x = int(float(geometry.get("x", "0") or 0))
    y = int(float(geometry.get("y", "0") or 0))
    width = int(float(geometry.get("width", "120") or 120))
    height = int(float(geometry.get("height", "60") or 60))
    if cell.get("edge") == "1" and width == 0 and height == 0:
        points = _extract_edge_points(geometry)
        if points:
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            return BoundingBox(min(xs), min(ys), max(1, max(xs) - min(xs)), max(1, max(ys) - min(ys)))
        return BoundingBox(x, y, 60, 10)
    return BoundingBox(x=x, y=y, width=max(10, width), height=max(10, height))


def _extract_edge_points(geometry: ET.Element | None) -> list[tuple[int, int]]:
    if geometry is None:
        return []
    points: list[tuple[int, int]] = []
    for point in (
        geometry.find("./mxPoint[@as='sourcePoint']"),
        geometry.find("./mxPoint[@as='targetPoint']"),
    ):
        if point is not None:
            points.append((int(float(point.get("x", "0"))), int(float(point.get("y", "0")))))
    for point in geometry.findall(".//Array/mxPoint"):
        candidate = (int(float(point.get("x", "0"))), int(float(point.get("y", "0"))))
        if candidate not in points:
            points.append(candidate)
    return points


def _white_ratio(image: Image.Image) -> float:
    rgb = image.convert("RGB")
    pixels = rgb.load()
    total = rgb.width * rgb.height
    white_pixels = 0
    for x in range(rgb.width):
        for y in range(rgb.height):
            red, green, blue = pixels[x, y]
            if red > 235 and green > 235 and blue > 235:
                white_pixels += 1
    return white_pixels / max(1, total)


def _connected_components(image: Image.Image) -> list[dict]:
    grayscale = image.convert("L")
    width, height = grayscale.size
    pixels = grayscale.load()
    visited = [[False] * height for _ in range(width)]
    components: list[dict] = []

    for x in range(width):
        for y in range(height):
            if visited[x][y] or pixels[x, y] > 220:
                continue
            queue = deque([(x, y)])
            visited[x][y] = True
            points: list[tuple[int, int]] = []
            while queue:
                px, py = queue.popleft()
                points.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height and not visited[nx][ny] and pixels[nx, ny] <= 220:
                        visited[nx][ny] = True
                        queue.append((nx, ny))
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            components.append(
                {
                    "bbox": BoundingBox(min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1),
                    "pixels": len(points),
                }
            )
    return components


def _classify_component(bbox: BoundingBox, fill_ratio: float) -> Optional[str]:
    aspect_ratio = bbox.width / max(1, bbox.height)
    if bbox.width > 28 and bbox.height <= 28 and aspect_ratio >= 1.8 and fill_ratio <= 0.68:
        return "label"
    if max(bbox.width, bbox.height) > 24 and min(bbox.width, bbox.height) <= 8:
        return "connector"
    if bbox.width > 28 and bbox.height > 20 and 0.03 <= fill_ratio <= 0.92 and 0.35 <= aspect_ratio <= 6.5:
        return "node"
    return None


def _route_component(crop: Image.Image, element_type: str, bbox: BoundingBox, fill_ratio: float) -> dict[str, object]:
    if element_type == "connector":
        return {
            "decision": "primitive",
            "assigned_task": "diagram_cleanup",
            "assigned_model": "connector-reconstruction",
            "reason": "Thin linework is more editable as a structured connector than as copied raster pixels.",
            "confidence": 0.95,
            "fallback": "Copy the source pixels if connector reconstruction is too lossy.",
        }

    rgb_crop = crop.convert("RGB").resize((max(8, min(48, crop.width)), max(8, min(48, crop.height))))
    colors = rgb_crop.getcolors(maxcolors=4096) or []
    unique_colors = len(colors)
    extrema = crop.convert("L").getextrema()
    contrast = (extrema[1] - extrema[0]) if extrema else 0
    aspect_ratio = bbox.width / max(1, bbox.height)

    if element_type == "label":
        return {
            "decision": "copy",
            "assigned_task": "copy_asset",
            "assigned_model": "preserve-source",
            "reason": "Raster labels are preserved as copied assets because OCR is not guaranteed to be lossless.",
            "confidence": 0.72,
            "fallback": "Convert the label into editable text manually after import.",
        }
    if bbox.width < 42 or bbox.height < 42 or contrast < 22:
        return {
            "decision": "generate",
            "assigned_task": "asset_refine",
            "assigned_model": "diagram-cleanup-backend",
            "reason": "This component is small or low contrast, so a cleanup pass may make it reusable.",
            "confidence": 0.61,
            "fallback": "Reuse the original crop if refinement is unavailable.",
        }
    if unique_colors > 24 or fill_ratio > 0.58:
        return {
            "decision": "copy",
            "assigned_task": "copy_asset",
            "assigned_model": "preserve-source",
            "reason": "The component has enough visual identity that preserving source pixels is safer than reconstructing it.",
            "confidence": 0.88,
            "fallback": "Fallback to primitive reconstruction for simpler editing if copying proves noisy.",
        }
    if 0.55 <= aspect_ratio <= 4.5:
        return {
            "decision": "primitive",
            "assigned_task": "diagram_cleanup",
            "assigned_model": "shape-reconstruction",
            "reason": "The component looks geometric enough to recreate as an editable primitive.",
            "confidence": 0.78,
            "fallback": "Copy the crop if the primitive loses too much fidelity.",
        }
    return {
        "decision": "copy",
        "assigned_task": "copy_asset",
        "assigned_model": "preserve-source",
        "reason": "The component did not match a strong primitive pattern, so the source crop is preserved.",
        "confidence": 0.70,
        "fallback": "Fallback to a generated cleanup pass when the copied asset is too noisy.",
    }


def _extract_text_elements(image: Image.Image) -> tuple[list[DiagramElement], list[str]]:
    if pytesseract is None:
        return [], ["OCR is unavailable in this runtime, so raster text may remain image-backed instead of fully extracted."]

    try:
        ocr_data = pytesseract.image_to_data(
            image.convert("RGB"),
            output_type=pytesseract.Output.DICT,
            config="--psm 6",
        )
    except Exception:
        return [], ["Raster OCR failed, so the parser fell back to non-text component segmentation."]

    grouped: dict[tuple[int, int, int], dict[str, object]] = {}
    for index, raw_text in enumerate(ocr_data.get("text", [])):
        text = (raw_text or "").strip()
        confidence_text = str(ocr_data.get("conf", ["-1"])[index]).strip()
        try:
            confidence = float(confidence_text)
        except ValueError:
            confidence = -1.0
        if not text or confidence < 0:
            continue

        left = int(ocr_data.get("left", [0])[index])
        top = int(ocr_data.get("top", [0])[index])
        width = int(ocr_data.get("width", [0])[index])
        height = int(ocr_data.get("height", [0])[index])
        if width <= 2 or height <= 2:
            continue

        key = (
            int(ocr_data.get("block_num", [0])[index]),
            int(ocr_data.get("par_num", [0])[index]),
            int(ocr_data.get("line_num", [0])[index]),
        )
        group = grouped.setdefault(
            key,
            {
                "tokens": [],
                "bbox": BoundingBox(left, top, width, height),
                "confidence_values": [],
            },
        )
        group["tokens"].append(text)
        bbox = group["bbox"]
        x1 = min(bbox.x, left)
        y1 = min(bbox.y, top)
        x2 = max(bbox.x + bbox.width, left + width)
        y2 = max(bbox.y + bbox.height, top + height)
        group["bbox"] = BoundingBox(x1, y1, x2 - x1, y2 - y1)
        group["confidence_values"].append(confidence)

    elements: list[DiagramElement] = []
    for index, group in enumerate(grouped.values(), start=1):
        text = " ".join(token for token in group["tokens"] if token).strip()
        if not text:
            continue
        bbox = group["bbox"]
        confidence_values = group["confidence_values"] or [75.0]
        elements.append(
            DiagramElement(
                element_id=f"text-{index:03d}",
                element_type="text",
                bbox=bbox,
                label=text,
                fill_color="#00000000",
                stroke_color="#00000000",
                text_color="#1f2b24",
                style={"shape": "text_box", "source": "ocr"},
                semantic_class="text_label",
                editability=["move", "label", "style"],
                confidence=min(0.99, max(0.45, sum(confidence_values) / (len(confidence_values) * 100.0))),
                z_index=50,
            )
        )

    if elements:
        return elements, ["Extracted raster text into editable text boxes using OCR."]
    return [], ["No raster text was confidently extracted from the diagram image."]


def _bbox_overlap_ratio(left: BoundingBox, right: BoundingBox) -> float:
    overlap_x1 = max(left.x, right.x)
    overlap_y1 = max(left.y, right.y)
    overlap_x2 = min(left.x + left.width, right.x + right.width)
    overlap_y2 = min(left.y + left.height, right.y + right.height)
    if overlap_x2 <= overlap_x1 or overlap_y2 <= overlap_y1:
        return 0.0
    overlap_area = (overlap_x2 - overlap_x1) * (overlap_y2 - overlap_y1)
    return overlap_area / max(1, min(left.area(), right.area()))


def _semantic_class_for_component(element_type: str, bbox: BoundingBox, crop: Image.Image) -> str:
    if element_type == "connector":
        return "arrow"
    if element_type == "label":
        return "label"
    aspect_ratio = bbox.width / max(1, bbox.height)
    if 0.85 <= aspect_ratio <= 1.3 and bbox.width >= 40:
        return "icon_node"
    if aspect_ratio > 2.8:
        return "container"
    if crop.width >= 60 and crop.height >= 40:
        return "process_node"
    return "generic_node"


def _semantic_class_from_style(style: dict[str, str]) -> str:
    shape = style.get("shape", "")
    if shape in {"ellipse", "circle"}:
        return "ellipse_node"
    if "database" in shape:
        return "database"
    if style.get("image"):
        return "image_node"
    return "generic_node"


def _match_diagram_targets(
    model: DiagramModel,
    intent: ParsedEditIntent,
) -> tuple[list[DiagramElement], list[DiagramConnector]]:
    target_lower = intent.target_entity.lower()
    elements = model.elements
    connectors = model.connectors

    if any(keyword in target_lower for keyword in DIAGRAM_ELEMENT_KEYWORDS["connector"]):
        connectors = _match_connectors(model, intent)
        if connectors:
            return [], connectors

    if any(keyword in target_lower for keyword in DIAGRAM_ELEMENT_KEYWORDS["label"]):
        elements = [element for element in elements if _is_text_element(element)] or elements
    elif any(keyword in target_lower for keyword in DIAGRAM_ELEMENT_KEYWORDS["node"]):
        elements = [element for element in elements if not _is_text_element(element)] or elements

    if intent.referenced_labels:
        label_matches = [
            element
            for element in elements
            if any(label.lower() in (element.label or "").lower() for label in intent.referenced_labels)
        ]
        if label_matches:
            elements = label_matches

    if target_lower and target_lower not in {"image region", "connector", "node", "diagram"}:
        text_matches = [
            element
            for element in elements
            if target_lower in (element.label or "").lower() or target_lower in element.semantic_class.lower()
        ]
        if text_matches:
            elements = text_matches

    if intent.spatial_qualifiers:
        elements = _filter_by_spatial_qualifiers(elements, model.width, model.height, intent.spatial_qualifiers)
        connectors = _filter_connectors_by_spatial_qualifiers(
            model,
            connectors,
            model.width,
            model.height,
            intent.spatial_qualifiers,
        )

    return elements[:3], connectors[:3]


def _match_connectors(model: DiagramModel, intent: ParsedEditIntent) -> list[DiagramConnector]:
    if len(intent.referenced_labels) >= 2:
        labels = {element.element_id: (element.label or "").lower() for element in model.elements}
        left, right = intent.referenced_labels[:2]
        matches = []
        for connector in model.connectors:
            source_label = labels.get(connector.source_element_id or "", "")
            target_label = labels.get(connector.target_element_id or "", "")
            if (
                left.lower() in source_label and right.lower() in target_label
            ) or (
                right.lower() in source_label and left.lower() in target_label
            ):
                matches.append(connector)
        if matches:
            return matches
    return model.connectors


def _filter_by_spatial_qualifiers(
    elements: list[DiagramElement],
    width: int,
    height: int,
    qualifiers: list[str],
) -> list[DiagramElement]:
    ranked = elements
    for qualifier in qualifiers:
        if qualifier == "top":
            ranked = [element for element in ranked if element.bbox.center()[1] <= height * 0.45] or ranked
        elif qualifier == "bottom":
            ranked = [element for element in ranked if element.bbox.center()[1] >= height * 0.55] or ranked
        elif qualifier == "left":
            ranked = [element for element in ranked if element.bbox.center()[0] <= width * 0.45] or ranked
        elif qualifier == "right":
            ranked = [element for element in ranked if element.bbox.center()[0] >= width * 0.55] or ranked
        elif qualifier in {"center", "middle"}:
            ranked = [
                element
                for element in ranked
                if width * 0.25 <= element.bbox.center()[0] <= width * 0.75
                and height * 0.25 <= element.bbox.center()[1] <= height * 0.75
            ] or ranked
    return ranked


def _filter_connectors_by_spatial_qualifiers(
    model: DiagramModel,
    connectors: list[DiagramConnector],
    width: int,
    height: int,
    qualifiers: list[str],
) -> list[DiagramConnector]:
    ranked = connectors
    for qualifier in qualifiers:
        if qualifier == "top":
            ranked = [connector for connector in ranked if _connector_center(model, connector)[1] <= height * 0.45] or ranked
        elif qualifier == "bottom":
            ranked = [connector for connector in ranked if _connector_center(model, connector)[1] >= height * 0.55] or ranked
        elif qualifier == "left":
            ranked = [connector for connector in ranked if _connector_center(model, connector)[0] <= width * 0.45] or ranked
        elif qualifier == "right":
            ranked = [connector for connector in ranked if _connector_center(model, connector)[0] >= width * 0.55] or ranked
    return ranked


def _apply_prompt_attributes_to_element(element: DiagramElement, intent: ParsedEditIntent) -> None:
    if "color" in intent.target_attributes:
        element.fill_color = intent.target_attributes["color"]
    if "style" in intent.target_attributes:
        element.style["style_hint"] = intent.target_attributes["style"]
    if "text" in intent.target_attributes:
        element.label = intent.target_attributes["text"]
    if intent.action == "text_update" and not intent.target_attributes.get("text"):
        replacement = _extract_replacement_text(intent.raw_prompt)
        if replacement:
            element.label = replacement


def _apply_prompt_attributes_to_connector(connector: DiagramConnector, intent: ParsedEditIntent) -> None:
    if "color" in intent.target_attributes:
        connector.stroke_color = intent.target_attributes["color"]
    if "style" in intent.target_attributes:
        connector.style["style_hint"] = intent.target_attributes["style"]
    if "text" in intent.target_attributes:
        connector.label = intent.target_attributes["text"]


def _extract_replacement_text(prompt: str) -> str:
    match = re.search(r"\bto\s+(.+)$", prompt, re.IGNORECASE)
    if not match:
        return ""
    return match.group(1).strip().strip('"\'')


def _connector_bbox(model: DiagramModel, connector: DiagramConnector) -> BoundingBox:
    points = _connector_points(model, connector)
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return BoundingBox(min(xs), min(ys), max(1, max(xs) - min(xs)), max(1, max(ys) - min(ys)))


def _connector_center(model: DiagramModel, connector: DiagramConnector) -> tuple[float, float]:
    return _connector_bbox(model, connector).center()


def _connector_points(model: DiagramModel, connector: DiagramConnector) -> list[tuple[int, int]]:
    if connector.anchor_points:
        return connector.anchor_points
    elements = {element.element_id: element for element in model.elements}
    source = elements.get(connector.source_element_id or "")
    target = elements.get(connector.target_element_id or "")
    if source and target:
        return [tuple(map(int, source.bbox.center())), tuple(map(int, target.bbox.center()))]
    return [(0, 0), (40, 40)]


def _connector_points_from_bbox(bbox: BoundingBox) -> list[tuple[int, int]]:
    if bbox.width >= bbox.height:
        mid_y = bbox.y + (bbox.height // 2)
        return [(bbox.x, mid_y), (bbox.x + bbox.width, mid_y)]
    mid_x = bbox.x + (bbox.width // 2)
    return [(mid_x, bbox.y), (mid_x, bbox.y + bbox.height)]


def _link_connectors(elements: list[DiagramElement], connectors: list[DiagramConnector]) -> list[DiagramConnector]:
    nodes = [element for element in elements if not _is_text_element(element)]
    if len(nodes) < 2:
        return connectors
    for connector in connectors:
        points = connector.anchor_points or [(0, 0), (0, 0)]
        start = points[0]
        end = points[-1]
        source = min(nodes, key=lambda element: _distance(start, element.bbox.center()))
        target_candidates = [element for element in nodes if element.element_id != source.element_id]
        if not target_candidates:
            continue
        target = min(target_candidates, key=lambda element: _distance(end, element.bbox.center()))
        connector.source_element_id = source.element_id
        connector.target_element_id = target.element_id
        source_anchor = _anchor_point_towards(source.bbox, target.bbox.center())
        target_anchor = _anchor_point_towards(target.bbox, source.bbox.center())
        if len(points) > 2:
            connector.anchor_points = [source_anchor, *points[1:-1], target_anchor]
        else:
            connector.anchor_points = [source_anchor, target_anchor]
    return connectors


def _distance(point: tuple[int, int] | tuple[float, float], center: tuple[float, float]) -> float:
    return ((point[0] - center[0]) ** 2 + (point[1] - center[1]) ** 2) ** 0.5


def _anchor_point_towards(bbox: BoundingBox, target_center: tuple[float, float]) -> tuple[int, int]:
    center_x, center_y = bbox.center()
    dx = target_center[0] - center_x
    dy = target_center[1] - center_y
    if abs(dx) >= abs(dy):
        return (
            int(bbox.x + bbox.width if dx >= 0 else bbox.x),
            int(center_y),
        )
    return (
        int(center_x),
        int(bbox.y + bbox.height if dy >= 0 else bbox.y),
    )


def _build_image_backed_diagram(image: Image.Image, source_image_ref: str) -> DiagramModel:
    bbox = BoundingBox(80, 80, max(180, image.width - 160), max(120, image.height - 160))
    asset = ExtractedAsset(
        asset_id="asset-001",
        source_bbox=BoundingBox(0, 0, image.width, image.height),
        decision="copy",
        mime_type="image/png",
        asset_data_url=_image_to_data_url(image),
        source_image_ref=source_image_ref,
        confidence=1.0,
        notes=["Full-image fallback asset preserved for manual diagram editing."],
    )
    return DiagramModel(
        elements=[
            DiagramElement(
                element_id="element-001",
                element_type="node",
                bbox=bbox,
                label="Imported visual",
                fill_color="#ffffff",
                stroke_color="#1f2b24",
                text_color="#1f2b24",
                style={"shape": "rectangle", "source": "forced-diagram"},
                semantic_class="copied_visual",
                asset_id=asset.asset_id,
                confidence=1.0,
            )
        ],
        connectors=[],
        assets=[asset],
        width=max(image.width, 512),
        height=max(image.height, 512),
        source_format="forced-raster",
        detection_confidence=0.45,
        routing_metadata=[
            ModelRoutingDecision(
                target_id="element-001",
                target_type="node",
                decision="copy",
                assigned_task="copy_asset",
                assigned_model="preserve-source",
                reason="Manual diagram override preserved the full source image as one editable asset.",
                confidence=1.0,
                fallback_strategy="The user can split this asset into more structure through direct editing.",
            )
        ],
        notes=["Created a diagram canvas from the full uploaded image because diagram mode was forced."],
    )


def _infer_mode_from_model(model: DiagramModel) -> str:
    if model.source_format in {"drawio", "prompt", "editable-xml"}:
        return "diagram"
    return "diagram" if model.detection_confidence >= 0.72 else "hybrid"


def _maybe_refine_asset(crop: Image.Image, generation_backend: GenerationBackend, model_name: str) -> Image.Image:
    resolved_model_name = _resolve_runtime_asset_model_name(model_name)
    request = GenerationRequest(
        prompt_text="Clean isolated diagram asset, preserve silhouette and colors, plain background.",
        model_name=resolved_model_name,
        input_image=_image_to_png_bytes(crop),
        denoise=0.35,
        steps=16,
        cfg=6.5,
        task_type="asset_refine",
    )
    try:
        refined = generation_backend.refine_asset(request)
        return Image.open(io.BytesIO(refined)).convert("RGBA")
    except Exception:
        return crop


def _resolve_runtime_asset_model_name(model_name: str | None) -> str | None:
    candidate = (model_name or "").strip().lower()
    if not candidate:
        return None
    if candidate in {
        "diagram-cleanup-backend",
        "connector-reconstruction",
        "shape-reconstruction",
        "preserve-source",
    }:
        return None
    return model_name


def _image_to_data_url(image: Image.Image) -> str:
    return f"data:image/png;base64,{base64.b64encode(_image_to_png_bytes(image)).decode('ascii')}"


def _image_to_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _data_url_to_image(data_url: str) -> Optional[Image.Image]:
    if not data_url or "," not in data_url:
        return None
    try:
        _, data = data_url.split(",", 1)
        return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGBA")
    except Exception:
        return None


def _next_identifier(prefix: str, identifiers: list[str]) -> str:
    used = set(identifiers)
    index = 1
    while f"{prefix}-{index:03d}" in used:
        index += 1
    return f"{prefix}-{index:03d}"


def _draw_arrow_head(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color: str) -> None:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    if dx == 0 and dy == 0:
        return
    length = max(1.0, (dx * dx + dy * dy) ** 0.5)
    ux = dx / length
    uy = dy / length
    left = (int(end[0] - 12 * ux + 6 * uy), int(end[1] - 12 * uy - 6 * ux))
    right = (int(end[0] - 12 * ux - 6 * uy), int(end[1] - 12 * uy + 6 * ux))
    draw.polygon([end, left, right], fill=color)
