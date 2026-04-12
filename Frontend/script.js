const API_BASE = (() => {
    if (window.location.protocol === "file:") {
        return "http://127.0.0.1:9988/api";
    }

    const port = window.location.port;
    if (port === "9988" || port === "5080" || port === "" || port === "80" || port === "443") {
        return `${window.location.origin}/api`;
    }

    return `${window.location.protocol}//${window.location.hostname}:9988/api`;
})();

const dropZone = document.getElementById("drop-zone");
const dropZoneWrapper = document.getElementById("drop-zone-wrapper");
const fileInput = document.getElementById("file-input");
const previewImg = document.getElementById("preview-img");
const drawioContainer = document.getElementById("drawio-container");
const clearUploadBtn = document.getElementById("clear-upload-btn");
const resetSessionBtn = document.getElementById("reset-session-btn");
const submitBtn = document.getElementById("submit-btn");
const promptText = document.getElementById("prompt-text");
const errorDiv = document.getElementById("error-message");
const statusDiv = document.getElementById("status-message");
const helperText = document.getElementById("helper-text");
const userDescription = document.getElementById("user-description");
const btnPromptMode = document.getElementById("mode-prompt");
const btnImageMode = document.getElementById("mode-image");
const composerPanel = document.querySelector(".composer-panel");
const sessionTitle = document.getElementById("session-title");
const sessionPill = document.getElementById("session-pill");
const resultStage = document.getElementById("result-stage");
const resultImage = document.getElementById("result-image");
const resultPlaceholder = document.getElementById("result-placeholder");
const historyList = document.getElementById("history-list");
const historyCount = document.getElementById("history-count");
const modelSelect = document.getElementById("model-select");
const modelHint = document.getElementById("model-hint");
const workflowProfileSelect = document.getElementById("workflow-profile-select");
const workflowProfileHint = document.getElementById("workflow-profile-hint");
const processingModeSelect = document.getElementById("processing-mode");
const diagramPanel = document.getElementById("diagram-panel");
const diagramModePill = document.getElementById("diagram-mode-pill");
const diagramHelper = document.getElementById("diagram-helper");
const diagramCanvasPanel = document.getElementById("diagram-canvas-panel");
const diagramCanvas = document.getElementById("diagram-canvas");
const diagramXmlView = document.getElementById("diagram-xml-view");
const diagramExportBtn = document.getElementById("diagram-export-btn");
const diagramToggleXmlBtn = document.getElementById("diagram-toggle-xml-btn");
const diagramElementSelect = document.getElementById("diagram-element-select");
const diagramLabelInput = document.getElementById("diagram-label-input");
const diagramFillInput = document.getElementById("diagram-fill-input");
const diagramStrokeInput = document.getElementById("diagram-stroke-input");
const diagramXInput = document.getElementById("diagram-x-input");
const diagramYInput = document.getElementById("diagram-y-input");
const diagramWidthInput = document.getElementById("diagram-width-input");
const diagramHeightInput = document.getElementById("diagram-height-input");
const diagramSemanticInput = document.getElementById("diagram-semantic-input");
const diagramSourceSelect = document.getElementById("diagram-source-select");
const diagramTargetSelect = document.getElementById("diagram-target-select");
const diagramApplyBtn = document.getElementById("diagram-apply-btn");
const diagramDeleteBtn = document.getElementById("diagram-delete-btn");
const diagramAddType = document.getElementById("diagram-add-type");
const diagramAddLabel = document.getElementById("diagram-add-label");
const diagramAddSource = document.getElementById("diagram-add-source");
const diagramAddTarget = document.getElementById("diagram-add-target");
const diagramAddBtn = document.getElementById("diagram-add-btn");

const state = {
    currentMode: "image",
    selectedFile: null,
    selectedFileKind: null,
    previewObjectUrl: null,
    currentSession: null,
    isBusy: false,
    availableModels: [],
    availableWorkflowProfiles: [],
    selectedModel: "",
    activeModel: "",
    modelMessage: "Loading live models from ComfyUI...",
    selectedWorkflowProfile: "",
    workflowProfileMessage: "Loading workflow profiles...",
    taskDefaults: {},
    workflowDefaults: {},
    processingMode: "auto",
    currentDiagramModel: null,
    selectedDiagramElementId: "",
    showDiagramXml: false,
    dragState: null,
};

resultImage.addEventListener("load", () => {
    clearError();
});

resultImage.addEventListener("error", () => {
    showError("The result image was generated, but the browser could not load it. Try refreshing the page or starting a new session.");
});

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
});

["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add("drag-over"));
});

["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove("drag-over"));
});

dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
        handleFile(file);
    }
});

dropZone.addEventListener("click", () => {
    if (!state.isBusy) {
        fileInput.click();
    }
});

fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
        handleFile(file);
    }
});

btnPromptMode.addEventListener("click", () => setMode("prompt"));
btnImageMode.addEventListener("click", () => setMode("image"));
clearUploadBtn.addEventListener("click", clearUpload);
resetSessionBtn.addEventListener("click", resetSession);
submitBtn.addEventListener("click", submitRequest);
modelSelect.addEventListener("change", () => {
    state.selectedModel = modelSelect.value;
    syncTaskRoutingSelection();
    refreshModelHint();
});
workflowProfileSelect.addEventListener("change", () => {
    state.selectedWorkflowProfile = workflowProfileSelect.value;
    refreshWorkflowProfileHint();
});
processingModeSelect.addEventListener("change", () => {
    state.processingMode = processingModeSelect.value;
});
diagramElementSelect.addEventListener("change", () => {
    state.selectedDiagramElementId = diagramElementSelect.value;
    populateDiagramFields();
});
diagramApplyBtn.addEventListener("click", applyDiagramElementEdit);
diagramDeleteBtn.addEventListener("click", deleteDiagramElement);
diagramAddBtn.addEventListener("click", addDiagramObject);
diagramToggleXmlBtn.addEventListener("click", toggleDiagramXml);
diagramExportBtn.addEventListener("click", exportDiagramXml);

