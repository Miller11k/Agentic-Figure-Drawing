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
from typing import Optional

from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError

try:
    from .editing_models import BoundingBox, DiagramElement, DiagramModel, ParsedEditIntent, RegionSelection, SelectedRegion
except ImportError:
    from editing_models import BoundingBox, DiagramElement, DiagramModel, ParsedEditIntent, RegionSelection, SelectedRegion


DIAGRAM_ELEMENT_KEYWORDS = {
    "node": {"node", "box", "rectangle", "container", "block"},
    "edge": {"edge", "arrow", "connector", "connection", "line"},
    "label": {"label", "text", "caption", "title"},
}


def looks_like_drawio(filename: str | None, payload: bytes) -> bool:
    name = (filename or "").lower()
    if name.endswith(".drawio") or name.endswith(".xml"):
        return True

    head = payload[:512].decode("utf-8", errors="ignore")
    return "<mxfile" in head or "<mxGraphModel" in head


def analyze_diagram_payload(payload: bytes, filename: str | None = None) -> Optional[DiagramModel]:
    if looks_like_drawio(filename, payload):
        return parse_drawio_document(payload)

    try:
        image = Image.open(io.BytesIO(payload)).convert("RGBA")
    except UnidentifiedImageError:
        return None
    return detect_raster_diagram(image)


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
            elements.append(
                DiagramElement(
                    element_id=cell_id,
                    element_type="node",
                    bbox=bbox,
                    label=label,
                    fill_color=style.get("fillColor", "#ffffff"),
                    stroke_color=style.get("strokeColor", "#1f2b24"),
                    text_color=style.get("fontColor", "#1f2b24"),
                    style=style,
                )
            )
        elif cell.get("edge") == "1":
            elements.append(
                DiagramElement(
                    element_id=cell_id,
                    element_type="edge",
                    bbox=bbox,
                    label=label,
                    stroke_color=style.get("strokeColor", "#1f2b24"),
                    text_color=style.get("fontColor", "#1f2b24"),
                    points=_extract_edge_points(geometry),
                    source_id=cell.get("source"),
                    target_id=cell.get("target"),
                    style=style,
                )
            )

    width = max(512, max_right + 60)
    height = max(512, max_bottom + 60)
    notes = ["Loaded structured diagram data from draw.io XML."]

    return DiagramModel(
        elements=elements,
        width=width,
        height=height,
        source_format="drawio",
        detection_confidence=0.99,
        is_editable=True,
        notes=notes,
    )


def detect_raster_diagram(image: Image.Image) -> Optional[DiagramModel]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    white_ratio = _white_ratio(rgba)
    components = _connected_components(rgba)

    elements: list[DiagramElement] = []
    node_count = 0
    edge_count = 0

    for index, component in enumerate(components):
        bbox = component["bbox"]
        if bbox.area() < 80:
            continue

        fill_ratio = component["pixels"] / max(1, bbox.area())
        element_type = _classify_component(bbox, fill_ratio)
        if element_type is None:
            continue

        if element_type == "node":
            node_count += 1
        if element_type == "edge":
            edge_count += 1

        elements.append(
            DiagramElement(
                element_id=f"raster-{index}",
                element_type=element_type,
                bbox=bbox,
                label="",
                fill_color="#ffffff" if element_type == "node" else "#00000000",
                stroke_color="#1f2b24",
                text_color="#1f2b24",
                style={"source": "raster_heuristic"},
            )
        )

    confidence = min(
        0.95,
        (0.35 if white_ratio > 0.45 else 0.0)
        + min(0.35, node_count * 0.08)
        + min(0.25, edge_count * 0.05),
    )

    if confidence < 0.45 or node_count == 0:
        return None

    notes = [
        "Detected a diagram-like raster image using white background and component-layout heuristics.",
        "Raster diagram extraction is approximate; labels may need manual editing.",
    ]
    return DiagramModel(
        elements=elements,
        width=width,
        height=height,
        source_format="raster",
        detection_confidence=confidence,
        is_editable=True,
        notes=notes,
    )


def select_diagram_regions(model: DiagramModel, intent: ParsedEditIntent) -> RegionSelection:
    matched = _match_diagram_elements(model, intent)
    if not matched:
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
        for element in matched
    ]
    return RegionSelection(
        regions=regions,
        confidence=min(0.98, intent.confidence + 0.1),
        mask_type="hard",
        affected_element_ids=[element.element_id for element in matched],
        rationale="Diagram edit is restricted to matched structured elements.",
    )


