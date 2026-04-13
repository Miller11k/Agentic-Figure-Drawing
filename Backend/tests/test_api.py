import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from PIL import Image

from Backend.app import create_app
from Backend.editing_models import EditingAnalysis, MaskMetadata, PrecisionEditResult, RegionSelection
from Backend.generation_backend import GenerationRequest
from Backend.precision_editing import analyze_edit_request
from Backend.precision_editing import perform_precise_edit
from Backend.prompt_parser import parse_edit_intent
from Backend.session_store import FileSessionStore
from Backend.workflow_profiles import resolve_workflow_profile


def make_png_bytes(color: str) -> bytes:
    image = Image.new("RGB", (8, 8), color=color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_drawio_bytes() -> bytes:
    return b"""<mxfile host="app.diagrams.net"><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="box1" value="Start" style="rounded=1;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell><mxCell id="box2" value="End" style="rounded=1;fillColor=#ffffff;strokeColor=#000000;" vertex="1" parent="1"><mxGeometry x="260" y="40" width="120" height="60" as="geometry"/></mxCell><mxCell id="edge1" value="" style="strokeColor=#000000;" edge="1" parent="1" source="box1" target="box2"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>"""


def make_precision_result(
    color: str,
    prompt: str = "edit prompt",
    *,
    mask_used: bool = False,
) -> PrecisionEditResult:
    analysis = EditingAnalysis(
        content_mode="image",
        edit_intent=parse_edit_intent(prompt),
        region_selection=RegionSelection(),
        diagram_model=None,
        mask_metadata=MaskMetadata(
            used=mask_used,
            source="user_brush" if mask_used else "auto",
            mask_type="hard" if mask_used else "full",
            width=8,
            height=8,
        ),
        warnings=[],
    )
    return PrecisionEditResult(image_bytes=make_png_bytes(color), analysis=analysis)


def make_backend(generate_color: str = "red", edit_color: str = "blue") -> Mock:
    backend = Mock()
    backend.provider_name = "comfyui"
    backend.list_models.return_value = ["dreamshaper_8.safetensors", "alt-model.safetensors"]
    backend.list_model_catalog.return_value = {
        "checkpoints": ["dreamshaper_8.safetensors", "alt-model.safetensors"],
        "diffusion_models": ["flux1-dev.safetensors"],
        "gguf_diffusion_models": ["Qwen_Image_Edit-Q2_K.gguf"],
        "clip_models": ["t5xxl_fp16.safetensors"],
        "gguf_clip_models": ["Qwen2.5-VL-7B-Instruct-Q2_K.gguf"],
        "vae_models": ["ae.safetensors"],
    }
    backend.list_workflow_profiles.return_value = [
        {"name": "legacy", "label": "SD 1.x / checkpoint-compatible", "description": "legacy"},
        {"name": "sdxl", "label": "SDXL", "description": "sdxl"},
        {"name": "flux-kontext", "label": "FLUX Kontext", "description": "edit"},
        {"name": "qwen-image-edit-gguf", "label": "Qwen Image Edit GGUF", "description": "low-vram qwen edit"},
    ]
    backend.resolve_model.side_effect = (
        lambda requested_model, task_type: requested_model or "dreamshaper_8.safetensors"
    )
    backend.resolve_workflow_profile.side_effect = (
        lambda requested_profile, model_name, task_type: requested_profile or ("sdxl" if task_type == "text_to_image" else "flux-kontext" if task_type == "image_edit" else "legacy")
    )
    backend.resolve_task_execution.side_effect = (
        lambda requested_model, requested_profile, task_type: (
            requested_model or "dreamshaper_8.safetensors",
            requested_profile or ("sdxl" if task_type == "text_to_image" else "flux-kontext" if task_type == "image_edit" else "legacy"),
        )
    )
    backend.generate.return_value = make_png_bytes(generate_color)
    backend.edit.return_value = make_png_bytes(edit_color)
    return backend


class EditableApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = FileSessionStore(Path(self.temp_dir.name))
        self.app = create_app(session_store=self.store)
        self.client = TestClient(self.app)
        self.original_server_url = os.environ.get("SERVER_URL")
        os.environ["SERVER_URL"] = "http://localhost:8188"

    def tearDown(self):
        if self.original_server_url is None:
            os.environ.pop("SERVER_URL", None)
        else:
            os.environ["SERVER_URL"] = self.original_server_url
        self.temp_dir.cleanup()

    def test_generate_creates_a_session_and_history(self):
        backend = make_backend(generate_color="red")
        with patch("Backend.app._generation_backend", return_value=backend):
            response = self.client.post(
                "/generate",
                data={"prompt_text": "A sketch of a dancer", "model_name": "test-model", "workflow_profile": "sdxl"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertIn("session_id", payload)
        self.assertEqual(payload["current_index"], 0)
        self.assertEqual(len(payload["edit_history"]), 1)
        self.assertEqual(payload["edit_history"][0]["operation"], "generate")
        self.assertEqual(payload["current_entry"]["parameters"]["model_name"], "test-model")
        self.assertEqual(payload["current_entry"]["parameters"]["workflow_profile"], "sdxl")
        self.assertTrue(payload["current_image_url"].startswith("/api/sessions/"))
        self.assertTrue(payload["current_image_url"].endswith(".png"))

    def test_generate_uses_workflow_profile_recommendations_when_tuning_is_omitted(self):
        backend = make_backend(generate_color="red")
        with patch("Backend.app._generation_backend", return_value=backend):
            response = self.client.post(
                "/generate",
                data={
                    "prompt_text": "A cinematic robot portrait",
                    "model_name": "flux1-schnell-fp8.safetensors",
                    "workflow_profile": "flux",
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        request_payload = backend.generate.call_args.args[0]
        self.assertEqual(request_payload.workflow_profile, "flux")
        self.assertEqual(request_payload.width, 640)
        self.assertEqual(request_payload.height, 640)
        self.assertEqual(request_payload.steps, 4)
        self.assertEqual(request_payload.cfg, 1.0)
        self.assertEqual(request_payload.scheduler, "simple")

    def test_models_endpoint_returns_available_models(self):
        backend = make_backend()
        with patch("Backend.app._generation_backend", return_value=backend):
            with patch.dict(os.environ, {"MODEL": "dreamshaper_8.safetensors"}, clear=False):
                response = self.client.get("/models")

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(
            payload["models"],
            ["dreamshaper_8.safetensors", "alt-model.safetensors"],
        )
        self.assertIn("catalog", payload)
        self.assertIn("workflow_profiles", payload)
        self.assertEqual(payload["configured_model"], "dreamshaper_8.safetensors")
        self.assertTrue(payload["configured_model_available"])
        self.assertEqual(payload["default_model"], "dreamshaper_8.safetensors")
        self.assertEqual(payload["workflow_defaults"]["text_to_image"], "sdxl")

    def test_precision_analysis_parses_spatial_local_edit(self):
        analysis = analyze_edit_request(
            make_png_bytes("white"),
            "Remove the watermark in the bottom-left corner",
        )

        self.assertEqual(analysis.content_mode, "image")
        self.assertEqual(analysis.edit_intent.action, "remove")
        self.assertIn("watermark", analysis.edit_intent.target_entity)
        self.assertIn("bottom-left", analysis.edit_intent.spatial_qualifiers)
        self.assertEqual(len(analysis.region_selection.regions), 1)
        region = analysis.region_selection.regions[0]
        self.assertGreaterEqual(region.bbox.y, 4)

    def test_edit_with_upload_starts_a_new_session(self):
        backend = make_backend()
        with patch("Backend.app._generation_backend", return_value=backend):
            with patch("Backend.app.perform_precise_edit", return_value=make_precision_result("blue", "Turn this into a blueprint")):
                response = self.client.post(
                    "/edit",
                    data={"prompt_text": "Turn this into a blueprint", "model_name": "test-model"},
                    files={"input_image": ("input.png", make_png_bytes("gray"), "image/png")},
                )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["current_index"], 1)
        self.assertEqual(len(payload["edit_history"]), 2)
        self.assertEqual(payload["edit_history"][0]["source"], "upload")
        self.assertEqual(payload["edit_history"][0]["operation"], "original")
        self.assertEqual(payload["edit_history"][1]["operation"], "edit")

    def test_edit_existing_session_appends_history(self):
        backend = make_backend(generate_color="red")
        with patch("Backend.app._generation_backend", return_value=backend):
            generated = self.client.post(
                "/generate",
                data={"prompt_text": "A mechanical bird", "model_name": "test-model"},
            ).json()

        with patch("Backend.app._generation_backend", return_value=backend):
            with patch("Backend.app.perform_precise_edit", return_value=make_precision_result("green", "Add brass wings and gears")):
                edited_response = self.client.post(
                    "/edit",
                    data={
                        "session_id": generated["session_id"],
                        "prompt_text": "Add brass wings and gears",
                        "model_name": "test-model",
                    },
                )

        self.assertEqual(edited_response.status_code, 200, edited_response.text)
        payload = edited_response.json()
        self.assertEqual(payload["current_index"], 1)
        self.assertEqual(len(payload["edit_history"]), 2)
        self.assertTrue(payload["can_undo"])
        self.assertEqual(payload["current_entry"]["prompt"], "Add brass wings and gears")

        history_response = self.client.get(f"/history/{generated['session_id']}")
        self.assertEqual(history_response.status_code, 200, history_response.text)
        history_payload = history_response.json()
        self.assertEqual(len(history_payload["edit_history"]), 2)

    def test_edit_with_mask_persists_mask_metadata(self):
        backend = make_backend(generate_color="red")
        with patch("Backend.app._generation_backend", return_value=backend):
            generated = self.client.post(
                "/generate",
                data={"prompt_text": "A ceramic teapot", "model_name": "test-model"},
            ).json()

        with patch("Backend.app._generation_backend", return_value=backend):
            with patch(
                "Backend.app.perform_precise_edit",
                return_value=make_precision_result("green", "Add a gold handle", mask_used=True),
            ):
                response = self.client.post(
                    "/edit",
                    data={
                        "session_id": generated["session_id"],
                        "prompt_text": "Add a gold handle",
                        "model_name": "test-model",
                    },
                    files={"mask_image": ("mask.png", make_png_bytes("white"), "image/png")},
                )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["current_mask_metadata"]["used"])
        self.assertEqual(payload["current_mask_metadata"]["source"], "user_brush")
        self.assertIn("mask_image_url", payload["current_mask_metadata"])
        self.assertTrue(payload["current_mask_metadata"]["mask_image_url"].endswith(".png"))

    def test_edit_with_mask_uses_asset_refine_routing(self):
        backend = make_backend(generate_color="red")
        backend.resolve_task_execution.side_effect = (
            lambda requested_model, requested_profile, task_type: (
                requested_model or ("sd_xl_base_1.0.safetensors" if task_type == "asset_refine" else "flux1-schnell-fp8.safetensors"),
                requested_profile or ("sdxl" if task_type == "asset_refine" else "flux"),
            )
        )
        with patch("Backend.app._generation_backend", return_value=backend):
            generated = self.client.post(
                "/generate",
                data={"prompt_text": "A ceramic teapot", "model_name": "test-model"},
            ).json()

        with patch("Backend.app._generation_backend", return_value=backend):
            with patch(
                "Backend.app.perform_precise_edit",
                return_value=make_precision_result("green", "Add a gold handle", mask_used=True),
            ):
                response = self.client.post(
                    "/edit",
                    data={
                        "session_id": generated["session_id"],
                        "prompt_text": "Add a gold handle",
                    },
                    files={"mask_image": ("mask.png", make_png_bytes("white"), "image/png")},
                )

        self.assertEqual(response.status_code, 200, response.text)
        routed_model, routed_profile, routed_task = backend.resolve_task_execution.call_args.args
        self.assertIsNone(routed_model)
        self.assertIsNone(routed_profile)
        self.assertEqual(routed_task, "asset_refine")

    def test_edit_with_mask_upgrades_flux_session_to_refine_defaults(self):
        backend = make_backend(generate_color="red")
        backend.resolve_task_execution.side_effect = (
            lambda requested_model, requested_profile, task_type: (
                requested_model or ("sd_xl_base_1.0.safetensors" if task_type == "asset_refine" else "flux1-schnell-fp8.safetensors"),
                requested_profile or ("sdxl" if task_type == "asset_refine" else "flux"),
            )
        )
        with patch("Backend.app._generation_backend", return_value=backend):
            generated = self.client.post(
                "/generate",
                data={"prompt_text": "A ceramic teapot", "model_name": "flux1-schnell-fp8.safetensors", "workflow_profile": "flux"},
            ).json()

        with patch("Backend.app._generation_backend", return_value=backend):
            with patch(
                "Backend.app.perform_precise_edit",
                return_value=make_precision_result("green", "Add a gold handle", mask_used=True),
            ):
                response = self.client.post(
                    "/edit",
                    data={
                        "session_id": generated["session_id"],
                        "prompt_text": "Add a gold handle",
                        "model_name": "flux1-schnell-fp8.safetensors",
                        "workflow_profile": "flux",
                    },
                    files={"mask_image": ("mask.png", make_png_bytes("white"), "image/png")},
                )

        self.assertEqual(response.status_code, 200, response.text)
        routed_model, routed_profile, routed_task = backend.resolve_task_execution.call_args.args
        self.assertIsNone(routed_model)
        self.assertIsNone(routed_profile)
        self.assertEqual(routed_task, "asset_refine")

    def test_upload_edit_history_can_revert_to_original_image(self):
        backend = make_backend()
        with patch("Backend.app._generation_backend", return_value=backend):
            with patch(
                "Backend.app.perform_precise_edit",
                return_value=make_precision_result("green", "Add a hat"),
            ):
                created = self.client.post(
                    "/edit",
                    data={"prompt_text": "Add a hat", "model_name": "test-model"},
                    files={"input_image": ("input.png", make_png_bytes("gray"), "image/png")},
                ).json()

        self.assertEqual(created["current_index"], 1)
        self.assertEqual(created["edit_history"][0]["operation"], "original")

        reverted = self.client.post(
            "/revert",
            json={"session_id": created["session_id"], "version": 0},
        )
        self.assertEqual(reverted.status_code, 200, reverted.text)
        payload = reverted.json()
        self.assertEqual(payload["current_index"], 0)
        self.assertEqual(payload["current_entry"]["operation"], "original")

    def test_undo_rolls_back_to_previous_image(self):
        backend = make_backend(generate_color="red")
        with patch("Backend.app._generation_backend", return_value=backend):
            generated = self.client.post(
                "/generate",
                data={"prompt_text": "A charcoal portrait", "model_name": "test-model"},
            ).json()

        with patch("Backend.app._generation_backend", return_value=backend):
            with patch("Backend.app.perform_precise_edit", return_value=make_precision_result("purple", "Add a stormy watercolor wash")):
                self.client.post(
                    "/edit",
                    data={
                        "session_id": generated["session_id"],
                        "prompt_text": "Add a stormy watercolor wash",
                        "model_name": "test-model",
                    },
                )

        undo_response = self.client.post("/undo", json={"session_id": generated["session_id"]})
        self.assertEqual(undo_response.status_code, 200, undo_response.text)
        payload = undo_response.json()
        self.assertEqual(payload["current_index"], 0)
        self.assertFalse(payload["can_undo"])
        self.assertEqual(payload["current_entry"]["version"], 0)

    def test_diagram_import_creates_editable_session(self):
        with patch("Backend.app._generation_backend", return_value=make_backend()):
            response = self.client.post(
                "/diagram/import",
                files={"diagram_file": ("diagram.drawio", make_drawio_bytes(), "application/xml")},
            )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["content_mode"], "diagram")
        self.assertIsNotNone(payload["current_diagram_model"])
        self.assertIsNotNone(payload["current_diagram_structure"])
        self.assertGreaterEqual(len(payload["current_diagram_model"]["elements"]), 2)
        self.assertGreaterEqual(len(payload["current_diagram_structure"]["elements"]), 2)
        self.assertGreaterEqual(len(payload["current_diagram_model"]["connectors"]), 1)
        self.assertEqual(payload["current_diagram_model"]["connectors"][0]["source_element_id"], "box1")
        self.assertEqual(payload["current_diagram_model"]["connectors"][0]["target_element_id"], "box2")
        self.assertIn("<editable-diagram", payload["current_diagram_xml"])

    def test_diagram_json_endpoint_returns_structured_payload(self):
        with patch("Backend.app._generation_backend", return_value=make_backend()):
            imported = self.client.post(
                "/diagram/import",
                files={"diagram_file": ("diagram.drawio", make_drawio_bytes(), "application/xml")},
            ).json()

        response = self.client.get(f"/diagram/json/{imported['session_id']}")
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertIn("elements", payload)
        self.assertIn("connectors", payload)
        self.assertGreaterEqual(len(payload["elements"]), 2)

    def test_diagram_edit_updates_element_label(self):
        with patch("Backend.app._generation_backend", return_value=make_backend()):
            imported = self.client.post(
                "/diagram/import",
                files={"diagram_file": ("diagram.drawio", make_drawio_bytes(), "application/xml")},
            ).json()

        response = self.client.post(
            "/diagram/edit",
            json={
                "session_id": imported["session_id"],
                "element_id": "box1",
                "label": "Launch",
                "fill_color": "#ff0000",
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["content_mode"], "diagram")
        self.assertEqual(payload["current_index"], 1)
        updated_box = next(
            element for element in payload["current_diagram_model"]["elements"] if element["element_id"] == "box1"
        )
        self.assertEqual(updated_box["label"], "Launch")

    def test_diagram_new_creates_prompt_backed_canvas(self):
        response = self.client.post(
            "/diagram/new",
            data={"prompt_text": "Client -> API -> Database"},
        )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["content_mode"], "diagram")
        self.assertEqual(payload["current_entry"]["operation"], "diagram_generate")
        self.assertEqual(len(payload["current_diagram_model"]["connectors"]), 2)

    def test_diagram_add_can_create_connector(self):
        session = self.client.post(
            "/diagram/new",
            data={"prompt_text": "Start, Finish"},
        ).json()

        element_ids = [element["element_id"] for element in session["current_diagram_model"]["elements"]]
        response = self.client.post(
            "/diagram/add",
            json={
                "session_id": session["session_id"],
                "element_type": "connector",
                "label": "next",
                "source_id": element_ids[0],
                "target_id": element_ids[1],
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["content_mode"], "diagram")
        self.assertGreaterEqual(len(payload["current_diagram_model"]["connectors"]), 2)

    def test_revert_can_jump_to_any_saved_version(self):
        backend = make_backend(generate_color="red")
        with patch("Backend.app._generation_backend", return_value=backend):
            generated = self.client.post(
                "/generate",
                data={"prompt_text": "A small robot", "model_name": "test-model"},
            ).json()

        with patch("Backend.app._generation_backend", return_value=backend):
            with patch(
                "Backend.app.perform_precise_edit",
                side_effect=[
                    make_precision_result("blue", "Make it blueprint blue"),
                    make_precision_result("green", "Add neon green lighting"),
                ],
            ):
                self.client.post(
                    "/edit",
                    data={
                        "session_id": generated["session_id"],
                        "prompt_text": "Make it blueprint blue",
                        "model_name": "test-model",
                    },
                )
                self.client.post(
                    "/edit",
                    data={
                        "session_id": generated["session_id"],
                        "prompt_text": "Add neon green lighting",
                        "model_name": "test-model",
                    },
                )

        revert_response = self.client.post(
            "/revert",
            json={"session_id": generated["session_id"], "version": 0},
        )
        self.assertEqual(revert_response.status_code, 200, revert_response.text)
        payload = revert_response.json()
        self.assertEqual(payload["current_index"], 0)
        self.assertEqual(payload["current_entry"]["version"], 0)
        self.assertEqual(len(payload["edit_history"]), 3)
        self.assertTrue(payload["can_revert"])
        self.assertEqual(payload["edit_history"][-1]["version"], 2)

    def test_legacy_generate_image_endpoint_still_returns_png_bytes(self):
        backend = make_backend(generate_color="orange")
        with patch("Backend.app._generation_backend", return_value=backend):
            response = self.client.post(
                "/generate/image",
                data={"prompt_text": "A silhouette", "model_name": "test-model"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertGreater(len(response.content), 0)

    def test_precise_edit_forwards_explicit_workflow_profile(self):
        backend = Mock()
        backend.edit.return_value = make_png_bytes("blue")
        with patch("Backend.precision_editing.get_generation_backend", return_value=backend):
            perform_precise_edit(
                make_png_bytes("white"),
                "Change the shirt to red",
                model_name="Qwen_Image_Edit-Q2_K.gguf",
                workflow_profile="qwen-image-edit-gguf",
                server_url="http://localhost:8188",
            )

        first_request = backend.edit.call_args_list[0].args[0]
        self.assertIsInstance(first_request, GenerationRequest)
        self.assertEqual(first_request.workflow_profile, "qwen-image-edit-gguf")

    def test_precise_edit_uses_asset_refine_task_for_explicit_mask(self):
        backend = Mock()
        backend.edit.return_value = make_png_bytes("blue")
        with patch("Backend.precision_editing.get_generation_backend", return_value=backend):
            perform_precise_edit(
                make_png_bytes("white"),
                "Change the shirt to red",
                model_name="sd_xl_base_1.0.safetensors",
                workflow_profile=resolve_workflow_profile(
                    "asset_refine",
                    model_name="sd_xl_base_1.0.safetensors",
                ).name,
                server_url="http://localhost:8188",
                mask_image_bytes=make_png_bytes("white"),
            )

        first_request = backend.edit.call_args_list[0].args[0]
        self.assertIsInstance(first_request, GenerationRequest)
        self.assertEqual(first_request.task_type, "asset_refine")
        self.assertLessEqual(first_request.denoise, 0.32)
        self.assertIsNotNone(first_request.input_image)
        self.assertGreaterEqual(len(first_request.input_image), 1)


if __name__ == "__main__":
    unittest.main()