function setMode(mode) {
    state.currentMode = mode;
    btnImageMode.classList.toggle("active", mode === "image");
    btnPromptMode.classList.toggle("active", mode === "prompt");
    composerPanel.classList.toggle("mode-prompt-active", mode === "prompt");

    if (mode === "prompt") {
        helperText.textContent = state.currentSession
            ? "You already have a live session. Submitting now will keep editing the current image with text-only prompts."
            : "Prompt Only creates a fresh image from scratch and opens a tracked editing session.";
    } else {
        helperText.textContent = state.currentSession
            ? "Upload a new raster image to start a fresh image-based session, or leave the upload empty to keep editing the current one."
            : "Prompt + Image starts from an uploaded raster image and saves every edit as a restorable step.";
    }

    syncTaskRoutingSelection();
}

function handleFile(file) {
    const isImage = file.type.startsWith("image/");
    const isDrawIO = file.name.toLowerCase().endsWith(".drawio");

    if (!isImage && !isDrawIO) {
        showError("Unsupported file type. Use PNG, JPG, WebP, or a preview-only .drawio file.");
        return;
    }

    clearError();
    revokePreviewUrl();
    state.selectedFile = file;
    state.selectedFileKind = isImage ? "image" : "drawio";

    if (isImage) {
        state.previewObjectUrl = URL.createObjectURL(file);
        previewImg.src = state.previewObjectUrl;
        previewImg.hidden = false;
        drawioContainer.hidden = true;
        drawioContainer.innerHTML = "";
    } else {
        const reader = new FileReader();
        reader.onload = (event) => {
            previewImg.hidden = true;
            drawioContainer.hidden = false;
            renderDrawio(event.target?.result || "");
        };
        reader.readAsText(file);
    }

    promptText.classList.add("hidden");
    clearUploadBtn.classList.remove("hidden");
    fileInput.value = "";

    setStatus(
        state.currentSession
            ? `Loaded ${file.name}. The next submit will start a new session from this upload.`
            : `Loaded ${file.name}. Add a prompt and submit when you're ready.`
    );
}

function renderDrawio(xmlData) {
    drawioContainer.innerHTML = "";
    const element = document.createElement("div");
    element.className = "mxgraph";
    element.style.maxWidth = "100%";
    element.setAttribute(
        "data-mxgraph",
        JSON.stringify({
            highlight: "#d96c2f",
            nav: false,
            toolbar: "hidden",
            edit: null,
            xml: xmlData,
        })
    );
    drawioContainer.appendChild(element);

    if (window.GraphViewer) {
        GraphViewer.processElements();
    }
}

function clearUpload() {
    revokePreviewUrl();
    state.selectedFile = null;
    state.selectedFileKind = null;
    previewImg.src = "";
    previewImg.hidden = true;
    drawioContainer.innerHTML = "";
    drawioContainer.hidden = true;
    promptText.classList.remove("hidden");
    clearUploadBtn.classList.add("hidden");
    fileInput.value = "";
    setStatus("Upload cleared. You can keep editing the active session or choose a new source image.");
}

function resetSession() {
    state.currentSession = null;
    state.currentDiagramModel = null;
    state.selectedDiagramElementId = "";
    state.showDiagramXml = false;
    clearUpload();
    userDescription.value = "";
    renderSession(null);
    setMode(state.currentMode);
    setStatus("Started a fresh workspace. Submit a prompt or upload a new source image.");
}

async function importDiagramSession() {
    if (!state.selectedFile || state.selectedFileKind !== "drawio" || state.isBusy) {
        return;
    }

    const formData = new FormData();
    formData.append("diagram_file", state.selectedFile);
    if (userDescription.value.trim()) {
        formData.append("prompt_text", userDescription.value.trim());
    }
    formData.append("mode_override", state.processingMode === "auto" ? "diagram" : state.processingMode);

    setBusy(true, "Importing the diagram into editable mode...");
    try {
        const response = await fetch(`${API_BASE}/diagram/import`, {
            method: "POST",
            body: formData,
        });
        const payload = await parseJsonResponse(response);
        state.currentSession = payload;
        renderSession(payload);
        userDescription.value = "";
        clearUpload();
        setMode("image");
        setStatus("Diagram imported. You can now edit elements directly or keep using prompts.");
    } catch (error) {
        showError(error.message || "Diagram import failed.");
    } finally {
        setBusy(false);
    }
}

async function createDiagramSession(prompt) {
    const formData = new FormData();
    formData.append("prompt_text", prompt || "Start");

    setBusy(true, "Creating a new editable diagram canvas...");
    try {
        const response = await fetch(`${API_BASE}/diagram/new`, {
            method: "POST",
            body: formData,
        });
        const payload = await parseJsonResponse(response);
        state.currentSession = payload;
        renderSession(payload);
        userDescription.value = "";
        setStatus("Diagram canvas created. Add nodes, connect them, or keep editing with prompts.");
    } catch (error) {
        showError(error.message || "Diagram canvas creation failed.");
    } finally {
        setBusy(false);
    }
}

