const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewImg = document.getElementById('preview-img');
const drawioContainer = document.getElementById('drawio-container');
const restartBtn = document.getElementById('restart-btn');
const submitBtn = document.getElementById('submit-btn');
const promptText = document.getElementById('prompt-text');
const errorDiv = document.getElementById('error-message');
const userDescription = document.getElementById('user-description');
const btnPromptMode = document.getElementById('mode-prompt');
const btnImageMode = document.getElementById('mode-image');
const container = document.querySelector('.upload-container');

let currentMode = "image";
let uploadedFile = null;
let encodedFileData = "";

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

dropZone.addEventListener('click', () => {
    if (encodedFileData) return;
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
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
}

function switchToImageMode(blob, imageUrl) {
    // Convert blob to a File so it can be re-submitted
    uploadedFile = new File([blob], 'generated.png', { type: 'image/png' });
    encodedFileData = imageUrl;

    // Show the drop zone if it was hidden (prompt-only mode)
    container.classList.remove('mode-prompt-active');

    // Switch mode buttons
    currentMode = "image";
    btnImageMode.classList.add('active');
    btnPromptMode.classList.remove('active');

    // Update the preview in place
    drawioContainer.style.display = 'none';
    previewImg.src = imageUrl;
    previewImg.style.display = 'block';
    promptText.classList.add('hidden');
    restartBtn.classList.remove('hidden');
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

        // Replace preview with generated image and switch to image+prompt mode
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

init();