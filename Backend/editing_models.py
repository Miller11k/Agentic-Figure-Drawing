from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal, Optional


MaskType = Literal["soft", "hard", "crop", "full", "element"]
ContentMode = Literal["image", "diagram", "hybrid"]
AssetDecision = Literal["copy", "primitive", "generate"]
GenerationTask = Literal["text_to_image", "image_edit", "diagram_cleanup", "asset_refine", "copy_asset"]


@dataclass
class BoundingBox:
    x: int
    y: int
    width: int
    height: int

    def clamp(self, max_width: int, max_height: int) -> "BoundingBox":
        x = max(0, min(self.x, max_width))
        y = max(0, min(self.y, max_height))
        right = max(x + 1, min(self.x + self.width, max_width))
        bottom = max(y + 1, min(self.y + self.height, max_height))
        return BoundingBox(x=x, y=y, width=right - x, height=bottom - y)

    def expanded(self, padding: int, max_width: int, max_height: int) -> "BoundingBox":
        return BoundingBox(
            x=max(0, self.x - padding),
            y=max(0, self.y - padding),
            width=min(max_width, self.x + self.width + padding) - max(0, self.x - padding),
            height=min(max_height, self.y + self.height + padding) - max(0, self.y - padding),
        )

    def center(self) -> tuple[float, float]:
        return (self.x + (self.width / 2.0), self.y + (self.height / 2.0))

    def area(self) -> int:
        return max(0, self.width) * max(0, self.height)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict) -> "BoundingBox":
        return cls(
            x=int(payload.get("x", 0)),
            y=int(payload.get("y", 0)),
            width=int(payload.get("width", 0)),
            height=int(payload.get("height", 0)),
        )


@dataclass
class ParsedEditIntent:
    raw_prompt: str
    action: str
    target_entity: str
    target_attributes: dict[str, str] = field(default_factory=dict)
    preserve_constraints: list[str] = field(default_factory=list)
    spatial_qualifiers: list[str] = field(default_factory=list)
    referenced_labels: list[str] = field(default_factory=list)
    exclusions: list[str] = field(default_factory=list)
    confidence: float = 0.0
    ambiguity_notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict) -> "ParsedEditIntent":
        return cls(
            raw_prompt=payload.get("raw_prompt", ""),
            action=payload.get("action", "generic_edit"),
            target_entity=payload.get("target_entity", "image region"),
            target_attributes=dict(payload.get("target_attributes", {})),
            preserve_constraints=list(payload.get("preserve_constraints", [])),
            spatial_qualifiers=list(payload.get("spatial_qualifiers", [])),
            referenced_labels=list(payload.get("referenced_labels", [])),
            exclusions=list(payload.get("exclusions", [])),
            confidence=float(payload.get("confidence", 0.0)),
            ambiguity_notes=list(payload.get("ambiguity_notes", [])),
        )


@dataclass
class SelectedRegion:
    bbox: BoundingBox
    confidence: float
    mask_type: MaskType
    reason: str
    element_id: Optional[str] = None

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["bbox"] = self.bbox.to_dict()
        return payload

    @classmethod
    def from_dict(cls, payload: dict) -> "SelectedRegion":
        return cls(
            bbox=BoundingBox.from_dict(payload.get("bbox", {})),
            confidence=float(payload.get("confidence", 0.0)),
            mask_type=payload.get("mask_type", "full"),
            reason=payload.get("reason", ""),
            element_id=payload.get("element_id"),
        )


@dataclass
class RegionSelection:
    regions: list[SelectedRegion] = field(default_factory=list)
    confidence: float = 0.0
    mask_type: MaskType = "full"
    affected_element_ids: list[str] = field(default_factory=list)
    rationale: str = ""

    def to_dict(self) -> dict:
        return {
            "regions": [region.to_dict() for region in self.regions],
            "confidence": self.confidence,
            "mask_type": self.mask_type,
            "affected_element_ids": self.affected_element_ids,
            "rationale": self.rationale,
        }

    @classmethod
    def from_dict(cls, payload: dict) -> "RegionSelection":
        return cls(
            regions=[SelectedRegion.from_dict(region) for region in payload.get("regions", [])],
            confidence=float(payload.get("confidence", 0.0)),
            mask_type=payload.get("mask_type", "full"),
            affected_element_ids=list(payload.get("affected_element_ids", [])),
            rationale=payload.get("rationale", ""),
        )


