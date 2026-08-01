/* =======================================================
   Main App Core
   ======================================================= */

function init() {
    initThemeMode();
    initGrid();
    initImportPanel();
    initPanelResize();
    initDB();
    setupEventListeners();
    updateModeButtons();
    updateStepButtons();
}

const FMA_THEME_STORAGE = "fma_viewer_theme";

function initThemeMode() {
    let theme = "dark";
    try {
        const stored = localStorage.getItem(FMA_THEME_STORAGE);
        if (stored === "light" || stored === "dark") {
            theme = stored;
        }
    } catch (error) {}
    applyThemeMode(theme, false);
    dom.btnThemeToggle.onclick = () => {
        toggleThemeMode();
    };
}

function toggleThemeMode() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyThemeMode(next, true);
}

function applyThemeMode(theme, persist) {
    const light = theme === "light";
    document.documentElement.dataset.theme = light ? "light" : "dark";
    dom.themeToggleIcon.innerText = light ? "☾" : "☀";
    dom.btnThemeToggle.title = light ? "다크 모드로 전환" : "라이트 모드로 전환";
    dom.btnThemeToggle.setAttribute("aria-label", dom.btnThemeToggle.title);
    dom.btnThemeToggle.setAttribute("aria-pressed", String(light));
    if (persist) {
        try {
            localStorage.setItem(FMA_THEME_STORAGE, light ? "light" : "dark");
        } catch (error) {}
    }
}

function initImportPanel() {
    if (!dom.importSection || !dom.btnToggleImportPanel) return;
    const collapsed = localStorage.getItem("fma_import_panel_collapsed") === "true";
    setImportPanelCollapsed(collapsed);
}

function setImportPanelCollapsed(collapsed) {
    if (!dom.importSection || !dom.btnToggleImportPanel) return;
    dom.importSection.classList.toggle("collapsed", collapsed);
    dom.btnToggleImportPanel.setAttribute("aria-expanded", String(!collapsed));
    dom.btnToggleImportPanel.title = collapsed ? "파일 추가 영역 펼치기" : "파일 추가 영역 접기";
    const icon = dom.btnToggleImportPanel.querySelector(".import-collapse-icon");
    const title = dom.btnToggleImportPanel.querySelector(".import-collapse-label strong");
    const description = dom.btnToggleImportPanel.querySelector(".import-collapse-label small");
    if (icon) icon.innerText = collapsed ? "⌄" : "⌃";
    if (title) title.innerText = collapsed ? "＋ 이미지 파일 추가 열기" : "파일 열기 · 이미지 추가";
    if (description) {
        description.innerText = collapsed
            ? "이미지, ZIP, 붙여넣기"
            : "FMA, 이미지, ZIP, 클립보드";
    }
    localStorage.setItem("fma_import_panel_collapsed", String(collapsed));
}

function initGrid() {
    const savedCols = Number(localStorage.getItem("fma_grid_cols")) || 2;
    changeGrid([1, 2, 3, 4].includes(savedCols) ? savedCols : 2);
}

function changeGrid(cols) {
    cols = [1, 2, 3, 4].includes(Number(cols)) ? Number(cols) : 2;
    document.documentElement.style.setProperty('--grid-cols', cols);
    localStorage.setItem('fma_grid_cols', cols);
    if (dom.btnGridCycle) {
        dom.btnGridCycle.dataset.cols = String(cols);
        dom.btnGridCycle.innerText = `Grid ${cols} ▦`;
        dom.btnGridCycle.title = `현재 ${cols}열 · 클릭하여 ${cols === 4 ? 1 : cols + 1}열로 전환`;
    }
}

function closeFileMenu() {
    if (!dom.fileMenuDropdown) return;
    dom.fileMenuDropdown.style.display = "none";
    dom.btnFileMenu.setAttribute("aria-expanded", "false");
}

function closeSaveDbMenu() {
    if (!dom.saveDbDropdown) return;
    dom.saveDbDropdown.style.display = "none";
    dom.btnSaveDbMenu.setAttribute("aria-expanded", "false");
}

