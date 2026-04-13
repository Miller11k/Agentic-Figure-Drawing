import unittest
from unittest.mock import patch

from Backend.image_generation import _render_workflow_template, list_model_catalog, list_models
from Backend.workflow_profiles import resolve_workflow_profile


class WorkflowProfileTests(unittest.TestCase):
    def test_resolve_workflow_profile_detects_sdxl(self):
        with patch.dict(
            "os.environ",
            {"WORKFLOW_PROFILE_TEXT_TO_IMAGE": "", "WORKFLOW_PROFILE_IMAGE_EDIT": ""},
            clear=False,
        ):
            profile = resolve_workflow_profile("text_to_image", model_name="sdxl_base_1.0.safetensors")
        self.assertEqual(profile.name, "sdxl")

    def test_resolve_workflow_profile_detects_flux_kontext(self):
        with patch.dict(
            "os.environ",
            {"WORKFLOW_PROFILE_TEXT_TO_IMAGE": "", "WORKFLOW_PROFILE_IMAGE_EDIT": ""},
            clear=False,
        ):
            profile = resolve_workflow_profile("image_edit", model_name="flux1-kontext-dev.safetensors")
        self.assertEqual(profile.name, "flux-kontext")

    def test_flux_profile_has_builtin_image_edit_template(self):
        with patch.dict(
            "os.environ",
            {"WORKFLOW_PROFILE_TEXT_TO_IMAGE": "", "WORKFLOW_PROFILE_IMAGE_EDIT": ""},
            clear=False,
        ):
            profile = resolve_workflow_profile("image_edit", model_name="flux1-schnell-fp8.safetensors")
        self.assertEqual(profile.name, "flux")
        self.assertTrue(profile.template_for_task("image_edit"))

    def test_resolve_workflow_profile_detects_qwen_edit_gguf(self):
        with patch.dict(
            "os.environ",
            {"WORKFLOW_PROFILE_TEXT_TO_IMAGE": "", "WORKFLOW_PROFILE_IMAGE_EDIT": ""},
            clear=False,
        ):
            profile = resolve_workflow_profile("image_edit", model_name="Qwen_Image_Edit-Q2_K.gguf")
        self.assertEqual(profile.name, "qwen-image-edit-gguf")
        self.assertTrue(profile.template_for_task("image_edit"))

    def test_render_workflow_template_replaces_nested_placeholders(self):
        template = {
            "4": {"inputs": {"ckpt_name": "__MODEL__"}},
            "6": {"inputs": {"text": "__PROMPT__"}},
            "12": {"inputs": {"width": "__WIDTH__", "height": "__HEIGHT__"}},
        }
        rendered = _render_workflow_template(
            template,
            {
                "__MODEL__": "dreamshaper_8.safetensors",
                "__PROMPT__": "hello world",
                "__WIDTH__": 1024,
                "__HEIGHT__": 1024,
            },
        )

        self.assertEqual(rendered["4"]["inputs"]["ckpt_name"], "dreamshaper_8.safetensors")
        self.assertEqual(rendered["6"]["inputs"]["text"], "hello world")
        self.assertEqual(rendered["12"]["inputs"]["width"], 1024)
        self.assertEqual(rendered["12"]["inputs"]["height"], 1024)

    def test_model_listing_filters_hidden_runtime_incompatible_models(self):
        fake_object_info = {
            "CheckpointLoaderSimple": {"input": {"required": {"ckpt_name": [["sd_xl_base_1.0.safetensors"]]}}},
            "UnetLoaderGGUF": {
                "input": {
                    "required": {
                        "unet_name": [["Qwen-Image-Edit-2509-Q2_K.gguf", "Qwen_Image_Edit-Q2_K.gguf"]]
                    }
                }
            },
            "CLIPLoaderGGUF": {"input": {"required": {"clip_name": [["Qwen2.5-VL-7B-Instruct-Q2_K.gguf"]]}}},
            "VAELoader": {"input": {"required": {"vae_name": [["Qwen_Image-VAE.safetensors"]]}}},
        }
        with patch("Backend.image_generation._object_info", return_value=fake_object_info):
            models = list_models("http://example.invalid")
            catalog = list_model_catalog("http://example.invalid")

        self.assertIn("Qwen-Image-Edit-2509-Q2_K.gguf", models)
        self.assertNotIn("Qwen_Image_Edit-Q2_K.gguf", models)
        self.assertIn("Qwen-Image-Edit-2509-Q2_K.gguf", catalog["gguf_diffusion_models"])
        self.assertNotIn("Qwen_Image_Edit-Q2_K.gguf", catalog["gguf_diffusion_models"])


if __name__ == "__main__":
    unittest.main()
