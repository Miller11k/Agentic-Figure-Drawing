from __future__ import annotations

import xml.etree.ElementTree as ET

try:
    from .editing_models import (
        BoundingBox,
        DiagramConnector,
        DiagramElement,
        DiagramModel,
        ExtractedAsset,
        ModeState,
        ModelRoutingDecision,
    )
except ImportError:
    from editing_models import (
        BoundingBox,
        DiagramConnector,
        DiagramElement,
        DiagramModel,
        ExtractedAsset,
        ModeState,
        ModelRoutingDecision,
    )


def serialize_diagram_model(model: DiagramModel) -> str:
    root = ET.Element(
        "editable-diagram",
        {
            "version": "1.0",
            "width": str(model.width),
            "height": str(model.height),
            "sourceFormat": model.source_format,
            "detectionConfidence": f"{model.detection_confidence:.3f}",
        },
    )

    mode_state = model.mode_state or ModeState(
        current_mode="diagram",
        auto_detected_mode="diagram",
        canvas_width=model.width,
        canvas_height=model.height,
    )
    ET.SubElement(
        root,
        "mode",
        {
            "current": mode_state.current_mode,
            "autoDetected": mode_state.auto_detected_mode,
            "userOverride": str(mode_state.user_override).lower(),
        },
    )

    assets_node = ET.SubElement(root, "assets")
    for asset in model.assets:
        asset_node = ET.SubElement(
            assets_node,
            "asset",
            {
                "id": asset.asset_id,
                "decision": asset.decision,
                "mimeType": asset.mime_type,
                "confidence": f"{asset.confidence:.3f}",
                "sourceImageRef": asset.source_image_ref or "",
                "refinedAssetRef": asset.refined_asset_ref or "",
            },
        )
        ET.SubElement(
            asset_node,
            "sourceBounds",
            {
                "x": str(asset.source_bbox.x),
                "y": str(asset.source_bbox.y),
                "width": str(asset.source_bbox.width),
                "height": str(asset.source_bbox.height),
            },
        )
        ET.SubElement(asset_node, "data").text = asset.asset_data_url
        if asset.notes:
            notes_node = ET.SubElement(asset_node, "notes")
            for note in asset.notes:
                ET.SubElement(notes_node, "note").text = note

    elements_node = ET.SubElement(root, "elements")
    for element in sorted(model.elements, key=lambda current: current.z_index):
        element_node = ET.SubElement(
            elements_node,
            "element",
            {
                "id": element.element_id,
                "type": element.element_type,
                "semanticClass": element.semantic_class,
                "assetId": element.asset_id or "",
                "confidence": f"{element.confidence:.3f}",
                "zIndex": str(element.z_index),
                "editability": ",".join(element.editability),
            },
        )
        ET.SubElement(
            element_node,
            "bounds",
            {
                "x": str(element.bbox.x),
                "y": str(element.bbox.y),
                "width": str(element.bbox.width),
                "height": str(element.bbox.height),
            },
        )
        ET.SubElement(
            element_node,
            "style",
            {
                **element.style,
                "fill": element.fill_color,
                "stroke": element.stroke_color,
                "text": element.text_color,
            },
        )
        ET.SubElement(element_node, "label").text = element.label

    connectors_node = ET.SubElement(root, "connectors")
    for connector in model.connectors:
        connector_node = ET.SubElement(
            connectors_node,
            "connector",
            {
                "id": connector.connector_id,
                "source": connector.source_element_id or "",
                "target": connector.target_element_id or "",
                "semanticClass": connector.semantic_class,
                "confidence": f"{connector.confidence:.3f}",
            },
        )
        ET.SubElement(
            connector_node,
            "style",
            {
                **connector.style,
                "stroke": connector.stroke_color,
            },
        )
        anchors = ET.SubElement(connector_node, "anchors")
        for x, y in connector.anchor_points:
            ET.SubElement(anchors, "point", {"x": str(x), "y": str(y)})
        ET.SubElement(connector_node, "label").text = connector.label

    routing_node = ET.SubElement(root, "routing")
    for decision in model.routing_metadata:
        decision_node = ET.SubElement(
            routing_node,
            "decision",
            {
                "targetId": decision.target_id,
                "targetType": decision.target_type,
                "decision": decision.decision,
                "task": decision.assigned_task,
                "model": decision.assigned_model,
                "confidence": f"{decision.confidence:.3f}",
            },
        )
        ET.SubElement(decision_node, "reason").text = decision.reason
        ET.SubElement(decision_node, "fallback").text = decision.fallback_strategy

    notes_node = ET.SubElement(root, "notes")
    for note in model.notes:
        ET.SubElement(notes_node, "note").text = note

    try:
        ET.indent(root)
    except AttributeError:
        pass
    return ET.tostring(root, encoding="unicode")


