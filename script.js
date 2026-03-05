/**
 * @fileoverview Logic for a dual-mode upload/prompt interface.
 * Supports image previews, .drawio diagram rendering via diagrams.net,
 * and switching between "Image" and "Prompt" modes.
 */

// --- DOM Element Selectors ---
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

/** * @type {string} Defines the current interaction state: "image" or "prompt".
 */
let currentMode = "image"; 

/** * @type {string} Stores the Base64 data URL (for images) or XML string (for .drawio).
 */
let encodedFileData = ""; 

// --- 1. DRAG & DROP HANDLERS ---

/**
 * Prevent default browser behavior (e.g., opening the image in the tab)
 * across all drag-and-drop events.
 */
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});

/**
 * Visual feedback handlers to highlight the drop area during hover.
 */
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
});

/**
 * Handles the drop event specifically to extract the file object.
 */
dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) handleFile(files[0]);
});

// --- 2. CLICK HANDLERS ---

/**
 * Trigger hidden file input when the drop zone is clicked, 
 * provided a file hasn't already been uploaded.
 */
dropZone.addEventListener('click', () => {
    if (encodedFileData) return; 
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

// --- 3. FILE PROCESSING LOGIC ---

/**
 * Validates the file type and reads it into memory using FileReader.
 * @param {File} file - The file object from input or drag-drop.
 */
function handleFile(file) {
    const isImage = file.type.startsWith('image/');
    const isDrawIO = file.name.toLowerCase().endsWith('.drawio');

    // Basic validation for supported types
    if (!isImage && !isDrawIO) {
        showError("Unsupported file type!");
        return;
    }

    const reader = new FileReader();
    
    /**
     * Callback triggered once the file is fully read.
     * @param {ProgressEvent<FileReader>} e 
     */
    reader.onload = (e) => {
        encodedFileData = e.target.result;
        
        if (isImage) {
            drawioContainer.style.display = 'none';
            previewImg.src = encodedFileData;
            previewImg.style.display = 'block';
        } else {
            // Processing for .drawio XML content
            previewImg.style.display = 'none';
            drawioContainer.style.display = 'block';
            renderDrawio(encodedFileData);
        }
        showUI();
    };

    // Images use DataURL (Base64), DrawIO uses raw Text (XML)
    if (isImage) reader.readAsDataURL(file);
    else reader.readAsText(file);
}

// --- 4. DRAW.IO RENDERER ---

/**
 * Injects Draw.io XML into the container and triggers the Diagrams.net 
 * GraphViewer to render it as an interactive diagram.
 * @param {string} xmlData - The raw XML string from a .drawio file.
 */
function renderDrawio(xmlData) {
    drawioContainer.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'mxgraph';
    div.style.maxWidth = '100%';
    
    // Configuration for the diagrams.net viewer engine
    const config = {
        highlight: '#38bdf8',
        nav: false,
        toolbar: 'hidden', 
        edit: null,
        xml: xmlData
    };
    
    div.setAttribute('data-mxgraph', JSON.stringify(config));
    drawioContainer.appendChild(div);

    // Call the external diagrams.net script if it exists in the global scope
    if (window.GraphViewer) {
        GraphViewer.processElements();
    }
}

/**
 * Resets the application state to the default Image mode.
 */
function init() {
    currentMode = "image";
    container.classList.remove('mode-prompt-active');
    btnImageMode.classList.add('active');
    btnPromptMode.classList.remove('active');
}

// --- 5. UI & MODE LOGIC ---

/**
 * Toggles UI visibility once a file has been successfully uploaded.
 */
function showUI() {
    promptText.classList.add('hidden');
    restartBtn.classList.remove('hidden');
}

/**
 * Clears all uploaded data and resets the preview UI.
 */
restartBtn.addEventListener('click', (e) => {
    // Stop event from bubbling to the dropZone click handler
    e.stopPropagation(); 
    
    encodedFileData = "";
    previewImg.src = "";
    previewImg.style.display = 'none';
    drawioContainer.innerHTML = '';
    drawioContainer.style.display = 'none';
    promptText.classList.remove('hidden');
    restartBtn.classList.add('hidden');
    fileInput.value = ""; 
});

/**
 * Switches the UI to Prompt Mode.
 */
btnPromptMode.addEventListener('click', () => {
    currentMode = "prompt";
    btnPromptMode.classList.add('active');
    btnImageMode.classList.remove('active');
    container.classList.add('mode-prompt-active');
});

/**
 * Switches the UI back to Image Mode.
 */
btnImageMode.addEventListener('click', () => {
    currentMode = "image";
    btnImageMode.classList.add('active');
    btnPromptMode.classList.remove('active');
    container.classList.remove('mode-prompt-active');
});

// --- Updated Submit Logic ---

/**
 * Validates inputs based on the current mode and "submits" the data.
 * Currently logs result to the console for demonstration.
 */
submitBtn.addEventListener('click', () => {
    const prompt = userDescription.value.trim();

    // Contextual validation
    if (currentMode === "image" && !encodedFileData) {
        showError("Please upload an image for this mode!");
        return;
    }
    
    if (currentMode === "prompt" && !prompt) {
        showError("Please enter a prompt!");
        return;
    }

    console.log("--- SUBMISSION ---");
    console.log("Mode:", currentMode);
    console.log("Prompt:", prompt || "(Empty)");
    
    if (currentMode === "image") {
        // Log a snippet of the data for verification
        console.log("Data Snippet:", encodedFileData.substring(0, 50) + "...");
    }
    
    alert(`Success! Mode: ${currentMode}. Data logged to console.`);
});

/**
 * Displays a transient error message to the user.
 * @param {string} message - The error text to display.
 */
function showError(message) {
    errorDiv.textContent = message;
    setTimeout(() => { errorDiv.textContent = ""; }, 3000);
}

// Initialize application
init();