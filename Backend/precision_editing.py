from __future__ import annotations

import io
from typing import Optional

from PIL import Image, ImageDraw, ImageFilter

try:
    from .diagram_project import (
        analyze_diagram_payload,
        apply_prompt_to_diagram_model,
        refresh_diagram_metadata,
        render_diagram_model,
        select_diagram_regions,
    )
    from .editing_models import (
        BoundingBox,
        DiagramModel,
        EditingAnalysis,
        MaskMetadata,
        PrecisionEditResult,
        RegionSelection,
        SelectedRegion,
    )
    from .generation_backend import GenerationRequest, get_generation_backend
    from .prompt_parser import parse_edit_intent
except ImportError:
    from diagram_project import (
        analyze_diagram_payload,
        apply_prompt_to_diagram_model,
        refresh_diagram_metadata,
        render_diagram_model,
        select_diagram_regions,
    )
    from editing_models import (
        BoundingBox,
        DiagramModel,
        EditingAnalysis,
        MaskMetadata,
        PrecisionEditResult,
        RegionSelection,
        SelectedRegion,
    )
    from generation_backend import GenerationRequest, get_generation_backend
    from prompt_parser import parse_edit_intent


SEMANTIC_REGION_HINTS = {
    "sky": lambda w, h: BoundingBox(0, 0, w, max(1, int(h * 0.38))),
    "background": lambda w, h: BoundingBox(0, 0, w, h),
    "foreground": lambda w, h: BoundingBox(int(w * 0.18), int(h * 0.18), int(w * 0.64), int(h * 0.72)),
    "hat": lambda w, h: BoundingBox(int(w * 0.28), int(h * 0.04), int(w * 0.44), int(h * 0.22)),
    "hair": lambda w, h: BoundingBox(int(w * 0.22), int(h * 0.05), int(w * 0.56), int(h * 0.25)),
    "face": lambda w, h: BoundingBox(int(w * 0.24), int(h * 0.14), int(w * 0.52), int(h * 0.28)),
    "shirt": lambda w, h: BoundingBox(int(w * 0.22), int(h * 0.34), int(w * 0.56), int(h * 0.28)),
    "jacket": lambda w, h: BoundingBox(int(w * 0.18), int(h * 0.30), int(w * 0.62), int(h * 0.35)),
    "logo": lambda w, h: BoundingBox(int(w * 0.72), int(h * 0.04), int(w * 0.22), int(h * 0.18)),
    "watermark": lambda w, h: BoundingBox(int(w * 0.68), int(h * 0.76), int(w * 0.24), int(h * 0.16)),
    "text": lambda w, h: BoundingBox(int(w * 0.12), int(h * 0.08), int(w * 0.76), int(h * 0.16)),
    "label": lambda w, h: BoundingBox(int(w * 0.12), int(h * 0.08), int(w * 0.76), int(h * 0.16)),
    "ground": lambda w, h: BoundingBox(0, int(h * 0.62), w, int(h * 0.38)),
    "road": lambda w, h: BoundingBox(0, int(h * 0.60), w, int(h * 0.40)),
    "tree": lambda w, h: BoundingBox(int(w * 0.08), int(h * 0.10), int(w * 0.32), int(h * 0.72)),
}

HARD_MASK_TARGETS = {"watermark", "logo", "text", "label", "caption", "connector", "arrow", "edge", "node", "box"}
MIN_MASK_CONTEXT_SIZE = 384
MIN_AUTO_CONTEXT_SIZE = 256


def analyze_edit_request(
    image_bytes: bytes,
    prompt_text: str,
    *,
    filename: Optional[str] = None,
    existing_diagram_model: Optional[DiagramModel] = None,
    mode_override: Optional[str] = None,
    server_url: Optional[str] = None,
) -> EditingAnalysis:
    intent = parse_edit_intent(prompt_text)
    generation_backend = get_generation_backend(server_url) if server_url else None
    diagram_model = None
    if mode_override != "image":
        diagram_model = existing_diagram_model or analyze_diagram_payload(
            image_bytes,
            filename,
            mode_override=mode_override,
            generation_backend=generation_backend,
        )
    if diagram_model is not None:
        return EditingAnalysis(
            content_mode=diagram_model.mode_state.current_mode if diagram_model.mode_state else "diagram",
            edit_intent=intent,
            region_selection=select_diagram_regions(diagram_model, intent),
            diagram_model=diagram_model,
            mode_state=diagram_model.mode_state,
            mask_metadata=MaskMetadata(),
            warnings=list(diagram_model.notes),
        )

    image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    return EditingAnalysis(
        content_mode="image",
        edit_intent=intent,
        region_selection=select_image_regions(image, intent),
        diagram_model=None,
        mode_state=None,
        mask_metadata=MaskMetadata(
            used=False,
            source="auto",
            mask_type="full",
            width=image.width,
            height=image.height,
        ),
        warnings=[],
    )