def apply_prompt_to_diagram_model(model: DiagramModel, intent: ParsedEditIntent) -> tuple[DiagramModel, RegionSelection]:
    updated = copy.deepcopy(model)
    matched = _match_diagram_elements(updated, intent)
    selection = select_diagram_regions(updated, intent)
    if not matched:
        return updated, selection

    if intent.action == "remove":
        matched_ids = {element.element_id for element in matched}
        updated.elements = [
            element
            for element in updated.elements
            if element.element_id not in matched_ids
            and element.source_id not in matched_ids
            and element.target_id not in matched_ids
        ]
        updated.notes.append(f"Removed {len(matched_ids)} diagram element(s) through prompt editing.")
        return updated, selection

    for element in matched:
        if "color" in intent.target_attributes:
            color = intent.target_attributes["color"]
            if element.element_type == "edge":
                element.stroke_color = color
            else:
                element.fill_color = color
        if "style" in intent.target_attributes:
            element.style["style_hint"] = intent.target_attributes["style"]
        if "text" in intent.target_attributes:
            element.label = intent.target_attributes["text"]
        if intent.action == "text_update" and not intent.target_attributes.get("text"):
            replacement = _extract_replacement_text(intent.raw_prompt)
            if replacement:
                element.label = replacement

    updated.notes.append("Applied prompt-driven structured diagram edit.")
    return updated, selection


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
    delete: bool = False,
) -> DiagramModel:
    updated = copy.deepcopy(model)
    if delete:
        removed_ids = {element_id}
        updated.elements = [
            element
            for element in updated.elements
            if element.element_id not in removed_ids
            and element.source_id not in removed_ids
            and element.target_id not in removed_ids
        ]
        updated.notes.append(f"Deleted diagram element {element_id}.")
        return updated

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

    if any(value is not None for value in (x, y, width, height)):
        element.bbox = BoundingBox(
            x=element.bbox.x if x is None else int(x),
            y=element.bbox.y if y is None else int(y),
            width=max(10, element.bbox.width if width is None else int(width)),
            height=max(10, element.bbox.height if height is None else int(height)),
        )
    updated.notes.append(f"Updated diagram element {element_id}.")
    return updated


