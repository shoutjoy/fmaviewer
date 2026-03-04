/* =======================================================
   Main App Core
   ======================================================= */

function init() {
    initGrid();
    initPanelResize();
    initDB();
    setupEventListeners();
    updateModeButtons();
    updateStepButtons();
}

function initGrid() {
    const savedCols = localStorage.getItem('fma_grid_cols') || 2;
    changeGrid(parseInt(savedCols));
}

function changeGrid(cols) {
    document.documentElement.style.setProperty('--grid-cols', cols);
    localStorage.setItem('fma_grid_cols', cols);
    document.querySelectorAll('.btnGrid').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.getAttribute('data-cols')) === cols);
    });
}

function setupEventListeners() {
    // Top Bar Actions
    dom.btnOpen.onclick = () => dom.input.click();
    dom.dropzone.onclick = () => dom.input.click();
    dom.input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) loadFMA(file);
    };

    dom.btnAddImg.onclick = () => dom.addImgInput.click();
    dom.addImgInput.onchange = (e) => handleAddImages(Array.from(e.target.files));
    dom.btnSave.onclick = saveFMA;
    dom.btnZip.onclick = downloadAllAsZIP;
    dom.btnRestoreRemove.onclick = restoreLastDeleted;
    dom.btnRestore.onclick = restoreLastSession;

    // Sort & Fav & Orientation
    dom.sortSelect.onchange = (e) => {
        sortMode = e.target.value;
        renderGallery();
    };

    dom.btnToggleFavs.onclick = () => {
        dom.favSidebar.classList.toggle('open');
        renderFavorites();
    };

    dom.btnOrientation.onclick = toggleOrientation;

    // View Modes
    dom.btnModeSingle.onclick = () => switchViewMode(1);
    dom.btnModeTwo.onclick = () => switchViewMode(2);

    // Zoom Buttons
    dom.btnZoomIn.onclick = () => { zoom *= 1.2; updateZoom(); };
    dom.btnZoomOut.onclick = () => { zoom /= 1.2; updateZoom(); };
    dom.btnResetZoom.onclick = resetZoom;

    // Navigation
    dom.btnPrev.onclick = () => showImage(currentIndex - navStep);
    dom.btnNext.onclick = () => showImage(currentIndex + navStep);
    dom.btnPrevMenu.onclick = () => showImage(currentIndex - navStep);
    dom.btnNextMenu.onclick = () => showImage(currentIndex + navStep);

    // Skip/Step Buttons
    dom.btnStep1.onclick = () => { navStep = 1; updateStepButtons(); };
    dom.btnStep2.onclick = () => { navStep = 2; updateStepButtons(); };

    // Keyboard
    document.addEventListener("keydown", e => {
        if (e.key === "ArrowRight") showImage(currentIndex + navStep);
        if (e.key === "ArrowLeft") showImage(currentIndex - navStep);
    });

    // Mouse Interactions (Zoom & Pan)
    setupDragPan();

    // Fullscreen
    dom.btnFullscreen.onclick = toggleFullscreen;

    // FMA Dropzone (Smart: handles both FMA and Images)
    dom.dropzone.ondragover = e => e.preventDefault();
    dom.dropzone.ondragenter = () => dom.dropzone.classList.add('drag-over');
    dom.dropzone.ondragleave = () => dom.dropzone.classList.remove('drag-over');
    dom.dropzone.ondrop = e => {
        e.preventDefault();
        dom.dropzone.classList.remove('drag-over');
        const items = Array.from(e.dataTransfer.files);
        if (items.length === 0) return;

        const file = items[0];
        if (file.name.toLowerCase().endsWith('.fma') || file.type === 'application/json') {
            loadFMA(file);
        } else if (file.type.startsWith('image/')) {
            handleAddImages(items);
        }
    };

    if (dom.dropzoneImg) {
        dom.dropzoneImg.ondragover = e => e.preventDefault();
        dom.dropzoneImg.ondragenter = () => dom.dropzoneImg.classList.add('drag-over');
        dom.dropzoneImg.ondragleave = () => dom.dropzoneImg.classList.remove('drag-over');
        dom.dropzoneImg.ondrop = e => {
            e.preventDefault();
            dom.dropzoneImg.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) handleAddImages(files);
        };
        // Option: Can also click to add images
        dom.dropzoneImg.onclick = () => dom.addImgInput.click();
    }
}

function updateModeButtons() {
    if (!dom.btnModeSingle) return;
    dom.btnModeSingle.classList.toggle('active', viewMode === 1);
    dom.btnModeTwo.classList.toggle('active', viewMode === 2);
}

function updateStepButtons() {
    if (!dom.btnStep1) return;
    dom.btnStep1.classList.toggle('active', navStep === 1);
    dom.btnStep2.classList.toggle('active', navStep === 2);

    // Header navigation/step visibility
    const isHorz = (orientation === 'horz');
    if (dom.stepOption) dom.stepOption.style.display = isHorz ? 'flex' : 'none';
    if (dom.navMenu) dom.navMenu.style.display = 'flex'; // Always visible

    // Page count update
    if (dom.pageText) dom.pageText.innerText = `${currentIndex + 1} / ${images.length}`;
}

// Run Initialization
document.addEventListener("DOMContentLoaded", init);