async function loadModels() {
    state.modelMessage = "Loading live models from ComfyUI...";
    state.workflowProfileMessage = "Loading workflow profiles...";
    refreshModelHint();
    refreshWorkflowProfileHint();
    modelSelect.disabled = true;
    workflowProfileSelect.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/models`);
        const payload = await parseJsonResponse(response);
        state.availableModels = Array.isArray(payload.models) ? payload.models : [];
        state.availableWorkflowProfiles = Array.isArray(payload.workflow_profiles) ? payload.workflow_profiles : [];
        state.taskDefaults = payload.task_defaults || {};
        state.workflowDefaults = payload.workflow_defaults || {};

        populateModelOptions(
            state.availableModels,
            state.selectedModel || state.taskDefaults.image_edit || payload.default_model || payload.configured_model || ""
        );
        state.selectedModel = modelSelect.value;
        syncTaskRoutingSelection();

        if (state.availableModels.length === 0) {
            state.modelMessage = "No local models were reported by ComfyUI yet.";
        } else if (payload.configured_model && !payload.configured_model_available) {
            state.modelMessage = `Configured default ${payload.configured_model} is unavailable.`;
        } else {
            state.modelMessage = `Loaded ${state.availableModels.length} local model${state.availableModels.length === 1 ? "" : "s"} from ComfyUI.`;
        }

        if (state.availableWorkflowProfiles.length === 0) {
            state.workflowProfileMessage = "No workflow profiles were returned by the backend.";
        } else {
            state.workflowProfileMessage = `Backend supports ${state.availableWorkflowProfiles.length} workflow profile${state.availableWorkflowProfiles.length === 1 ? "" : "s"}.`;
        }
    } catch (error) {
        state.availableModels = [];
        populateModelOptions([], "");
        state.selectedModel = "";
        state.modelMessage = "Live model list unavailable. Requests will fall back to the backend default when possible.";
        state.availableWorkflowProfiles = [];
        populateWorkflowProfileOptions([], "");
        state.selectedWorkflowProfile = "";
        state.workflowProfileMessage = "Workflow profile list unavailable. Requests will auto-route when possible.";
        state.taskDefaults = {};
        state.workflowDefaults = {};
    }

    refreshModelHint();
    refreshWorkflowProfileHint();
    updateControls();
}

function populateModelOptions(models, preferredModel) {
    modelSelect.innerHTML = "";

    if (!models.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Backend default";
        modelSelect.appendChild(option);
        modelSelect.value = "";
        return;
    }

    models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
    });

    if (preferredModel && models.includes(preferredModel)) {
        modelSelect.value = preferredModel;
    } else {
        modelSelect.selectedIndex = 0;
    }
}

function refreshModelHint() {
    if (state.selectedModel && state.selectedModel !== state.activeModel) {
        modelHint.textContent = `Selected model: ${state.selectedModel}`;
        return;
    }

    if (state.activeModel) {
        modelHint.textContent = `Active model: ${state.activeModel}`;
        return;
    }

    modelHint.textContent = state.modelMessage;
}

function populateWorkflowProfileOptions(profiles, preferredProfile) {
    workflowProfileSelect.innerHTML = "";

    const autoOption = document.createElement("option");
    autoOption.value = "";
    autoOption.textContent = "Auto Select";
    workflowProfileSelect.appendChild(autoOption);

    const taskKey = getPreferredTaskKey();
    const filteredProfiles = getCompatibleWorkflowProfiles(profiles, taskKey, getEffectiveModelName());

    filteredProfiles.forEach((profile) => {
        const option = document.createElement("option");
        option.value = profile.name;
        option.textContent = profile.label || profile.name;
        workflowProfileSelect.appendChild(option);
    });

    workflowProfileSelect.value = preferredProfile && [...workflowProfileSelect.options].some((option) => option.value === preferredProfile)
        ? preferredProfile
        : "";
}

function syncWorkflowProfileOptions() {
    const preferredProfile =
        state.selectedWorkflowProfile ||
        state.workflowDefaults[getPreferredTaskKey()] ||
        "";
    populateWorkflowProfileOptions(state.availableWorkflowProfiles, preferredProfile);
    state.selectedWorkflowProfile = workflowProfileSelect.value;
    refreshWorkflowProfileHint();
}

function refreshWorkflowProfileHint() {
    if (state.selectedWorkflowProfile) {
        const profile = state.availableWorkflowProfiles.find((candidate) => candidate.name === state.selectedWorkflowProfile);
        workflowProfileHint.textContent = profile?.description || `Selected workflow profile: ${state.selectedWorkflowProfile}`;
        return;
    }

    workflowProfileHint.textContent = state.workflowProfileMessage;
}

function getPreferredTaskKey() {
    return state.currentMode === "prompt" && !state.currentSession ? "text_to_image" : "image_edit";
}

function syncTaskDefaultModelSelection() {
    if (!state.availableModels.length) {
        return;
    }

    const taskDefaultModel = state.taskDefaults[getPreferredTaskKey()];
    if (taskDefaultModel && state.availableModels.includes(taskDefaultModel)) {
        modelSelect.value = taskDefaultModel;
        state.selectedModel = taskDefaultModel;
    }
}

function isProfileTaskCompatible(profile, taskKey) {
    return taskKey === "text_to_image" ? profile.supports_text : profile.supports_image;
}

function doesProfileMatchModel(profile, modelName) {
    const effectiveModel = (modelName || "").toLowerCase();
    if (!effectiveModel) {
        return true;
    }
    if (profile.name === "legacy") {
        return !effectiveModel.includes("qwen") && !effectiveModel.includes("flux");
    }
    if (profile.name === "sdxl") {
        return effectiveModel.includes("xl");
    }
    if (profile.name === "sd35") {
        return effectiveModel.includes("sd3.5") || effectiveModel.includes("sd35") || effectiveModel.includes("stable-diffusion-3.5");
    }
    if (profile.name.startsWith("qwen")) {
        return effectiveModel.includes("qwen");
    }
    if (profile.name.startsWith("flux")) {
        return effectiveModel.includes("flux");
    }
    return true;
}

function getCompatibleWorkflowProfiles(profiles, taskKey, modelName) {
    return profiles.filter((profile) => isProfileTaskCompatible(profile, taskKey) && doesProfileMatchModel(profile, modelName));
}

function syncTaskRoutingSelection() {
    if (!state.availableModels.length) {
        return;
    }

    const taskKey = getPreferredTaskKey();
    const taskDefaultModel = state.taskDefaults[taskKey] || "";
    const taskDefaultWorkflow = state.workflowDefaults[taskKey] || "";

    if (!state.selectedModel || !state.availableModels.includes(state.selectedModel)) {
        syncTaskDefaultModelSelection();
    }

    let compatibleProfiles = getCompatibleWorkflowProfiles(
        state.availableWorkflowProfiles,
        taskKey,
        state.selectedModel || taskDefaultModel
    );

    if (!compatibleProfiles.length && taskDefaultModel && state.availableModels.includes(taskDefaultModel)) {
        modelSelect.value = taskDefaultModel;
        state.selectedModel = taskDefaultModel;
        compatibleProfiles = getCompatibleWorkflowProfiles(state.availableWorkflowProfiles, taskKey, taskDefaultModel);
    }

    const preferredProfile =
        compatibleProfiles.find((profile) => profile.name === state.selectedWorkflowProfile)?.name ||
        compatibleProfiles.find((profile) => profile.name === taskDefaultWorkflow)?.name ||
        compatibleProfiles[0]?.name ||
        "";

    populateWorkflowProfileOptions(state.availableWorkflowProfiles, preferredProfile);
    state.selectedWorkflowProfile = workflowProfileSelect.value;
    refreshWorkflowProfileHint();
}

function getEffectiveWorkflowProfileName() {
    return state.selectedWorkflowProfile || state.workflowDefaults[getPreferredTaskKey()] || "";
}

function getEffectiveModelName() {
    return state.selectedModel || state.taskDefaults[getPreferredTaskKey()] || "";
}

function getEffectiveWorkflowProfile() {
    const profileName = getEffectiveWorkflowProfileName();
    return state.availableWorkflowProfiles.find((profile) => profile.name === profileName) || null;
}

function appendWorkflowTuning(formData, isPromptGeneration) {
    const workflowProfile = getEffectiveWorkflowProfile();
    if (!workflowProfile) {
        if (isPromptGeneration) {
            formData.append("width", "512");
            formData.append("height", "512");
        }
        return;
    }

    if (workflowProfile.recommended_steps) {
        formData.append("steps", String(workflowProfile.recommended_steps));
    }
    if (workflowProfile.recommended_cfg) {
        formData.append("cfg", String(workflowProfile.recommended_cfg));
    }
    if (workflowProfile.recommended_sampler) {
        formData.append("sampler", String(workflowProfile.recommended_sampler));
    }
    if (workflowProfile.recommended_scheduler) {
        formData.append("scheduler", String(workflowProfile.recommended_scheduler));
    }
    if (isPromptGeneration) {
        formData.append("width", String(workflowProfile.recommended_width || 512));
        formData.append("height", String(workflowProfile.recommended_height || 512));
    }
}

async function submitRequest() {
    if (state.isBusy) {
        return;
    }

    if (state.selectedFileKind === "drawio") {
        await importDiagramSession();
        return;
    }

    const prompt = userDescription.value.trim();
    if (!prompt) {
        showError("Enter a prompt describing what to generate or how to edit the image.");
        return;
    }

    if (!state.selectedFile && !state.currentSession && state.currentMode === "prompt" && state.processingMode === "diagram") {
        await createDiagramSession(prompt);
        return;
    }

    const formData = new FormData();
    formData.append("prompt_text", prompt);
    const effectiveModel = getEffectiveModelName();
    if (effectiveModel) {
        formData.append("model_name", effectiveModel);
    }
    const effectiveWorkflowProfile = getEffectiveWorkflowProfileName();
    if (effectiveWorkflowProfile) {
        formData.append("workflow_profile", effectiveWorkflowProfile);
    }
    if (state.processingMode !== "auto") {
        formData.append("mode_override", state.processingMode);
    }
    let endpoint = `${API_BASE}/edit`;

    if (state.selectedFile && state.selectedFileKind === "image") {
        formData.append("input_image", state.selectedFile);
    } else if (state.currentSession) {
        formData.append("session_id", state.currentSession.session_id);
    } else if (state.currentMode === "prompt") {
        endpoint = `${API_BASE}/generate`;
        appendWorkflowTuning(formData, true);
    } else {
        showError("Upload a source image or switch to Prompt Only to start from text.");
        return;
    }

    if (!endpoint.endsWith("/generate")) {
        appendWorkflowTuning(formData, false);
    }

    setBusy(true, endpoint.endsWith("/generate") ? "Generating a new base image..." : "Applying your edit...");

    try {
        const response = await fetch(endpoint, { method: "POST", body: formData });
        const payload = await parseJsonResponse(response);
        state.currentSession = payload;
        renderSession(payload);
        userDescription.value = "";

        if (state.selectedFile) {
            clearUpload();
        }

        setMode(state.currentMode);
        setStatus(
            payload.edit_history.length > 1
                ? "Edit saved. Pick any version in History to make it current again."
                : "Session created. Add another prompt whenever you want to refine it."
        );
    } catch (error) {
        showError(error.message || "Request failed.");
    } finally {
        setBusy(false);
    }
}

async function revertToVersion(version) {
    if (!state.currentSession || state.isBusy) {
        return;
    }

    setBusy(true, `Restoring version ${version}...`);
    try {
        const response = await fetch(`${API_BASE}/revert`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: state.currentSession.session_id,
                version,
            }),
        });
        const payload = await parseJsonResponse(response);
        state.currentSession = payload;
        renderSession(payload);
        setStatus(`Version ${version} is active again. Submit a new prompt from here to branch the session.`);
    } catch (error) {
        showError(error.message || "Revert failed.");
    } finally {
        setBusy(false);
    }
}

function renderDiagramEditor(session) {
    const isDiagramSession = Boolean(session?.current_diagram_model);
    diagramPanel.classList.toggle("hidden", !isDiagramSession);

    if (!isDiagramSession) {
        state.currentDiagramModel = null;
        state.selectedDiagramElementId = "";
        diagramElementSelect.innerHTML = "";
        diagramSourceSelect.innerHTML = "";
        diagramTargetSelect.innerHTML = "";
        diagramAddSource.innerHTML = "";
        diagramAddTarget.innerHTML = "";
        diagramCanvas.innerHTML = "";
        diagramXmlView.value = "";
        [
            diagramLabelInput,
            diagramFillInput,
            diagramStrokeInput,
            diagramXInput,
            diagramYInput,
            diagramWidthInput,
            diagramHeightInput,
            diagramSemanticInput,
        ].forEach((input) => {
            input.value = "";
        });
        return;
    }

    state.currentDiagramModel = session.current_diagram_model;
    const elements = Array.isArray(state.currentDiagramModel?.elements) ? state.currentDiagramModel.elements : [];
    const connectors = Array.isArray(state.currentDiagramModel?.connectors) ? state.currentDiagramModel.connectors : [];
    diagramModePill.textContent = `${elements.length} elements / ${connectors.length} connectors`;
    diagramHelper.textContent = (session.analysis_warnings && session.analysis_warnings.length)
        ? session.analysis_warnings.join(" ")
        : "This session has an editable diagram model. Pick an element to update its text, colors, or bounds directly.";
    diagramXmlView.value = session.current_diagram_xml || state.currentDiagramModel.xml_representation || "";
    diagramToggleXmlBtn.textContent = state.showDiagramXml ? "Hide XML" : "Show XML";
    diagramXmlView.classList.toggle("hidden", !state.showDiagramXml);

    diagramElementSelect.innerHTML = "";
    elements.forEach((element) => {
        const option = document.createElement("option");
        option.value = element.element_id;
        option.textContent = `${element.element_type} - ${element.label || element.element_id}`;
        diagramElementSelect.appendChild(option);
    });
    connectors.forEach((connector) => {
        const option = document.createElement("option");
        option.value = connector.connector_id;
        option.textContent = `connector - ${connector.label || connector.connector_id}`;
        diagramElementSelect.appendChild(option);
    });

    populateDiagramNodeSelects(elements);

    if (!elements.length && !connectors.length) {
        state.selectedDiagramElementId = "";
        populateDiagramFields();
        renderDiagramCanvas();
        return;
    }

    const knownIds = [...elements.map((element) => element.element_id), ...connectors.map((connector) => connector.connector_id)];
    if (state.selectedDiagramElementId && knownIds.includes(state.selectedDiagramElementId)) {
        diagramElementSelect.value = state.selectedDiagramElementId;
    } else {
        diagramElementSelect.selectedIndex = 0;
        state.selectedDiagramElementId = diagramElementSelect.value;
    }

    populateDiagramFields();
    renderDiagramCanvas();
}

function populateDiagramFields() {
    const element = getSelectedDiagramElement();
    if (!element) {
        [
            diagramLabelInput,
            diagramFillInput,
            diagramStrokeInput,
            diagramXInput,
            diagramYInput,
            diagramWidthInput,
            diagramHeightInput,
            diagramSemanticInput,
        ].forEach((input) => {
            input.value = "";
        });
        diagramSourceSelect.value = "";
        diagramTargetSelect.value = "";
        return;
    }

    diagramLabelInput.value = element.label || "";
    diagramFillInput.value = element.fill_color || "";
    diagramStrokeInput.value = element.stroke_color || "";
    diagramXInput.value = element.bbox?.x ?? "";
    diagramYInput.value = element.bbox?.y ?? "";
    diagramWidthInput.value = element.bbox?.width ?? "";
    diagramHeightInput.value = element.bbox?.height ?? "";
    diagramSemanticInput.value = element.semantic_class || "";
    diagramSourceSelect.value = element.source_element_id || "";
    diagramTargetSelect.value = element.target_element_id || "";
}

function getSelectedDiagramElement() {
    if (!state.currentDiagramModel || !state.selectedDiagramElementId) {
        return null;
    }

    return (
        state.currentDiagramModel.elements.find((element) => element.element_id === state.selectedDiagramElementId) ||
        state.currentDiagramModel.connectors?.find((connector) => connector.connector_id === state.selectedDiagramElementId) ||
        null
    );
}

async function applyDiagramElementEdit() {
    if (!state.currentSession || !state.currentDiagramModel || !state.selectedDiagramElementId || state.isBusy) {
        return;
    }

    setBusy(true, `Updating ${state.selectedDiagramElementId}...`);
    try {
        const response = await fetch(`${API_BASE}/diagram/edit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: state.currentSession.session_id,
                element_id: state.selectedDiagramElementId,
                label: diagramLabelInput.value,
                fill_color: diagramFillInput.value || null,
                stroke_color: diagramStrokeInput.value || null,
                text_color: null,
                x: valueOrNull(diagramXInput.value),
                y: valueOrNull(diagramYInput.value),
                width: valueOrNull(diagramWidthInput.value),
                height: valueOrNull(diagramHeightInput.value),
                source_id: diagramSourceSelect.value || null,
                target_id: diagramTargetSelect.value || null,
                semantic_class: diagramSemanticInput.value || null,
            }),
        });
        const payload = await parseJsonResponse(response);
        state.currentSession = payload;
        renderSession(payload);
        setStatus(`Updated diagram element ${state.selectedDiagramElementId}.`);
    } catch (error) {
        showError(error.message || "Diagram element update failed.");
    } finally {
        setBusy(false);
    }
}

