import requests
import json
import time
import os
import random
from dotenv import load_dotenv
import io
from PIL import Image

# Configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(SCRIPT_DIR)

# Define the path to the 'workflows' folder relative to the script
WORKFLOWS_DIR = os.path.join(SCRIPT_DIR, "workflows")

# Define the absolute paths to specific JSON files
WORKFLOW_IMAGE_TO_IMAGE = os.path.join(WORKFLOWS_DIR, "workflow_api_with_image.json")
WORKFLOW_TEXT_TO_IMAGE = os.path.join(WORKFLOWS_DIR, "workflow_api_no_image.json")

# Node IDs from verified workflow_api.json
LOAD_IMAGE_ID = "10" 
PROMPT_NODE_ID = "6"
NEGATIVE_NODE_ID = "7"
SAVE_IMAGE_ID = "9"
KSAMPLER_ID = "3"
CHECKPOINT_LOADER_ID = "4"
EMPTY_LATENT_ID = "12" # Node ID for Empty Latent Image

# Per-model parameter overrides.
# Any model whose filename contains a key (case-insensitive) gets these defaults
# applied automatically, overriding whatever the caller passed in.
MODEL_CONFIGS = {
    "sdxl_lightning": {
        "steps": 4,
        "cfg": 1.8,
        "sampler": "euler",
        "scheduler": "sgm_uniform",
    },
}

def get_model_config(model_name: str) -> dict:
    """Return parameter overrides for the given model filename, or {} if none."""
    if not model_name:
        return {}
    lower = model_name.lower()
    for key, config in MODEL_CONFIGS.items():
        if key in lower:
            return config
    return {}