def render_diagram_model(model: DiagramModel) -> bytes:
    image = Image.new("RGBA", (model.width, model.height), "#ffffff")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()

    elements_by_id = {element.element_id: element for element in model.elements}

    for element in model.elements:
        if element.element_type != "edge":
            continue
        points = list(element.points)
        if not points:
            source = elements_by_id.get(element.source_id or "")
            target = elements_by_id.get(element.target_id or "")
            if source and target:
                points = [tuple(map(int, source.bbox.center())), tuple(map(int, target.bbox.center()))]
            else:
                points = [
                    (element.bbox.x, element.bbox.y),
                    (element.bbox.x + element.bbox.width, element.bbox.y + element.bbox.height),
                ]
        if len(points) >= 2:
            draw.line(points, fill=element.stroke_color, width=3)
            _draw_arrow_head(draw, points[-2], points[-1], element.stroke_color)
        if element.label:
            midpoint = points[len(points) // 2]
            draw.text((midpoint[0] + 4, midpoint[1] + 4), element.label, fill=element.text_color, font=font)

    for element in model.elements:
        if element.element_type == "edge":
            continue
        x1 = element.bbox.x
        y1 = element.bbox.y
        x2 = x1 + element.bbox.width
        y2 = y1 + element.bbox.height
        shape_name = element.style.get("shape", "rectangle")
        if shape_name in {"ellipse", "circle"}:
            draw.ellipse((x1, y1, x2, y2), fill=element.fill_color, outline=element.stroke_color, width=3)
        else:
            draw.rounded_rectangle(
                (x1, y1, x2, y2),
                radius=12,
                fill=element.fill_color,
                outline=element.stroke_color,
                width=3,
            )
        if element.label:
            draw.multiline_text(
                (x1 + 10, y1 + 10),
                element.label,
                fill=element.text_color,
                font=font,
                spacing=4,
            )

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _decode_drawio_diagram(diagram_node: ET.Element) -> str:
    if list(diagram_node):
        child = list(diagram_node)[0]
        return ET.tostring(child, encoding="unicode")

    raw = (diagram_node.text or "").strip()
    if raw.startswith("<mxGraphModel"):
        return raw

    try:
        decoded = base64.b64decode(raw)
        inflated = zlib.decompress(decoded, -15)
        return urllib.parse.unquote(inflated.decode("utf-8"))
    except Exception as exc:
        raise ValueError("Could not decode compressed draw.io diagram payload.") from exc


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


def _geometry_to_bbox(cell: ET.Element, geometry: Optional[ET.Element]) -> BoundingBox:
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


def _extract_edge_points(geometry: Optional[ET.Element]) -> list[tuple[int, int]]:
    if geometry is None:
        return []

    points: list[tuple[int, int]] = []
    source_point = geometry.find("./mxPoint[@as='sourcePoint']")
    target_point = geometry.find("./mxPoint[@as='targetPoint']")
    for point in (source_point, target_point):
        if point is not None:
            points.append((int(float(point.get("x", "0"))), int(float(point.get("y", "0")))))

    for point in geometry.findall(".//Array/mxPoint"):
        points.append((int(float(point.get("x", "0"))), int(float(point.get("y", "0")))))

    deduped: list[tuple[int, int]] = []
    for point in points:
        if point not in deduped:
            deduped.append(point)
    return deduped


def _white_ratio(image: Image.Image) -> float:
    pixels = image.convert("RGB")
    pixel_access = pixels.load()
    total = pixels.width * pixels.height
    white_pixels = 0
    for x in range(pixels.width):
        for y in range(pixels.height):
            red, green, blue = pixel_access[x, y]
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
            bbox = BoundingBox(
                x=min(xs),
                y=min(ys),
                width=max(xs) - min(xs) + 1,
                height=max(ys) - min(ys) + 1,
            )
            components.append({"bbox": bbox, "pixels": len(points)})

    return components


def _classify_component(bbox: BoundingBox, fill_ratio: float) -> Optional[str]:
    aspect_ratio = bbox.width / max(1, bbox.height)
    if bbox.width > 40 and bbox.height > 24 and 0.03 <= fill_ratio <= 0.55 and 0.5 <= aspect_ratio <= 5.5:
        return "node"
    if max(bbox.width, bbox.height) > 30 and min(bbox.width, bbox.height) <= 8:
        return "edge"
    return None


def _match_diagram_elements(model: DiagramModel, intent: ParsedEditIntent) -> list[DiagramElement]:
    candidates = model.elements
    target_lower = intent.target_entity.lower()

    for element_type, keywords in DIAGRAM_ELEMENT_KEYWORDS.items():
        if any(keyword in target_lower for keyword in keywords):
            candidates = [element for element in candidates if element.element_type == element_type]
            break

    if intent.referenced_labels:
        label_matches = [
            element
            for element in candidates
            if any(label.lower() in (element.label or "").lower() for label in intent.referenced_labels)
        ]
        if label_matches:
            candidates = label_matches

    if target_lower and target_lower not in {"image region", "connector", "node"}:
        text_matches = [element for element in candidates if target_lower in (element.label or "").lower()]
        if text_matches:
            candidates = text_matches

    if intent.spatial_qualifiers:
        candidates = _filter_by_spatial_qualifiers(candidates, model.width, model.height, intent.spatial_qualifiers)

    return candidates[:3]


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
        elif qualifier == "top-left":
            ranked = [element for element in ranked if element.bbox.center()[0] <= width * 0.45 and element.bbox.center()[1] <= height * 0.45] or ranked
        elif qualifier == "top-right":
            ranked = [element for element in ranked if element.bbox.center()[0] >= width * 0.55 and element.bbox.center()[1] <= height * 0.45] or ranked
        elif qualifier == "bottom-left":
            ranked = [element for element in ranked if element.bbox.center()[0] <= width * 0.45 and element.bbox.center()[1] >= height * 0.55] or ranked
        elif qualifier == "bottom-right":
            ranked = [element for element in ranked if element.bbox.center()[0] >= width * 0.55 and element.bbox.center()[1] >= height * 0.55] or ranked
    return ranked


def _extract_replacement_text(prompt: str) -> str:
    match = re.search(r"\bto\s+(.+)$", prompt, re.IGNORECASE)
    if not match:
        return ""
    return match.group(1).strip().strip('"\'')


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