function setupEventListeners() {
    // Top Bar Actions
    dom.btnFileMenu.onclick = event => {
        event.stopPropagation();
        const opening = dom.fileMenuDropdown.style.display === "none";
        closeSaveDbMenu();
        dom.fileMenuDropdown.style.display = opening ? "flex" : "none";
        dom.btnFileMenu.setAttribute("aria-expanded", String(opening));
    };
    dom.fileMenuDropdown.onclick = event => event.stopPropagation();
    dom.btnSaveDbMenu.onclick = event => {
        event.stopPropagation();
        const opening = dom.saveDbDropdown.style.display === "none";
        closeFileMenu();
        dom.saveDbDropdown.style.display = opening ? "flex" : "none";
        dom.btnSaveDbMenu.setAttribute("aria-expanded", String(opening));
    };
    dom.saveDbDropdown.onclick = event => event.stopPropagation();
    document.addEventListener("click", () => {
        closeFileMenu();
        closeSaveDbMenu();
    });
    dom.btnToggleImportPanel.onclick = () => {
        setImportPanelCollapsed(!dom.importSection.classList.contains("collapsed"));
    };
    dom.btnOpen.onclick = () => dom.input.click();
    dom.dropzone.onclick = () => dom.input.click();
    dom.input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) loadFMA(file);
    };

    dom.btnAddImg.onclick = () => dom.addImgInput.click();
    dom.btnOpenFolder.onclick = () => dom.folderImgInput.click();
    dom.btnImportImages.onclick = () => dom.addImgInput.click();
    dom.btnImportZip.onclick = () => dom.zipImgInput.click();
    dom.btnImportFolder.onclick = () => dom.folderImgInput.click();
    dom.btnPasteImg.onclick = importClipboardImages;
    dom.addImgInput.onchange = async (e) => {
        await handleAddImages(Array.from(e.target.files));
        e.target.value = "";
    };
    dom.zipImgInput.onchange = async (e) => {
        await handleImportFiles(Array.from(e.target.files));
        e.target.value = "";
    };
    dom.folderImgInput.onchange = async (e) => {
        await handleImportFolder(Array.from(e.target.files));
        e.target.value = "";
    };
    dom.btnSave.onclick = saveFMA;
    dom.btnSaveDbSnapshot.onclick = saveCurrentStateToDbHistory;
    dom.btnOpenDbHistory.onclick = openDbHistoryWindow;
    dom.btnSaveFmaPanel.onclick = saveFMA;
    dom.btnClear.onclick = resetProject;
    dom.btnZip.onclick = downloadAllAsZIP;
    dom.btnRestoreRemove.onclick = restoreLastDeleted;
    dom.btnRestore.onclick = restoreLastSession;
    [dom.btnOpen, dom.btnSave, dom.btnZip, dom.btnAddImg, dom.btnOpenFolder].forEach(button => {
        button.addEventListener("click", closeFileMenu);
    });
    [dom.btnSaveDbSnapshot, dom.btnOpenDbHistory].forEach(button => {
        button.addEventListener("click", closeSaveDbMenu);
    });
    dom.btnGridCycle.onclick = () => {
        const current = Number(dom.btnGridCycle.dataset.cols) || 2;
        changeGrid(current === 4 ? 1 : current + 1);
    };

    // Sort & Fav & Orientation
    dom.sortSelect.onchange = (e) => {
        sortMode = e.target.value;
        renderGallery();
        if (images.length > 0) {
            currentIndex = getImageIndexAtDisplayPosition(0);
            if (orientation === "vert") {
                renderVerticalPreview();
            } else {
                showImage(currentIndex);
            }
        } else {
            updatePreviewPageText();
        }
    };

    dom.btnToggleFavs.onclick = () => {
        dom.favSidebar.classList.toggle('open');
        renderFavorites();
    };

    dom.btnOrientation.onclick = toggleOrientation;

    // View mode cycle: Single ↔ Two
    dom.btnViewModeCycle.onclick = () => switchViewMode(viewMode === 1 ? 2 : 1);

    // Zoom Buttons
    dom.btnZoomIn.onclick = () => { zoom *= 1.2; updateZoom(); };
    dom.btnZoomOut.onclick = () => { zoom /= 1.2; updateZoom(); };
    dom.btnCenterPreview.onclick = centerPreviewImage;
    dom.btnResetZoom.onclick = resetZoom;
    const setPreviewMenuCollapsed = collapsed => {
        dom.previewMeta.classList.toggle("menu-collapsed", collapsed);
        dom.btnTogglePreviewMenu.innerText = collapsed ? "⌄" : "⌃";
        dom.btnTogglePreviewMenu.title = collapsed ? "이미지 작업 메뉴 펼치기" : "이미지 작업 메뉴 접기";
        dom.btnTogglePreviewMenu.setAttribute("aria-label", dom.btnTogglePreviewMenu.title);
        dom.btnTogglePreviewMenu.setAttribute("aria-expanded", String(!collapsed));
        localStorage.setItem("fmaPreviewMenuCollapsed", collapsed ? "1" : "0");
    };
    setPreviewMenuCollapsed(localStorage.getItem("fmaPreviewMenuCollapsed") === "1");
    dom.btnTogglePreviewMenu.onclick = () => {
        setPreviewMenuCollapsed(!dom.previewMeta.classList.contains("menu-collapsed"));
    };

    // Navigation
    dom.btnPrev.onclick = () => navigateSortedImages(-navStep);
    dom.btnNext.onclick = () => navigateSortedImages(navStep);
    dom.btnPrevMenu.onclick = () => navigateSortedImages(-navStep);
    dom.btnNextMenu.onclick = () => navigateSortedImages(navStep);

    // Navigation step cycle: 1 ↔ 2
    dom.btnStepCycle.onclick = () => {
        navStep = navStep === 1 ? 2 : 1;
        updateStepButtons();
    };

    dom.mediaFilterSelect.onchange = (event) => {
        mediaFilter = ["all", "image", "video"].includes(event.target.value)
            ? event.target.value : "all";
        renderGallery();
        const order = getActiveImageOrder();
        if (order.length) {
            currentIndex = order.includes(currentIndex) ? currentIndex : order[0];
            if (orientation === "vert") renderVerticalPreview();
            else showImage(currentIndex);
        } else {
            dom.previewContainer.innerHTML = "";
            dom.placeholder.style.display = "block";
            dom.previewMeta.style.display = "none";
            dom.zoomInfo.style.display = "none";
            updatePreviewPageText();
        }
        renderFavorites();
        saveCurrentImagesToDB();
    };

    // Keyboard
    document.addEventListener("keydown", e => {
        if (e.altKey && (e.key === "4" || e.code === "Digit4" || e.code === "Numpad4")) {
            e.preventDefault();
            toggleThemeMode();
            return;
        }
        if (dom.cropModal && dom.cropModal.style.display !== "none") return;
        if (dom.upscaleModal && dom.upscaleModal.style.display !== "none") return;
        if (dom.bgRemoveModal && dom.bgRemoveModal.style.display !== "none") return;
        if (dom.bgMaskEditorModal && dom.bgMaskEditorModal.style.display !== "none") return;
        if (dom.imageEditorModal && dom.imageEditorModal.style.display !== "none") return;
        if (dom.externalAppModal && dom.externalAppModal.style.display !== "none") return;
        if (dom.imageMetadataModal && dom.imageMetadataModal.style.display !== "none") return;
        if (dom.settingsModal && dom.settingsModal.style.display !== "none") return;
        if (e.key === "ArrowRight") navigateSortedImages(navStep);
        if (e.key === "ArrowLeft") navigateSortedImages(-navStep);
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
        } else {
            handleImportFiles(items);
        }
    };

    if (dom.dropzoneImg) {
        dom.dropzoneImg.ondragover = e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        };
        dom.dropzoneImg.ondragenter = () => dom.dropzoneImg.classList.add('drag-over');
        dom.dropzoneImg.ondragleave = () => dom.dropzoneImg.classList.remove('drag-over');
        dom.dropzoneImg.ondrop = e => {
            e.preventDefault();
            dom.dropzoneImg.classList.remove('drag-over');
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) handleImportFiles(files);
        };
    }

    document.addEventListener("paste", handlePasteEvent);
}