@dataclass
class ExtractedAsset:
    asset_id: str
    source_bbox: BoundingBox
    decision: AssetDecision = "copy"
    mime_type: str = "image/png"
    asset_data_url: str = ""
    source_image_ref: Optional[str] = None
    refined_asset_ref: Optional[str] = None
    confidence: float = 0.0
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["source_bbox"] = self.source_bbox.to_dict()
        return payload

    @classmethod
    def from_dict(cls, payload: dict) -> "ExtractedAsset":
        return cls(
            asset_id=payload.get("asset_id", ""),
            source_bbox=BoundingBox.from_dict(payload.get("source_bbox", {})),
            decision=payload.get("decision", "copy"),
            mime_type=payload.get("mime_type", "image/png"),
            asset_data_url=payload.get("asset_data_url", ""),
            source_image_ref=payload.get("source_image_ref"),
            refined_asset_ref=payload.get("refined_asset_ref"),
            confidence=float(payload.get("confidence", 0.0)),
            notes=list(payload.get("notes", [])),
        )


@dataclass
class DiagramConnector:
    connector_id: str
    source_element_id: Optional[str]
    target_element_id: Optional[str]
    anchor_points: list[tuple[int, int]] = field(default_factory=list)
    label: str = ""
    stroke_color: str = "#1f2b24"
    style: dict[str, str] = field(default_factory=dict)
    semantic_class: str = "connection"
    confidence: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict) -> "DiagramConnector":
        return cls(
            connector_id=payload.get("connector_id", ""),
            source_element_id=payload.get("source_element_id"),
            target_element_id=payload.get("target_element_id"),
            anchor_points=[tuple(point) for point in payload.get("anchor_points", [])],
            label=payload.get("label", ""),
            stroke_color=payload.get("stroke_color", "#1f2b24"),
            style=dict(payload.get("style", {})),
            semantic_class=payload.get("semantic_class", "connection"),
            confidence=float(payload.get("confidence", 0.0)),
        )


@dataclass
class ModelRoutingDecision:
    target_id: str
    target_type: str
    decision: AssetDecision
    assigned_task: GenerationTask
    assigned_model: str
    reason: str
    confidence: float
    fallback_strategy: str

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict) -> "ModelRoutingDecision":
        return cls(
            target_id=payload.get("target_id", ""),
            target_type=payload.get("target_type", ""),
            decision=payload.get("decision", "copy"),
            assigned_task=payload.get("assigned_task", "copy_asset"),
            assigned_model=payload.get("assigned_model", "preserve-source"),
            reason=payload.get("reason", ""),
            confidence=float(payload.get("confidence", 0.0)),
            fallback_strategy=payload.get("fallback_strategy", ""),
        )


@dataclass
class ModeState:
    current_mode: ContentMode
    auto_detected_mode: ContentMode
    user_override: bool = False
    available_modes: list[ContentMode] = field(default_factory=lambda: ["image", "diagram", "hybrid"])
    canvas_width: int = 0
    canvas_height: int = 0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict) -> "ModeState":
        return cls(
            current_mode=payload.get("current_mode", "image"),
            auto_detected_mode=payload.get("auto_detected_mode", "image"),
            user_override=bool(payload.get("user_override", False)),
            available_modes=list(payload.get("available_modes", ["image", "diagram", "hybrid"])),
            canvas_width=int(payload.get("canvas_width", 0)),
            canvas_height=int(payload.get("canvas_height", 0)),
        )


@dataclass
class DiagramElement:
    element_id: str
    element_type: str
    bbox: BoundingBox
    label: str = ""
    fill_color: str = "#ffffff"
    stroke_color: str = "#1f2b24"
    text_color: str = "#1f2b24"
    points: list[tuple[int, int]] = field(default_factory=list)
    source_id: Optional[str] = None
    target_id: Optional[str] = None
    style: dict[str, str] = field(default_factory=dict)
    semantic_class: str = "generic"
    asset_id: Optional[str] = None
    editability: list[str] = field(default_factory=lambda: ["move", "resize", "style", "label"])
    confidence: float = 0.0
    z_index: int = 0

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["bbox"] = self.bbox.to_dict()
        return payload

    @classmethod
    def from_dict(cls, payload: dict) -> "DiagramElement":
        return cls(
            element_id=payload.get("element_id", ""),
            element_type=payload.get("element_type", "node"),
            bbox=BoundingBox.from_dict(payload.get("bbox", {})),
            label=payload.get("label", ""),
            fill_color=payload.get("fill_color", "#ffffff"),
            stroke_color=payload.get("stroke_color", "#1f2b24"),
            text_color=payload.get("text_color", "#1f2b24"),
            points=[tuple(point) for point in payload.get("points", [])],
            source_id=payload.get("source_id"),
            target_id=payload.get("target_id"),
            style=dict(payload.get("style", {})),
            semantic_class=payload.get("semantic_class", "generic"),
            asset_id=payload.get("asset_id"),
            editability=list(payload.get("editability", ["move", "resize", "style", "label"])),
            confidence=float(payload.get("confidence", 0.0)),
            z_index=int(payload.get("z_index", 0)),
        )