def parse_editable_diagram_xml(payload: bytes) -> DiagramModel:
    root = ET.fromstring(payload.decode("utf-8", errors="ignore"))
    if root.tag != "editable-diagram":
        raise ValueError("Unsupported editable diagram XML payload.")

    width = int(root.get("width", "512"))
    height = int(root.get("height", "512"))
    source_format = root.get("sourceFormat", "editable-xml")
    detection_confidence = float(root.get("detectionConfidence", "1.0"))

    mode_node = root.find("./mode")
    mode_state = None
    if mode_node is not None:
        mode_state = ModeState(
            current_mode=mode_node.get("current", "diagram"),
            auto_detected_mode=mode_node.get("autoDetected", "diagram"),
            user_override=mode_node.get("userOverride", "false").lower() == "true",
            canvas_width=width,
            canvas_height=height,
        )

    assets = [_parse_asset_node(node) for node in root.findall("./assets/asset")]
    elements = [_parse_element_node(node) for node in root.findall("./elements/element")]
    connectors = [_parse_connector_node(node) for node in root.findall("./connectors/connector")]
    routing_metadata = [_parse_routing_node(node) for node in root.findall("./routing/decision")]
    notes = [node.text or "" for node in root.findall("./notes/note")]

    return DiagramModel(
        elements=elements,
        connectors=connectors,
        assets=assets,
        width=width,
        height=height,
        source_format=source_format,
        detection_confidence=detection_confidence,
        xml_representation=payload.decode("utf-8", errors="ignore"),
        mode_state=mode_state,
        routing_metadata=routing_metadata,
        notes=notes,
    )


def _parse_asset_node(node: ET.Element) -> ExtractedAsset:
    bounds = node.find("./sourceBounds")
    return ExtractedAsset(
        asset_id=node.get("id", ""),
        source_bbox=BoundingBox(
            x=int((bounds.get("x") if bounds is not None else "0") or 0),
            y=int((bounds.get("y") if bounds is not None else "0") or 0),
            width=int((bounds.get("width") if bounds is not None else "0") or 0),
            height=int((bounds.get("height") if bounds is not None else "0") or 0),
        ),
        decision=node.get("decision", "copy"),
        mime_type=node.get("mimeType", "image/png"),
        asset_data_url=(node.findtext("./data") or "").strip(),
        source_image_ref=node.get("sourceImageRef"),
        refined_asset_ref=node.get("refinedAssetRef"),
        confidence=float(node.get("confidence", "0")),
        notes=[note.text or "" for note in node.findall("./notes/note")],
    )


def _parse_element_node(node: ET.Element) -> DiagramElement:
    bounds = node.find("./bounds")
    style = node.find("./style")
    return DiagramElement(
        element_id=node.get("id", ""),
        element_type=node.get("type", "node"),
        bbox=BoundingBox(
            x=int((bounds.get("x") if bounds is not None else "0") or 0),
            y=int((bounds.get("y") if bounds is not None else "0") or 0),
            width=int((bounds.get("width") if bounds is not None else "120") or 120),
            height=int((bounds.get("height") if bounds is not None else "60") or 60),
        ),
        label=node.findtext("./label", "").strip(),
        fill_color=(style.get("fill") if style is not None else "#ffffff") or "#ffffff",
        stroke_color=(style.get("stroke") if style is not None else "#1f2b24") or "#1f2b24",
        text_color=(style.get("text") if style is not None else "#1f2b24") or "#1f2b24",
        style=_style_from_node(style),
        semantic_class=node.get("semanticClass", "generic"),
        asset_id=node.get("assetId") or None,
        editability=[token for token in node.get("editability", "").split(",") if token],
        confidence=float(node.get("confidence", "0")),
        z_index=int(node.get("zIndex", "0")),
    )


def _parse_connector_node(node: ET.Element) -> DiagramConnector:
    style = node.find("./style")
    points = [
        (int(point.get("x", "0")), int(point.get("y", "0")))
        for point in node.findall("./anchors/point")
    ]
    return DiagramConnector(
        connector_id=node.get("id", ""),
        source_element_id=node.get("source") or None,
        target_element_id=node.get("target") or None,
        anchor_points=points,
        label=node.findtext("./label", "").strip(),
        stroke_color=(style.get("stroke") if style is not None else "#1f2b24") or "#1f2b24",
        style=_style_from_node(style),
        semantic_class=node.get("semanticClass", "connection"),
        confidence=float(node.get("confidence", "0")),
    )


def _parse_routing_node(node: ET.Element) -> ModelRoutingDecision:
    return ModelRoutingDecision(
        target_id=node.get("targetId", ""),
        target_type=node.get("targetType", ""),
        decision=node.get("decision", "copy"),
        assigned_task=node.get("task", "copy_asset"),
        assigned_model=node.get("model", "preserve-source"),
        reason=node.findtext("./reason", "").strip(),
        confidence=float(node.get("confidence", "0")),
        fallback_strategy=node.findtext("./fallback", "").strip(),
    )


def _style_from_node(node: ET.Element | None) -> dict[str, str]:
    if node is None:
        return {}
    return {key: value for key, value in node.attrib.items() if key not in {"fill", "stroke", "text"}}