function updateModeButtons() {
    if (!dom.btnViewModeCycle) return;
    const isTwo = viewMode === 2;
    dom.btnViewModeCycle.innerText = `View: ${isTwo ? "Two" : "Single"}`;
    dom.btnViewModeCycle.classList.toggle('active', isTwo);
    dom.btnViewModeCycle.title = `현재 ${isTwo ? "Two" : "Single"} · 클릭하여 ${isTwo ? "Single" : "Two"}로 전환`;
}

function updateStepButtons() {
    if (!dom.btnStepCycle) return;
    dom.btnStepCycle.innerText = `Skip: ${navStep}`;
    dom.btnStepCycle.classList.toggle('active', navStep === 2);
    dom.btnStepCycle.title = `현재 ${navStep}장씩 이동 · 클릭하여 ${navStep === 1 ? 2 : 1}장씩 이동`;

    // Header navigation/step visibility
    const isHorz = (orientation === 'horz');
    dom.btnStepCycle.style.display = isHorz ? 'inline-flex' : 'none';
    if (dom.navMenu) dom.navMenu.style.display = 'flex'; // Always visible

    // Page count update
    if (typeof updatePreviewPageText === "function") updatePreviewPageText();
}

// Run Initialization
document.addEventListener("DOMContentLoaded", init);