def list_models(server_url):
    """Fetches all available checkpoints from the Server."""
    try:
        response = requests.get(f"{server_url}/object_info")
        data = response.json()
        # Navigates the API schema to find the list of model filenames
        return data["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
    except Exception as e:
        print(f"Could not fetch models: {e}")
        return []
    

def display_available_models(server_url):
    # Get available models from the server
    models = list_models(server_url)
    
    if not models:
        print("No models found. Check your ComfyUI models/checkpoints folder.")
    else:
        print("\nAvailable Models:")
        for i, m in enumerate(models):
            print(f"[{i}] {m}")


def process_prompt(model_name, prompt_text, server_url, 
                  width=512, height=512, seed=None, steps=20, 
                  cfg=8.0, sampler="euler", scheduler="normal"):
    """Text-to-Image Generation Implementation"""
    
    # 1. Load the specific Text-to-Image workflow
    with open(WORKFLOW_TEXT_TO_IMAGE, "r") as f:
        workflow = json.load(f)

    # 2. Set Dynamic Values for Text-to-Image
    # Node 12: Empty Latent (Resolution)
    workflow[EMPTY_LATENT_ID]["inputs"]["width"] = width
    workflow[EMPTY_LATENT_ID]["inputs"]["height"] = height
    
    # Node 6: Positive Prompt
    workflow[PROMPT_NODE_ID]["inputs"]["text"] = prompt_text
    
    # Node 4: Model Selection
    workflow[CHECKPOINT_LOADER_ID]["inputs"]["ckpt_name"] = model_name
    
    # Node 3: KSampler Settings — apply per-model overrides first
    cfg_override = get_model_config(model_name)
    steps    = cfg_override.get("steps",     steps)
    cfg      = cfg_override.get("cfg",       cfg)
    sampler  = cfg_override.get("sampler",   sampler)
    scheduler= cfg_override.get("scheduler", scheduler)

    final_seed = seed if seed is not None else random.randint(1, 1000000000000)
    workflow[KSAMPLER_ID]["inputs"]["seed"] = final_seed
    workflow[KSAMPLER_ID]["inputs"]["steps"] = steps
    workflow[KSAMPLER_ID]["inputs"]["cfg"] = cfg
    workflow[KSAMPLER_ID]["inputs"]["sampler_name"] = sampler
    workflow[KSAMPLER_ID]["inputs"]["scheduler"] = scheduler
    # In Text-to-Image, denoise MUST be 1.0 to generate from scratch
    workflow[KSAMPLER_ID]["inputs"]["denoise"] = 1.0 

    # 3. Queue the prompt
    print(f"Generating from text: '{prompt_text[:30]}...' with seed {final_seed}")
    p = {"prompt": workflow}
    q_resp = requests.post(f"{server_url}/prompt", data=json.dumps(p).encode('utf-8'))
    
    if q_resp.status_code != 200:
        print(f"Server Error: {q_resp.text}")
        return

    prompt_id = q_resp.json()["prompt_id"]

    # 4. Poll for completion
    while True:
        history = requests.get(f"{server_url}/history/{prompt_id}").json()
        if prompt_id in history:
            out_name = history[prompt_id]["outputs"][SAVE_IMAGE_ID]["images"][0]["filename"]
            break
        time.sleep(1)

    # 5. Return result
    view_resp = requests.get(f"{server_url}/view", params={"filename": out_name})
    
    if view_resp.status_code == 200:
        return view_resp.content
    return None


def process_image(model_name, denoise_val: float, prompt_text, server_url, input_image, 
                  seed = None, steps: int = 20, cfg: float = 8.0, sampler = "euler",
                  scheduler = "normal", denoise: float = 0.6):
    # 1. Upload to Server
    display_name = os.path.basename(input_image) if isinstance(input_image, str) else "bytes_upload.png"
    print(f"Uploading {os.path.basename(display_name)} to {server_url}...")
    try:
        # Check if input_image is bytes or a file path
        if isinstance(input_image, bytes):
            files = {"image": ("input_image.png", input_image)}
        else:
            files = {"image": open(input_image, "rb")}
            
        up_resp = requests.post(f"{server_url}/upload/image", files=files, data={"overwrite": "true"})
        server_filename = up_resp.json()["name"]
    except Exception as e:
        print(f"Upload failed: {e}")
        return None

    # 2. Prepare the workflow JSON
    with open(WORKFLOW_IMAGE_TO_IMAGE, "r") as f:
        workflow = json.load(f)

    # --- SET DYNAMIC VALUES ---
    # Image and Prompts
    workflow[LOAD_IMAGE_ID]["inputs"]["image"] = server_filename
    workflow[PROMPT_NODE_ID]["inputs"]["text"] = prompt_text
    
    # Model Selection
    workflow[CHECKPOINT_LOADER_ID]["inputs"]["ckpt_name"] = model_name
    
    # KSampler Settings (Node 3) — apply per-model overrides first
    cfg_override = get_model_config(model_name)
    steps    = cfg_override.get("steps",     steps)
    cfg      = cfg_override.get("cfg",       cfg)
    sampler  = cfg_override.get("sampler",   sampler)
    scheduler= cfg_override.get("scheduler", scheduler)
    # For lightning models denoise should stay at 1.0 for img2img too
    if "denoise" in cfg_override:
        denoise = cfg_override["denoise"]

    # If no seed is provided, generate a random one
    final_seed = seed if seed is not None else random.randint(1, 1000000000000)
    
    workflow[KSAMPLER_ID]["inputs"]["seed"] = final_seed
    workflow[KSAMPLER_ID]["inputs"]["steps"] = steps
    workflow[KSAMPLER_ID]["inputs"]["cfg"] = cfg
    workflow[KSAMPLER_ID]["inputs"]["sampler_name"] = sampler
    workflow[KSAMPLER_ID]["inputs"]["scheduler"] = scheduler
    workflow[KSAMPLER_ID]["inputs"]["denoise"] = denoise

    # 3. Queue the prompt
    print(f"Queueing prompt on RTX 3050 with model: {model_name}...")
    p = {"prompt": workflow}
    q_resp = requests.post(f"{server_url}/prompt", data=json.dumps(p).encode('utf-8'))
    
    if q_resp.status_code != 200:
        print(f"Server rejected request: {q_resp.text}")
        return

    prompt_id = q_resp.json()["prompt_id"]

    # 4. Poll for completion
    print("Waiting for render...")
    while True:
        history = requests.get(f"{server_url}/history/{prompt_id}").json()
        if prompt_id in history:
            outputs = history[prompt_id]["outputs"][SAVE_IMAGE_ID]["images"]
            out_name = outputs[0]["filename"]
            break
        time.sleep(1)

    # 5. Return result
    view_resp = requests.get(f"{server_url}/view", params={"filename": out_name})
    
    if view_resp.status_code == 200:
        return view_resp.content
    return None


if __name__ == "__main__":

    env_path = os.path.join(PARENT_DIR, ".env")
    
    try:
        if not load_dotenv(dotenv_path=env_path):
            raise FileNotFoundError("Environment file (.env) not found in parent directory.")
    except Exception as e:
        print(f"Startup Error: {e}")
        
    # Configuration
    server_url = os.getenv("SERVER_URL")
    input_image = os.path.expanduser("~/Downloads/Elongated.jpg")
    
    # 1. Try to get model from environment
    model = os.getenv("MODEL")
    
    # 2. If it's not set, fetch the list and grab the first one
    if not model:
        available_models = list_models(server_url)
        if available_models:
            model = available_models[0]
            # print(f"No MODEL env var found. Defaulting to first available: {model}")
        else:
            print("Error: No models found on server and no MODEL env var set.")
            exit(1) # Stop the script if no model can be found at all
        
    # --- TEST 1: Text-to-Image ---
    print("--- Starting Stage 1: Text-to-Image ---")
    txt_prompt = "A futuristic city built into a giant glowing mushroom, cinematic lighting"
    
    # Generate the first image
    first_image_bytes = process_prompt(model_name=model, prompt_text=txt_prompt, server_url=server_url)

    if first_image_bytes:
        # Display the first result
        img1 = Image.open(io.BytesIO(first_image_bytes))
        img1.show(title="Stage 1 Result (Text-to-Image)")

        # --- TEST 2: Image-to-Image (Using result from Test 1) ---
        print("\n--- Starting Stage 2: Image-to-Image (Feeding in Stage 1 result) ---")
        img2img_prompt = "Change this image so it is in the style of surrealism."
        
        # Pass the BYTES from the first test into the second test
        second_image_bytes = process_image(
            model_name=model, 
            denoise_val=0.6, 
            prompt_text=img2img_prompt,
            server_url=server_url, 
            input_image=first_image_bytes,
            denoise=0.6
        )
        if second_image_bytes:
            img2 = Image.open(io.BytesIO(second_image_bytes))
            img2.show(title="Stage 2 Result (Image-to-Image)")
        else:
            print("Stage 2 failed.")

    else:
        print("Stage 1 failed. Skipping Stage 2.")