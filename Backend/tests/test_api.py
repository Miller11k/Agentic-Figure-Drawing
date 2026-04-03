import requests
import os
import io
from PIL import Image
from dotenv import load_dotenv
from pathlib import Path

# 1. Setup paths and load .env
current_file = Path(__file__).resolve()
project_root = current_file.parent.parent.parent
env_path = project_root / ".env"
load_dotenv(dotenv_path=env_path)

# 2. Configuration
api_port = os.getenv("API_PORT", "9988") 
API_URL = f"http://127.0.0.1:{api_port}/generate/image"
TEST_IMAGE_PATH = os.path.expanduser("~/Downloads/Elongated.jpg")

def test_generate_and_display():
    if not os.path.exists(TEST_IMAGE_PATH):
        print(f"Error: Could not find test image at {TEST_IMAGE_PATH}")
        return

    data = {
        "prompt_text": "A colorful cyberpunk painting of this figure, high detail",
        "denoise": 0.5,
        "steps": 20
    }

    with open(TEST_IMAGE_PATH, "rb") as f:
        files = {"input_image": (os.path.basename(TEST_IMAGE_PATH), f, "image/jpeg")}
        
        print(f"Sending request to {API_URL}...")
        try:
            response = requests.post(API_URL, data=data, files=files)
            
            if response.status_code == 200:
                # --- PILLOW MAGIC ---
                # 1. Convert raw bytes from response into a file-like object in RAM
                image_bytes = io.BytesIO(response.content)
                
                # 2. Open the image using PIL
                img = Image.open(image_bytes)
                
                # 3. Display the image using your OS's default viewer
                print("Success! Opening image viewer...")
                img.show(title="FastAPI Render Result")
                
            else:
                print(f"Failed! Status: {response.status_code}, Detail: {response.text}")
                
        except requests.exceptions.ConnectionError:
            print(f"Connection Refused: Is the FastAPI server running on port {api_port}?")

if __name__ == "__main__":
    test_generate_and_display()