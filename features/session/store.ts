"use client";

import { create } from "zustand";
import type { DiagramModel, EditorMode, EditTargetType } from "@/types";
import type { ImageGenerationProvider } from "@/lib/google";

export interface SelectedDiagramElement {
  id: string;
  type: Extract<EditTargetType, "node" | "edge" | "group">;
}

export interface PendingImageEditRequest {
  id: number;
  sessionId: string;
  versionId?: string;
}

interface EditorState {
  mode: EditorMode;
  activeSessionId?: string;
  activeVersionId?: string;
  activeArtifactId?: string;
  activeDiagramModel?: DiagramModel;
  activeXml?: string;
  activeImageDataUrl?: string;
  imageProvider: ImageGenerationProvider;
  prompt: string;
  selectedVersionId?: string;
  selectedElement?: SelectedDiagramElement;
  pendingEdgeSourceId?: string;
  pendingImageEditRequest?: PendingImageEditRequest;
  showHistory: boolean;
  setMode: (mode: EditorMode) => void;
  setPrompt: (prompt: string) => void;
  setActiveSession: (sessionId: string, versionId?: string | null) => void;
  setActiveVersion: (versionId?: string | null) => void;
  setActiveArtifact: (artifactId?: string) => void;
  setDiagramState: (diagramModel?: DiagramModel, xml?: string) => void;
  setActiveImageDataUrl: (dataUrl?: string) => void;
  setImageProvider: (provider: ImageGenerationProvider) => void;
  selectVersion: (versionId?: string) => void;
  selectElement: (element?: SelectedDiagramElement) => void;
  setPendingEdgeSource: (nodeId?: string) => void;
  requestImageEdit: (request: Omit<PendingImageEditRequest, "id">) => void;
  clearPendingImageEditRequest: (requestId: number) => void;
  setShowHistory: (showHistory: boolean) => void;
  clearWorkspace: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: "diagram",
  imageProvider: "gemini",
  showHistory: false,
  prompt: "",
  setMode: (mode) => set({ mode }),
  setPrompt: (prompt) => set({ prompt }),
  setActiveSession: (activeSessionId, activeVersionId) =>
    set({ activeSessionId, activeVersionId: activeVersionId ?? undefined, selectedVersionId: activeVersionId ?? undefined }),
  setActiveVersion: (activeVersionId) => set({ activeVersionId: activeVersionId ?? undefined }),
  setActiveArtifact: (activeArtifactId) => set({ activeArtifactId }),
  setDiagramState: (activeDiagramModel, activeXml) => set({ activeDiagramModel, activeXml }),
  setActiveImageDataUrl: (activeImageDataUrl) => set({ activeImageDataUrl }),
  setImageProvider: (imageProvider) => set({ imageProvider }),
  selectVersion: (selectedVersionId) => set({ selectedVersionId }),
  selectElement: (selectedElement) => set({ selectedElement }),
  setPendingEdgeSource: (pendingEdgeSourceId) => set({ pendingEdgeSourceId }),
  requestImageEdit: (request) =>
    set({
      pendingImageEditRequest: {
        ...request,
        id: Date.now()
      }
    }),
  clearPendingImageEditRequest: (requestId) =>
    set((state) => ({
      pendingImageEditRequest:
        state.pendingImageEditRequest?.id === requestId ? undefined : state.pendingImageEditRequest
    })),
  setShowHistory: (showHistory) => set({ showHistory }),
  clearWorkspace: () =>
    set({
      activeSessionId: undefined,
      activeVersionId: undefined,
      activeArtifactId: undefined,
      activeDiagramModel: undefined,
      activeXml: undefined,
      activeImageDataUrl: undefined,
      selectedVersionId: undefined,
      selectedElement: undefined,
      pendingEdgeSourceId: undefined,
      pendingImageEditRequest: undefined,
      prompt: "",
      showHistory: false
    })
}));