def perform_precise_edit(
    image_bytes: bytes,
    prompt_text: str,
    *,
    model_name: str,
    workflow_profile: Optional[str] = None,
    server_url: str,
    filename: Optional[str] = None,
    existing_diagram_model: Optional[DiagramModel] = None,
    mode_override: Optional[str] = None,
    mask_image_bytes: Optional[bytes] = None,
    seed: Optional[int] = None,
    steps: int = 20,
    cfg: float = 8.0,
    sampler: str = "euler",
    scheduler: str = "normal",
    denoise: float = 0.6,
) -> PrecisionEditResult:
    analysis = analyze_edit_request(
        image_bytes,
        prompt_text,
        filename=filename,
        existing_diagram_model=existing_diagram_model,
        mode_override=mode_override,
        server_url=server_url,
    )

    if analysis.content_mode in {"diagram", "hybrid"} and analysis.diagram_model is not None:
        updated_model, selection = apply_prompt_to_diagram_model(analysis.diagram_model, analysis.edit_intent)
        analysis.region_selection = selection
        analysis.mode_state = updated_model.mode_state
        analysis.mask_metadata = MaskMetadata(
            used=False,
            source="diagram",
            mask_type="element",
            regions=[region.bbox for region in selection.regions],
            width=updated_model.width,
            height=updated_model.height,
        )

        if updated_model != analysis.diagram_model and (
            analysis.content_mode == "diagram" or selection.affected_element_ids
        ):
            analysis.diagram_model = updated_model
            return PrecisionEditResult(
                image_bytes=render_diagram_model(updated_model),
                analysis=analysis,
            )

    explicit_mask = None
    if mask_image_bytes and analysis.content_mode == "image":
        explicit_mask, masked_selection, mask_metadata = _load_explicit_mask(mask_image_bytes, image_bytes)
        if mask_metadata.used:
            analysis.region_selection = masked_selection
            analysis.mask_metadata = mask_metadata
            analysis.warnings.append("Applied a user-defined binary mask to keep the edit localized.")
    elif analysis.content_mode == "image":
        base_image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        analysis.mask_metadata = MaskMetadata(
            used=False,
            source="auto",
            mask_type=analysis.region_selection.mask_type,
            regions=[region.bbox for region in analysis.region_selection.regions],
            width=base_image.width,
            height=base_image.height,
        )

    edited_bytes = _localized_image_edit(
        image_bytes=image_bytes,
        prompt_text=prompt_text,
        analysis=analysis,
        model_name=model_name,
        workflow_profile=workflow_profile,
        server_url=server_url,
        mask_image=explicit_mask,
        seed=seed,
        steps=steps,
        cfg=cfg,
        sampler=sampler,
        scheduler=scheduler,
        denoise=denoise,
    )
    return PrecisionEditResult(image_bytes=edited_bytes, analysis=analysis)


def select_image_regions(image: Image.Image, intent) -> RegionSelection:
    width, height = image.size
    target_lower = intent.target_entity.lower()
    mask_type = "hard" if any(keyword in target_lower for keyword in HARD_MASK_TARGETS) else "soft"

    base_bbox = _bbox_from_target(target_lower, width, height)
    if intent.spatial_qualifiers:
        base_bbox = _apply_spatial_qualifiers(base_bbox, width, height, intent.spatial_qualifiers)

    if target_lower == "image region" and not intent.spatial_qualifiers:
        base_bbox = BoundingBox(int(width * 0.18), int(height * 0.18), int(width * 0.64), int(height * 0.64))

    base_bbox = base_bbox.clamp(width, height)
    region = SelectedRegion(
        bbox=base_bbox,
        confidence=max(0.35, intent.confidence),
        mask_type=mask_type,
        reason=f"Selected a localized edit crop for target '{intent.target_entity}'.",
    )
    return RegionSelection(
        regions=[region],
        confidence=region.confidence,
        mask_type=mask_type,
        rationale="Localized crop editing preserves untouched pixels outside the selected region.",
    )


