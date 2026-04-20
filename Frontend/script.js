const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewImg = document.getElementById('preview-img');
const drawioContainer = document.getElementById('drawio-container');
const restartBtn = document.getElementById('restart-btn');
const submitBtn = document.getElementById('submit-btn');
const promptText = document.getElementById('prompt-text');
const errorDiv = document.getElementById('error-message');
const userDescription = document.getElementById('user-description');
const downloadBtn = document.getElementById('download-btn');
const btnPromptMode = document.getElementById('mode-prompt');
const btnImageMode = document.getElementById('mode-image');
const container = document.querySelector('.upload-container');

// Model dropdown elements
const modelDropdown = document.getElementById('model-dropdown');
const modelSelectedText = document.getElementById('model-selected-text');
const modelList = document.getElementById('model-list');
const modelError = document.getElementById('model-error');

let currentMode = "image";
let uploadedFile = null;
let encodedFileData = "";
let selectedModel = null;
let availableModels = [];

// ── Model Dropdown Logic ──────────────────────────────────────────
async function loadModels() {
    try {
        const res = await fetch('/api/models');
        if (!res.ok) throw new Error('Failed to fetch models');
        const data = await res.json();
        availableModels = data.models || [];
    } catch (e) {
        availableModels = [];
    }

    modelDropdown.classList.remove('model-dropdown--loading');

    if (availableModels.length === 0) {
        modelSelectedText.textContent = 'No models available';
        modelDropdown.classList.add('model-dropdown--loading');
        modelError.classList.remove('hidden');
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.title = 'No models available on the server';
        return;
    }

    selectedModel = availableModels[0];
    modelSelectedText.textContent = selectedModel;

    availableModels.forEach((m, i) => {
        const li = document.createElement('li');
        li.textContent = m;
        li.setAttribute('role', 'option');
        if (i === 0) li.classList.add('selected');
        li.addEventListener('click', () => {
            selectedModel = m;
            modelSelectedText.textContent = m;
            modelList.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
            li.classList.add('selected');
            modelDropdown.classList.remove('open');
        });
        modelList.appendChild(li);
    });
}

modelDropdown.querySelector('.model-dropdown__selected').addEventListener('click', () => {
    if (availableModels.length === 0) return;
    modelDropdown.classList.toggle('open');
});

document.addEventListener('click', (e) => {
    if (!modelDropdown.contains(e.target)) {
        modelDropdown.classList.remove('open');
    }
});

loadModels();

// ── Drag & Drop ───────────────────────────────────────────────────
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
});
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
});
['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
});

dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length) handleFile(files[0]);
});

// Always open file picker on click — allows replacing the current image.
// Reset value first so 'change' fires even if the same file is re-picked.
dropZone.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
});

// Only act if the user actually picked a file; cancelling leaves the old image intact.
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    const isImage = file.type.startsWith('image/');
    const isDrawIO = file.name.toLowerCase().endsWith('.drawio');
    if (!isImage && !isDrawIO) { showError("Unsupported file type!"); return; }

    uploadedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        encodedFileData = e.target.result;
        if (isImage) {
            drawioContainer.style.display = 'none';
            previewImg.src = encodedFileData;
            previewImg.style.display = 'block';
        } else {
            previewImg.style.display = 'none';
            drawioContainer.style.display = 'block';
            renderDrawio(encodedFileData);
        }
        showUI();
    };
    if (isImage) reader.readAsDataURL(file);
    else reader.readAsText(file);
}

function renderDrawio(xmlData) {
    drawioContainer.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'mxgraph';
    div.style.maxWidth = '100%';
    div.setAttribute('data-mxgraph', JSON.stringify({ highlight: '#38bdf8', nav: false, toolbar: 'hidden', edit: null, xml: xmlData }));
    drawioContainer.appendChild(div);
    if (window.GraphViewer) GraphViewer.processElements();
}

function init() {
    currentMode = "image";
    container.classList.remove('mode-prompt-active');
    btnImageMode.classList.add('active');
    btnPromptMode.classList.remove('active');
}

function showUI() {
    promptText.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    if (uploadedFile && uploadedFile.type.startsWith('image/')) {
        downloadBtn.classList.remove('hidden');
    }
}

function switchToImageMode(blob, imageUrl) {
    uploadedFile = new File([blob], 'generated.png', { type: 'image/png' });
    encodedFileData = imageUrl;

    container.classList.remove('mode-prompt-active');
    currentMode = "image";
    btnImageMode.classList.add('active');
    btnPromptMode.classList.remove('active');

    drawioContainer.style.display = 'none';
    previewImg.src = imageUrl;
    previewImg.style.display = 'block';
    promptText.classList.add('hidden');
    restartBtn.classList.remove('hidden');
    downloadBtn.classList.remove('hidden');
}

restartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    uploadedFile = null;
    encodedFileData = "";
    previewImg.src = "";
    previewImg.style.display = 'none';
    drawioContainer.innerHTML = '';
    drawioContainer.style.display = 'none';
    promptText.classList.remove('hidden');
    restartBtn.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    fileInput.value = "";
});

btnPromptMode.addEventListener('click', () => {
    currentMode = "prompt";
    btnPromptMode.classList.add('active');
    btnImageMode.classList.remove('active');
    container.classList.add('mode-prompt-active');
});

btnImageMode.addEventListener('click', () => {
    currentMode = "image";
    btnImageMode.classList.add('active');
    btnPromptMode.classList.remove('active');
    container.classList.remove('mode-prompt-active');
});

submitBtn.addEventListener('click', async () => {
    if (availableModels.length === 0) {
        showError("No models available on the server!");
        return;
    }
    const prompt = userDescription.value.trim();

    if (currentMode === "image" && !uploadedFile) {
        showError("Please upload an image for this mode!");
        return;
    }
    if (!prompt) {
        showError("Please enter a prompt!");
        return;
    }

    const formData = new FormData();
    formData.append('prompt_text', prompt);
    if (selectedModel) formData.append('model_name', selectedModel);
    if (currentMode === "image" && uploadedFile) {
        formData.append('input_image', uploadedFile);
    }

    setLoading(true);

    try {
        const response = await fetch('/generate/image', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ detail: response.statusText }));
            throw new Error(err.detail || 'Server error ' + response.status);
        }

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        switchToImageMode(blob, imageUrl);

    } catch (err) {
        showError('Generation failed: ' + err.message);
    } finally {
        setLoading(false);
    }
});

function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? 'Generating…' : 'Submit Request';
    submitBtn.style.opacity = isLoading ? '0.7' : '1';
}

function showError(message) {
    errorDiv.textContent = message;
    setTimeout(() => { errorDiv.textContent = ""; }, 4000);
}

downloadBtn.addEventListener('click', () => {
    if (!encodedFileData) return;
    const a = document.createElement('a');
    a.href = encodedFileData;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `generated-${timestamp}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

init();