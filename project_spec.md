# Editable AI Image Generation System

## 1. Overview

This project implements an **AI-powered image editing system** that allows users to iteratively modify images using natural language prompts. The goal is to move beyond one-shot generation and support a **persistent, stateful editing workflow** where users can refine outputs over multiple steps.

The system builds on an existing codebase and focuses on:
- Prompt-based image editing
- State tracking across edits
- Efficient backend processing
- Scalable API design

This is not just image generation — it is an **interactive editing pipeline**.

---

## 2. Core Problem

Most AI image tools (e.g., diffusion-based generators) are:
- Stateless
- One-shot (prompt → image)
- Hard to iteratively refine

We are solving:
> How do we enable **controlled, incremental edits** to an image using natural language while preserving prior structure?

---

## 3. System Architecture

### High-Level Components

```
Frontend (UI)
    ↓
Backend API (FastAPI / Express)
    ↓
Orchestrator Layer
    ↓
Model Interface (Diffusion / VLM / Editing Model)
    ↓
Storage Layer (Images + Metadata)
```

---

## 4. Key Modules

### 4.1 API Layer

Handles all client interaction.

**Responsibilities:**
- Accept prompts and images
- Route requests to orchestrator
- Return edited images + metadata

**Endpoints (expected):**
- `POST /generate`
- `POST /edit`
- `GET /history/:session_id`
- `POST /undo`

---

### 4.2 Orchestrator

Central control logic.

**Responsibilities:**
- Maintain edit history
- Construct model inputs
- Decide editing strategy

---

### 4.3 Image State Representation

Each session maintains:

```json
{
  "session_id": "...",
  "original_image": "...",
  "current_image": "...",
  "edit_history": [
    {
      "prompt": "add a sunset",
      "operation": "inpaint",
      "timestamp": ...
    }
  ]
}
```

---

### 4.4 Model Layer

Abstracts the underlying AI models.

**Interface:**
```python
def edit_image(image, prompt, mask=None, config=None) -> Image:
    pass
```

---

### 4.5 Storage Layer

Stores:
- Images (original + intermediate)
- Metadata (edit history, prompts)

---

## 5. Editing Pipeline

### Step-by-Step Flow

1. User uploads or generates base image
2. User provides edit prompt
3. System:
   - Retrieves current image
   - Determines edit type
   - Calls model
4. New image stored
5. History updated
6. Response returned

---

## 6. Editing Types

- Full regeneration
- Inpainting
- Guided editing

---

## 7. State Management

Key requirement: **non-destructive edits**

Approach:
- Never overwrite original image
- Maintain full edit chain
- Allow rollback / undo

---

## 8. Data Flow

```
User Prompt → API → Orchestrator → Model → Storage → Response
```

---

## 9. Extensibility Goals

- Multi-step editing sessions
- Different model backends
- Plugin-style editing tools

---

## 10. Key Engineering Challenges

- Consistency across edits
- Latency
- Prompt interpretation

---

## 11. Minimal MVP Requirements

- Upload image
- Apply prompt-based edit
- Return modified image
- Maintain session history

---

## 12. Summary

A **stateful, prompt-driven image editing engine** built on generative AI models.