def _localized_image_edit(
    *,
    image_bytes: bytes,
    prompt_text: str,
    analysis: EditingAnalysis,
    model_name: str,
    workflow_profile: Optional[str],
    server_url: str,
    mask_image: Optional[Image.Image],
    seed: Optional[int],
    steps: int,
    cfg: float,
    sampler: str,
    scheduler: str,
    denoise: float,
) -> bytes:
    generation_backend = get_generation_backend(server_url)
    selection = analysis.region_selection
    if not selection.regions or selection.confidence < 0.3:
        result = generation_backend.edit(
            GenerationRequest(
                model_name=model_name,
                prompt_text=_local_edit_prompt(prompt_text, analysis),
                input_image=image_bytes,
                workflow_profile=workflow_profile,
                seed=seed,
                steps=steps,
                cfg=cfg,
                sampler=sampler,
                scheduler=scheduler,
                denoise=denoise,
                task_type="image_edit",
            )
        )
        analysis.region_selection = RegionSelection(
            regions=[],
            confidence=0.2,
            mask_type="full",
            rationale="Fell back to full-image editing because no reliable local region was found.",
        )
        return result

    original = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    working = original.copy()
    uses_explicit_mask = mask_image is not None
    generation_task_type = "asset_refine" if uses_explicit_mask else "image_edit"

    for region in selection.regions:
        crop_bbox = _build_context_crop(
            region.bbox,
            original.width,
            original.height,
            prefer_large_context=uses_explicit_mask,
        )
        crop = working.crop(
            (
                crop_bbox.x,
                crop_bbox.y,
                crop_bbox.x + crop_bbox.width,
                crop_bbox.y + crop_bbox.height,
            )
        )

        crop_bytes = _image_to_png_bytes(crop)
        edited_crop_bytes = generation_backend.edit(
            GenerationRequest(
                model_name=model_name,
                prompt_text=_local_edit_prompt(prompt_text, analysis),
                input_image=crop_bytes,
                workflow_profile=workflow_profile,
                seed=seed,
                steps=steps,
                cfg=cfg,
                sampler=sampler,
                scheduler=scheduler,
                denoise=_effective_local_denoise(
                    denoise,
                    selection.mask_type,
                    explicit_mask=uses_explicit_mask,
                ),
                task_type=generation_task_type,
            )
        )
        edited_crop = Image.open(io.BytesIO(edited_crop_bytes)).convert("RGBA").resize(crop.size)
        mask = _build_blend_mask(
            crop.size,
            selection.mask_type,
            source_mask=(
                mask_image.crop(
                    (
                        crop_bbox.x,
                        crop_bbox.y,
                        crop_bbox.x + crop_bbox.width,
                        crop_bbox.y + crop_bbox.height,
                    )
                )
                if mask_image is not None
                else None
            ),
        )
        working.paste(edited_crop, (crop_bbox.x, crop_bbox.y), mask)

    return _image_to_png_bytes(working)


def _build_context_crop(
    bbox: BoundingBox,
    image_width: int,
    image_height: int,
    *,
    prefer_large_context: bool,
) -> BoundingBox:
    base_padding = max(24, int(min(bbox.width, bbox.height) * (0.30 if prefer_large_context else 0.18)))
    expanded = bbox.expanded(base_padding, image_width, image_height)
    minimum_size = MIN_MASK_CONTEXT_SIZE if prefer_large_context else MIN_AUTO_CONTEXT_SIZE

    if expanded.width >= minimum_size and expanded.height >= minimum_size:
        return expanded

    center_x, center_y = bbox.center()
    target_width = min(image_width, max(expanded.width, minimum_size))
    target_height = min(image_height, max(expanded.height, minimum_size))

    left = int(round(center_x - (target_width / 2.0)))
    top = int(round(center_y - (target_height / 2.0)))
    left = max(0, min(left, image_width - target_width))
    top = max(0, min(top, image_height - target_height))
    return BoundingBox(left, top, target_width, target_height)


def _effective_local_denoise(denoise: float, mask_type: str, *, explicit_mask: bool) -> float:
    if explicit_mask:
        return min(max(denoise, 0.18), 0.32)
    if mask_type == "soft":
        return min(denoise, 0.55)
    return denoise


def _local_edit_prompt(prompt_text: str, analysis: EditingAnalysis) -> str:
    preserve = ", ".join(analysis.edit_intent.preserve_constraints) or "all unrelated content"
    return (
        f"{prompt_text}. Restrict changes to the requested target only. "
        f"Preserve {preserve}. Maintain the original composition, geometry, text, and layout outside the selected region."
    )


def _bbox_from_target(target_entity: str, width: int, height: int) -> BoundingBox:
    for keyword, builder in SEMANTIC_REGION_HINTS.items():
        if keyword in target_entity:
            return builder(width, height)
    return BoundingBox(int(width * 0.2), int(height * 0.2), int(width * 0.6), int(height * 0.6))


