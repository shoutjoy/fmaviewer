/* =======================================================
   Globals & State
   ======================================================= */

var images = [];      // Extracted images
var currentIndex = 0; // Current selection index
var zoom = 1;         // Current zoom level
var viewMode = 1;     // 1: Single, 2: Dual
var sortMode = 'group'; // Sort option
var orientation = 'horz'; // horz: Slide, vert: Scroll
var deletedImages = [];  // Deleted images stack for restoration
var navStep = 1;         // Navigation step (1 or 2 pages)

// DOM Cache
var dom = {
    btnOpen: document.getElementById("btnOpen"),
    dropzone: document.getElementById("dropzone"),
    dropzoneImg: document.getElementById("dropzoneImg"),
    input: document.getElementById("fileInput"),
    gallery: document.getElementById("gallery"),
    previewContainer: document.getElementById("previewContainer"),
    preview: document.getElementById("preview"),
    preview2: document.getElementById("preview2"),
    previewWrap: document.querySelector(".previewWrap"),
    btnModeSingle: document.getElementById("btnModeSingle"),
    btnModeTwo: document.getElementById("btnModeTwo"),
    sortSelect: document.getElementById("sortSelect"),
    btnToggleFavs: document.getElementById("btnToggleFavs"),
    favSidebar: document.getElementById("favSidebar"),
    favList: document.getElementById("favList"),
    btnOrientation: document.getElementById("btnOrientationTop"),
    placeholder: document.getElementById("placeholder"),
    previewMeta: document.getElementById("previewMeta"),
    metaDynamicArea: document.getElementById("metaDynamicArea"),
    btnFullscreen: document.getElementById("btnFullscreen"),
    btnResetZoom: document.getElementById("btnResetZoom"),
    btnAddImg: document.getElementById("btnAddImg"),
    addImgInput: document.getElementById("addImgInput"),
    btnSave: document.getElementById("btnSave"),
    btnClear: document.getElementById("btnClear"),
    btnZoomIn: document.getElementById("btnZoomIn"),
    btnZoomOut: document.getElementById("btnZoomOut"),
    zoomText: document.getElementById("zoomText"),
    btnRestoreRemove: document.getElementById("btnRestoreRemove"),
    btnRestore: document.getElementById("btnRestore"),
    imageCount: document.getElementById("imageCount"),
    resizer: document.getElementById("resizer"),
    leftPanel: document.getElementById("leftPanel"),
    btnStep1: document.getElementById("btnStep1"),
    btnStep2: document.getElementById("btnStep2"),
    stepOption: document.getElementById("stepOption"),
    btnZip: document.getElementById("btnZip"),
    btnPrev: document.getElementById("btnPrev"),
    btnNext: document.getElementById("btnNext"),
    btnPrevMenu: document.getElementById("btnPrevMenu"),
    btnNextMenu: document.getElementById("btnNextMenu"),
    pageText: document.getElementById("pageText"),
    navMenu: document.getElementById("navMenu"),
    loadingOverlay: document.getElementById("loadingOverlay"),
    loadingTitle: document.getElementById("loadingTitle"),
    progressBar: document.getElementById("progressBar"),
    progressPercent: document.getElementById("progressPercent")
};

function showLoading(title) {
    if (!dom.loadingOverlay) return;
    dom.loadingTitle.innerText = title || "Processing...";
    dom.progressBar.style.width = "0%";
    dom.progressPercent.innerText = "0%";
    dom.loadingOverlay.style.display = "flex";
}

function updateLoading(percent) {
    if (!dom.progressBar) return;
    const p = Math.round(percent);
    dom.progressBar.style.width = p + "%";
    dom.progressPercent.innerText = p + "%";
}

function hideLoading() {
    if (dom.loadingOverlay) dom.loadingOverlay.style.display = "none";
}

