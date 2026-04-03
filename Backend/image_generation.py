import requests
import json
import time
import os
import random
from dotenv import load_dotenv

# Configuration
WORKFLOW_FILE = "workflow_api_with_image.json"

# Node IDs from verified workflow_api.json
LOAD_IMAGE_ID = "10" 
PROMPT_NODE_ID = "6"
NEGATIVE_NODE_ID = "7"
SAVE_IMAGE_ID = "9"
KSAMPLER_ID = "3"
CHECKPOINT_LOADER_ID = "4"


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


def process_prompt(model_name, denoise_val, prompt_text, server_url, 
                  seed = None, steps = 20, cfg = 8, sampler = "euler",
                  scheduler = "normal", denoise = 0.6):
    pass


def process_image(model_name, denoise_val, prompt_text, server_url, input_image, 
                  seed = None, steps = 20, cfg = 8, sampler = "euler",
                  scheduler = "normal", denoise = 0.6):
    # 1. Upload to Server
    print(f"Uploading {os.path.basename(input_image)} to {server_url}...")
    try:
        with open(input_image, "rb") as f:
            files = {"image": f}
            up_resp = requests.post(f"{server_url}/upload/image", files=files, data={"overwrite": "true"})
            server_filename = up_resp.json()["name"]
    except Exception as e:
        print(f"Upload failed: {e}")
        return

    # 2. Prepare the workflow JSON
    with open(WORKFLOW_FILE, "r") as f:
        workflow = json.load(f)

    # --- SET DYNAMIC VALUES ---
    # Image and Prompts
    workflow[LOAD_IMAGE_ID]["inputs"]["image"] = server_filename
    workflow[PROMPT_NODE_ID]["inputs"]["text"] = prompt_text
    
    # Model Selection
    workflow[CHECKPOINT_LOADER_ID]["inputs"]["ckpt_name"] = model_name
    
    # KSampler Settings (Node 3)
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

    # 5. Download the result
    view_resp = requests.get(f"{server_url}/view", params={"filename": out_name})
    output_path = f"processed_{os.path.basename(input_image)}"
    with open(output_path, "wb") as f:
        f.write(view_resp.content)
    
    print(f"Successfully saved to: {os.path.abspath(output_path)}")


if __name__ == "__main__":

    load_dotenv()

    # Configuration
    server_url = os.getenv("SERVER_URL")
    input_image = os.path.expanduser("~/Downloads/Elongated.jpg")
    model = os.getenv("MODEL")
        
    # Run with specific settings
    user_prompt = "A stylized bear with a (vibrant blue shirt:1.2), sunset background"
    process_image(model_name = model, denoise_val = 0.65, prompt_text = user_prompt,
                    server_url = server_url, input_image = input_image, seed = None, 
                    steps = 20, cfg = 8, sampler = "euler", scheduler = "normal", denoise = 0.6)