def _apply_spatial_qualifiers(
    bbox: BoundingBox,
    width: int,
    height: int,
    qualifiers: list[str],
) -> BoundingBox:
    candidate = bbox
    for qualifier in qualifiers:
        if qualifier == "top":
            candidate = BoundingBox(candidate.x, 0, candidate.width, max(candidate.height, int(height * 0.35)))
        elif qualifier == "bottom":
            candidate = BoundingBox(candidate.x, int(height * 0.65), candidate.width, max(candidate.height, int(height * 0.30)))
        elif qualifier == "left":
            candidate = BoundingBox(0, candidate.y, max(candidate.width, int(width * 0.35)), candidate.height)
        elif qualifier == "right":
            candidate = BoundingBox(int(width * 0.65), candidate.y, max(candidate.width, int(width * 0.30)), candidate.height)
        elif qualifier in {"center", "middle"}:
            candidate = BoundingBox(int(width * 0.25), int(height * 0.25), int(width * 0.50), int(height * 0.50))
        elif qualifier == "top-left":
            candidate = BoundingBox(0, 0, int(width * 0.35), int(height * 0.35))
        elif qualifier == "top-right":
            candidate = BoundingBox(int(width * 0.65), 0, int(width * 0.35), int(height * 0.35))
        elif qualifier == "bottom-left":
            candidate = BoundingBox(0, int(height * 0.65), int(width * 0.35), int(height * 0.35))
        elif qualifier == "bottom-right":
            candidate = BoundingBox(int(width * 0.65), int(height * 0.65), int(width * 0.35), int(height * 0.35))
        elif qualifier == "background":
            candidate = BoundingBox(0, 0, width, height)
        elif qualifier == "foreground":
            candidate = BoundingBox(int(width * 0.16), int(height * 0.16), int(width * 0.68), int(height * 0.68))
    return candidate


def _load_explicit_mask(mask_image_bytes: bytes, base_image_bytes: bytes) -> tuple[Image.Image, RegionSelection, MaskMetadata]:
    base_image = Image.open(io.BytesIO(base_image_bytes)).convert("RGBA")
    mask_image = Image.open(io.BytesIO(mask_image_bytes)).convert("L")
    if mask_image.size != base_image.size:
        mask_image = mask_image.resize(base_image.size)

    binary_mask = mask_image.point(lambda pixel: 255 if pixel >= 24 else 0)
    mask_bbox = binary_mask.getbbox()
    coverage_ratio = binary_mask.histogram()[255] / max(1, base_image.width * base_image.height)

    if mask_bbox is None or coverage_ratio <= 0.0:
        metadata = MaskMetadata(
            used=False,
            source="user_brush",
            mask_type="hard",
            width=base_image.width,
            height=base_image.height,
        )
        return binary_mask, RegionSelection(rationale="User mask was empty.", mask_type="hard"), metadata

    bbox = BoundingBox(
        x=int(mask_bbox[0]),
        y=int(mask_bbox[1]),
        width=max(1, int(mask_bbox[2] - mask_bbox[0])),
        height=max(1, int(mask_bbox[3] - mask_bbox[1])),
    )
    selection = RegionSelection(
        regions=[
            SelectedRegion(
                bbox=bbox,
                confidence=0.99,
                mask_type="hard",
                reason="Used the user-painted mask as the exact edit region.",
            )
        ],
        confidence=0.99,
        mask_type="hard",
        rationale="User-defined mask overrides heuristic region selection for localized editing.",
    )
    metadata = MaskMetadata(
        used=True,
        source="user_brush",
        mask_type="hard",
        regions=[bbox],
        coverage_ratio=coverage_ratio,
        width=base_image.width,
        height=base_image.height,
    )
    return binary_mask, selection, metadata


def _build_blend_mask(
    size: tuple[int, int],
    mask_type: str,
    *,
    source_mask: Optional[Image.Image] = None,
) -> Image.Image:
    if source_mask is not None:
        mask = source_mask.convert("L").resize(size)
        if mask_type == "hard":
            return mask.point(lambda pixel: 255 if pixel >= 24 else 0)
        return mask.filter(ImageFilter.GaussianBlur(radius=max(4, min(size) // 18)))

    if mask_type == "hard":
        return Image.new("L", size, 255)

    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    inset_x = max(6, int(size[0] * 0.05))
    inset_y = max(6, int(size[1] * 0.05))
    draw.rounded_rectangle(
        (inset_x, inset_y, max(inset_x + 1, size[0] - inset_x), max(inset_y + 1, size[1] - inset_y)),
        radius=max(8, min(size) // 10),
        fill=255,
    )
    return mask.filter(ImageFilter.GaussianBlur(radius=max(6, min(size) // 14)))


def _image_to_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