async function deleteDiagramElement() {
    if (!state.currentSession || !state.currentDiagramModel || !state.selectedDiagramElementId || state.isBusy) {
        return;
    }

    setBusy(true, `Deleting ${state.selectedDiagramElementId}...`);
    try {
        const response = await fetch(`${API_BASE}/diagram/edit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: state.currentSession.session_id,
                element_id: state.selectedDiagramElementId,
                delete: true,
            }),
        });
        const payload = await parseJsonResponse(response);
        state.currentSession = payload;
        renderSession(payload);
        setStatus("Diagram element deleted.");
    } catch (error) {
        showError(error.message || "Diagram delete failed.");
    } finally {
        setBusy(false);
    }
}

async function addDiagramObject() {
    if (!state.currentSession || !state.currentDiagramModel || state.isBusy) {
        return;
    }

    setBusy(true, `Adding ${diagramAddType.value}...`);
    try {
        const response = await fetch(`${API_BASE}/diagram/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: state.currentSession.session_id,
                element_type: diagramAddType.value,
                label: diagramAddLabel.value,
                source_id: diagramAddSource.value || null,
                target_id: diagramAddTarget.value || null,
            }),
        });
        const payload = await parseJsonResponse(response);
        state.currentSession = payload;
        renderSession(payload);
        diagramAddLabel.value = "";
        setStatus(`Added ${diagramAddType.value} to the diagram.`);
    } catch (error) {
        showError(error.message || "Diagram add failed.");
    } finally {
        setBusy(false);
    }
}