@dataclass
class DiagramModel:
    elements: list[DiagramElement]
    width: int
    height: int
    source_format: str
    detection_confidence: float
    connectors: list[DiagramConnector] = field(default_factory=list)
    assets: list[ExtractedAsset] = field(default_factory=list)
    xml_representation: str = ""
    mode_state: Optional[ModeState] = None
    routing_metadata: list[ModelRoutingDecision] = field(default_factory=list)
    is_editable: bool = True
    notes: list[str] = field(default_factory=list)

    def get_element(self, element_id: str) -> Optional[DiagramElement]:
        return next((element for element in self.elements if element.element_id == element_id), None)

    def get_connector(self, connector_id: str) -> Optional[DiagramConnector]:
        return next((connector for connector in self.connectors if connector.connector_id == connector_id), None)

    def get_asset(self, asset_id: str) -> Optional[ExtractedAsset]:
        return next((asset for asset in self.assets if asset.asset_id == asset_id), None)

    def to_dict(self) -> dict:
        return {
            "elements": [element.to_dict() for element in self.elements],
            "width": self.width,
            "height": self.height,
            "source_format": self.source_format,
            "detection_confidence": self.detection_confidence,
            "connectors": [connector.to_dict() for connector in self.connectors],
            "assets": [asset.to_dict() for asset in self.assets],
            "xml_representation": self.xml_representation,
            "mode_state": self.mode_state.to_dict() if self.mode_state else None,
            "routing_metadata": [decision.to_dict() for decision in self.routing_metadata],
            "is_editable": self.is_editable,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, payload: dict) -> "DiagramModel":
        mode_state = payload.get("mode_state")
        return cls(
            elements=[DiagramElement.from_dict(element) for element in payload.get("elements", [])],
            width=int(payload.get("width", 512)),
            height=int(payload.get("height", 512)),
            source_format=payload.get("source_format", "raster"),
            detection_confidence=float(payload.get("detection_confidence", 0.0)),
            connectors=[DiagramConnector.from_dict(connector) for connector in payload.get("connectors", [])],
            assets=[ExtractedAsset.from_dict(asset) for asset in payload.get("assets", [])],
            xml_representation=payload.get("xml_representation", ""),
            mode_state=ModeState.from_dict(mode_state) if mode_state else None,
            routing_metadata=[
                ModelRoutingDecision.from_dict(decision) for decision in payload.get("routing_metadata", [])
            ],
            is_editable=bool(payload.get("is_editable", True)),
            notes=list(payload.get("notes", [])),
        )


@dataclass
class EditingAnalysis:
    content_mode: ContentMode
    edit_intent: ParsedEditIntent
    region_selection: RegionSelection
    diagram_model: Optional[DiagramModel] = None
    mode_state: Optional[ModeState] = None
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "content_mode": self.content_mode,
            "edit_intent": self.edit_intent.to_dict(),
            "region_selection": self.region_selection.to_dict(),
            "diagram_model": self.diagram_model.to_dict() if self.diagram_model else None,
            "mode_state": self.mode_state.to_dict() if self.mode_state else None,
            "warnings": self.warnings,
        }

    @classmethod
    def from_dict(cls, payload: dict) -> "EditingAnalysis":
        diagram_payload = payload.get("diagram_model")
        mode_state = payload.get("mode_state")
        return cls(
            content_mode=payload.get("content_mode", "image"),
            edit_intent=ParsedEditIntent.from_dict(payload.get("edit_intent", {})),
            region_selection=RegionSelection.from_dict(payload.get("region_selection", {})),
            diagram_model=DiagramModel.from_dict(diagram_payload) if diagram_payload else None,
            mode_state=ModeState.from_dict(mode_state) if mode_state else None,
            warnings=list(payload.get("warnings", [])),
        )


@dataclass
class PrecisionEditResult:
    image_bytes: bytes
    analysis: EditingAnalysis

    def metadata(self) -> dict:
        return self.analysis.to_dict()
