"use client";

import { create } from "zustand";
import type { DiagramModel, EditorMode, EditTargetType } from "@/types";

export interface SelectedDiagramElement {
  id: string;
  type: Extract<EditTargetType, "node" | "edge" | "group">;
}

interface EditorState {
  mode: EditorMode;
  activeSessionId?: string;
  activeVersionId?: string;
  activeArtifactId?: string;
  activeDiagramModel?: DiagramModel;
  activeXml?: string;
  activeImageDataUrl?: string;
  prompt: string;
  selectedVersionId?: string;
  selectedElement?: SelectedDiagramElement;
  pendingEdgeSourceId?: string;
  setMode: (mode: EditorMode) => void;
  setPrompt: (prompt: string) => void;
  setActiveSession: (sessionId: string, versionId?: string | null) => void;
  setActiveVersion: (versionId?: string | null) => void;
  setActiveArtifact: (artifactId?: string) => void;
  setDiagramState: (diagramModel?: DiagramModel, xml?: string) => void;
  setActiveImageDataUrl: (dataUrl?: string) => void;
  selectVersion: (versionId?: string) => void;
  selectElement: (element?: SelectedDiagramElement) => void;
  setPendingEdgeSource: (nodeId?: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  mode: "diagram",
  prompt: "",
  setMode: (mode) => set({ mode }),
  setPrompt: (prompt) => set({ prompt }),
  setActiveSession: (activeSessionId, activeVersionId) =>
    set({ activeSessionId, activeVersionId: activeVersionId ?? undefined, selectedVersionId: activeVersionId ?? undefined }),
  setActiveVersion: (activeVersionId) => set({ activeVersionId: activeVersionId ?? undefined }),
  setActiveArtifact: (activeArtifactId) => set({ activeArtifactId }),
  setDiagramState: (activeDiagramModel, activeXml) => set({ activeDiagramModel, activeXml }),
  setActiveImageDataUrl: (activeImageDataUrl) => set({ activeImageDataUrl }),
  selectVersion: (selectedVersionId) => set({ selectedVersionId }),
  selectElement: (selectedElement) => set({ selectedElement }),
  setPendingEdgeSource: (pendingEdgeSourceId) => set({ pendingEdgeSourceId })
}));