function toggleDiagramXml() {
    state.showDiagramXml = !state.showDiagramXml;
    diagramXmlView.classList.toggle("hidden", !state.showDiagramXml);
    diagramToggleXmlBtn.textContent = state.showDiagramXml ? "Hide XML" : "Show XML";
}

function exportDiagramXml() {
    const xml = diagramXmlView.value;
    if (!xml) {
        showError("No diagram XML is available for this session yet.");
        return;
    }

    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `diagram-${state.currentSession?.session_id || "session"}.diagram.xml`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function populateDiagramNodeSelects(elements) {
    const nodeElements = elements.filter((element) => element.element_type !== "label");
    [diagramSourceSelect, diagramTargetSelect, diagramAddSource, diagramAddTarget].forEach((select) => {
        select.innerHTML = '<option value=""></option>';
        nodeElements.forEach((element) => {
            const option = document.createElement("option");
            option.value = element.element_id;
            option.textContent = element.label || element.element_id;
            select.appendChild(option);
        });
    });
}

function renderDiagramCanvas() {
    if (!state.currentDiagramModel) {
        diagramCanvas.innerHTML = "";
        return;
    }

    const width = state.currentDiagramModel.width || 1024;
    const height = state.currentDiagramModel.height || 720;
    const elements = state.currentDiagramModel.elements || [];
    const connectors = state.currentDiagramModel.connectors || [];
    const assets = new Map((state.currentDiagramModel.assets || []).map((asset) => [asset.asset_id, asset]));
    const elementMap = new Map(elements.map((element) => [element.element_id, element]));

    const connectorMarkup = connectors.map((connector) => {
        const points = getConnectorPoints(connector, elementMap);
        const path = points.map((point) => point.join(",")).join(" ");
        return `
            <g class="canvas-connector ${state.selectedDiagramElementId === connector.connector_id ? "selected" : ""}" data-element-id="${connector.connector_id}">
                <polyline points="${path}" fill="none" stroke="${connector.stroke_color || "#1f2b24"}" stroke-width="3" marker-end="url(#arrow-head)"></polyline>
                ${connector.label ? `<text x="${points[Math.floor(points.length / 2)][0] + 8}" y="${points[Math.floor(points.length / 2)][1] - 6}" class="canvas-label">${escapeHtml(connector.label)}</text>` : ""}
            </g>
        `;
    }).join("");

    const elementMarkup = elements.map((element) => {
        const isSelected = state.selectedDiagramElementId === element.element_id;
        const asset = element.asset_id ? assets.get(element.asset_id) : null;
        const hasAsset = Boolean(asset?.asset_data_url);
        const rectClass = `canvas-node ${isSelected ? "selected" : ""}`;
        const body = hasAsset
            ? `<image href="${asset.asset_data_url}" x="${element.bbox.x}" y="${element.bbox.y}" width="${element.bbox.width}" height="${element.bbox.height}" preserveAspectRatio="none"></image>
               <rect x="${element.bbox.x}" y="${element.bbox.y}" width="${element.bbox.width}" height="${element.bbox.height}" rx="14" ry="14" fill="transparent" stroke="${element.stroke_color || "#1f2b24"}" stroke-width="2"></rect>`
            : element.element_type === "label"
                ? `<text x="${element.bbox.x}" y="${element.bbox.y + 18}" class="canvas-label">${escapeHtml(element.label || element.element_id)}</text>`
                : `<rect x="${element.bbox.x}" y="${element.bbox.y}" width="${element.bbox.width}" height="${element.bbox.height}" rx="14" ry="14" fill="${element.fill_color || "#ffffff"}" stroke="${element.stroke_color || "#1f2b24"}" stroke-width="3"></rect>`;
        const text = element.element_type !== "label" && element.label
            ? `<text x="${element.bbox.x + 12}" y="${element.bbox.y + 24}" class="canvas-label">${escapeHtml(element.label)}</text>`
            : "";
        return `
            <g class="${rectClass}" data-element-id="${element.element_id}" data-draggable="${element.element_type !== "label"}">
                ${body}
                ${text}
            </g>
        `;
    }).join("");

    diagramCanvas.innerHTML = `
        <svg class="diagram-svg" viewBox="0 0 ${width} ${height}" data-width="${width}" data-height="${height}">
            <defs>
                <marker id="arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#1f2b24"></path>
                </marker>
            </defs>
            ${connectorMarkup}
            ${elementMarkup}
        </svg>
    `;

    attachCanvasInteractions();
}

function renderSession(session) {
    if (!session) {
        state.activeModel = "";
        state.selectedModel = modelSelect.value;
        state.selectedWorkflowProfile = "";
        state.currentDiagramModel = null;
        state.selectedDiagramElementId = "";
        state.processingMode = "auto";
        processingModeSelect.value = state.processingMode;
        syncTaskRoutingSelection();
        sessionTitle.textContent = "No active session yet";
        sessionPill.textContent = "Idle";
        sessionPill.classList.add("muted");
        resultStage.classList.add("empty");
        resultPlaceholder.hidden = false;
        resultImage.hidden = true;
        resultImage.src = "";
        historyCount.textContent = "0 steps";
        historyList.innerHTML = '<p class="history-empty">Generated versions will appear here once a session starts.</p>';
        renderDiagramEditor(null);
        refreshModelHint();
        refreshWorkflowProfileHint();
        updateControls();
        return;
    }

    state.activeModel = session.current_model || session.current_entry?.parameters?.model_name || "";
    state.selectedWorkflowProfile = session.current_entry?.parameters?.workflow_profile || workflowProfileSelect.value;
    const routedMode = session.current_mode_state?.current_mode || (session.content_mode === "diagram" ? "diagram" : "auto");
    state.processingMode = routedMode === "hybrid" ? "auto" : routedMode;
    processingModeSelect.value = state.processingMode;
    if (state.activeModel && state.availableModels.includes(state.activeModel)) {
        modelSelect.value = state.activeModel;
    }
    state.selectedModel = state.activeModel || modelSelect.value;
    syncTaskRoutingSelection();

    sessionTitle.textContent = `Session ${session.session_id.slice(0, 8)}`;
    sessionPill.textContent = session.edit_history.length > 1 ? `${session.edit_history.length} saved steps` : "Base image";
    sessionPill.classList.remove("muted");

    resultStage.classList.remove("empty");
    resultPlaceholder.hidden = true;
    resultImage.hidden = false;
    resultImage.src = withCacheBust(session.current_image_url, session.updated_at);

    historyCount.textContent = `${session.edit_history.length} ${session.edit_history.length === 1 ? "step" : "steps"}`;
    historyList.innerHTML = "";

    [...session.edit_history]
        .sort((left, right) => right.version - left.version)
        .forEach((entry) => {
            const card = document.createElement("article");
            card.className = `history-item${entry.is_current ? " current" : ""}`;
            card.innerHTML = `
                <img class="history-thumb" src="${withCacheBust(entry.image_url, entry.timestamp)}" alt="Version ${entry.version}">
                <div class="history-body">
                    <div class="history-meta">
                        <span class="history-version">${entry.operation} • v${entry.version}</span>
                        ${entry.is_current ? '<span class="history-badge">Current</span>' : ""}
                    </div>
                    <p class="history-prompt">${escapeHtml(entry.prompt)}</p>
                    <p class="history-time">${formatTimestamp(entry.timestamp)}</p>
                </div>
            `;
            card.querySelector(".history-version").textContent = `${entry.operation} - v${entry.version}`;

            if (!entry.is_current) {
                const actions = document.createElement("div");
                actions.className = "history-actions";

                const revertButton = document.createElement("button");
                revertButton.className = "history-action-btn";
                revertButton.type = "button";
                revertButton.textContent = `Revert to v${entry.version}`;
                revertButton.addEventListener("click", () => {
                    void revertToVersion(entry.version);
                });

                actions.appendChild(revertButton);
                card.querySelector(".history-body").appendChild(actions);
            }

            historyList.appendChild(card);
        });

    renderDiagramEditor(session);
    refreshModelHint();
    refreshWorkflowProfileHint();
    updateControls();
}

function getConnectorPoints(connector, elementMap) {
    if (connector.anchor_points && connector.anchor_points.length >= 2) {
        return connector.anchor_points;
    }

    const source = elementMap.get(connector.source_element_id);
    const target = elementMap.get(connector.target_element_id);
    if (source && target) {
        return [
            [source.bbox.x + source.bbox.width / 2, source.bbox.y + source.bbox.height / 2],
            [target.bbox.x + target.bbox.width / 2, target.bbox.y + target.bbox.height / 2],
        ];
    }

    return [[0, 0], [40, 40]];
}

function attachCanvasInteractions() {
    const svg = diagramCanvas.querySelector("svg");
    if (!svg) {
        return;
    }

    svg.querySelectorAll("[data-element-id]").forEach((node) => {
        node.addEventListener("click", () => {
            state.selectedDiagramElementId = node.getAttribute("data-element-id") || "";
            diagramElementSelect.value = state.selectedDiagramElementId;
            populateDiagramFields();
            renderDiagramCanvas();
            updateControls();
        });
    });

    svg.querySelectorAll('[data-draggable="true"]').forEach((node) => {
        node.addEventListener("pointerdown", (event) => {
            const elementId = node.getAttribute("data-element-id");
            const element = state.currentDiagramModel?.elements?.find((candidate) => candidate.element_id === elementId);
            if (!element) {
                return;
            }
            event.preventDefault();
            node.setPointerCapture(event.pointerId);
            state.dragState = {
                pointerId: event.pointerId,
                elementId,
                startX: event.clientX,
                startY: event.clientY,
                originX: element.bbox.x,
                originY: element.bbox.y,
                canvasRect: svg.getBoundingClientRect(),
                viewWidth: Number(svg.dataset.width || state.currentDiagramModel.width || 1),
                viewHeight: Number(svg.dataset.height || state.currentDiagramModel.height || 1),
            };
        });
    });
}

window.addEventListener("pointermove", (event) => {
    if (!state.dragState || state.isBusy) {
        return;
    }
    const svg = diagramCanvas.querySelector("svg");
    const node = svg?.querySelector(`[data-element-id="${state.dragState.elementId}"]`);
    if (!svg || !node) {
        return;
    }
    const scaleX = state.dragState.viewWidth / Math.max(1, state.dragState.canvasRect.width);
    const scaleY = state.dragState.viewHeight / Math.max(1, state.dragState.canvasRect.height);
    const dx = (event.clientX - state.dragState.startX) * scaleX;
    const dy = (event.clientY - state.dragState.startY) * scaleY;
    node.style.transform = `translate(${dx}px, ${dy}px)`;
});

window.addEventListener("pointerup", async (event) => {
    if (!state.dragState || event.pointerId !== state.dragState.pointerId || state.isBusy) {
        return;
    }

    const drag = state.dragState;
    state.dragState = null;
    const svg = diagramCanvas.querySelector("svg");
    const node = svg?.querySelector(`[data-element-id="${drag.elementId}"]`);
    if (node) {
        node.style.transform = "";
    }

    const scaleX = drag.viewWidth / Math.max(1, drag.canvasRect.width);
    const scaleY = drag.viewHeight / Math.max(1, drag.canvasRect.height);
    const nextX = Math.max(0, Math.round(drag.originX + ((event.clientX - drag.startX) * scaleX)));
    const nextY = Math.max(0, Math.round(drag.originY + ((event.clientY - drag.startY) * scaleY)));

    if (!state.currentSession) {
        return;
    }

    try {
        setBusy(true, `Moving ${drag.elementId}...`);
        const response = await fetch(`${API_BASE}/diagram/edit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: state.currentSession.session_id,
                element_id: drag.elementId,
                x: nextX,
                y: nextY,
            }),
        });
        const payload = await parseJsonResponse(response);
        state.currentSession = payload;
        state.selectedDiagramElementId = drag.elementId;
        renderSession(payload);
        setStatus(`Moved ${drag.elementId}.`);
    } catch (error) {
        showError(error.message || "Diagram move failed.");
        renderDiagramCanvas();
    } finally {
        setBusy(false);
    }
});

function updateControls() {
    submitBtn.disabled = state.isBusy;
    submitBtn.textContent = state.isBusy ? "Working..." : "Submit";
    clearUploadBtn.disabled = state.isBusy;
    resetSessionBtn.disabled = state.isBusy;
    dropZone.style.pointerEvents = state.isBusy ? "none" : "auto";
    dropZoneWrapper.style.opacity = state.isBusy ? "0.7" : "1";
    modelSelect.disabled = state.isBusy || state.availableModels.length === 0;
    workflowProfileSelect.disabled = state.isBusy || state.availableWorkflowProfiles.length === 0;
    processingModeSelect.disabled = state.isBusy;
    document.querySelectorAll(".history-action-btn").forEach((button) => {
        button.disabled = state.isBusy;
    });
    diagramElementSelect.disabled = state.isBusy || !state.currentDiagramModel;
    diagramApplyBtn.disabled = state.isBusy || !state.currentDiagramModel || !state.selectedDiagramElementId;
    diagramDeleteBtn.disabled = state.isBusy || !state.currentDiagramModel || !state.selectedDiagramElementId;
    diagramAddBtn.disabled = state.isBusy || !state.currentDiagramModel;
    diagramExportBtn.disabled = !state.currentDiagramModel;
    diagramToggleXmlBtn.disabled = !state.currentDiagramModel;
    [
        diagramLabelInput,
        diagramFillInput,
        diagramStrokeInput,
        diagramXInput,
        diagramYInput,
        diagramWidthInput,
        diagramHeightInput,
        diagramSemanticInput,
        diagramSourceSelect,
        diagramTargetSelect,
        diagramAddType,
        diagramAddLabel,
        diagramAddSource,
        diagramAddTarget,
    ].forEach((input) => {
        input.disabled = state.isBusy || !state.currentDiagramModel || !state.selectedDiagramElementId;
    });
    [diagramAddType, diagramAddLabel, diagramAddSource, diagramAddTarget].forEach((input) => {
        input.disabled = state.isBusy || !state.currentDiagramModel;
    });
}

function setBusy(isBusy, message = "") {
    state.isBusy = isBusy;
    clearError();
    if (message) {
        setStatus(message);
    }
    updateControls();
}

function setStatus(message) {
    if (!message) {
        statusDiv.textContent = "";
        statusDiv.classList.add("hidden");
        return;
    }

    statusDiv.textContent = message;
    statusDiv.classList.remove("hidden");
}

function showError(message) {
    errorDiv.textContent = message;
}

function clearError() {
    errorDiv.textContent = "";
}

function revokePreviewUrl() {
    if (state.previewObjectUrl) {
        URL.revokeObjectURL(state.previewObjectUrl);
        state.previewObjectUrl = null;
    }
}

function formatTimestamp(isoTimestamp) {
    try {
        return new Date(isoTimestamp).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
        });
    } catch {
        return isoTimestamp;
    }
}

function withCacheBust(url, seed) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}t=${encodeURIComponent(seed || Date.now())}`;
}

function escapeHtml(text) {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function valueOrNull(value) {
    if (value === "" || value === null || value === undefined) {
        return null;
    }
    return Number(value);
}

async function parseJsonResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
        ? await response.json()
        : { detail: await response.text() };

    if (!response.ok) {
        throw new Error(payload.detail || "The request failed.");
    }

    return payload;
}

setMode("image");
renderSession(null);
updateControls();
void loadModels();
