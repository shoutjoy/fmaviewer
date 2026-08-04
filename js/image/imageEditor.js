/* =======================================================
   Non-destructive Image Adjustment & Text Layer Editor
   ======================================================= */

const IMAGE_EDITOR_PARAMS = [
    "brightness", "lightBalance", "exposure", "contrast", "highlight", "shadow",
    "saturation", "tint", "temperature", "sharpness", "clarity"
];
const IMAGE_EDITOR_EFFECTS = ["vignette", "grain", "glow", "fade"];
const IMAGE_EDITOR_UI_FONT_STORAGE = "fma_image_editor_ui_font_px";
const IMAGE_EDITOR_UI_FONT_DEFAULT = 12;
const IMAGE_EDITOR_TEXT_DEFAULTS_STORAGE = "fma_image_editor_text_defaults";
const IMAGE_EDITOR_DRAWING_SETTINGS_STORAGE = "fma_image_editor_drawing_settings";
const IMAGE_EDITOR_QUICK_CONTROLS_POSITION_STORAGE = "fma_image_editor_quick_controls_position";
const IMAGE_EDITOR_MAGNET_STORAGE = "fma_image_editor_magnetic_snap";
const IMAGE_EDITOR_DRAWING_DEFAULTS = {
    pencil: { size: 3, color: "#252525", opacity: .85, tip: "round" },
    brush: { size: 24, color: "#ff5577", opacity: .75, tip: "round" },
    pen: { size: 8, color: "#111111", opacity: .95, tip: "calligraphy" },
    highlighter: { size: 36, color: "#fff36f", opacity: .35, tip: "flat" },
    eraser: { size: 32, color: "#ffffff", opacity: 1, tip: "round" }
};
const IMAGE_EDITOR_PRESETS = {
    original: {
        name: "Original",
        values: {}
    },
    warmGlow: {
        name: "Warm Glow",
        values: {
            brightness: .05, lightBalance: .1, exposure: .08, contrast: -.05,
            highlight: -.1, shadow: .15, saturation: .12, tint: .05,
            temperature: .25, sharpness: .05, clarity: -.1,
            glow: .22, vignette: .08
        }
    },
    moodyDark: {
        name: "Moody Dark",
        values: {
            brightness: -.15, lightBalance: -.1, exposure: -.12, contrast: .15,
            highlight: -.2, shadow: -.25, saturation: -.1, tint: -.05,
            temperature: -.1, sharpness: .05, clarity: .15,
            vignette: .36, fade: .05
        }
    },
    tealOrange: {
        name: "Teal & Orange",
        values: {
            brightness: .02, lightBalance: .05, exposure: .03, contrast: .12,
            highlight: -.05, shadow: .1, saturation: .2, tint: -.1,
            temperature: .15, sharpness: .1, clarity: .1,
            vignette: .14
        }
    },
    pastelSoft: {
        name: "Pastel Soft",
        values: {
            brightness: .12, lightBalance: .05, exposure: .1, contrast: -.15,
            highlight: .1, shadow: .05, saturation: -.1, tint: .05,
            temperature: .05, sharpness: 0, clarity: -.15,
            glow: .18, fade: .16
        }
    },
    vintageFilm: {
        name: "Vintage Film",
        values: {
            brightness: -.05, lightBalance: -.05, exposure: -.03, contrast: -.1,
            highlight: -.15, shadow: .1, saturation: -.2, tint: .1,
            temperature: -.05, sharpness: 0, clarity: -.05,
            grain: .28, vignette: .22, fade: .2
        }
    },
    blackWhite: {
        name: "Black & White Fine",
        values: {
            brightness: .05, exposure: .02, contrast: .2, highlight: -.1,
            shadow: -.1, saturation: -1, sharpness: .1, clarity: .2,
            vignette: .18, grain: .08
        }
    }
};

var imageEditorState = {
    imageIndex: -1,
    sourceImage: null,
    sourceSrc: "",
    config: null,
    selectedLayerId: null,
    selectedImageLayerId: null,
    selectedEmptyLayerId: null,
    selectedShapeLayerId: null,
    selectedBaseLayer: false,
    baseSelectable: false,
    baseBounds: null,
    fmaPickerSelectedIndex: -1,
    bypass: false,
    previewScale: 1,
    renderRequested: false,
    textBounds: new Map(),
    imageBounds: new Map(),
    shapeBounds: new Map(),
    draggingLayer: false,
    textTransformMode: "",
    transformStart: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    processing: false,
    imageLayerCache: new Map(),
    drawingActive: false,
    drawingTool: "pencil",
    drawingSettings: JSON.parse(JSON.stringify(IMAGE_EDITOR_DRAWING_DEFAULTS)),
    drawing: false,
    drawingHasContent: false,
    drawingLastPoint: null,
    drawingUndo: [],
    zoom: 1,
    panX: 0,
    panY: 0,
    panning: false,
    panMode: false,
    panPointerStart: null,
    externalReturn: null,
    quickControlsDragging: false,
    quickControlsDragStart: null,
    magneticSnap: true,
    fillEyedropperTarget: null,
    fillEyedropperLayerId: null
};

function createDefaultImageEditorConfig() {
    const adjustments = {};
    const effects = {};
    IMAGE_EDITOR_PARAMS.forEach(key => adjustments[key] = 0);
    IMAGE_EDITOR_EFFECTS.forEach(key => effects[key] = 0);
    return {
        version: 4,
        preset: "original",
        adjustments: adjustments,
        effects: effects,
        imageLayers: [],
        textLayers: [],
        shapeLayers: [],
        emptyLayers: [],
        layerOrder: [],
        baseLayer: {
            visible: true, opacity: 1, locked: false,
            x: 0, y: 0, width: 0, height: 0, rotation: 0
        },
        canvasBackground: { enabled: false, color: "#ffffff", opacity: 1 },
        drawingDataUrl: ""
    };
}

function cloneImageEditorConfig(config) {
    const base = createDefaultImageEditorConfig();
    if (!config || typeof config !== "object") return base;
    IMAGE_EDITOR_PARAMS.forEach(key => {
        base.adjustments[key] = editorClamp(Number(config.adjustments?.[key]) || 0, -1, 1);
    });
    base.adjustments.sharpness = editorClamp(
        Number(config.adjustments?.sharpness) || 0, 0, 1
    );
    IMAGE_EDITOR_EFFECTS.forEach(key => {
        base.effects[key] = editorClamp(Number(config.effects?.[key]) || 0, 0, 1);
    });
    base.preset = typeof config.preset === "string" ? config.preset : "custom";
    base.imageLayers = Array.isArray(config.imageLayers)
        ? config.imageLayers.map(normalizeImageLayer)
        : [];
    base.textLayers = Array.isArray(config.textLayers)
        ? config.textLayers.map(normalizeTextLayer)
        : [];
    base.shapeLayers = Array.isArray(config.shapeLayers)
        ? config.shapeLayers.map(normalizeShapeLayer)
        : [];
    base.emptyLayers = Array.isArray(config.emptyLayers)
        ? config.emptyLayers.map(normalizeEmptyLayer)
        : [];
    base.layerOrder = normalizeImageEditorLayerOrder(
        config.layerOrder,
        base.imageLayers,
        base.textLayers,
        base.shapeLayers,
        base.emptyLayers
    );
    base.baseLayer = {
        visible: config.baseLayer?.visible !== false,
        opacity: editorClamp(Number(config.baseLayer?.opacity ?? 1), 0, 1),
        locked: config.baseLayer?.locked === true,
        x: Number(config.baseLayer?.x) || 0,
        y: Number(config.baseLayer?.y) || 0,
        width: Math.max(0, Number(config.baseLayer?.width) || 0),
        height: Math.max(0, Number(config.baseLayer?.height) || 0),
        rotation: editorClamp(Number(config.baseLayer?.rotation) || 0, -180, 180)
    };
    base.canvasBackground = {
        enabled: config.canvasBackground?.enabled === true,
        color: validEditorHex(config.canvasBackground?.color, "#ffffff"),
        opacity: editorClamp(Number(config.canvasBackground?.opacity ?? 1), 0, 1)
    };
    base.drawingDataUrl = typeof config.drawingDataUrl === "string"
        ? config.drawingDataUrl
        : "";
    return base;
}

function normalizeEmptyLayer(layer) {
    return {
        id: String(layer?.id || createImageEditorLayerId("empty")),
        name: String(layer?.name || "빈 레이어"),
        visible: layer?.visible !== false,
        locked: layer?.locked === true,
        fill: normalizeImageEditorLayerFill(layer?.fill)
    };
}

function normalizeImageEditorLayerFill(fill) {
    const mode = ["solid", "linear", "radial"].includes(fill?.mode)
        ? fill.mode
        : "solid";
    return {
        enabled: fill?.enabled === true,
        mode,
        color1: validEditorHex(fill?.color1, "#57e6c1"),
        color2: validEditorHex(fill?.color2, "#668cff"),
        opacity: editorClamp(Number(fill?.opacity ?? 1), 0, 1),
        angle: editorClamp(Number(fill?.angle) || 0, 0, 360)
    };
}

function createImageEditorLayerId(type) {
    return `${type || "layer"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeImageEditorLayerOrder(order, imageLayers, textLayers, shapeLayers, emptyLayers) {
    const valid = new Map();
    imageLayers.forEach(layer => valid.set(layer.id, "image"));
    textLayers.forEach(layer => valid.set(layer.id, "text"));
    shapeLayers.forEach(layer => valid.set(layer.id, "shape"));
    emptyLayers.forEach(layer => valid.set(layer.id, "empty"));
    const normalized = [];
    (Array.isArray(order) ? order : []).forEach(entry => {
        const id = typeof entry === "string" ? entry : String(entry?.id || "");
        const type = valid.get(id);
        if (type && !normalized.some(item => item.id === id)) normalized.push({ id, type });
    });
    [...imageLayers, ...textLayers, ...shapeLayers, ...emptyLayers].forEach(layer => {
        if (!normalized.some(item => item.id === layer.id)) {
            normalized.push({ id: layer.id, type: valid.get(layer.id) });
        }
    });
    return normalized;
}

function normalizeShapeLayer(layer) {
    const supported = [
        "rectangle", "roundedRectangle", "ellipse", "triangle",
        "semicircle", "diamond", "band", "arrow"
    ];
    return {
        id: String(layer?.id || createImageEditorLayerId("shape")),
        name: String(layer?.name || "도형"),
        shape: supported.includes(layer?.shape) ? layer.shape : "rectangle",
        visible: layer?.visible !== false,
        locked: layer?.locked === true,
        opacity: editorClamp(Number(layer?.opacity ?? 1), 0, 1),
        fillColor: validEditorHex(layer?.fillColor, "#57e6c1"),
        fillOpacity: editorClamp(Number(layer?.fillOpacity ?? .8), 0, 1),
        strokeColor: validEditorHex(layer?.strokeColor, "#ffffff"),
        strokeWidth: editorClamp(Number(layer?.strokeWidth ?? 4), 0, 100),
        x: Number(layer?.x) || 0,
        y: Number(layer?.y) || 0,
        width: Math.max(1, Number(layer?.width) || 280),
        height: Math.max(1, Number(layer?.height) || 180),
        rotation: editorClamp(Number(layer?.rotation) || 0, -180, 180)
    };
}

function normalizeImageLayer(layer) {
    const adjustments = {};
    const effects = {};
    IMAGE_EDITOR_PARAMS.forEach(key => {
        const minimum = key === "sharpness" ? 0 : -1;
        adjustments[key] = editorClamp(Number(layer?.adjustments?.[key]) || 0, minimum, 1);
    });
    IMAGE_EDITOR_EFFECTS.forEach(key => {
        effects[key] = editorClamp(Number(layer?.effects?.[key]) || 0, 0, 1);
    });
    return {
        id: String(layer?.id || `image-layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
        name: String(layer?.name || "Image Layer"),
        src: String(layer?.src || ""),
        visible: layer?.visible !== false,
        locked: layer?.locked === true,
        opacity: editorClamp(Number(layer?.opacity ?? 1), 0, 1),
        rotation: editorClamp(Number(layer?.rotation) || 0, -180, 180),
        x: Number(layer?.x) || 0,
        y: Number(layer?.y) || 0,
        width: Math.max(1, Number(layer?.width) || 100),
        height: Math.max(1, Number(layer?.height) || 100),
        preset: typeof layer?.preset === "string" ? layer.preset : "original",
        adjustments,
        effects
    };
}

function normalizeTextLayer(layer) {
    return {
        id: String(layer?.id || createTextLayerId()),
        name: String(layer?.name || "Text"),
        text: String(layer?.text ?? "새 텍스트"),
        visible: layer?.visible !== false,
        locked: layer?.locked === true,
        x: Number(layer?.x) || 0,
        y: Number(layer?.y) || 0,
        fontSize: editorClamp(Number(layer?.fontSize) || 64, 8, 500),
        fontFamily: String(layer?.fontFamily || "Pretendard, sans-serif"),
        fontWeight: String(layer?.fontWeight || "700"),
        color: validEditorHex(layer?.color, "#ffffff"),
        opacity: editorClamp(Number(layer?.opacity ?? 1), 0, 1),
        align: ["left", "center", "right"].includes(layer?.align) ? layer.align : "left",
        rotation: editorClamp(Number(layer?.rotation) || 0, -180, 180),
        scaleX: editorClamp(Number(layer?.scaleX) || 1, .1, 10),
        scaleY: editorClamp(Number(layer?.scaleY) || 1, .1, 10),
        shadow: {
            enabled: layer?.shadow?.enabled === true,
            blur: editorClamp(Number(layer?.shadow?.blur) || 0, 0, 100),
            distance: editorClamp(Number(layer?.shadow?.distance) || 0, 0, 200),
            angle: editorClamp(Number(layer?.shadow?.angle) || 0, 0, 360),
            color: validEditorHex(layer?.shadow?.color, "#000000"),
            opacity: editorClamp(Number(layer?.shadow?.opacity ?? .65), 0, 1)
        }
    };
}

function initImageEditorFeature() {
    if (!dom.imageEditorModal) return;

    initImageEditorFontSize();
    enhanceImageEditorNumericControls();
    document.querySelectorAll(".editor-preset").forEach(button => {
        button.onclick = () => {
            applyImageEditorPreset(button.dataset.editorPreset);
        };
    });
    dom.imageAdjustmentControls.querySelectorAll("label[data-param]").forEach(label => {
        const input = label.querySelector("input");
        input.oninput = () => {
            const target = getImageEditorAdjustmentTarget();
            if (!target) return;
            target.adjustments[label.dataset.param] = Number(input.value) / 100;
            setImageEditorPreset("custom", "Custom");
            label.querySelector("b").innerText = formatEditorControlValue(input.value);
            requestImageEditorRender();
        };
        label.title = "더블클릭하면 0으로 초기화됩니다.";
        label.addEventListener("dblclick", event => {
            if (event.target.closest(".editor-step-button")) return;
            event.preventDefault();
            input.value = "0";
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    });
    dom.imageEffectControls.querySelectorAll("label[data-effect]").forEach(label => {
        const input = label.querySelector("input");
        input.oninput = () => {
            const target = getImageEditorAdjustmentTarget();
            if (!target) return;
            target.effects[label.dataset.effect] = Number(input.value) / 100;
            setImageEditorPreset("custom", "Custom");
            label.querySelector("b").innerText = input.value;
            requestImageEditorRender();
        };
    });

    dom.btnImageEditorBypass.onclick = toggleImageEditorBypass;
    dom.btnImageEditorUndo.onclick = undoImageEditorDrawing;
    dom.btnImageEditorResetZoom.onclick = resetImageEditorViewport;
    dom.btnExportImageEditorProject.onclick = exportImageEditorProject;
    dom.btnImportImageEditorProject.onclick = () => dom.imageEditorProjectFileInput.click();
    dom.imageEditorProjectFileInput.onchange = async () => {
        const file = dom.imageEditorProjectFileInput.files?.[0];
        dom.imageEditorProjectFileInput.value = "";
        if (file) await importImageEditorProject(file);
    };
    dom.btnImageEditorReset.onclick = resetEntireImageEditor;
    dom.btnResetImageAdjustments.onclick = resetImageEditorAdjustments;
    dom.btnAddTextLayer.onclick = addTextToSelectedImageEditorLayer;
    initImageEditorLayerTabs();
    initImageLayerControls();
    initImageEditorShapeControls();
    initImageEditorQuickTextControls();
    initMovableImageEditorQuickControls();
    initImageEditorPanelResizers();
    initImageEditorFontManager();
    initImageEditorDrawingTools();
    initImageEditorMagneticSnap();
    initImageEditorPanMode();
    dom.btnMoveLayerUp.onclick = () => moveSelectedTextLayer(1);
    dom.btnMoveLayerDown.onclick = () => moveSelectedTextLayer(-1);
    dom.btnDuplicateTextLayer.onclick = duplicateSelectedTextLayer;
    dom.btnDeleteTextLayer.onclick = deleteSelectedTextLayer;
    dom.btnImageEditorClose.onclick = closeImageEditor;
    dom.btnImageEditorCancel.onclick = closeImageEditor;
    dom.btnImageEditorSave.onclick = openImageEditorSaveChoice;
    dom.btnImageEditorSaveBack.onclick = closeImageEditorSaveChoice;
    dom.btnImageEditorReplace.onclick = () => saveImageEditorResult("replace");
    dom.btnImageEditorNew.onclick = () => saveImageEditorResult("new");

    bindTextLayerInspector();
    dom.imageEditorCanvas.addEventListener("pointerdown", beginTextLayerDrag);
    dom.imageEditorCanvas.addEventListener("pointermove", continueTextLayerDrag);
    dom.imageEditorCanvas.addEventListener("pointerup", endTextLayerDrag);
    dom.imageEditorCanvas.addEventListener("pointercancel", endTextLayerDrag);
    dom.imageEditorStage.addEventListener("wheel", handleImageEditorWheel, { passive: false });
    dom.imageEditorStage.addEventListener("pointerdown", beginImageEditorPan);
    dom.imageEditorStage.addEventListener("pointermove", continueImageEditorPan);
    dom.imageEditorStage.addEventListener("pointerup", endImageEditorPan);
    dom.imageEditorStage.addEventListener("pointercancel", endImageEditorPan);
    window.addEventListener("resize", () => {
        if (imageEditorState.imageIndex >= 0) {
            sizeImageEditorCanvas();
            clampImageEditorQuickControlsPosition();
        }
    });
    dom.imageEditorModal.addEventListener("mousedown", event => {
        if (event.target === dom.imageEditorModal && !imageEditorState.processing) {
            closeImageEditor();
        }
    });
    document.addEventListener("keydown", event => {
        if (dom.imageEditorModal.style.display === "none") return;
        if (event.key === "Escape" && imageEditorState.fillEyedropperTarget) {
            event.preventDefault();
            cancelImageEditorFillEyedropper("스포이드가 취소되었습니다.");
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" &&
            !event.target.closest("input, textarea, select, [contenteditable='true']")) {
            event.preventDefault();
            undoImageEditorDrawing();
            return;
        }
        if (event.key === "Escape" && !imageEditorState.processing) {
            if (dom.imageEditorFmaPicker?.style.display !== "none") {
                closeImageEditorFmaPicker();
                return;
            }
            if (dom.cropModal?.style.display !== "none" || maskEditorState?.open) return;
            if (dom.imageEditorSaveChoice.style.display !== "none") closeImageEditorSaveChoice();
            else closeImageEditor();
        }
    });
}

function buildCurrentImageEditorProject() {
    if (!imageEditorState.sourceImage || !imageEditorState.config) return null;
    if (imageEditorState.drawingHasContent) {
        imageEditorState.config.drawingDataUrl =
            dom.imageEditorDrawingCanvas.toDataURL("image/png");
    }
    return {
        format: "FMA_EDIT_PROJECT",
        version: 1,
        exportedAt: new Date().toISOString(),
        source: {
            src: imageEditorState.sourceSrc,
            width: imageEditorState.sourceImage.naturalWidth,
            height: imageEditorState.sourceImage.naturalHeight,
            name: images[imageEditorState.imageIndex]?.path || "image"
        },
        config: cloneImageEditorConfig(imageEditorState.config)
    };
}

function exportImageEditorProject() {
    const project = buildCurrentImageEditorProject();
    if (!project) return;
    const sourceItem = images[imageEditorState.imageIndex];
    if (sourceItem) sourceItem.fmeProject = project;
    const blob = new Blob([JSON.stringify(project)], {
        type: "application/vnd.fma-edit+json"
    });
    const link = document.createElement("a");
    const safeName = String(project.source.name || "image")
        .replace(/\.[^.]+$/, "")
        .replace(/[\\/:*?"<>|]+/g, "_");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${safeName || "image"}_${Date.now()}.fme`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    saveCurrentImagesToDB();
}

async function importImageEditorProject(file) {
    if (!file || imageEditorState.processing) return;
    try {
        showLoading("FME 편집 프로젝트를 불러오는 중입니다...");
        updateLoading(12);
        const project = JSON.parse(await file.text());
        if (project?.format !== "FMA_EDIT_PROJECT" || !project.source?.src || !project.config) {
            throw new Error("지원되는 FMA 편집 프로젝트가 아닙니다.");
        }
        updateLoading(36);
        const sourceImage = await loadUpscaleImage(project.source.src);
        imageEditorState.sourceImage = sourceImage;
        imageEditorState.sourceSrc = project.source.src;
        imageEditorState.config = cloneImageEditorConfig(project.config);
        await preloadImageEditorLayers(imageEditorState.config.imageLayers);
        updateLoading(68);
        await initializeImageEditorDrawingLayer(imageEditorState.config.drawingDataUrl);
        const selected = imageEditorState.config.layerOrder.at(-1);
        selectImageEditorStackLayer(selected?.id || null, selected?.type || "empty");
        const sourceItem = images[imageEditorState.imageIndex];
        if (sourceItem) sourceItem.fmeProject = project;
        syncImageEditorControls();
        renderImageEditorLayerList();
        renderImageLayerList();
        sizeImageEditorCanvas();
        updateLoading(100);
    } catch (error) {
        console.error("FME project import failed:", error);
        alert("FME 프로젝트를 불러오지 못했습니다: " + error.message);
    } finally {
        hideLoading();
    }
}

function enhanceImageEditorNumericControls() {
    dom.imageEditorModal.querySelectorAll(
        'input[type="number"], input[type="range"]'
    ).forEach(input => {
        if (input.dataset.stepperReady === "true") return;
        input.dataset.stepperReady = "true";
        const wrapper = document.createElement("div");
        wrapper.className = "editor-stepper";
        wrapper.classList.toggle("range-stepper", input.type === "range");
        const minus = createImageEditorStepButton("−", -1, input);
        const plus = createImageEditorStepButton("+", 1, input);
        const zero = input.dataset.zeroStepper === "true"
            ? createImageEditorZeroButton(input)
            : null;
        wrapper.classList.toggle("has-zero", Boolean(zero));
        input.parentNode.insertBefore(wrapper, input);
        if (zero) wrapper.append(zero);
        wrapper.append(minus, input, plus);
    });
}

function createImageEditorZeroButton(input) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-step-button editor-zero-button";
    button.innerText = "0";
    button.title = "값을 0으로 설정";
    button.setAttribute("aria-label", button.title);
    button.onclick = event => {
        event.preventDefault();
        input.value = "0";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
    };
    return button;
}

function createImageEditorStepButton(label, direction, input) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "editor-step-button";
    button.innerText = label;
    button.title = direction < 0 ? "값 줄이기" : "값 늘리기";
    button.setAttribute("aria-label", button.title);
    button.onclick = event => {
        event.preventDefault();
        const step = Number(input.step) || 1;
        const minimum = input.min === "" ? -Infinity : Number(input.min);
        const maximum = input.max === "" ? Infinity : Number(input.max);
        const current = Number(input.value) || 0;
        const next = editorClamp(current + step * direction, minimum, maximum);
        input.value = String(Number(next.toFixed(6)));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
    };
    return button;
}

function initImageEditorFontSize() {
    let stored = NaN;
    try {
        stored = Number(localStorage.getItem(IMAGE_EDITOR_UI_FONT_STORAGE));
    } catch (error) {
        // Some file:// or privacy-restricted browser contexts disable localStorage.
    }
    const size = editorClamp(
        Number.isFinite(stored) && stored > 0 ? stored : IMAGE_EDITOR_UI_FONT_DEFAULT,
        6,
        15
    );
    applyImageEditorFontSize(size, false);
    dom.imageEditorFontSize.oninput = () => {
        applyImageEditorFontSize(Number(dom.imageEditorFontSize.value), true);
    };
}

function applyImageEditorFontSize(value, persist) {
    const size = Math.round(editorClamp(Number(value) || IMAGE_EDITOR_UI_FONT_DEFAULT, 6, 15));
    dom.imageEditorFontSize.value = String(size);
    dom.imageEditorFontSizeValue.innerText = size + "px";
    dom.imageEditorModal.style.setProperty("--editor-ui-font-size", size + "px");
    if (persist) {
        try {
            localStorage.setItem(IMAGE_EDITOR_UI_FONT_STORAGE, String(size));
        } catch (error) {
            // The size still applies for the current session when storage is unavailable.
        }
    }
}

function initImageEditorMagneticSnap() {
    try {
        imageEditorState.magneticSnap =
            localStorage.getItem(IMAGE_EDITOR_MAGNET_STORAGE) !== "false";
    } catch (error) {
        imageEditorState.magneticSnap = true;
    }
    dom.btnImageEditorMagnet.onclick = () => {
        imageEditorState.magneticSnap = !imageEditorState.magneticSnap;
        updateImageEditorMagnetButton();
        try {
            localStorage.setItem(
                IMAGE_EDITOR_MAGNET_STORAGE,
                String(imageEditorState.magneticSnap)
            );
        } catch (error) {}
    };
    updateImageEditorMagnetButton();
}

function updateImageEditorMagnetButton(snapping = false) {
    const enabled = Boolean(imageEditorState.magneticSnap);
    dom.btnImageEditorMagnet.classList.toggle("active", enabled);
    dom.btnImageEditorMagnet.classList.toggle("snapping", enabled && snapping);
    dom.btnImageEditorMagnet.setAttribute("aria-pressed", String(enabled));
    dom.btnImageEditorMagnet.title = enabled
        ? "자석 맞춤 켜짐 · 이미지 레이어를 경계나 중앙 가까이 이동하면 자동 정렬됩니다."
        : "자석 맞춤 꺼짐";
}

function snapImageEditorLayerPosition(layer, rawX, rawY) {
    if (!imageEditorState.magneticSnap || !imageEditorState.sourceImage) {
        return { x: rawX, y: rawY, snapped: false };
    }
    const canvasWidth = imageEditorState.sourceImage.naturalWidth;
    const canvasHeight = imageEditorState.sourceImage.naturalHeight;
    const baseCorners = imageEditorState.baseBounds?.corners || [];
    const baseBoundary = baseCorners.length === 4
        ? {
            left: Math.min(...baseCorners.map(point => point.x)),
            right: Math.max(...baseCorners.map(point => point.x)),
            top: Math.min(...baseCorners.map(point => point.y)),
            bottom: Math.max(...baseCorners.map(point => point.y)),
            centerX: imageEditorState.baseBounds.centerX,
            centerY: imageEditorState.baseBounds.centerY
        }
        : {
            left: 0,
            right: canvasWidth,
            top: 0,
            bottom: canvasHeight,
            centerX: canvasWidth / 2,
            centerY: canvasHeight / 2
        };
    const radians = (Number(layer.rotation) || 0) * Math.PI / 180;
    const cosine = Math.abs(Math.cos(radians));
    const sine = Math.abs(Math.sin(radians));
    const halfWidth = (layer.width * cosine + layer.height * sine) / 2;
    const halfHeight = (layer.width * sine + layer.height * cosine) / 2;
    const centerOffsetX = layer.width / 2;
    const centerOffsetY = layer.height / 2;
    // Keep the magnetic capture distance visually consistent at every zoom level.
    const threshold = 22 / Math.max(.05,
        imageEditorState.previewScale * imageEditorState.zoom
    );
    const xTargets = [
        baseBoundary.left + halfWidth - centerOffsetX,
        baseBoundary.centerX - centerOffsetX,
        baseBoundary.right - halfWidth - centerOffsetX
    ];
    const yTargets = [
        baseBoundary.top + halfHeight - centerOffsetY,
        baseBoundary.centerY - centerOffsetY,
        baseBoundary.bottom - halfHeight - centerOffsetY
    ];
    const nearest = (value, targets) => targets.reduce((best, target) => {
        const distance = Math.abs(value - target);
        return distance < best.distance ? { value: target, distance } : best;
    }, { value, distance: Infinity });
    const snapX = nearest(rawX, xTargets);
    const snapY = nearest(rawY, yTargets);
    const useX = snapX.distance <= threshold;
    const useY = snapY.distance <= threshold;
    return {
        x: useX ? snapX.value : rawX,
        y: useY ? snapY.value : rawY,
        snapped: useX || useY
    };
}

function getImageEditorTextDefaults() {
    const fallback = {
        fontFamily: "Pretendard, sans-serif",
        fontSize: 64,
        color: "#ffffff",
        fontWeight: "700",
        shadow: false
    };
    try {
        return { ...fallback, ...JSON.parse(localStorage.getItem(IMAGE_EDITOR_TEXT_DEFAULTS_STORAGE) || "{}") };
    } catch (_) {
        return fallback;
    }
}

function initImageEditorFontManager() {
    const defaults = getImageEditorTextDefaults();
    copyEditorFontOptionsToDefaults();
    setEditorSelectValue(dom.defaultTextFont, defaults.fontFamily);
    dom.defaultTextSize.value = defaults.fontSize;
    dom.defaultTextColor.value = defaults.color;
    setEditorSelectValue(dom.defaultTextWeight, defaults.fontWeight);
    dom.defaultTextShadow.checked = defaults.shadow;
    dom.btnOpenFontManager.onclick = () => {
        dom.fontManagerModal.style.display = "flex";
    };
    dom.btnCloseFontManager.onclick = () => {
        dom.fontManagerModal.style.display = "none";
    };
    dom.btnAddFontFiles.onclick = () => dom.fontFileInput.click();
    dom.fontFileInput.onchange = async () => {
        const files = [...(dom.fontFileInput.files || [])];
        for (const file of files) {
            const family = file.name.replace(/\.[^.]+$/, "") || "Custom Font";
            try {
                const font = new FontFace(family, await file.arrayBuffer());
                await font.load();
                document.fonts.add(font);
                addImageEditorFontOption(family, `"${family}"`);
            } catch (error) {
                console.warn("Font load failed:", file.name, error);
            }
        }
        dom.fontManagerStatus.innerText = `${files.length}개 폰트 파일을 처리했습니다.`;
        copyEditorFontOptionsToDefaults();
        dom.fontFileInput.value = "";
    };
    dom.btnLoadWindowsFonts.onclick = async () => {
        if (typeof window.queryLocalFonts !== "function") {
            dom.fontManagerStatus.innerText = "이 브라우저는 Windows 설치 폰트 조회를 지원하지 않습니다. TTF/OTF 추가를 사용하세요.";
            return;
        }
        try {
            const fonts = await window.queryLocalFonts();
            const families = [...new Set(fonts.map(font => font.family).filter(Boolean))].sort();
            families.forEach(family => addImageEditorFontOption(family, `"${family}"`));
            copyEditorFontOptionsToDefaults();
            dom.fontManagerStatus.innerText = `Windows 폰트 ${families.length}개를 불러왔습니다.`;
        } catch (error) {
            dom.fontManagerStatus.innerText = "Windows 폰트 권한이 허용되지 않았습니다.";
        }
    };
    dom.btnSaveFontDefaults.onclick = () => {
        const next = {
            fontFamily: dom.defaultTextFont.value || "Pretendard, sans-serif",
            fontSize: editorClamp(Number(dom.defaultTextSize.value) || 64, 8, 500),
            color: dom.defaultTextColor.value,
            fontWeight: dom.defaultTextWeight.value,
            shadow: dom.defaultTextShadow.checked
        };
        try {
            localStorage.setItem(IMAGE_EDITOR_TEXT_DEFAULTS_STORAGE, JSON.stringify(next));
        } catch (_) {}
        dom.fontManagerStatus.innerText = "새 텍스트 레이어 기본값을 저장했습니다.";
    };
}

function addImageEditorFontOption(label, value) {
    if ([...dom.editorTextFont.options].some(option => option.value === value)) return;
    const option = new Option(label, value);
    dom.editorTextFont.add(option);
}

function copyEditorFontOptionsToDefaults() {
    const current = dom.defaultTextFont.value;
    dom.defaultTextFont.innerHTML = "";
    [...dom.editorTextFont.options].forEach(option =>
        dom.defaultTextFont.add(new Option(option.text, option.value))
    );
    setEditorSelectValue(dom.defaultTextFont, current || getImageEditorTextDefaults().fontFamily);
}

function initImageEditorDrawingTools() {
    imageEditorState.drawingSettings = loadImageEditorDrawingSettings();
    document.querySelectorAll(".editor-drawing-tool").forEach(button => {
        button.onclick = () => selectImageEditorDrawingTool(button.dataset.drawingTool);
    });
    dom.btnImageEditorDrawingDone.onclick = () => setImageEditorDrawingActive(false);
    dom.imageEditorDrawingSize.oninput = () => {
        const setting = getCurrentImageEditorDrawingSetting();
        setting.size = editorClamp(Number(dom.imageEditorDrawingSize.value) || 1, 1, 300);
        dom.imageEditorDrawingSizeValue.innerText = `${Math.round(setting.size)}px`;
        saveImageEditorDrawingSettings();
    };
    dom.imageEditorDrawingOpacity.oninput = () => {
        const setting = getCurrentImageEditorDrawingSetting();
        setting.opacity = editorClamp(
            (Number(dom.imageEditorDrawingOpacity.value) || 1) / 100, .01, 1
        );
        dom.imageEditorDrawingOpacityValue.innerText =
            `${Math.round(setting.opacity * 100)}%`;
        saveImageEditorDrawingSettings();
    };
    dom.imageEditorDrawingColor.oninput = () => {
        getCurrentImageEditorDrawingSetting().color = dom.imageEditorDrawingColor.value;
        saveImageEditorDrawingSettings();
    };
    dom.imageEditorDrawingTip.onchange = () => {
        getCurrentImageEditorDrawingSetting().tip = dom.imageEditorDrawingTip.value;
        saveImageEditorDrawingSettings();
    };
    dom.imageEditorDrawingCanvas.addEventListener("pointerdown", beginImageEditorDrawing);
    dom.imageEditorDrawingCanvas.addEventListener("pointermove", continueImageEditorDrawing);
    dom.imageEditorDrawingCanvas.addEventListener("pointerup", endImageEditorDrawing);
    dom.imageEditorDrawingCanvas.addEventListener("pointercancel", endImageEditorDrawing);
    syncImageEditorDrawingControls();
}

function loadImageEditorDrawingSettings() {
    const settings = JSON.parse(JSON.stringify(IMAGE_EDITOR_DRAWING_DEFAULTS));
    try {
        const stored = JSON.parse(
            localStorage.getItem(IMAGE_EDITOR_DRAWING_SETTINGS_STORAGE) || "{}"
        );
        Object.keys(settings).forEach(tool => {
            const value = stored?.[tool];
            if (!value || typeof value !== "object") return;
            settings[tool] = {
                size: editorClamp(Number(value.size) || settings[tool].size, 1, 300),
                color: validEditorHex(value.color, settings[tool].color),
                opacity: editorClamp(
                    Number(value.opacity) || settings[tool].opacity,
                    .01,
                    1
                ),
                tip: ["round", "flat", "square", "calligraphy"].includes(value.tip)
                    ? value.tip
                    : settings[tool].tip
            };
        });
    } catch (error) {
        console.warn("Drawing tool settings load failed:", error);
    }
    return settings;
}

function saveImageEditorDrawingSettings() {
    try {
        localStorage.setItem(
            IMAGE_EDITOR_DRAWING_SETTINGS_STORAGE,
            JSON.stringify(imageEditorState.drawingSettings)
        );
    } catch (error) {
        console.warn("Drawing tool settings save failed:", error);
    }
}

function getCurrentImageEditorDrawingSetting() {
    return imageEditorState.drawingSettings[imageEditorState.drawingTool];
}

function selectImageEditorDrawingTool(tool) {
    if (tool === "hand") {
        setImageEditorDrawingActive(false);
        syncImageEditorDrawingToolButtons();
        dom.imageEditorDrawingStatus.innerText =
            "일반 선택 모드 · 오른쪽 도구에서 레이어·텍스트·도형을 선택해 편집하세요.";
        return;
    }
    if (!IMAGE_EDITOR_DRAWING_DEFAULTS[tool]) tool = "pencil";
    if (imageEditorState.drawingActive && imageEditorState.drawingTool === tool) {
        setImageEditorDrawingActive(false);
        return;
    }
    imageEditorState.drawingTool = tool;
    syncImageEditorDrawingToolButtons();
    syncImageEditorDrawingControls();
    setImageEditorDrawingActive(true);
}

function syncImageEditorDrawingToolButtons() {
    document.querySelectorAll(".editor-drawing-tool").forEach(button => {
        const buttonTool = button.dataset.drawingTool;
        const active = buttonTool !== "hand" &&
            imageEditorState.drawingActive && buttonTool === imageEditorState.drawingTool;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
}

function syncImageEditorDrawingControls() {
    const setting = getCurrentImageEditorDrawingSetting();
    dom.imageEditorDrawingSize.value = String(setting.size);
    dom.imageEditorDrawingSizeValue.innerText = `${Math.round(setting.size)}px`;
    dom.imageEditorDrawingColor.value = setting.color;
    dom.imageEditorDrawingOpacity.value = String(Math.round(setting.opacity * 100));
    dom.imageEditorDrawingOpacityValue.innerText = `${Math.round(setting.opacity * 100)}%`;
    dom.imageEditorDrawingTip.value = setting.tip;
    dom.imageEditorDrawingColor.disabled = imageEditorState.drawingTool === "eraser";
    dom.imageEditorDrawingStatus.innerText = imageEditorState.drawingTool === "eraser"
        ? "지우개로 그리기 레이어의 선을 지웁니다."
        : `${getImageEditorDrawingToolLabel(imageEditorState.drawingTool)} 도구 · 이미지 위에 그리세요.`;
}

function getImageEditorDrawingToolLabel(tool) {
    return {
        pencil: "연필",
        brush: "붓",
        pen: "펜",
        highlighter: "형광펜",
        eraser: "지우개"
    }[tool] || "그리기";
}

function setImageEditorDrawingActive(active) {
    imageEditorState.drawingActive = Boolean(active);
    dom.imageEditorDrawingCanvas.classList.toggle("active", imageEditorState.drawingActive);
    dom.btnImageEditorDrawingDone.classList.toggle("active", !imageEditorState.drawingActive);
    syncImageEditorDrawingToolButtons();
    if (!active) {
        imageEditorState.drawing = false;
        imageEditorState.drawingLastPoint = null;
        dom.imageEditorDrawingStatus.innerText =
            "선택·레이어 편집 중 · 그리기 도구를 누르면 다시 그릴 수 있습니다.";
    } else {
        syncImageEditorDrawingControls();
    }
}

async function initializeImageEditorDrawingLayer(dataUrl) {
    const canvas = dom.imageEditorDrawingCanvas;
    const width = imageEditorState.sourceImage?.naturalWidth || 1;
    const height = imageEditorState.sourceImage?.naturalHeight || 1;
    canvas.width = width;
    canvas.height = height;
    clearImageEditorDrawingLayer();
    imageEditorState.drawingHasContent = Boolean(dataUrl);
    if (!dataUrl) return;
    try {
        const image = await loadUpscaleImage(dataUrl);
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    } catch (error) {
        console.warn("Drawing layer load failed:", error);
    }
}

function clearImageEditorDrawingLayer() {
    const canvas = dom.imageEditorDrawingCanvas;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    imageEditorState.drawingHasContent = false;
}

function getImageEditorDrawingPoint(event) {
    const rect = dom.imageEditorDrawingCanvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * dom.imageEditorDrawingCanvas.width /
            Math.max(1, rect.width),
        y: (event.clientY - rect.top) * dom.imageEditorDrawingCanvas.height /
            Math.max(1, rect.height)
    };
}

function beginImageEditorDrawing(event) {
    if (!imageEditorState.drawingActive || imageEditorState.bypass || event.altKey) return;
    pushImageEditorDrawingUndo();
    imageEditorState.drawing = true;
    const point = getImageEditorDrawingPoint(event);
    imageEditorState.drawingLastPoint = point;
    dom.imageEditorDrawingCanvas.setPointerCapture?.(event.pointerId);
    drawImageEditorStroke(point, point);
    if (imageEditorState.drawingTool !== "eraser") {
        imageEditorState.drawingHasContent = true;
    }
    event.preventDefault();
}

function continueImageEditorDrawing(event) {
    if (!imageEditorState.drawing) return;
    const point = getImageEditorDrawingPoint(event);
    drawImageEditorStroke(imageEditorState.drawingLastPoint || point, point);
    imageEditorState.drawingLastPoint = point;
    event.preventDefault();
}

function endImageEditorDrawing(event) {
    if (!imageEditorState.drawing) return;
    imageEditorState.drawing = false;
    imageEditorState.drawingLastPoint = null;
    imageEditorState.config.drawingDataUrl = imageEditorState.drawingHasContent
        ? dom.imageEditorDrawingCanvas.toDataURL("image/png")
        : "";
    dom.imageEditorDrawingStatus.innerText =
        `${getImageEditorDrawingToolLabel(imageEditorState.drawingTool)} 적용 · Undo로 되돌릴 수 있습니다.`;
    updateImageEditorStatus();
    try {
        dom.imageEditorDrawingCanvas.releasePointerCapture?.(event.pointerId);
    } catch (error) {}
}

function drawImageEditorStroke(from, to) {
    const context = dom.imageEditorDrawingCanvas.getContext("2d");
    const setting = getCurrentImageEditorDrawingSetting();
    const tool = imageEditorState.drawingTool;
    context.save();
    context.globalAlpha = tool === "highlighter"
        ? Math.min(setting.opacity, .65)
        : setting.opacity;
    context.globalCompositeOperation = tool === "eraser"
        ? "destination-out"
        : "source-over";
    context.strokeStyle = setting.color;
    context.fillStyle = setting.color;
    context.lineWidth = setting.size;
    context.lineJoin = "round";
    context.lineCap = setting.tip === "square"
        ? "square"
        : setting.tip === "flat" ? "butt" : "round";
    if (setting.tip === "calligraphy") {
        drawImageEditorCalligraphyStroke(context, from, to, setting.size);
    } else {
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
        if (from.x === to.x && from.y === to.y) {
            if (setting.tip === "square" || setting.tip === "flat") {
                context.fillRect(
                    to.x - setting.size / 2,
                    to.y - setting.size / 2,
                    setting.size,
                    setting.size
                );
            } else {
                context.beginPath();
                context.arc(to.x, to.y, setting.size / 2, 0, Math.PI * 2);
                context.fill();
            }
        }
    }
    context.restore();
}

function drawImageEditorCalligraphyStroke(context, from, to, size) {
    const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, size * .18)));
    for (let index = 0; index <= steps; index++) {
        const ratio = index / steps;
        const x = from.x + (to.x - from.x) * ratio;
        const y = from.y + (to.y - from.y) * ratio;
        context.save();
        context.translate(x, y);
        context.rotate(-Math.PI / 4);
        context.beginPath();
        context.ellipse(0, 0, size / 2, Math.max(1, size * .16), 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }
}

function pushImageEditorDrawingUndo() {
    imageEditorState.drawingUndo.push({
        dataUrl: dom.imageEditorDrawingCanvas.toDataURL("image/png"),
        hasContent: imageEditorState.drawingHasContent
    });
    if (imageEditorState.drawingUndo.length > 12) imageEditorState.drawingUndo.shift();
    updateImageEditorUndoButton();
}

async function undoImageEditorDrawing() {
    if (!imageEditorState.drawingUndo.length) return;
    const snapshot = imageEditorState.drawingUndo.pop();
    clearImageEditorDrawingLayer();
    try {
        const image = await loadUpscaleImage(snapshot.dataUrl);
        dom.imageEditorDrawingCanvas.getContext("2d").drawImage(
            image,
            0,
            0,
            dom.imageEditorDrawingCanvas.width,
            dom.imageEditorDrawingCanvas.height
        );
    } catch (error) {
        console.warn("Drawing undo failed:", error);
    }
    imageEditorState.drawingHasContent = snapshot.hasContent;
    imageEditorState.config.drawingDataUrl = snapshot.hasContent
        ? dom.imageEditorDrawingCanvas.toDataURL("image/png")
        : "";
    updateImageEditorUndoButton();
    dom.imageEditorDrawingStatus.innerText = "최근 그리기를 되돌렸습니다.";
    updateImageEditorStatus();
}

function updateImageEditorUndoButton() {
    dom.btnImageEditorUndo.disabled = imageEditorState.drawingUndo.length === 0;
}

function initImageEditorPanMode() {
    if (!dom.btnImageEditorPanMode) return;
    dom.btnImageEditorPanMode.onclick = () => {
        imageEditorState.panMode = !imageEditorState.panMode;
        updateImageEditorPanModeButton();
    };
    updateImageEditorPanModeButton();
}

function updateImageEditorPanModeButton() {
    if (!dom.btnImageEditorPanMode) return;
    const enabled = imageEditorState.panMode === true;
    dom.btnImageEditorPanMode.classList.toggle("active", enabled);
    dom.btnImageEditorPanMode.setAttribute("aria-pressed", String(enabled));
    dom.btnImageEditorPanMode.title = enabled
        ? "이동 모드 끄기 · 현재 드래그로 편집 화면 이동"
        : "이동 모드 켜기 · Alt+드래그와 동일";
}

function handleImageEditorWheel(event) {
    if (!event.altKey || imageEditorState.imageIndex < 0) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    imageEditorState.zoom = editorClamp(imageEditorState.zoom * factor, .25, 8);
    applyImageEditorViewport();
}

function beginImageEditorPan(event) {
    const clickedCanvas = event.target.closest(".image-editor-canvas-wrap");
    const clickedQuickControls = event.target.closest(".editor-text-quick-controls");

    // 캔버스 밖의 빈 작업대를 누르면 현재 레이어 선택을 해제한다.
    // 캔버스 안쪽은 레이어 hit-test가 담당하고, 빠른 텍스트 컨트롤은 유지한다.
    const panRequested = event.altKey || imageEditorState.panMode;
    if (!panRequested) {
        if (!clickedCanvas && !clickedQuickControls) {
            clearImageEditorLayerSelection();
        }
        return;
    }
    if (!clickedCanvas) return;
    imageEditorState.panning = true;
    imageEditorState.panPointerStart = {
        x: event.clientX,
        y: event.clientY,
        panX: imageEditorState.panX,
        panY: imageEditorState.panY
    };
    dom.imageEditorStage.classList.add("panning");
    dom.imageEditorStage.setPointerCapture?.(event.pointerId);
    event.preventDefault();
}

function continueImageEditorPan(event) {
    if (!imageEditorState.panning || !imageEditorState.panPointerStart) return;
    imageEditorState.panX =
        imageEditorState.panPointerStart.panX +
        event.clientX - imageEditorState.panPointerStart.x;
    imageEditorState.panY =
        imageEditorState.panPointerStart.panY +
        event.clientY - imageEditorState.panPointerStart.y;
    applyImageEditorViewport();
    event.preventDefault();
}

function endImageEditorPan(event) {
    if (!imageEditorState.panning) return;
    imageEditorState.panning = false;
    imageEditorState.panPointerStart = null;
    dom.imageEditorStage.classList.remove("panning");
    try {
        dom.imageEditorStage.releasePointerCapture?.(event.pointerId);
    } catch (error) {}
}

function resetImageEditorViewport() {
    imageEditorState.zoom = 1;
    imageEditorState.panX = 0;
    imageEditorState.panY = 0;
    applyImageEditorViewport();
}

function applyImageEditorViewport() {
    if (!dom.imageEditorCanvasWrap) return;
    dom.imageEditorCanvasWrap.style.transform =
        `translate(${imageEditorState.panX}px, ${imageEditorState.panY}px) ` +
        `scale(${imageEditorState.zoom})`;
    dom.imageEditorZoomValue.innerText = `${Math.round(imageEditorState.zoom * 100)}%`;
}

async function openImageEditor(index) {
    const item = images[index];
    if (!item) return;
    const sourceSrc = item.imageEditSourceSrc || item.src;
    try {
        const sourceImage = await loadUpscaleImage(sourceSrc);
        imageEditorState.imageIndex = index;
        imageEditorState.sourceImage = sourceImage;
        imageEditorState.sourceSrc = sourceSrc;
        imageEditorState.config = cloneImageEditorConfig(item.imageEditConfig);
        if (imageEditorState.config.baseLayer.width <= 0) {
            imageEditorState.config.baseLayer.width = sourceImage.naturalWidth;
        }
        if (imageEditorState.config.baseLayer.height <= 0) {
            imageEditorState.config.baseLayer.height = sourceImage.naturalHeight;
        }
        await preloadImageEditorLayers(imageEditorState.config.imageLayers);
        await initializeImageEditorDrawingLayer(imageEditorState.config.drawingDataUrl);
        const selectedStackLayer = imageEditorState.config.layerOrder.at(-1) || null;
        imageEditorState.selectedLayerId =
            selectedStackLayer?.type === "text" ? selectedStackLayer.id : null;
        imageEditorState.selectedImageLayerId =
            selectedStackLayer?.type === "image" ? selectedStackLayer.id : null;
        imageEditorState.selectedEmptyLayerId =
            selectedStackLayer?.type === "empty" ? selectedStackLayer.id : null;
        imageEditorState.selectedShapeLayerId =
            selectedStackLayer?.type === "shape" ? selectedStackLayer.id : null;
        imageEditorState.selectedBaseLayer = false;
        imageEditorState.baseSelectable = false;
        imageEditorState.bypass = false;
        imageEditorState.processing = false;
        imageEditorState.drawingUndo = [];
        updateImageEditorUndoButton();
        resetImageEditorViewport();
        setImageEditorDrawingActive(false);
        updateImageEditorBypassButton();
        closeImageEditorSaveChoice();
        dom.imageEditorModal.style.display = "flex";
        syncImageEditorControls();
        renderImageEditorLayerList();
        renderImageLayerList();
        requestAnimationFrame(() => {
            sizeImageEditorCanvas();
            restoreImageEditorQuickControlsPosition();
        });
    } catch (error) {
        console.error("Image editor open failed:", error);
        alert("편집할 이미지를 불러올 수 없습니다: " + error.message);
    }
}

async function openImageEditorForExternal(src, onApply) {
    if (!src || typeof onApply !== "function") return;
    const tempIndex = images.length;
    images.push({
        src,
        path: `$.temporary.story_edit_${Date.now()}`,
        group: "temporary-story-edit",
        date: Date.now(),
        size: estimateDataUrlBytes(src),
        mimeType: "image/png",
        isFav: false
    });
    imageEditorState.externalReturn = { tempIndex, onApply };
    await openImageEditor(tempIndex);
    dom.imageEditorModal?.classList.add("story-external-child");
}

function clearImageEditorExternalReturn(removeTemporary = true) {
    const external = imageEditorState.externalReturn;
    imageEditorState.externalReturn = null;
    dom.imageEditorModal?.classList.remove("story-external-child");
    if (!external || !removeTemporary) return;
    if (images[external.tempIndex]?.group === "temporary-story-edit") {
        images.splice(external.tempIndex, 1);
    }
}

function closeImageEditor() {
    if (imageEditorState.processing) return;
    cancelImageEditorFillEyedropper();
    clearImageEditorExternalReturn(true);
    dom.imageEditorModal.style.display = "none";
    closeImageEditorFmaPicker();
    closeImageEditorSaveChoice();
    imageEditorState.imageIndex = -1;
    imageEditorState.sourceImage = null;
    imageEditorState.sourceSrc = "";
    imageEditorState.config = null;
    imageEditorState.selectedLayerId = null;
    imageEditorState.selectedImageLayerId = null;
    imageEditorState.selectedEmptyLayerId = null;
    imageEditorState.selectedShapeLayerId = null;
    imageEditorState.selectedBaseLayer = false;
    imageEditorState.baseSelectable = false;
    imageEditorState.textBounds.clear();
    imageEditorState.imageBounds.clear();
    imageEditorState.shapeBounds.clear();
    imageEditorState.baseBounds = null;
    imageEditorState.drawingUndo = [];
    setImageEditorDrawingActive(false);
}

function sizeImageEditorCanvas() {
    if (!imageEditorState.sourceImage || dom.imageEditorModal.style.display === "none") return;
    const stageRect = dom.imageEditorStage.getBoundingClientRect();
    const sourceWidth = imageEditorState.sourceImage.naturalWidth;
    const sourceHeight = imageEditorState.sourceImage.naturalHeight;
    const availableWidth = Math.max(160, stageRect.width - 48);
    const availableHeight = Math.max(160, stageRect.height - 64);
    const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight, 1);
    imageEditorState.previewScale = scale;
    dom.imageEditorCanvas.width = Math.max(1, Math.round(sourceWidth * scale));
    dom.imageEditorCanvas.height = Math.max(1, Math.round(sourceHeight * scale));
    applyImageEditorViewport();
    requestImageEditorRender();
}

function requestImageEditorRender() {
    if (imageEditorState.renderRequested || !imageEditorState.sourceImage) return;
    imageEditorState.renderRequested = true;
    requestAnimationFrame(() => {
        imageEditorState.renderRequested = false;
        renderImageEditorPreview();
    });
}

function renderImageEditorPreview() {
    if (!imageEditorState.sourceImage || !imageEditorState.config) return;
    renderImageEditorCanvas(
        dom.imageEditorCanvas,
        imageEditorState.sourceImage,
        imageEditorState.config,
        imageEditorState.bypass,
        imageEditorState.previewScale,
        true
    );
    dom.imageEditorDrawingCanvas.style.visibility =
        imageEditorState.bypass ? "hidden" : "visible";
    updateImageEditorStatus();
}

function renderImageEditorCanvas(canvas, image, config, bypass, scale, showSelection) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.save();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (!bypass && config.canvasBackground?.enabled) {
        context.globalAlpha = editorClamp(Number(config.canvasBackground.opacity ?? 1), 0, 1);
        context.fillStyle = config.canvasBackground.color || "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalAlpha = 1;
    }
    if (bypass) {
        context.globalAlpha = 1;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else if (config.baseLayer?.visible !== false) {
        drawImageEditorBaseImage(context, image, config.baseLayer, scale);
    }
    context.restore();

    if (bypass) {
        imageEditorState.textBounds.clear();
        imageEditorState.imageBounds.clear();
        imageEditorState.shapeBounds.clear();
        return canvas;
    }
    if (config.baseLayer?.visible !== false) {
        applyImageEditorAdjustments(canvas, config.adjustments);
        applyImageEditorAtmosphere(canvas, config.effects);
    }
    if (showSelection && imageEditorState.baseSelectable &&
        imageEditorState.selectedBaseLayer && config.baseLayer?.visible !== false) {
        drawImageLayerSelection(canvas.getContext("2d"), imageEditorState.baseBounds, scale);
    }
    drawImageEditorStackLayers(canvas, config, scale, showSelection);
    return canvas;
}

function drawImageEditorBaseImage(context, image, base, scale) {
    const width = Math.max(1, Number(base.width) || image.naturalWidth);
    const height = Math.max(1, Number(base.height) || image.naturalHeight);
    const x = Number(base.x) || 0;
    const y = Number(base.y) || 0;
    const rotation = Number(base.rotation) || 0;
    context.save();
    context.globalAlpha = editorClamp(Number(base.opacity ?? 1), 0, 1);
    context.translate((x + width / 2) * scale, (y + height / 2) * scale);
    context.rotate(rotation * Math.PI / 180);
    context.drawImage(image, -width * scale / 2, -height * scale / 2, width * scale, height * scale);
    context.restore();
    imageEditorState.baseBounds = createTextTransformBounds(
        x + width / 2, y + height / 2, width, height, 1, 1, rotation
    );
}

function drawImageEditorStackLayers(canvas, config, scale, showSelection) {
    imageEditorState.textBounds.clear();
    imageEditorState.imageBounds.clear();
    imageEditorState.shapeBounds.clear();
    (config.layerOrder || []).forEach(entry => {
        if (entry.type === "image") {
            const layer = config.imageLayers.find(item => item.id === entry.id);
            if (layer) drawImageEditorImageLayers(canvas, [layer], scale, showSelection);
        } else if (entry.type === "text") {
            const layer = config.textLayers.find(item => item.id === entry.id);
            if (layer) drawImageEditorTextLayers(canvas, [layer], scale, showSelection);
        } else if (entry.type === "shape") {
            const layer = config.shapeLayers.find(item => item.id === entry.id);
            if (layer) drawImageEditorShapeLayers(canvas, [layer], scale, showSelection);
        } else if (entry.type === "empty") {
            const layer = config.emptyLayers.find(item => item.id === entry.id);
            if (layer?.fill?.enabled) drawImageEditorFillLayer(canvas, layer);
        }
    });
}

function drawImageEditorFillLayer(canvas, layer) {
    if (!layer?.visible || !layer.fill?.enabled) return;
    const context = canvas.getContext("2d");
    const fill = layer.fill;
    let style = fill.color1;
    if (fill.mode === "linear") {
        const radians = fill.angle * Math.PI / 180;
        const directionX = Math.cos(radians);
        const directionY = Math.sin(radians);
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = (
            Math.abs(canvas.width * directionX) +
            Math.abs(canvas.height * directionY)
        ) / 2;
        style = context.createLinearGradient(
            centerX - directionX * radius,
            centerY - directionY * radius,
            centerX + directionX * radius,
            centerY + directionY * radius
        );
        style.addColorStop(0, fill.color1);
        style.addColorStop(1, fill.color2);
    } else if (fill.mode === "radial") {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.hypot(canvas.width, canvas.height) / 2;
        style = context.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, Math.max(1, radius)
        );
        style.addColorStop(0, fill.color1);
        style.addColorStop(1, fill.color2);
    }
    context.save();
    context.globalAlpha = fill.opacity;
    context.fillStyle = style;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
}

function drawImageEditorShapeLayers(canvas, layers, scale, showSelection) {
    const context = canvas.getContext("2d");
    (layers || []).forEach(layer => {
        if (!layer.visible) return;
        const x = layer.x * scale;
        const y = layer.y * scale;
        const width = layer.width * scale;
        const height = layer.height * scale;
        context.save();
        context.globalAlpha = layer.opacity;
        context.translate(x + width / 2, y + height / 2);
        context.rotate(layer.rotation * Math.PI / 180);
        buildImageEditorShapePath(context, layer.shape, width, height);
        context.globalAlpha = layer.opacity * layer.fillOpacity;
        context.fillStyle = layer.fillColor;
        context.fill();
        if (layer.strokeWidth > 0) {
            context.globalAlpha = layer.opacity;
            context.strokeStyle = layer.strokeColor;
            context.lineWidth = layer.strokeWidth * scale;
            context.stroke();
        }
        context.restore();
        const bounds = createTextTransformBounds(
            layer.x + layer.width / 2,
            layer.y + layer.height / 2,
            layer.width,
            layer.height,
            1,
            1,
            layer.rotation
        );
        imageEditorState.shapeBounds.set(layer.id, bounds);
        if (showSelection && layer.id === imageEditorState.selectedShapeLayerId) {
            if (layer.locked) drawImageLayerSelection(context, bounds, scale);
            else drawTextTransformSelection(context, bounds, scale);
        }
    });
}

function buildImageEditorShapePath(context, type, width, height) {
    const left = -width / 2;
    const top = -height / 2;
    context.beginPath();
    if (type === "ellipse") {
        context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
    } else if (type === "triangle") {
        context.moveTo(0, top);
        context.lineTo(width / 2, height / 2);
        context.lineTo(left, height / 2);
        context.closePath();
    } else if (type === "semicircle") {
        context.moveTo(left, height / 2);
        context.arc(0, height / 2, width / 2, Math.PI, 0);
        context.closePath();
    } else if (type === "diamond") {
        context.moveTo(0, top);
        context.lineTo(width / 2, 0);
        context.lineTo(0, height / 2);
        context.lineTo(left, 0);
        context.closePath();
    } else if (type === "arrow") {
        context.moveTo(left, -height * .2);
        context.lineTo(width * .12, -height * .2);
        context.lineTo(width * .12, top);
        context.lineTo(width / 2, 0);
        context.lineTo(width * .12, height / 2);
        context.lineTo(width * .12, height * .2);
        context.lineTo(left, height * .2);
        context.closePath();
    } else if (type === "roundedRectangle") {
        context.roundRect(left, top, width, height, Math.min(width, height) * .18);
    } else {
        context.rect(left, top, width, height);
    }
}

function applyImageEditorAdjustments(canvas, params) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const exposureFactor = Math.pow(2, params.exposure);
    const contrastFactor = Math.max(.05, 1 + params.contrast * 1.35);
    const clarityFactor = Math.max(.1, 1 + params.clarity * .65);
    const gamma = Math.max(.45, 1 - params.lightBalance * .32);

    for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] === 0) continue;
        let red = data[index];
        let green = data[index + 1];
        let blue = data[index + 2];

        red = Math.pow(editorClamp(red / 255, 0, 1), gamma) * 255;
        green = Math.pow(editorClamp(green / 255, 0, 1), gamma) * 255;
        blue = Math.pow(editorClamp(blue / 255, 0, 1), gamma) * 255;
        const brightnessOffset = params.brightness * 85;
        red = red * exposureFactor + brightnessOffset;
        green = green * exposureFactor + brightnessOffset;
        blue = blue * exposureFactor + brightnessOffset;
        red = (red - 128) * contrastFactor + 128;
        green = (green - 128) * contrastFactor + 128;
        blue = (blue - 128) * contrastFactor + 128;

        let luminance = red * .2126 + green * .7152 + blue * .0722;
        const highlightMask = editorSmoothStep(110, 245, luminance);
        const shadowMask = 1 - editorSmoothStep(10, 145, luminance);
        const tonalOffset =
            params.highlight * 75 * highlightMask + params.shadow * 75 * shadowMask;
        red += tonalOffset;
        green += tonalOffset;
        blue += tonalOffset;

        const gray = red * .299 + green * .587 + blue * .114;
        const saturationFactor = Math.max(0, 1 + params.saturation);
        red = gray + (red - gray) * saturationFactor;
        green = gray + (green - gray) * saturationFactor;
        blue = gray + (blue - gray) * saturationFactor;

        red += params.temperature * 54 + params.tint * 22;
        green -= params.tint * 38;
        blue -= params.temperature * 54 - params.tint * 22;
        luminance = red * .2126 + green * .7152 + blue * .0722;
        red = luminance + (red - luminance) * clarityFactor;
        green = luminance + (green - luminance) * clarityFactor;
        blue = luminance + (blue - luminance) * clarityFactor;

        data[index] = editorClamp(red, 0, 255);
        data[index + 1] = editorClamp(green, 0, 255);
        data[index + 2] = editorClamp(blue, 0, 255);
    }
    context.putImageData(imageData, 0, 0);
    if (params.sharpness > 0) applySharpen(canvas, params.sharpness * .65);
}

function applyImageEditorAtmosphere(canvas, effects) {
    const context = canvas.getContext("2d");
    if (effects.glow > 0) {
        const copy = document.createElement("canvas");
        copy.width = canvas.width;
        copy.height = canvas.height;
        copy.getContext("2d").drawImage(canvas, 0, 0);
        context.save();
        context.globalAlpha = effects.glow * .38;
        context.globalCompositeOperation = "source-atop";
        context.filter = `blur(${Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * .012))}px)`;
        context.drawImage(copy, 0, 0);
        context.restore();
    }
    if (effects.fade > 0) {
        context.save();
        context.globalAlpha = effects.fade * .34;
        context.fillStyle = "#d6a77b";
        context.globalCompositeOperation = "source-atop";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
    }
    if (effects.vignette > 0) {
        const radius = Math.max(canvas.width, canvas.height) * .72;
        const gradient = context.createRadialGradient(
            canvas.width / 2, canvas.height / 2, radius * .18,
            canvas.width / 2, canvas.height / 2, radius
        );
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(1, `rgba(0,0,0,${Math.min(.85, effects.vignette * .82)})`);
        context.save();
        context.globalCompositeOperation = "source-atop";
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
    }
    if (effects.grain > 0) {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const amount = effects.grain * 34;
        let seed = 8121;
        for (let index = 0; index < data.length; index += 4) {
            seed = (seed * 16807) % 2147483647;
            const noise = (seed / 2147483647 - .5) * amount;
            data[index] = editorClamp(data[index] + noise, 0, 255);
            data[index + 1] = editorClamp(data[index + 1] + noise, 0, 255);
            data[index + 2] = editorClamp(data[index + 2] + noise, 0, 255);
        }
        context.putImageData(imageData, 0, 0);
    }
}

function drawImageEditorTextLayers(canvas, layers, scale, showSelection) {
    const context = canvas.getContext("2d");
    layers.forEach(layer => {
        if (!layer.visible) return;
        const size = layer.fontSize * scale;
        const x = layer.x * scale;
        const y = layer.y * scale;
        const lineHeight = size * 1.2;
        const lines = String(layer.text).split(/\r?\n/);
        context.save();
        context.font = `${layer.fontWeight} ${size}px ${layer.fontFamily}`;
        context.textBaseline = "top";
        context.textAlign = layer.align;
        context.globalAlpha = layer.opacity;
        context.fillStyle = layer.color;
        const widths = lines.map(line => context.measureText(line || " ").width);
        const width = Math.max(...widths, size * .25);
        const height = lines.length * lineHeight;
        let left = x;
        if (layer.align === "center") left -= width / 2;
        else if (layer.align === "right") left -= width;
        const centerX = left + width / 2;
        const centerY = y + height / 2;
        context.translate(centerX, centerY);
        context.rotate(layer.rotation * Math.PI / 180);
        context.scale(layer.scaleX, layer.scaleY);
        if (layer.shadow.enabled) {
            const radians = layer.shadow.angle * Math.PI / 180;
            context.shadowOffsetX = Math.cos(radians) * layer.shadow.distance * scale;
            context.shadowOffsetY = Math.sin(radians) * layer.shadow.distance * scale;
            context.shadowBlur = layer.shadow.blur * scale;
            context.shadowColor = editorHexToRgba(layer.shadow.color, layer.shadow.opacity);
        }
        lines.forEach((line, lineIndex) => {
            context.fillText(line, x - centerX, y + lineIndex * lineHeight - centerY);
        });
        context.restore();

        const bounds = createTextTransformBounds(
            centerX / scale,
            centerY / scale,
            width / scale,
            height / scale,
            layer.scaleX,
            layer.scaleY,
            layer.rotation
        );
        imageEditorState.textBounds.set(layer.id, bounds);
        if (showSelection && layer.id === imageEditorState.selectedLayerId) {
            drawTextTransformSelection(context, bounds, scale);
        }
    });
}

function createTextTransformBounds(centerX, centerY, width, height, scaleX, scaleY, rotation) {
    const radians = rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const halfWidth = width * scaleX / 2;
    const halfHeight = height * scaleY / 2;
    const transform = (dx, dy) => ({
        x: centerX + dx * cosine - dy * sine,
        y: centerY + dx * sine + dy * cosine
    });
    const corners = [
        transform(-halfWidth, -halfHeight),
        transform(halfWidth, -halfHeight),
        transform(halfWidth, halfHeight),
        transform(-halfWidth, halfHeight)
    ];
    const handleGap = 30 / Math.max(.1, getImageEditorDisplayScale());
    return {
        centerX,
        centerY,
        width,
        height,
        halfWidth,
        halfHeight,
        rotation,
        corners,
        handles: {
            scaleX: transform(halfWidth, 0),
            scaleY: transform(0, halfHeight),
            uniform: transform(halfWidth, halfHeight),
            uniformTopRight: transform(halfWidth, -halfHeight),
            uniformTopLeft: transform(-halfWidth, -halfHeight),
            uniformBottomLeft: transform(-halfWidth, halfHeight),
            rotate: transform(0, -halfHeight - handleGap)
        }
    };
}

function drawTextTransformSelection(context, bounds, scale) {
    const points = bounds.corners.map(point => ({
        x: point.x * scale,
        y: point.y * scale
    }));
    const handles = Object.fromEntries(
        Object.entries(bounds.handles).map(([key, point]) => [
            key,
            { x: point.x * scale, y: point.y * scale }
        ])
    );
    context.save();
    context.globalAlpha = 1;
    context.strokeStyle = "#7fddff";
    context.fillStyle = "#101722";
    context.lineWidth = 1.5;
    context.setLineDash([5, 4]);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.closePath();
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.moveTo((points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
    context.lineTo(handles.rotate.x, handles.rotate.y);
    context.stroke();
    Object.entries(handles).forEach(([type, point]) => {
        context.beginPath();
        context.arc(point.x, point.y, type === "rotate" ? 8 : 7, 0, Math.PI * 2);
        context.fillStyle = type === "rotate" ? "#a78bfa" : "#101722";
        context.fill();
        context.strokeStyle = type === "rotate" ? "#ffffff" : "#7fddff";
        context.stroke();
        context.fillStyle = "#ffffff";
        context.font = "bold 10px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText({
            scaleX: "↔",
            scaleY: "↕",
            uniform: "↘",
            uniformTopRight: "↗",
            uniformTopLeft: "↖",
            uniformBottomLeft: "↙",
            rotate: "↻"
        }[type], point.x, point.y);
    });
    context.restore();
}

function applyImageEditorPreset(key) {
    const preset = IMAGE_EDITOR_PRESETS[key];
    if (!preset || !imageEditorState.config) return;
    const target = getImageEditorAdjustmentTarget();
    if (!target) return;
    IMAGE_EDITOR_PARAMS.forEach(name => {
        target.adjustments[name] = Number(preset.values[name]) || 0;
    });
    IMAGE_EDITOR_EFFECTS.forEach(name => {
        target.effects[name] = Number(preset.values[name]) || 0;
    });
    setImageEditorPreset(key, preset.name);
    syncImageAdjustmentControls();
    requestImageEditorRender();
}

function selectImageEditorBaseForAdjustments() {
    if (!imageEditorState.config || imageEditorState.selectedBaseLayer) return;
    selectImageEditorStackLayer("__base__", "base");
    renderImageLayerList();
    renderImageEditorLayerList();
}

function setImageEditorPreset(key, displayName) {
    const target = getImageEditorAdjustmentTarget();
    if (!target) return;
    target.preset = key;
    dom.imageEditorPresetName.innerText = displayName;
    document.querySelectorAll(".editor-preset").forEach(button => {
        button.classList.toggle("active", button.dataset.editorPreset === key);
    });
}

function syncImageEditorControls() {
    const preset = IMAGE_EDITOR_PRESETS[imageEditorState.config.preset];
    setImageEditorPreset(
        imageEditorState.config.preset,
        preset?.name || (imageEditorState.config.preset === "original" ? "Original" : "Custom")
    );
    syncImageAdjustmentControls();
    syncTextLayerInspector();
}

function syncImageAdjustmentControls() {
    const target = getImageEditorAdjustmentTarget();
    const enabled = Boolean(target);
    dom.imageAdjustmentControls.querySelectorAll("label[data-param]").forEach(label => {
        const value = Math.round((target?.adjustments?.[label.dataset.param] || 0) * 100);
        label.querySelector("input").value = String(value);
        label.querySelector("input").disabled = !enabled;
        label.querySelector("b").innerText = formatEditorControlValue(value);
    });
    dom.imageEffectControls.querySelectorAll("label[data-effect]").forEach(label => {
        const value = Math.round((target?.effects?.[label.dataset.effect] || 0) * 100);
        label.querySelector("input").value = String(value);
        label.querySelector("input").disabled = !enabled;
        label.querySelector("b").innerText = value;
    });
}

function resetImageEditorAdjustments() {
    const target = getImageEditorAdjustmentTarget();
    if (!target) return;
    IMAGE_EDITOR_PARAMS.forEach(key => target.adjustments[key] = 0);
    IMAGE_EDITOR_EFFECTS.forEach(key => target.effects[key] = 0);
    setImageEditorPreset("original", "Original");
    syncImageAdjustmentControls();
    requestImageEditorRender();
}

function resetEntireImageEditor() {
    if (!confirm("모든 보정, 이미지·텍스트 레이어와 그리기를 초기화할까요?")) return;
    cancelImageEditorFillEyedropper();
    imageEditorState.config = createDefaultImageEditorConfig();
    imageEditorState.selectedLayerId = null;
    imageEditorState.selectedImageLayerId = null;
    imageEditorState.selectedEmptyLayerId = null;
    imageEditorState.selectedShapeLayerId = null;
    imageEditorState.selectedBaseLayer = true;
    imageEditorState.imageLayerCache.clear();
    imageEditorState.bypass = false;
    clearImageEditorDrawingLayer();
    imageEditorState.drawingUndo = [];
    updateImageEditorUndoButton();
    updateImageEditorBypassButton();
    syncImageEditorControls();
    renderImageEditorLayerList();
    renderImageLayerList();
    requestImageEditorRender();
}

function toggleImageEditorBypass() {
    imageEditorState.bypass = !imageEditorState.bypass;
    updateImageEditorBypassButton();
    requestImageEditorRender();
}

function updateImageEditorBypassButton() {
    dom.btnImageEditorBypass.classList.toggle("active", imageEditorState.bypass);
    dom.btnImageEditorBypass.setAttribute("aria-pressed", String(imageEditorState.bypass));
    dom.btnImageEditorBypass.innerText = imageEditorState.bypass
        ? "◉ Bypass ON · 원본"
        : "◉ Bypass · 원본 보기";
    if (dom.imageEditorDrawingCanvas) {
        dom.imageEditorDrawingCanvas.style.visibility =
            imageEditorState.bypass ? "hidden" : "visible";
    }
}

function initImageEditorLayerTabs() {
    dom.btnEditorLayerTab.onclick = () => setImageEditorSidebarTab("layer");
    dom.btnEditorTextTab.onclick = () => setImageEditorSidebarTab("text");
    dom.btnEditorShapeTab.onclick = () => setImageEditorSidebarTab("shape");
    setImageEditorSidebarTab("layer");
}

function setImageEditorSidebarTab(tab) {
    const text = tab === "text";
    const shape = tab === "shape";
    const layer = !text && !shape;
    dom.btnEditorLayerTab.classList.toggle("active", layer);
    dom.btnEditorTextTab.classList.toggle("active", text);
    dom.btnEditorShapeTab.classList.toggle("active", shape);
    dom.btnEditorLayerTab.setAttribute("aria-selected", String(layer));
    dom.btnEditorTextTab.setAttribute("aria-selected", String(text));
    dom.btnEditorShapeTab.setAttribute("aria-selected", String(shape));
    dom.editorLayerTabPanel.style.display = layer ? "block" : "none";
    dom.editorTextTabPanel.style.display = text ? "block" : "none";
    dom.editorShapeTabPanel.style.display = shape ? "block" : "none";
}

function initImageEditorShapeControls() {
    document.querySelectorAll("[data-editor-shape]").forEach(button => {
        button.onclick = () => addImageEditorShapeLayer(button.dataset.editorShape);
    });
    [
        [dom.editorShapeType, "shape", value => value],
        [dom.editorShapeOpacity, "opacity", value => editorClamp(Number(value) / 100, 0, 1)],
        [dom.editorShapeFillColor, "fillColor", value => value],
        [dom.editorShapeFillOpacity, "fillOpacity", value => editorClamp(Number(value) / 100, 0, 1)],
        [dom.editorShapeStrokeColor, "strokeColor", value => value],
        [dom.editorShapeStrokeWidth, "strokeWidth", value => editorClamp(Number(value), 0, 100)],
        [dom.editorShapeX, "x", value => Number(value) || 0],
        [dom.editorShapeY, "y", value => Number(value) || 0],
        [dom.editorShapeWidth, "width", value => Math.max(1, Number(value) || 1)],
        [dom.editorShapeHeight, "height", value => Math.max(1, Number(value) || 1)],
        [dom.editorShapeRotation, "rotation", value => editorClamp(Number(value) || 0, -180, 180)]
    ].forEach(([input, key, parse]) => {
        input.oninput = () => {
            const shape = getSelectedShapeLayer();
            if (!shape || shape.locked) return;
            shape[key] = parse(input.value);
            requestImageEditorRender();
            renderImageLayerList();
        };
    });
    const updateBackground = () => {
        const background = imageEditorState.config?.canvasBackground;
        if (!background) return;
        background.enabled = dom.editorCanvasBackgroundEnabled.checked;
        background.color = dom.editorCanvasBackgroundColor.value;
        background.opacity = editorClamp(
            Number(dom.editorCanvasBackgroundOpacity.value) / 100, 0, 1
        );
        dom.editorCanvasBackgroundOpacityValue.innerText =
            `${Math.round(background.opacity * 100)}%`;
        requestImageEditorRender();
    };
    dom.editorCanvasBackgroundEnabled.onchange = updateBackground;
    dom.editorCanvasBackgroundColor.oninput = updateBackground;
    dom.editorCanvasBackgroundOpacity.oninput = updateBackground;
}

function initImageLayerControls() {
    dom.btnAddImageLayer.onclick = addEmptyImageEditorLayer;
    dom.btnPutColorInLayer.onclick = putColorInSelectedImageEditorLayer;
    dom.btnPutImageInLayer.onclick = () => {
        if (!imageEditorState.selectedEmptyLayerId) addEmptyImageEditorLayer();
        dom.imageLayerFileInput.click();
    };
    dom.btnPutFmaImageInLayer.onclick = openImageEditorFmaPicker;
    dom.btnCloseImageEditorFmaPicker.onclick = closeImageEditorFmaPicker;
    dom.btnCancelImageEditorFmaPicker.onclick = closeImageEditorFmaPicker;
    dom.btnApplyImageEditorFmaPicker.onclick = applySelectedFmaImageToEditorLayer;
    dom.imageEditorFmaPicker.addEventListener("mousedown", event => {
        if (event.target === dom.imageEditorFmaPicker) closeImageEditorFmaPicker();
    });
    dom.btnPutTextInLayer.onclick = addTextToSelectedImageEditorLayer;
    dom.imageLayerFileInput.onchange = async () => {
        const files = [...(dom.imageLayerFileInput.files || [])].filter(file =>
            file.type.startsWith("image/")
        );
        for (const file of files) await addImageEditorImageLayer(file);
        dom.imageLayerFileInput.value = "";
    };
    dom.btnImageLayerUp.onclick = () => moveSelectedImageLayer(1);
    dom.btnImageLayerDown.onclick = () => moveSelectedImageLayer(-1);
    dom.btnDuplicateImageLayer.onclick = duplicateSelectedImageEditorStackLayer;
    dom.btnDeleteImageLayer.onclick = deleteSelectedImageEditorStackLayer;
    dom.btnCropImageLayer.onclick = cropSelectedImageEditorLayer;
    dom.btnBgRemoveImageLayer.onclick = removeBackgroundFromSelectedImageEditorLayer;
    dom.btnDuplicateImageAlpha.onclick = () => duplicateSelectedImageLayerSegmentation("alpha");
    dom.btnDuplicateImageMask.onclick = () => duplicateSelectedImageLayerSegmentation("mask");
    dom.btnDuplicateBaseLayer.onclick = duplicateImageEditorBaseLayer;
    dom.btnDuplicateBaseAlpha.onclick = () => duplicateImageEditorBaseSegmentation("alpha");
    dom.btnDuplicateBaseMask.onclick = () => duplicateImageEditorBaseSegmentation("mask");
    dom.baseImageLayerVisible.onchange = updateImageEditorBaseLayer;
    dom.baseImageLayerSelectable.onchange = () => {
        imageEditorState.baseSelectable = dom.baseImageLayerSelectable.checked;
        if (!imageEditorState.baseSelectable && imageEditorState.selectedBaseLayer) {
            selectImageEditorStackLayer(null, "none");
            renderImageLayerList();
            renderImageEditorLayerList();
        }
        requestImageEditorRender();
    };
    dom.baseImageLayerOpacity.oninput = updateImageEditorBaseLayer;
    document.querySelectorAll("[data-fill-layer-mode]").forEach(button => {
        button.onclick = () => updateSelectedImageEditorFillLayer({
            mode: button.dataset.fillLayerMode
        });
    });
    dom.fillLayerColorStart.oninput = () => updateSelectedImageEditorFillLayer({
        color1: dom.fillLayerColorStart.value
    });
    dom.fillLayerColorEnd.oninput = () => updateSelectedImageEditorFillLayer({
        color2: dom.fillLayerColorEnd.value
    });
    dom.fillLayerOpacity.oninput = () => updateSelectedImageEditorFillLayer({
        opacity: editorClamp(Number(dom.fillLayerOpacity.value) / 100, 0, 1)
    });
    dom.fillLayerAngle.oninput = () => updateSelectedImageEditorFillLayer({
        angle: editorClamp(Number(dom.fillLayerAngle.value) || 0, 0, 360)
    });
    dom.btnSwapFillLayerColors.onclick = () => {
        const layer = getSelectedImageEditorFillLayer();
        if (!layer || layer.locked) return;
        [layer.fill.color1, layer.fill.color2] = [layer.fill.color2, layer.fill.color1];
        syncImageEditorFillLayerInspector();
        renderImageLayerList();
        renderImageEditorLayerList();
        requestImageEditorRender();
    };
    dom.btnPickFillColorStart.onclick = () => toggleImageEditorFillEyedropper("start");
    dom.btnPickFillColorEnd.onclick = () => toggleImageEditorFillEyedropper("end");
    [
        [dom.imageLayerOpacity, "opacity", value => editorClamp(Number(value) / 100, 0, 1)],
        [dom.imageLayerRotation, "rotation", value => editorClamp(Number(value) || 0, -180, 180)],
        [dom.imageLayerX, "x", value => Number(value) || 0],
        [dom.imageLayerY, "y", value => Number(value) || 0],
        [dom.imageLayerWidth, "width", value => Math.max(1, Number(value) || 1)],
        [dom.imageLayerHeight, "height", value => Math.max(1, Number(value) || 1)]
    ].forEach(([input, key, parse]) => {
        input.oninput = () => {
            const layer = getSelectedImageLayer();
            if (!layer || layer.locked) return;
            layer[key] = parse(input.value);
            syncImageLayerRangeValues(layer);
            requestImageEditorRender();
        };
    });
}

function updateImageEditorBaseLayer() {
    if (!imageEditorState.config?.baseLayer) return;
    imageEditorState.config.baseLayer.visible = dom.baseImageLayerVisible.checked;
    imageEditorState.config.baseLayer.opacity = editorClamp(
        Number(dom.baseImageLayerOpacity.value) / 100,
        0,
        1
    );
    dom.baseImageLayerOpacityValue.value =
        `${Math.round(imageEditorState.config.baseLayer.opacity * 100)}%`;
    dom.baseImageLayerOpacityValue.innerText =
        `${Math.round(imageEditorState.config.baseLayer.opacity * 100)}%`;
    renderImageLayerList();
    renderImageEditorLayerList();
    requestImageEditorRender();
}

function syncImageEditorBaseLayerControls() {
    const base = imageEditorState.config?.baseLayer;
    if (!base) return;
    dom.baseImageLayerVisible.checked = base.visible;
    dom.baseImageLayerSelectable.checked = imageEditorState.baseSelectable;
    dom.baseImageLayerOpacity.value = Math.round(base.opacity * 100);
    dom.baseImageLayerOpacityValue.value = `${Math.round(base.opacity * 100)}%`;
    dom.baseImageLayerOpacityValue.innerText = `${Math.round(base.opacity * 100)}%`;
}

function syncImageLayerRangeValues(layer) {
    if (!layer) return;
    const sourceWidth = imageEditorState.sourceImage?.naturalWidth || layer.width || 1;
    const sourceHeight = imageEditorState.sourceImage?.naturalHeight || layer.height || 1;
    dom.imageLayerX.min = String(-sourceWidth * 2);
    dom.imageLayerX.max = String(sourceWidth * 3);
    dom.imageLayerY.min = String(-sourceHeight * 2);
    dom.imageLayerY.max = String(sourceHeight * 3);
    dom.imageLayerWidth.max = String(Math.max(1000, sourceWidth * 4, layer.width));
    dom.imageLayerHeight.max = String(Math.max(1000, sourceHeight * 4, layer.height));
    dom.imageLayerOpacityValue.innerText = `${Math.round(layer.opacity * 100)}%`;
    dom.imageLayerRotationValue.innerText = `${Math.round(layer.rotation)}°`;
    dom.imageLayerXValue.innerText = `${Math.round(layer.x)}`;
    dom.imageLayerYValue.innerText = `${Math.round(layer.y)}`;
    dom.imageLayerWidthValue.innerText = `${Math.round(layer.width)}px`;
    dom.imageLayerHeightValue.innerText = `${Math.round(layer.height)}px`;
}

function addEmptyImageEditorLayer() {
    if (!imageEditorState.config) return null;
    const count = imageEditorState.config.layerOrder.length + 1;
    const layer = normalizeEmptyLayer({
        id: createImageEditorLayerId("empty"),
        name: `레이어 ${count}`
    });
    imageEditorState.config.emptyLayers.push(layer);
    imageEditorState.config.layerOrder.push({ id: layer.id, type: "empty" });
    selectImageEditorStackLayer(layer.id, "empty");
    renderImageLayerList();
    requestImageEditorRender();
    return layer;
}

function putColorInSelectedImageEditorLayer() {
    if (!imageEditorState.config) return;
    let layer = imageEditorState.config.emptyLayers.find(
        item => item.id === imageEditorState.selectedEmptyLayerId
    );
    if (!layer) layer = addEmptyImageEditorLayer();
    if (!layer) return;
    layer.fill = normalizeImageEditorLayerFill({
        ...layer.fill,
        enabled: true
    });
    if (/^레이어\s+\d+$/u.test(layer.name) || layer.name === "빈 레이어") {
        const count = imageEditorState.config.emptyLayers.filter(
            item => item.fill?.enabled
        ).length;
        layer.name = `색상 레이어 ${Math.max(1, count)}`;
    }
    selectImageEditorStackLayer(layer.id, "empty");
    syncImageEditorFillLayerInspector();
    renderImageLayerList();
    renderImageEditorLayerList();
    requestImageEditorRender();
}

function getSelectedImageEditorFillLayer() {
    const layer = imageEditorState.config?.emptyLayers.find(
        item => item.id === imageEditorState.selectedEmptyLayerId
    ) || null;
    return layer?.fill?.enabled ? layer : null;
}

function updateSelectedImageEditorFillLayer(patch) {
    const layer = getSelectedImageEditorFillLayer();
    if (!layer || layer.locked) return;
    Object.assign(layer.fill, patch || {});
    layer.fill = normalizeImageEditorLayerFill(layer.fill);
    syncImageEditorFillLayerInspector();
    renderImageLayerList();
    renderImageEditorLayerList();
    requestImageEditorRender();
}

function getImageEditorFillModeLabel(mode) {
    return ({
        solid: "단색",
        linear: "선형 그라데이션",
        radial: "방사형 그라데이션"
    })[mode] || "단색";
}

function syncImageEditorFillLayerInspector() {
    const layer = getSelectedImageEditorFillLayer();
    if (!dom.fillLayerInspector) return;
    dom.fillLayerInspector.style.display = layer ? "flex" : "none";
    if (!layer) {
        cancelImageEditorFillEyedropper();
        return;
    }
    const fill = layer.fill;
    const gradient = fill.mode !== "solid";
    const linear = fill.mode === "linear";
    document.querySelectorAll("[data-fill-layer-mode]").forEach(button => {
        const active = button.dataset.fillLayerMode === fill.mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
        button.disabled = layer.locked;
    });
    dom.fillLayerColorStartLabel.innerText = gradient ? "시작 색" : "색상";
    dom.fillLayerColorStart.value = fill.color1;
    dom.fillLayerColorEnd.value = fill.color2;
    dom.fillLayerOpacity.value = Math.round(fill.opacity * 100);
    dom.fillLayerOpacityValue.innerText = `${Math.round(fill.opacity * 100)}%`;
    dom.fillLayerAngle.value = Math.round(fill.angle);
    dom.fillLayerAngleValue.innerText = `${Math.round(fill.angle)}°`;
    dom.fillLayerColorEndRow.style.display = gradient ? "grid" : "none";
    dom.fillLayerAngleRow.style.display = linear ? "grid" : "none";
    dom.btnSwapFillLayerColors.style.display = gradient ? "block" : "none";
    [
        dom.fillLayerColorStart, dom.fillLayerColorEnd, dom.fillLayerOpacity,
        dom.fillLayerAngle, dom.btnPickFillColorStart, dom.btnPickFillColorEnd,
        dom.btnSwapFillLayerColors
    ].forEach(control => control.disabled = layer.locked);
    const color1 = editorHexToRgba(fill.color1, fill.opacity);
    const color2 = editorHexToRgba(fill.color2, fill.opacity);
    const fillPreview = fill.mode === "linear"
        ? `linear-gradient(${fill.angle + 90}deg, ${color1}, ${color2})`
        : fill.mode === "radial"
            ? `radial-gradient(circle at center, ${color1}, ${color2})`
            : `linear-gradient(${color1}, ${color1})`;
    dom.fillLayerPreview.style.backgroundImage = [
        fillPreview,
        "linear-gradient(45deg, #202733 25%, transparent 25%)",
        "linear-gradient(-45deg, #202733 25%, transparent 25%)",
        "linear-gradient(45deg, transparent 75%, #202733 75%)",
        "linear-gradient(-45deg, transparent 75%, #202733 75%)"
    ].join(",");
    dom.fillLayerPreview.style.backgroundSize = "auto, 14px 14px, 14px 14px, 14px 14px, 14px 14px";
    dom.fillLayerPreview.style.backgroundPosition = "0 0, 0 0, 0 7px, 7px -7px, -7px 0";
}

function toggleImageEditorFillEyedropper(target) {
    const layer = getSelectedImageEditorFillLayer();
    if (!layer || layer.locked) return;
    if (imageEditorState.fillEyedropperTarget === target &&
        imageEditorState.fillEyedropperLayerId === layer.id) {
        cancelImageEditorFillEyedropper("스포이드가 취소되었습니다.");
        return;
    }
    if (imageEditorState.drawingActive) setImageEditorDrawingActive(false);
    imageEditorState.fillEyedropperTarget = target;
    imageEditorState.fillEyedropperLayerId = layer.id;
    dom.imageEditorCanvas.classList.add("fill-eyedropper-active");
    dom.btnPickFillColorStart.classList.toggle("active", target === "start");
    dom.btnPickFillColorEnd.classList.toggle("active", target === "end");
    dom.fillLayerEyedropperStatus.innerText = target === "end"
        ? "캔버스에서 그라데이션의 끝 색을 클릭하세요. Esc로 취소할 수 있습니다."
        : "캔버스에서 색을 클릭하세요. Esc로 취소할 수 있습니다.";
}

function cancelImageEditorFillEyedropper(message) {
    imageEditorState.fillEyedropperTarget = null;
    imageEditorState.fillEyedropperLayerId = null;
    dom.imageEditorCanvas?.classList.remove("fill-eyedropper-active");
    dom.btnPickFillColorStart?.classList.remove("active");
    dom.btnPickFillColorEnd?.classList.remove("active");
    if (message && dom.fillLayerEyedropperStatus) {
        dom.fillLayerEyedropperStatus.innerText = message;
    }
}

function sampleImageEditorFillColor(event) {
    const target = imageEditorState.fillEyedropperTarget;
    const layer = getSelectedImageEditorFillLayer();
    if (!target || !layer || layer.id !== imageEditorState.fillEyedropperLayerId) {
        cancelImageEditorFillEyedropper();
        return false;
    }
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = dom.imageEditorCanvas.width;
    sampleCanvas.height = dom.imageEditorCanvas.height;
    const wasEnabled = layer.fill.enabled;
    layer.fill.enabled = false;
    try {
        renderImageEditorCanvas(
            sampleCanvas,
            imageEditorState.sourceImage,
            imageEditorState.config,
            imageEditorState.bypass,
            imageEditorState.previewScale,
            false
        );
        if (imageEditorState.drawingHasContent && !imageEditorState.bypass) {
            sampleCanvas.getContext("2d").drawImage(
                dom.imageEditorDrawingCanvas,
                0,
                0,
                sampleCanvas.width,
                sampleCanvas.height
            );
        }
    } finally {
        layer.fill.enabled = wasEnabled;
    }
    const rect = dom.imageEditorCanvas.getBoundingClientRect();
    const x = editorClamp(
        Math.floor((event.clientX - rect.left) * sampleCanvas.width / Math.max(1, rect.width)),
        0,
        sampleCanvas.width - 1
    );
    const y = editorClamp(
        Math.floor((event.clientY - rect.top) * sampleCanvas.height / Math.max(1, rect.height)),
        0,
        sampleCanvas.height - 1
    );
    const pixel = sampleCanvas.getContext("2d", { willReadFrequently: true })
        .getImageData(x, y, 1, 1).data;
    const color = `#${[pixel[0], pixel[1], pixel[2]]
        .map(value => value.toString(16).padStart(2, "0"))
        .join("")}`;
    if (target === "end") layer.fill.color2 = color;
    else layer.fill.color1 = color;
    cancelImageEditorFillEyedropper(
        pixel[3] === 0
            ? `투명 영역에서 ${color}을(를) 추출했습니다.`
            : `${color} 색상을 추출했습니다.`
    );
    syncImageEditorFillLayerInspector();
    renderImageLayerList();
    renderImageEditorLayerList();
    requestImageEditorRender();
    return true;
}

function addTextToSelectedImageEditorLayer() {
    if (!imageEditorState.config) return;
    if (!imageEditorState.selectedEmptyLayerId) addEmptyImageEditorLayer();
    addImageEditorTextLayer(imageEditorState.selectedEmptyLayerId);
}

async function addImageEditorImageLayer(file) {
    if (!imageEditorState.config || !imageEditorState.sourceImage) return;
    const src = await readImageEditorFile(file);
    const image = await loadUpscaleImage(src);
    const maxWidth = imageEditorState.sourceImage.naturalWidth * .55;
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const targetEmptyId = imageEditorState.selectedEmptyLayerId;
    const layer = normalizeImageLayer({
        id: targetEmptyId || createImageEditorLayerId("image"),
        name: file.name || `Image ${imageEditorState.config.imageLayers.length + 1}`,
        src,
        width,
        height,
        x: Math.round((imageEditorState.sourceImage.naturalWidth - width) / 2),
        y: Math.round((imageEditorState.sourceImage.naturalHeight - height) / 2)
    });
    if (targetEmptyId) {
        imageEditorState.config.emptyLayers = imageEditorState.config.emptyLayers.filter(
            item => item.id !== targetEmptyId
        );
        const orderEntry = imageEditorState.config.layerOrder.find(
            entry => entry.id === targetEmptyId
        );
        if (orderEntry) orderEntry.type = "image";
    } else {
        imageEditorState.config.layerOrder.push({ id: layer.id, type: "image" });
    }
    imageEditorState.imageLayerCache.set(layer.id, image);
    imageEditorState.config.imageLayers.push(layer);
    selectImageEditorStackLayer(layer.id, "image");
    renderImageLayerList();
    syncImageLayerInspector();
    requestImageEditorRender();
}

async function addImageEditorLayerFromSource(src, name, options = {}) {
    if (!imageEditorState.config || !imageEditorState.sourceImage || !src) return null;
    const image = await loadUpscaleImage(src);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const maxWidth = imageEditorState.sourceImage.naturalWidth * .72;
    const scale = options.fullSize ? 1 : Math.min(1, maxWidth / naturalWidth);
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const targetEmptyId = options.targetEmptyId || null;
    const layer = normalizeImageLayer({
        id: targetEmptyId || createImageEditorLayerId("image"),
        name: name || `Image ${imageEditorState.config.imageLayers.length + 1}`,
        src,
        width,
        height,
        x: options.fullSize ? 0 : Math.round((imageEditorState.sourceImage.naturalWidth - width) / 2),
        y: options.fullSize ? 0 : Math.round((imageEditorState.sourceImage.naturalHeight - height) / 2)
    });
    imageEditorState.config.imageLayers.push(layer);
    if (targetEmptyId) {
        imageEditorState.config.emptyLayers = imageEditorState.config.emptyLayers.filter(
            item => item.id !== targetEmptyId
        );
        const orderEntry = imageEditorState.config.layerOrder.find(entry => entry.id === targetEmptyId);
        if (orderEntry) orderEntry.type = "image";
        else imageEditorState.config.layerOrder.push({ id: layer.id, type: "image" });
    } else {
        imageEditorState.config.layerOrder.push({ id: layer.id, type: "image" });
    }
    imageEditorState.imageLayerCache.set(layer.id, image);
    selectImageEditorStackLayer(layer.id, "image");
    renderImageLayerList();
    renderImageEditorLayerList();
    syncImageLayerInspector();
    requestImageEditorRender();
    return layer;
}

function openImageEditorFmaPicker() {
    if (!imageEditorState.config || !dom.imageEditorFmaPicker) return;
    if (!images.length) {
        alert("FMA 갤러리에 이미지가 없습니다.");
        return;
    }
    imageEditorState.fmaPickerSelectedIndex = -1;
    renderImageEditorFmaPicker();
    dom.imageEditorFmaPicker.style.display = "flex";
}

function closeImageEditorFmaPicker() {
    if (!dom.imageEditorFmaPicker) return;
    dom.imageEditorFmaPicker.style.display = "none";
    imageEditorState.fmaPickerSelectedIndex = -1;
}

function getImageEditorFmaPickerOrder() {
    const validOrder = Array.isArray(sortedImageOrder) &&
        sortedImageOrder.length === images.length &&
        new Set(sortedImageOrder).size === images.length;
    return validOrder ? [...sortedImageOrder] : images.map((_, index) => index);
}

function renderImageEditorFmaPicker() {
    dom.imageEditorFmaPickerGrid.innerHTML = "";
    getImageEditorFmaPickerOrder().forEach(index => {
        const item = images[index];
        if (!item) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "editor-fma-picker-item";
        button.classList.toggle("active", index === imageEditorState.fmaPickerSelectedIndex);
        button.title = item.path || `FMA 이미지 ${index + 1}`;
        const image = document.createElement("img");
        image.src = item.thumbnailSrc || item.src;
        image.alt = item.path || `FMA 이미지 ${index + 1}`;
        const label = document.createElement("span");
        label.innerText = item.path || `이미지 ${index + 1}`;
        button.append(image, label);
        button.onclick = () => {
            imageEditorState.fmaPickerSelectedIndex = index;
            renderImageEditorFmaPicker();
        };
        button.ondblclick = () => {
            imageEditorState.fmaPickerSelectedIndex = index;
            applySelectedFmaImageToEditorLayer();
        };
        dom.imageEditorFmaPickerGrid.appendChild(button);
    });
    const selected = imageEditorState.fmaPickerSelectedIndex;
    dom.btnApplyImageEditorFmaPicker.disabled = selected < 0 || !images[selected];
    dom.imageEditorFmaPickerStatus.innerText = selected >= 0 && images[selected]
        ? `${images[selected].path || `이미지 ${selected + 1}`} 선택됨`
        : `${images.length}개 이미지 · 하나를 선택하세요.`;
}

async function applySelectedFmaImageToEditorLayer() {
    const index = imageEditorState.fmaPickerSelectedIndex;
    if (index < 0 || !images[index] || !imageEditorState.config) return;
    dom.btnApplyImageEditorFmaPicker.disabled = true;
    dom.imageEditorFmaPickerStatus.innerText = "FMA 원본 이미지를 불러오는 중입니다…";
    try {
        if (typeof ensureImageOriginalLoaded === "function") {
            await ensureImageOriginalLoaded(index);
        }
        const item = images[index];
        if (!item?.src) throw new Error("선택한 이미지 원본을 읽을 수 없습니다.");
        await addImageEditorLayerFromSource(
            item.src,
            item.path || `FMA 이미지 ${index + 1}`,
            { targetEmptyId: imageEditorState.selectedEmptyLayerId || null }
        );
        closeImageEditorFmaPicker();
    } catch (error) {
        console.error("FMA image layer import failed:", error);
        dom.imageEditorFmaPickerStatus.innerText = "이미지를 레이어로 넣지 못했습니다.";
        dom.btnApplyImageEditorFmaPicker.disabled = false;
        alert("FMA 이미지를 레이어로 넣지 못했습니다: " + error.message);
    }
}

async function duplicateImageEditorBaseLayer() {
    if (!imageEditorState.sourceSrc || imageEditorState.processing) return;
    await addImageEditorLayerFromSource(imageEditorState.sourceSrc, "베이스 이미지 Copy", { fullSize: true });
}

async function duplicateImageEditorBaseSegmentation(kind) {
    if (!imageEditorState.sourceSrc || imageEditorState.processing) return;
    imageEditorState.processing = true;
    [dom.btnDuplicateBaseAlpha, dom.btnDuplicateBaseMask].forEach(button => button.disabled = true);
    try {
        showLoading(kind === "mask" ? "베이스 이미지의 마스크를 만드는 중입니다..." : "베이스 이미지의 알파 레이어를 만드는 중입니다...");
        updateLoading(5);
        const transparentSrc = await runWebGlBackgroundRemoval(
            imageEditorState.sourceSrc, null, 8, 88
        );
        const outputSrc = kind === "mask"
            ? await createImageEditorMaskFromAlpha(transparentSrc)
            : transparentSrc;
        updateLoading(96);
        await addImageEditorLayerFromSource(
            outputSrc,
            kind === "mask" ? "베이스 전경 마스크" : "베이스 알파 레이어",
            { fullSize: true }
        );
        updateLoading(100);
    } catch (error) {
        console.error("Base segmentation duplication failed:", error);
        alert("알파·마스크 레이어를 복제하지 못했습니다: " + error.message);
    } finally {
        hideLoading();
        imageEditorState.processing = false;
        [dom.btnDuplicateBaseAlpha, dom.btnDuplicateBaseMask].forEach(button => button.disabled = false);
    }
}

async function duplicateSelectedImageLayerSegmentation(kind) {
    const sourceLayer = getSelectedImageLayer();
    if (!sourceLayer || sourceLayer.locked || imageEditorState.processing) return;
    imageEditorState.processing = true;
    [dom.btnDuplicateImageAlpha, dom.btnDuplicateImageMask].forEach(button => button.disabled = true);
    try {
        showLoading(kind === "mask"
            ? "선택 레이어의 마스크를 복제하는 중입니다..."
            : "선택 레이어의 알파를 복제하는 중입니다...");
        updateLoading(5);
        const transparentSrc = await runWebGlBackgroundRemoval(sourceLayer.src, null, 8, 88);
        const outputSrc = kind === "mask"
            ? await createImageEditorMaskFromAlpha(transparentSrc)
            : transparentSrc;
        const newLayer = await addImageEditorLayerFromSource(
            outputSrc,
            `${sourceLayer.name} · ${kind === "mask" ? "Mask" : "Alpha"}`
        );
        if (newLayer) {
            newLayer.x = sourceLayer.x;
            newLayer.y = sourceLayer.y;
            newLayer.width = sourceLayer.width;
            newLayer.height = sourceLayer.height;
            newLayer.rotation = sourceLayer.rotation;
            requestImageEditorRender();
        }
        updateLoading(100);
    } catch (error) {
        console.error("Selected layer segmentation duplication failed:", error);
        alert("선택 레이어의 알파·마스크를 복제하지 못했습니다: " + error.message);
    } finally {
        hideLoading();
        imageEditorState.processing = false;
        syncImageLayerInspector();
    }
}

async function createImageEditorMaskFromAlpha(src) {
    const image = await loadUpscaleImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        pixels[index] = alpha;
        pixels[index + 1] = alpha;
        pixels[index + 2] = alpha;
        pixels[index + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
}

function readImageEditorFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("이미지 파일을 읽지 못했습니다."));
        reader.readAsDataURL(file);
    });
}

async function preloadImageEditorLayers(layers) {
    imageEditorState.imageLayerCache.clear();
    await Promise.all((layers || []).map(async layer => {
        if (!layer.src) return;
        try {
            imageEditorState.imageLayerCache.set(layer.id, await loadUpscaleImage(layer.src));
        } catch (error) {
            console.warn("Image layer preload failed:", layer.name, error);
        }
    }));
}

async function replaceImageEditorLayerSource(layer, resultSrc, suffix) {
    if (!layer || !resultSrc || !imageEditorState.config) {
        throw new Error("이미지 편집 세션 또는 대상 레이어를 찾을 수 없습니다.");
    }
    const image = await loadUpscaleImage(resultSrc);
    const centerX = layer.x + layer.width / 2;
    const centerY = layer.y + layer.height / 2;
    const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
    if (aspect >= 1) {
        layer.height = Math.max(1, layer.width / aspect);
    } else {
        layer.width = Math.max(1, layer.height * aspect);
    }
    layer.x = centerX - layer.width / 2;
    layer.y = centerY - layer.height / 2;
    layer.src = resultSrc;
    if (suffix && !layer.name.endsWith(suffix)) layer.name += suffix;
    imageEditorState.imageLayerCache.set(layer.id, image);
    syncImageLayerInspector();
    renderImageLayerList();
    renderImageEditorLayerList();
    requestImageEditorRender();
}

function cropSelectedImageEditorLayer() {
    const layer = getSelectedImageLayer();
    if (!layer || layer.locked) return;
    if (typeof openCropEditorForLayer !== "function") {
        alert("Crop 편집기를 불러오지 못했습니다.");
        return;
    }
    const layerId = layer.id;
    openCropEditorForLayer(layer.src, async resultSrc => {
        const targetLayer = imageEditorState.config?.imageLayers.find(item => item.id === layerId);
        if (!targetLayer) throw new Error("Crop을 적용할 이미지 레이어가 없습니다.");
        await replaceImageEditorLayerSource(targetLayer, resultSrc, " · Crop");
        dom.imageEditorModal.style.display = "flex";
    });
}

function removeBackgroundFromSelectedImageEditorLayer() {
    const layer = getSelectedImageLayer();
    if (!layer || layer.locked || imageEditorState.processing) return;
    if (typeof openBackgroundRemoveEditorForExternal !== "function") {
        alert("배경 제거 설정 창을 불러오지 못했습니다.");
        return;
    }
    const layerId = layer.id;
    openBackgroundRemoveEditorForExternal(layer.src, async resultSrc => {
        const target = imageEditorState.config?.imageLayers.find(item => item.id === layerId);
        if (!target) throw new Error("배경 제거 결과를 적용할 레이어가 없습니다.");
        await replaceImageEditorLayerSource(target, resultSrc, " · BG Removed");
        dom.imageEditorModal.style.display = "flex";
    }, {
        className: "editor-child-workspace",
        applyLabel: "이미지 편집으로 보내기"
    });
}

function drawImageEditorImageLayers(canvas, layers, scale, showSelection) {
    const context = canvas.getContext("2d");
    (layers || []).forEach(layer => {
        if (!layer.visible) return;
        const image = imageEditorState.imageLayerCache.get(layer.id);
        if (!image) return;
        const x = layer.x * scale;
        const y = layer.y * scale;
        const width = layer.width * scale;
        const height = layer.height * scale;
        const layerCanvas = document.createElement("canvas");
        layerCanvas.width = Math.max(1, image.naturalWidth || image.width);
        layerCanvas.height = Math.max(1, image.naturalHeight || image.height);
        const layerContext = layerCanvas.getContext("2d", { willReadFrequently: true });
        layerContext.imageSmoothingEnabled = true;
        layerContext.imageSmoothingQuality = "high";
        layerContext.drawImage(image, 0, 0, layerCanvas.width, layerCanvas.height);
        applyImageEditorAdjustments(layerCanvas, layer.adjustments || createDefaultImageEditorConfig().adjustments);
        applyImageEditorAtmosphere(layerCanvas, layer.effects || createDefaultImageEditorConfig().effects);
        context.save();
        context.globalAlpha = layer.opacity;
        context.translate(x + width / 2, y + height / 2);
        context.rotate(layer.rotation * Math.PI / 180);
        context.drawImage(layerCanvas, -width / 2, -height / 2, width, height);
        context.restore();
        const bounds = createTextTransformBounds(
            layer.x + layer.width / 2,
            layer.y + layer.height / 2,
            layer.width,
            layer.height,
            1,
            1,
            layer.rotation
        );
        imageEditorState.imageBounds.set(layer.id, bounds);
        if (showSelection && layer.id === imageEditorState.selectedImageLayerId) {
            if (layer.locked) drawImageLayerSelection(context, bounds, scale);
            else drawTextTransformSelection(context, bounds, scale);
        }
    });
}

function drawImageLayerSelection(context, bounds, scale) {
    const points = bounds.corners.map(point => ({ x: point.x * scale, y: point.y * scale }));
    context.save();
    context.globalAlpha = 1;
    context.strokeStyle = "#71f7d0";
    context.fillStyle = "#101722";
    context.lineWidth = 2;
    context.setLineDash([7, 5]);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.closePath();
    context.stroke();
    context.setLineDash([]);
    points.forEach(point => {
        context.beginPath();
        context.arc(point.x, point.y, 5, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    });
    context.restore();
}

function renderImageLayerList() {
    if (!imageEditorState.config) return;
    dom.imageLayerList.innerHTML = "";
    [...imageEditorState.config.layerOrder].reverse().forEach(entry => {
        const layer = getImageEditorStackLayer(entry);
        if (!layer) return;
        const item = document.createElement("div");
        item.tabIndex = 0;
        item.className = `editor-layer-item ${entry.type}-layer-item`;
        item.classList.toggle("active", layer.id === getSelectedImageEditorStackLayerId());
        const visibility = document.createElement("input");
        visibility.type = "checkbox";
        visibility.checked = layer.visible;
        visibility.className = "layer-visible-check";
        visibility.title = layer.visible ? "레이어 숨기기" : "레이어 보이기";
        visibility.onclick = event => event.stopPropagation();
        visibility.onchange = event => {
            event.stopPropagation();
            layer.visible = visibility.checked;
            renderImageLayerList();
            renderImageEditorLayerList();
            requestImageEditorRender();
        };
        const details = document.createElement("div");
        const title = document.createElement("b");
        title.innerText = layer.name;
        const preview = document.createElement("small");
        preview.innerText = entry.type === "image"
            ? `${Math.round(layer.width)} × ${Math.round(layer.height)} · Alpha ${Math.round(layer.opacity * 100)}%`
            : entry.type === "text"
                ? (layer.text.replace(/\s+/g, " ").slice(0, 28) || "빈 텍스트")
                : entry.type === "shape"
                    ? `${getEditorShapeLabel(layer.shape)} · ${Math.round(layer.width)} × ${Math.round(layer.height)}`
                    : layer.fill?.enabled
                        ? `${getImageEditorFillModeLabel(layer.fill.mode)} · Alpha ${Math.round(layer.fill.opacity * 100)}%`
                        : "이미지·텍스트·색상을 넣으세요";
        details.append(title, preview);
        const type = document.createElement("em");
        type.innerText = entry.type === "image" ? "IMG" :
            entry.type === "text" ? "T" : entry.type === "shape" ? "◆" :
                layer.fill?.enabled ? "COL" : "＋";
        if (layer.fill?.enabled) type.style.color = layer.fill.color1;
        const lock = document.createElement("span");
        lock.className = `layer-lock-toggle${layer.locked ? " locked" : ""}`;
        lock.innerText = layer.locked ? "🔒" : "🔓";
        lock.title = layer.locked ? "레이어 잠금 해제" : "레이어 잠금";
        lock.onclick = event => {
            event.stopPropagation();
            layer.locked = !layer.locked;
            renderImageLayerList();
            renderImageEditorLayerList();
            syncImageLayerInspector();
            syncTextLayerInspector();
            syncShapeLayerInspector();
            requestImageEditorRender();
        };
        item.append(visibility, details, type, lock);
        item.onclick = () => {
            selectImageEditorStackLayer(layer.id, entry.type);
            renderImageLayerList();
            renderImageEditorLayerList();
            syncImageLayerInspector();
            syncTextLayerInspector();
            syncShapeLayerInspector();
            requestImageEditorRender();
        };
        item.onkeydown = event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                item.click();
            }
        };
        dom.imageLayerList.appendChild(item);
    });
    dom.imageLayerList.appendChild(createImageEditorBaseLayerListItem());
    syncImageLayerInspector();
    syncShapeLayerInspector();
    syncImageEditorBaseLayerControls();
}

function createImageEditorBaseLayerListItem() {
    const base = imageEditorState.config?.baseLayer || {
        visible: true,
        opacity: 1,
        locked: true
    };
    const item = document.createElement("div");
    item.className = "editor-layer-item base-layer";
    item.classList.toggle("active", imageEditorState.selectedBaseLayer);
    item.tabIndex = 0;
    const visibility = document.createElement("input");
    visibility.type = "checkbox";
    visibility.checked = base.visible;
    visibility.className = "layer-visible-check";
    visibility.title = base.visible ? "베이스 이미지 숨기기" : "베이스 이미지 보이기";
    visibility.onchange = () => {
        base.visible = visibility.checked;
        syncImageEditorBaseLayerControls();
        renderImageLayerList();
        renderImageEditorLayerList();
        requestImageEditorRender();
    };
    const details = document.createElement("div");
    details.innerHTML =
        `<b>Image</b><small>보정 · 필터 베이스 · Alpha ${Math.round(base.opacity * 100)}%</small>`;
    const type = document.createElement("em");
    type.innerText = "BASE";
    const lock = document.createElement("span");
    lock.className = `layer-lock-toggle${base.locked ? " locked" : ""}`;
    lock.innerText = base.locked ? "🔒" : "🔓";
    lock.title = base.locked ? "베이스 이동 잠금 해제" : "베이스 이동 잠금";
    lock.onclick = event => {
        event.stopPropagation();
        base.locked = !base.locked;
        renderImageLayerList();
        renderImageEditorLayerList();
        requestImageEditorRender();
    };
    item.append(visibility, details, type, lock);
    item.onclick = event => {
        if (event.target === visibility) return;
        selectImageEditorBaseForAdjustments();
        syncImageEditorBaseLayerControls();
        requestImageEditorRender();
    };
    item.onkeydown = event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            item.click();
        }
    };
    return item;
}

function getImageEditorStackLayer(entry) {
    if (!entry || !imageEditorState.config) return null;
    if (entry.type === "image") {
        return imageEditorState.config.imageLayers.find(layer => layer.id === entry.id) || null;
    }
    if (entry.type === "text") {
        return imageEditorState.config.textLayers.find(layer => layer.id === entry.id) || null;
    }
    if (entry.type === "shape") {
        return imageEditorState.config.shapeLayers.find(layer => layer.id === entry.id) || null;
    }
    return imageEditorState.config.emptyLayers.find(layer => layer.id === entry.id) || null;
}

function getSelectedImageEditorStackLayerId() {
    return imageEditorState.selectedImageLayerId ||
        imageEditorState.selectedLayerId ||
        imageEditorState.selectedShapeLayerId ||
        imageEditorState.selectedEmptyLayerId ||
        (imageEditorState.selectedBaseLayer ? "__base__" : null) ||
        null;
}

function selectImageEditorStackLayer(id, type) {
    if (imageEditorState.fillEyedropperTarget &&
        (type !== "empty" || id !== imageEditorState.fillEyedropperLayerId)) {
        cancelImageEditorFillEyedropper("스포이드가 취소되었습니다.");
    }
    imageEditorState.selectedImageLayerId = type === "image" ? id : null;
    imageEditorState.selectedLayerId = type === "text" ? id : null;
    imageEditorState.selectedShapeLayerId = type === "shape" ? id : null;
    imageEditorState.selectedEmptyLayerId = type === "empty" ? id : null;
    imageEditorState.selectedBaseLayer = type === "base";
    if (imageEditorState.config) syncImageAdjustmentControls();
}

function getImageEditorAdjustmentTarget() {
    if (!imageEditorState.config) return null;
    if (imageEditorState.selectedImageLayerId) return getSelectedImageLayer();
    if (imageEditorState.selectedBaseLayer) return imageEditorState.config;
    return null;
}

function clearImageEditorLayerSelection() {
    selectImageEditorStackLayer(null, "none");
    renderImageLayerList();
    renderImageEditorLayerList();
    syncImageLayerInspector();
    syncTextLayerInspector();
    syncShapeLayerInspector();
    requestImageEditorRender();
}

function getSelectedShapeLayer() {
    return imageEditorState.config?.shapeLayers.find(
        layer => layer.id === imageEditorState.selectedShapeLayerId
    ) || null;
}

function getEditorShapeLabel(type) {
    return ({
        rectangle: "사각형",
        roundedRectangle: "둥근 사각형",
        ellipse: "원·타원",
        triangle: "삼각형",
        semicircle: "반원",
        diamond: "마름모",
        band: "띠",
        arrow: "화살표"
    })[type] || "도형";
}

function addImageEditorShapeLayer(type) {
    if (!imageEditorState.config || !imageEditorState.sourceImage) return;
    const width = Math.max(80, imageEditorState.sourceImage.naturalWidth * .32);
    const height = type === "band"
        ? Math.max(24, width * .18)
        : Math.max(80, width * .62);
    const shape = normalizeShapeLayer({
        id: createImageEditorLayerId("shape"),
        name: getEditorShapeLabel(type),
        shape: type,
        width,
        height,
        x: (imageEditorState.sourceImage.naturalWidth - width) / 2,
        y: (imageEditorState.sourceImage.naturalHeight - height) / 2
    });
    imageEditorState.config.shapeLayers.push(shape);
    imageEditorState.config.layerOrder.push({ id: shape.id, type: "shape" });
    selectImageEditorStackLayer(shape.id, "shape");
    renderImageLayerList();
    renderImageEditorLayerList();
    syncShapeLayerInspector();
    requestImageEditorRender();
}

function syncShapeLayerInspector() {
    const shape = getSelectedShapeLayer();
    dom.shapeLayerInspector.style.display = shape ? "block" : "none";
    const background = imageEditorState.config?.canvasBackground;
    if (background) {
        dom.editorCanvasBackgroundEnabled.checked = background.enabled;
        dom.editorCanvasBackgroundColor.value = background.color;
        dom.editorCanvasBackgroundOpacity.value = Math.round(background.opacity * 100);
        dom.editorCanvasBackgroundOpacityValue.innerText =
            `${Math.round(background.opacity * 100)}%`;
    }
    if (!shape) return;
    const values = [
        [dom.editorShapeType, shape.shape],
        [dom.editorShapeOpacity, Math.round(shape.opacity * 100)],
        [dom.editorShapeFillColor, shape.fillColor],
        [dom.editorShapeFillOpacity, Math.round(shape.fillOpacity * 100)],
        [dom.editorShapeStrokeColor, shape.strokeColor],
        [dom.editorShapeStrokeWidth, shape.strokeWidth],
        [dom.editorShapeX, Math.round(shape.x)],
        [dom.editorShapeY, Math.round(shape.y)],
        [dom.editorShapeWidth, Math.round(shape.width)],
        [dom.editorShapeHeight, Math.round(shape.height)],
        [dom.editorShapeRotation, Math.round(shape.rotation)]
    ];
    values.forEach(([input, value]) => {
        input.value = value;
        input.disabled = shape.locked;
    });
}

function moveSelectedImageEditorStackLayer(direction) {
    const layers = imageEditorState.config?.layerOrder;
    const selectedId = getSelectedImageEditorStackLayerId();
    if (!layers || !selectedId) return;
    const selectedEntry = layers.find(entry => entry.id === selectedId);
    if (getImageEditorStackLayer(selectedEntry)?.locked) return;
    const index = layers.findIndex(entry => entry.id === selectedId);
    const next = editorClamp(index + direction, 0, layers.length - 1);
    if (index < 0 || index === next) return;
    [layers[index], layers[next]] = [layers[next], layers[index]];
    renderImageLayerList();
    renderImageEditorLayerList();
    requestImageEditorRender();
}

function getSelectedImageLayer() {
    return imageEditorState.config?.imageLayers.find(
        layer => layer.id === imageEditorState.selectedImageLayerId
    ) || null;
}

function syncImageLayerInspector() {
    const layer = getSelectedImageLayer();
    const fillLayer = getSelectedImageEditorFillLayer();
    const selectedId = getSelectedImageEditorStackLayerId();
    dom.imageLayerInspector.style.display = layer ? "flex" : "none";
    dom.imageLayerEmpty.style.display = layer || fillLayer ? "none" : "block";
    syncImageEditorFillLayerInspector();
    if (!layer && !fillLayer) {
        dom.imageLayerEmpty.innerText = imageEditorState.selectedLayerId
            ? "선택한 텍스트는 Text 탭에서 편집할 수 있습니다."
            : imageEditorState.selectedShapeLayerId
                ? "선택한 도형은 도형 탭에서 편집할 수 있습니다."
            : imageEditorState.selectedEmptyLayerId
                ? "이 빈 레이어에 이미지·텍스트·색상을 넣으세요."
                : "＋ 레이어를 먼저 만든 뒤 이미지·텍스트·색상을 넣으세요.";
    }
    [dom.btnImageLayerUp, dom.btnImageLayerDown, dom.btnDuplicateImageLayer,
        dom.btnDeleteImageLayer].forEach(button => button.disabled = !selectedId);
    const selectedEntry = imageEditorState.config?.layerOrder.find(
        entry => entry.id === selectedId
    );
    const selectedStackLayer = getImageEditorStackLayer(selectedEntry);
    dom.btnImageLayerUp.disabled = !selectedId || selectedStackLayer?.locked;
    dom.btnImageLayerDown.disabled = !selectedId || selectedStackLayer?.locked;
    dom.btnDeleteImageLayer.disabled = !selectedId || selectedStackLayer?.locked;
    if (!layer) return;
    [
        dom.imageLayerOpacity, dom.imageLayerRotation, dom.imageLayerX,
        dom.imageLayerY, dom.imageLayerWidth, dom.imageLayerHeight,
        dom.btnCropImageLayer, dom.btnBgRemoveImageLayer,
        dom.btnDuplicateImageAlpha, dom.btnDuplicateImageMask
    ].forEach(control => control.disabled = layer.locked);
    dom.imageLayerOpacity.value = Math.round(layer.opacity * 100);
    dom.imageLayerRotation.value = Math.round(layer.rotation);
    dom.imageLayerX.value = Math.round(layer.x);
    dom.imageLayerY.value = Math.round(layer.y);
    dom.imageLayerWidth.value = Math.round(layer.width);
    dom.imageLayerHeight.value = Math.round(layer.height);
    syncImageLayerRangeValues(layer);
}

function duplicateSelectedImageEditorStackLayer() {
    if (imageEditorState.selectedImageLayerId) {
        duplicateSelectedImageLayer();
        return;
    }
    if (imageEditorState.selectedLayerId) {
        duplicateSelectedTextLayer();
        return;
    }
    if (imageEditorState.selectedShapeLayerId) {
        const selected = getSelectedShapeLayer();
        if (!selected) return;
        const clone = normalizeShapeLayer({
            ...selected,
            id: "",
            name: `${selected.name} Copy`,
            x: selected.x + 20,
            y: selected.y + 20
        });
        imageEditorState.config.shapeLayers.push(clone);
        const orderIndex = imageEditorState.config.layerOrder.findIndex(
            entry => entry.id === selected.id
        );
        imageEditorState.config.layerOrder.splice(
            orderIndex + 1, 0, { id: clone.id, type: "shape" }
        );
        selectImageEditorStackLayer(clone.id, "shape");
        renderImageLayerList();
        renderImageEditorLayerList();
        syncShapeLayerInspector();
        requestImageEditorRender();
        return;
    }
    const selected = imageEditorState.config?.emptyLayers.find(
        layer => layer.id === imageEditorState.selectedEmptyLayerId
    );
    if (!selected) return;
    const clone = normalizeEmptyLayer({
        ...JSON.parse(JSON.stringify(selected)),
        id: "",
        name: `${selected.name} Copy`,
        visible: selected.visible
    });
    imageEditorState.config.emptyLayers.push(clone);
    const orderIndex = imageEditorState.config.layerOrder.findIndex(
        entry => entry.id === selected.id
    );
    imageEditorState.config.layerOrder.splice(
        orderIndex + 1,
        0,
        { id: clone.id, type: "empty" }
    );
    selectImageEditorStackLayer(clone.id, "empty");
    renderImageLayerList();
    renderImageEditorLayerList();
}

function deleteSelectedImageEditorStackLayer() {
    const selectedEntry = imageEditorState.config?.layerOrder.find(
        entry => entry.id === getSelectedImageEditorStackLayerId()
    );
    if (getImageEditorStackLayer(selectedEntry)?.locked) return;
    if (imageEditorState.selectedImageLayerId) {
        deleteSelectedImageLayer();
        return;
    }
    if (imageEditorState.selectedLayerId) {
        deleteSelectedTextLayer();
        return;
    }
    if (imageEditorState.selectedShapeLayerId) {
        const selectedId = imageEditorState.selectedShapeLayerId;
        const orderIndex = imageEditorState.config.layerOrder.findIndex(
            entry => entry.id === selectedId
        );
        imageEditorState.config.shapeLayers = imageEditorState.config.shapeLayers.filter(
            layer => layer.id !== selectedId
        );
        imageEditorState.config.layerOrder = imageEditorState.config.layerOrder.filter(
            entry => entry.id !== selectedId
        );
        selectNearestImageEditorStackLayer(orderIndex);
        renderImageLayerList();
        renderImageEditorLayerList();
        syncShapeLayerInspector();
        requestImageEditorRender();
        return;
    }
    const selectedId = imageEditorState.selectedEmptyLayerId;
    if (!selectedId) return;
    const orderIndex = imageEditorState.config.layerOrder.findIndex(
        entry => entry.id === selectedId
    );
    imageEditorState.config.emptyLayers = imageEditorState.config.emptyLayers.filter(
        layer => layer.id !== selectedId
    );
    imageEditorState.config.layerOrder = imageEditorState.config.layerOrder.filter(
        entry => entry.id !== selectedId
    );
    selectNearestImageEditorStackLayer(orderIndex);
    renderImageLayerList();
    renderImageEditorLayerList();
    requestImageEditorRender();
}

function moveSelectedImageLayer(direction) {
    moveSelectedImageEditorStackLayer(direction);
}

function duplicateSelectedImageLayer() {
    const selected = getSelectedImageLayer();
    if (!selected) return;
    const clone = normalizeImageLayer({ ...selected, id: "", name: `${selected.name} Copy` });
    clone.x += 20;
    clone.y += 20;
    imageEditorState.imageLayerCache.set(clone.id, imageEditorState.imageLayerCache.get(selected.id));
    const index = imageEditorState.config.imageLayers.indexOf(selected);
    imageEditorState.config.imageLayers.splice(index + 1, 0, clone);
    const orderIndex = imageEditorState.config.layerOrder.findIndex(
        entry => entry.id === selected.id
    );
    imageEditorState.config.layerOrder.splice(
        orderIndex + 1,
        0,
        { id: clone.id, type: "image" }
    );
    selectImageEditorStackLayer(clone.id, "image");
    renderImageLayerList();
    renderImageEditorLayerList();
    requestImageEditorRender();
}

function deleteSelectedImageLayer() {
    const selected = getSelectedImageLayer();
    if (!selected) return;
    const layers = imageEditorState.config.imageLayers;
    const index = layers.indexOf(selected);
    const orderIndex = imageEditorState.config.layerOrder.findIndex(
        entry => entry.id === selected.id
    );
    layers.splice(index, 1);
    imageEditorState.config.layerOrder = imageEditorState.config.layerOrder.filter(
        entry => entry.id !== selected.id
    );
    imageEditorState.imageLayerCache.delete(selected.id);
    selectNearestImageEditorStackLayer(orderIndex);
    renderImageLayerList();
    renderImageEditorLayerList();
    requestImageEditorRender();
}

function selectNearestImageEditorStackLayer(previousIndex) {
    const order = imageEditorState.config?.layerOrder || [];
    const entry = order[Math.min(Math.max(0, previousIndex), Math.max(0, order.length - 1))] || null;
    selectImageEditorStackLayer(entry?.id || "__base__", entry?.type || "base");
}

function initImageEditorQuickTextControls() {
    const change = (sizeDelta, rotationDelta) => {
        const layer = getSelectedTextLayer();
        if (!layer || layer.locked) return;
        if (sizeDelta) layer.fontSize = editorClamp(layer.fontSize + sizeDelta, 8, 500);
        if (rotationDelta) layer.rotation = normalizeEditorRotation(layer.rotation + rotationDelta);
        syncTextLayerInspector();
        requestImageEditorRender();
    };
    dom.btnQuickTextSmaller.onclick = () => change(-4, 0);
    dom.btnQuickTextLarger.onclick = () => change(4, 0);
    dom.btnQuickTextRotateLeft.onclick = () => change(0, -5);
    dom.btnQuickTextRotateRight.onclick = () => change(0, 5);
}

function initMovableImageEditorQuickControls() {
    const panel = dom.imageEditorTextQuickControls;
    if (!panel || !dom.imageEditorStage) return;
    const handle = panel.querySelector(".quick-controls-drag-handle");
    if (!handle) return;

    handle.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        const stageRect = dom.imageEditorStage.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        panel.style.left = `${panelRect.left - stageRect.left}px`;
        panel.style.top = `${panelRect.top - stageRect.top}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        panel.style.transform = "none";
        imageEditorState.quickControlsDragging = true;
        imageEditorState.quickControlsDragStart = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            left: panelRect.left - stageRect.left,
            top: panelRect.top - stageRect.top
        };
        panel.classList.add("dragging");
        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    });

    handle.addEventListener("pointermove", event => {
        if (!imageEditorState.quickControlsDragging ||
            !imageEditorState.quickControlsDragStart) return;
        const start = imageEditorState.quickControlsDragStart;
        positionImageEditorQuickControls(
            start.left + event.clientX - start.pointerX,
            start.top + event.clientY - start.pointerY
        );
        event.preventDefault();
    });

    const finishDrag = event => {
        if (!imageEditorState.quickControlsDragging) return;
        imageEditorState.quickControlsDragging = false;
        imageEditorState.quickControlsDragStart = null;
        panel.classList.remove("dragging");
        try {
            handle.releasePointerCapture?.(event.pointerId);
        } catch (error) {}
        saveImageEditorQuickControlsPosition();
    };
    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);
    handle.addEventListener("dblclick", event => {
        resetImageEditorQuickControlsPosition();
        event.preventDefault();
        event.stopPropagation();
    });
}

function positionImageEditorQuickControls(left, top) {
    const panel = dom.imageEditorTextQuickControls;
    const stage = dom.imageEditorStage;
    if (!panel || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    const maxLeft = Math.max(0, stageRect.width - panel.offsetWidth);
    const maxTop = Math.max(0, stageRect.height - panel.offsetHeight);
    panel.style.left = `${editorClamp(Number(left) || 0, 0, maxLeft)}px`;
    panel.style.top = `${editorClamp(Number(top) || 0, 0, maxTop)}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";
}

function saveImageEditorQuickControlsPosition() {
    const panel = dom.imageEditorTextQuickControls;
    if (!panel || panel.style.transform !== "none") return;
    try {
        localStorage.setItem(
            IMAGE_EDITOR_QUICK_CONTROLS_POSITION_STORAGE,
            JSON.stringify({
                left: parseFloat(panel.style.left) || 0,
                top: parseFloat(panel.style.top) || 0
            })
        );
    } catch (error) {
        console.warn("Quick text control position could not be saved:", error);
    }
}

function restoreImageEditorQuickControlsPosition() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(IMAGE_EDITOR_QUICK_CONTROLS_POSITION_STORAGE) || "null"
        );
        if (saved && Number.isFinite(Number(saved.left)) && Number.isFinite(Number(saved.top))) {
            positionImageEditorQuickControls(Number(saved.left), Number(saved.top));
        }
    } catch (error) {
        resetImageEditorQuickControlsPosition(false);
    }
}

function resetImageEditorQuickControlsPosition(clearSaved = true) {
    const panel = dom.imageEditorTextQuickControls;
    if (!panel) return;
    panel.style.left = "auto";
    panel.style.top = "auto";
    panel.style.right = "18px";
    panel.style.bottom = "18px";
    panel.style.transform = "none";
    if (clearSaved) {
        try {
            localStorage.removeItem(IMAGE_EDITOR_QUICK_CONTROLS_POSITION_STORAGE);
        } catch (error) {}
    }
}

function initImageEditorPanelResizers() {
    const workspace = document.querySelector(".image-editor-workspace");
    const left = document.getElementById("imageEditorLeftResizer");
    const right = document.getElementById("imageEditorRightResizer");
    if (!workspace || !left || !right) return;
    try {
        const sizes = JSON.parse(localStorage.getItem("fma_image_editor_panel_sizes") || "null");
        if (sizes?.left) workspace.style.setProperty("--editor-left-width", `${sizes.left}px`);
        if (sizes?.right) workspace.style.setProperty("--editor-right-width", `${sizes.right}px`);
    } catch (error) {}
    const bind = (handle, side) => {
        handle.addEventListener("pointerdown", event => {
            if (event.button !== 0) return;
            handle.classList.add("dragging");
            handle.setPointerCapture?.(event.pointerId);
            const move = moveEvent => {
                const rect = workspace.getBoundingClientRect();
                const maximum = Math.max(240, rect.width * .42);
                const width = side === "left"
                    ? moveEvent.clientX - rect.left
                    : rect.right - moveEvent.clientX;
                workspace.style.setProperty(
                    side === "left" ? "--editor-left-width" : "--editor-right-width",
                    `${Math.round(editorClamp(width, 220, maximum))}px`
                );
                sizeImageEditorCanvas();
            };
            const finish = finishEvent => {
                handle.classList.remove("dragging");
                handle.releasePointerCapture?.(finishEvent.pointerId);
                handle.removeEventListener("pointermove", move);
                handle.removeEventListener("pointerup", finish);
                handle.removeEventListener("pointercancel", finish);
                const style = getComputedStyle(workspace);
                try {
                    localStorage.setItem("fma_image_editor_panel_sizes", JSON.stringify({
                        left: parseFloat(style.getPropertyValue("--editor-left-width")) || 292,
                        right: parseFloat(style.getPropertyValue("--editor-right-width")) || 304
                    }));
                } catch (error) {}
            };
            handle.addEventListener("pointermove", move);
            handle.addEventListener("pointerup", finish);
            handle.addEventListener("pointercancel", finish);
            event.preventDefault();
        });
    };
    bind(left, "left");
    bind(right, "right");
}

function clampImageEditorQuickControlsPosition() {
    const panel = dom.imageEditorTextQuickControls;
    if (!panel || panel.style.transform !== "none") return;
    positionImageEditorQuickControls(
        parseFloat(panel.style.left) || 0,
        parseFloat(panel.style.top) || 0
    );
}

function addImageEditorTextLayer(targetEmptyId) {
    const image = imageEditorState.sourceImage;
    const count = imageEditorState.config.textLayers.length + 1;
    const defaults = getImageEditorTextDefaults();
    const layer = normalizeTextLayer({
        id: typeof targetEmptyId === "string" && targetEmptyId
            ? targetEmptyId
            : createTextLayerId(),
        name: `Text ${count}`,
        text: count === 1 ? "새 텍스트" : `새 텍스트 ${count}`,
        x: image.naturalWidth / 2,
        y: image.naturalHeight / 2,
        align: "center",
        fontSize: defaults.fontSize || Math.max(24, Math.round(Math.min(image.naturalWidth, image.naturalHeight) * .065)),
        fontFamily: defaults.fontFamily,
        fontWeight: defaults.fontWeight,
        color: defaults.color,
        shadow: { enabled: defaults.shadow, blur: 10, distance: 6, angle: 45, color: "#000000", opacity: .65 }
    });
    if (typeof targetEmptyId === "string" && targetEmptyId) {
        imageEditorState.config.emptyLayers = imageEditorState.config.emptyLayers.filter(
            item => item.id !== targetEmptyId
        );
        const orderEntry = imageEditorState.config.layerOrder.find(
            entry => entry.id === targetEmptyId
        );
        if (orderEntry) orderEntry.type = "text";
    } else {
        imageEditorState.config.layerOrder.push({ id: layer.id, type: "text" });
    }
    imageEditorState.config.textLayers.push(layer);
    selectImageEditorStackLayer(layer.id, "text");
    setImageEditorSidebarTab("text");
    renderImageLayerList();
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
    dom.editorTextContent.focus();
    dom.editorTextContent.select();
}

function renderImageEditorLayerList() {
    if (!imageEditorState.config) return;
    dom.imageEditorLayerList.innerHTML = "";
    [...imageEditorState.config.layerOrder].reverse().forEach(entry => {
        const layer = getImageEditorStackLayer(entry);
        if (!layer) return;
        const item = document.createElement("div");
        item.tabIndex = 0;
        item.className = `editor-layer-item ${entry.type}-layer-item`;
        item.classList.toggle("active", layer.id === getSelectedImageEditorStackLayerId());
        const visibility = document.createElement("input");
        visibility.type = "checkbox";
        visibility.checked = layer.visible;
        visibility.className = "layer-visible-check";
        visibility.title = layer.visible ? "레이어 숨기기" : "레이어 보이기";
        visibility.onclick = event => event.stopPropagation();
        visibility.onchange = event => {
            event.stopPropagation();
            layer.visible = visibility.checked;
            renderImageEditorLayerList();
            renderImageLayerList();
            requestImageEditorRender();
        };
        const details = document.createElement("div");
        const title = document.createElement("b");
        title.innerText = layer.name;
        const preview = document.createElement("small");
        preview.innerText = entry.type === "image"
            ? `${Math.round(layer.width)} × ${Math.round(layer.height)} · Alpha ${Math.round(layer.opacity * 100)}%`
            : entry.type === "text"
                ? (layer.text.replace(/\s+/g, " ").slice(0, 28) || "빈 텍스트")
                : entry.type === "shape"
                    ? `${getEditorShapeLabel(layer.shape)} · ${Math.round(layer.width)} × ${Math.round(layer.height)}`
                    : layer.fill?.enabled
                        ? `${getImageEditorFillModeLabel(layer.fill.mode)} · Alpha ${Math.round(layer.fill.opacity * 100)}%`
                        : "빈 레이어";
        details.append(title, preview);
        const type = document.createElement("em");
        type.innerText = entry.type === "image" ? "IMG" :
            entry.type === "text" ? "T" : entry.type === "shape" ? "◆" :
                layer.fill?.enabled ? "COL" : "＋";
        if (layer.fill?.enabled) type.style.color = layer.fill.color1;
        const lock = document.createElement("span");
        lock.className = `layer-lock-toggle${layer.locked ? " locked" : ""}`;
        lock.innerText = layer.locked ? "🔒" : "🔓";
        lock.title = layer.locked ? "레이어 잠금 해제" : "레이어 잠금";
        lock.onclick = event => {
            event.stopPropagation();
            layer.locked = !layer.locked;
            renderImageEditorLayerList();
            renderImageLayerList();
            syncImageLayerInspector();
            syncTextLayerInspector();
            syncShapeLayerInspector();
            requestImageEditorRender();
        };
        item.append(visibility, details, type, lock);
        item.onclick = () => {
            selectImageEditorStackLayer(layer.id, entry.type);
            renderImageEditorLayerList();
            renderImageLayerList();
            syncTextLayerInspector();
            syncImageLayerInspector();
            syncShapeLayerInspector();
            requestImageEditorRender();
        };
        item.onkeydown = event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                item.click();
            }
        };
        dom.imageEditorLayerList.appendChild(item);
    });
    dom.imageEditorLayerList.appendChild(createImageEditorBaseLayerListItem());
    updateTextLayerActionState();
    syncShapeLayerInspector();
}

function selectImageEditorTextLayer(id) {
    selectImageEditorStackLayer(id, "text");
    renderImageEditorLayerList();
    renderImageLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
}

function getSelectedTextLayer() {
    return imageEditorState.config?.textLayers.find(
        layer => layer.id === imageEditorState.selectedLayerId
    ) || null;
}

function moveSelectedTextLayer(direction) {
    moveSelectedImageEditorStackLayer(direction);
}

function duplicateSelectedTextLayer() {
    const selected = getSelectedTextLayer();
    if (!selected) return;
    const clone = normalizeTextLayer(JSON.parse(JSON.stringify(selected)));
    clone.id = createTextLayerId();
    clone.name = selected.name + " Copy";
    clone.x += 20;
    clone.y += 20;
    const index = imageEditorState.config.textLayers.indexOf(selected);
    imageEditorState.config.textLayers.splice(index + 1, 0, clone);
    const orderIndex = imageEditorState.config.layerOrder.findIndex(
        entry => entry.id === selected.id
    );
    imageEditorState.config.layerOrder.splice(
        orderIndex + 1,
        0,
        { id: clone.id, type: "text" }
    );
    selectImageEditorStackLayer(clone.id, "text");
    renderImageLayerList();
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
}

function deleteSelectedTextLayer() {
    const selected = getSelectedTextLayer();
    if (!selected) return;
    const layers = imageEditorState.config.textLayers;
    const index = layers.indexOf(selected);
    const orderIndex = imageEditorState.config.layerOrder.findIndex(
        entry => entry.id === selected.id
    );
    layers.splice(index, 1);
    imageEditorState.config.layerOrder = imageEditorState.config.layerOrder.filter(
        entry => entry.id !== selected.id
    );
    selectNearestImageEditorStackLayer(orderIndex);
    renderImageLayerList();
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
}

function updateTextLayerActionState() {
    const selected = getSelectedTextLayer();
    const disabled = !selected;
    dom.btnMoveLayerUp.disabled = disabled || selected?.locked;
    dom.btnMoveLayerDown.disabled = disabled || selected?.locked;
    dom.btnDuplicateTextLayer.disabled = disabled;
    dom.btnDeleteTextLayer.disabled = disabled || selected?.locked;
    dom.textLayerInspector.style.display = selected ? "flex" : "none";
    dom.textLayerEmpty.style.display = selected ? "none" : "block";
    dom.imageEditorTextQuickControls.style.display = selected ? "flex" : "none";
    if (selected) {
        [
            dom.editorTextContent, dom.editorTextFont, dom.editorTextSize,
            dom.editorTextColor, dom.editorTextOpacity, dom.editorTextX,
            dom.editorTextY, dom.editorTextWeight, dom.editorTextAlign,
            dom.editorTextRotation, dom.editorTextScaleX, dom.editorTextScaleY,
            dom.editorTextShadowEnabled, dom.editorTextShadowBlur,
            dom.editorTextShadowDistance, dom.editorTextShadowAngle,
            dom.editorTextShadowColor, dom.editorTextShadowOpacity
        ].forEach(control => control.disabled = selected.locked);
    }
    if (selected) {
        requestAnimationFrame(clampImageEditorQuickControlsPosition);
    }
}

function bindTextLayerInspector() {
    const bindings = [
        [dom.editorTextContent, "text", value => value],
        [dom.editorTextFont, "fontFamily", value => value],
        [dom.editorTextSize, "fontSize", value => editorClamp(Number(value), 8, 500)],
        [dom.editorTextColor, "color", value => value],
        [dom.editorTextOpacity, "opacity", value => editorClamp(Number(value) / 100, 0, 1)],
        [dom.editorTextX, "x", value => Number(value) || 0],
        [dom.editorTextY, "y", value => Number(value) || 0],
        [dom.editorTextWeight, "fontWeight", value => value],
        [dom.editorTextAlign, "align", value => value],
        [dom.editorTextRotation, "rotation", value =>
            editorClamp(Number(value) || 0, -180, 180)],
        [dom.editorTextScaleX, "scaleX", value =>
            editorClamp((Number(value) || 100) / 100, .1, 10)],
        [dom.editorTextScaleY, "scaleY", value =>
            editorClamp((Number(value) || 100) / 100, .1, 10)]
    ];
    bindings.forEach(([element, key, parse]) => {
        element.oninput = () => {
            const layer = getSelectedTextLayer();
            if (!layer || layer.locked) return;
            layer[key] = parse(element.value);
            if (key === "text") {
                layer.name = element.value.replace(/\s+/g, " ").trim().slice(0, 18) || "Text";
                renderImageEditorLayerList();
                renderImageLayerList();
            }
            requestImageEditorRender();
        };
    });
    dom.editorTextShadowEnabled.onchange = updateSelectedTextLayerShadow;
    [
        dom.editorTextShadowBlur, dom.editorTextShadowDistance, dom.editorTextShadowAngle,
        dom.editorTextShadowColor, dom.editorTextShadowOpacity
    ].forEach(element => element.oninput = updateSelectedTextLayerShadow);
}

function updateSelectedTextLayerShadow() {
    const layer = getSelectedTextLayer();
    if (!layer || layer.locked) return;
    layer.shadow.enabled = dom.editorTextShadowEnabled.checked;
    layer.shadow.blur = editorClamp(Number(dom.editorTextShadowBlur.value) || 0, 0, 100);
    layer.shadow.distance =
        editorClamp(Number(dom.editorTextShadowDistance.value) || 0, 0, 200);
    layer.shadow.angle = editorClamp(Number(dom.editorTextShadowAngle.value) || 0, 0, 360);
    layer.shadow.color = dom.editorTextShadowColor.value;
    layer.shadow.opacity =
        editorClamp(Number(dom.editorTextShadowOpacity.value) / 100, 0, 1);
    requestImageEditorRender();
}

function syncTextLayerInspector() {
    const layer = getSelectedTextLayer();
    updateTextLayerActionState();
    if (!layer) return;
    dom.editorTextContent.value = layer.text;
    setEditorSelectValue(dom.editorTextFont, layer.fontFamily);
    dom.editorTextSize.value = Math.round(layer.fontSize);
    dom.editorTextColor.value = layer.color;
    dom.editorTextOpacity.value = Math.round(layer.opacity * 100);
    dom.editorTextX.value = Math.round(layer.x);
    dom.editorTextY.value = Math.round(layer.y);
    setEditorSelectValue(dom.editorTextWeight, layer.fontWeight);
    setEditorSelectValue(dom.editorTextAlign, layer.align);
    dom.editorTextRotation.value = Math.round(layer.rotation);
    dom.editorTextScaleX.value = Math.round(layer.scaleX * 100);
    dom.editorTextScaleY.value = Math.round(layer.scaleY * 100);
    dom.editorTextShadowEnabled.checked = layer.shadow.enabled;
    dom.editorTextShadowBlur.value = Math.round(layer.shadow.blur);
    dom.editorTextShadowDistance.value = Math.round(layer.shadow.distance);
    dom.editorTextShadowAngle.value = Math.round(layer.shadow.angle);
    dom.editorTextShadowColor.value = layer.shadow.color;
    dom.editorTextShadowOpacity.value = Math.round(layer.shadow.opacity * 100);
    dom.quickTextSizeValue.innerText = `${Math.round(layer.fontSize)}px`;
    dom.quickTextRotationValue.innerText = `${Math.round(layer.rotation)}°`;
}

function beginTextLayerDrag(event) {
    if (imageEditorState.fillEyedropperTarget) {
        if (sampleImageEditorFillColor(event)) {
            event.preventDefault();
            event.stopPropagation();
        }
        return;
    }
    if (imageEditorState.bypass || imageEditorState.drawingActive || event.altKey || imageEditorState.panMode) return;
    const point = getImageEditorSourcePoint(event);
    const selectedShape = getSelectedShapeLayer();
    const selectedShapeBounds = selectedShape
        ? imageEditorState.shapeBounds.get(selectedShape.id)
        : null;
    const shapeHandle = selectedShapeBounds
        ? getTextTransformHandleAtPoint(point, selectedShapeBounds)
        : "";
    if (selectedShape && !selectedShape.locked && selectedShapeBounds && shapeHandle) {
        imageEditorState.draggingLayer = true;
        imageEditorState.textTransformMode = `shape-${shapeHandle}`;
        imageEditorState.transformStart = {
            rotation: selectedShape.rotation,
            width: selectedShape.width,
            height: selectedShape.height,
            centerX: selectedShape.x + selectedShape.width / 2,
            centerY: selectedShape.y + selectedShape.height / 2,
            bounds: selectedShapeBounds,
            pointerAngle: Math.atan2(
                point.y - selectedShapeBounds.centerY,
                point.x - selectedShapeBounds.centerX
            ),
            pointerDistance: Math.max(1, Math.hypot(
                point.x - selectedShapeBounds.centerX,
                point.y - selectedShapeBounds.centerY
            ))
        };
        dom.imageEditorCanvas.setPointerCapture?.(event.pointerId);
        dom.imageEditorCanvas.dataset.transformMode = shapeHandle;
        event.preventDefault();
        return;
    }
    const selectedImage = getSelectedImageLayer();
    const selectedImageBounds = selectedImage
        ? imageEditorState.imageBounds.get(selectedImage.id)
        : null;
    const imageHandle = selectedImageBounds
        ? getTextTransformHandleAtPoint(point, selectedImageBounds)
        : "";
    if (selectedImage && !selectedImage.locked && selectedImageBounds && imageHandle) {
        imageEditorState.draggingLayer = true;
        imageEditorState.textTransformMode = `image-${imageHandle}`;
        imageEditorState.transformStart = {
            rotation: selectedImage.rotation,
            width: selectedImage.width,
            height: selectedImage.height,
            centerX: selectedImage.x + selectedImage.width / 2,
            centerY: selectedImage.y + selectedImage.height / 2,
            bounds: selectedImageBounds,
            pointerAngle: Math.atan2(
                point.y - selectedImageBounds.centerY,
                point.x - selectedImageBounds.centerX
            ),
            pointerDistance: Math.max(1, Math.hypot(
                point.x - selectedImageBounds.centerX,
                point.y - selectedImageBounds.centerY
            ))
        };
        dom.imageEditorCanvas.setPointerCapture?.(event.pointerId);
        dom.imageEditorCanvas.dataset.transformMode = imageHandle;
        event.preventDefault();
        return;
    }
    const selected = getSelectedTextLayer();
    const selectedBounds = selected
        ? imageEditorState.textBounds.get(selected.id)
        : null;
    const handle = selectedBounds
        ? getTextTransformHandleAtPoint(point, selectedBounds)
        : "";
    if (selected && !selected.locked && selectedBounds && handle) {
        imageEditorState.draggingLayer = true;
        imageEditorState.textTransformMode = handle;
        imageEditorState.transformStart = {
            rotation: selected.rotation,
            scaleX: selected.scaleX,
            scaleY: selected.scaleY,
            bounds: selectedBounds,
            pointerAngle: Math.atan2(
                point.y - selectedBounds.centerY,
                point.x - selectedBounds.centerX
            ),
            pointerDistance: Math.max(1, Math.hypot(
                point.x - selectedBounds.centerX,
                point.y - selectedBounds.centerY
            ))
        };
        dom.imageEditorCanvas.setPointerCapture?.(event.pointerId);
        dom.imageEditorCanvas.dataset.transformMode = handle;
        event.preventDefault();
        return;
    }
    // 레이어 목록에서 이미 고른 객체가 겹쳐 있어도 그 객체를 우선 이동한다.
    // 선택 객체의 경계 밖을 눌렀을 때만 아래의 일반 hit-test로 다른 레이어를 고른다.
    const selectedId = getSelectedImageEditorStackLayerId();
    const selectedEntry = selectedId
        ? imageEditorState.config.layerOrder.find(entry => entry.id === selectedId)
        : null;
    const directTextEntry = [...imageEditorState.config.layerOrder].reverse().find(entry => {
        if (entry.type !== "text") return false;
        const textLayer = getImageEditorStackLayer(entry);
        const textBounds = imageEditorState.textBounds.get(entry.id);
        return textLayer?.visible && textBounds &&
            isPointInsideTextTransformBounds(point, textBounds, 8);
    });
    const selectedStackLayer = getImageEditorStackLayer(selectedEntry);
    const selectedStackBounds = selectedEntry?.type === "text"
        ? imageEditorState.textBounds.get(selectedId)
        : selectedEntry?.type === "shape"
            ? imageEditorState.shapeBounds.get(selectedId)
            : selectedEntry?.type === "image"
                ? imageEditorState.imageBounds.get(selectedId)
                : null;
    if (
        (!directTextEntry || directTextEntry.id === selectedId) &&
        selectedStackLayer?.visible &&
        selectedStackBounds &&
        isPointInsideTextTransformBounds(point, selectedStackBounds, 8)
    ) {
        if (selectedStackLayer.locked) {
            requestImageEditorRender();
            event.preventDefault();
            return;
        }
        beginImageEditorStackLayerMove(event, point, selectedEntry, selectedStackLayer);
        return;
    }
    const hitEntry = [...imageEditorState.config.layerOrder].reverse().find(entry => {
        const layer = getImageEditorStackLayer(entry);
        if (!layer?.visible || entry.type === "empty") return false;
        const bounds = entry.type === "text"
            ? imageEditorState.textBounds.get(entry.id)
            : entry.type === "shape"
                ? imageEditorState.shapeBounds.get(entry.id)
                : imageEditorState.imageBounds.get(entry.id);
        return bounds && isPointInsideTextTransformBounds(point, bounds, 8);
    });
    if (!hitEntry) {
        const base = imageEditorState.config?.baseLayer;
        if (imageEditorState.baseSelectable && base?.visible && imageEditorState.baseBounds &&
            isPointInsideTextTransformBounds(point, imageEditorState.baseBounds, 8)) {
            selectImageEditorStackLayer("__base__", "base");
            renderImageLayerList();
            renderImageEditorLayerList();
            if (!base.locked) beginImageEditorBaseMove(event, point, base);
            else {
                requestImageEditorRender();
                event.preventDefault();
            }
        } else {
            clearImageEditorLayerSelection();
        }
        return;
    }
    const hit = getImageEditorStackLayer(hitEntry);
    selectImageEditorStackLayer(hit.id, hitEntry.type);
    renderImageLayerList();
    renderImageEditorLayerList();
    syncImageLayerInspector();
    syncTextLayerInspector();
    syncShapeLayerInspector();
    if (hit.locked) {
        requestImageEditorRender();
        event.preventDefault();
        return;
    }
    beginImageEditorStackLayerMove(event, point, hitEntry, hit);
}

function beginImageEditorStackLayerMove(event, point, entry, layer) {
    if (!entry || !layer || layer.locked) return;
    imageEditorState.draggingLayer = true;
    imageEditorState.textTransformMode = entry.type === "image"
        ? "image-move"
        : entry.type === "shape" ? "shape-move" : "move";
    imageEditorState.transformStart = null;
    imageEditorState.dragOffsetX = point.x - layer.x;
    imageEditorState.dragOffsetY = point.y - layer.y;
    dom.imageEditorCanvas.setPointerCapture?.(event.pointerId);
    dom.imageEditorCanvas.classList.add("dragging-text");
    dom.imageEditorCanvas.dataset.transformMode = "move";
    event.preventDefault();
}

function beginImageEditorBaseMove(event, point, base) {
    imageEditorState.draggingLayer = true;
    imageEditorState.textTransformMode = "base-move";
    imageEditorState.transformStart = null;
    imageEditorState.dragOffsetX = point.x - base.x;
    imageEditorState.dragOffsetY = point.y - base.y;
    dom.imageEditorCanvas.setPointerCapture?.(event.pointerId);
    dom.imageEditorCanvas.classList.add("dragging-text");
    dom.imageEditorCanvas.dataset.transformMode = "move";
    event.preventDefault();
}

function continueTextLayerDrag(event) {
    if (!imageEditorState.draggingLayer) {
        updateTextTransformHoverCursor(event);
        return;
    }
    const point = getImageEditorSourcePoint(event);
    const mode = imageEditorState.textTransformMode;
    const start = imageEditorState.transformStart;
    if (mode === "base-move") {
        const base = imageEditorState.config?.baseLayer;
        if (!base || base.locked) return;
        base.x = point.x - imageEditorState.dragOffsetX;
        base.y = point.y - imageEditorState.dragOffsetY;
        requestImageEditorRender();
        event.preventDefault();
        return;
    }
    if (mode.startsWith("shape-") && mode !== "shape-move") {
        const shape = getSelectedShapeLayer();
        if (!shape || shape.locked || !start) return;
        const transformMode = mode.slice(6);
        if (transformMode === "rotate") {
            const angle = Math.atan2(point.y - start.centerY, point.x - start.centerX);
            shape.rotation = normalizeEditorRotation(
                start.rotation + (angle - start.pointerAngle) * 180 / Math.PI
            );
        } else if (transformMode.startsWith("uniform")) {
            const distance = Math.hypot(point.x - start.centerX, point.y - start.centerY);
            const factor = editorClamp(distance / start.pointerDistance, .05, 20);
            shape.width = Math.max(1, start.width * factor);
            shape.height = Math.max(1, start.height * factor);
        } else {
            const local = rotateTextPointToLocal(point, start.bounds);
            if (transformMode === "scaleX") shape.width = Math.max(1, Math.abs(local.x) * 2);
            if (transformMode === "scaleY") shape.height = Math.max(1, Math.abs(local.y) * 2);
        }
        shape.x = start.centerX - shape.width / 2;
        shape.y = start.centerY - shape.height / 2;
        syncShapeLayerInspector();
        requestImageEditorRender();
        event.preventDefault();
        return;
    }
    if (mode === "shape-move") {
        const shape = getSelectedShapeLayer();
        if (!shape || shape.locked) return;
        shape.x = point.x - imageEditorState.dragOffsetX;
        shape.y = point.y - imageEditorState.dragOffsetY;
        syncShapeLayerInspector();
        requestImageEditorRender();
        event.preventDefault();
        return;
    }
    if (mode.startsWith("image-") && mode !== "image-move") {
        const imageLayer = getSelectedImageLayer();
        if (!imageLayer || imageLayer.locked || !start) return;
        const transformMode = mode.slice(6);
        if (transformMode === "rotate") {
            const angle = Math.atan2(point.y - start.centerY, point.x - start.centerX);
            imageLayer.rotation = normalizeEditorRotation(
                start.rotation + (angle - start.pointerAngle) * 180 / Math.PI
            );
        } else if (transformMode.startsWith("uniform")) {
            const distance = Math.hypot(point.x - start.centerX, point.y - start.centerY);
            const factor = editorClamp(distance / start.pointerDistance, .05, 20);
            imageLayer.width = Math.max(1, start.width * factor);
            imageLayer.height = Math.max(1, start.height * factor);
        } else {
            const local = rotateTextPointToLocal(point, start.bounds);
            if (transformMode === "scaleX") {
                imageLayer.width = Math.max(1, Math.abs(local.x) * 2);
            } else if (transformMode === "scaleY") {
                imageLayer.height = Math.max(1, Math.abs(local.y) * 2);
            }
        }
        imageLayer.x = start.centerX - imageLayer.width / 2;
        imageLayer.y = start.centerY - imageLayer.height / 2;
        syncImageLayerInspector();
        requestImageEditorRender();
        event.preventDefault();
        return;
    }
    if (mode === "image-move") {
        const imageLayer = getSelectedImageLayer();
        if (!imageLayer || imageLayer.locked) return;
        const rawX = editorClamp(
            point.x - imageEditorState.dragOffsetX,
            -imageLayer.width,
            imageEditorState.sourceImage.naturalWidth
        );
        const rawY = editorClamp(
            point.y - imageEditorState.dragOffsetY,
            -imageLayer.height,
            imageEditorState.sourceImage.naturalHeight
        );
        const snapped = snapImageEditorLayerPosition(imageLayer, rawX, rawY);
        imageLayer.x = snapped.x;
        imageLayer.y = snapped.y;
        updateImageEditorMagnetButton(snapped.snapped);
        dom.imageLayerX.value = Math.round(imageLayer.x);
        dom.imageLayerY.value = Math.round(imageLayer.y);
        syncImageLayerRangeValues(imageLayer);
        requestImageEditorRender();
        event.preventDefault();
        return;
    }
    const layer = getSelectedTextLayer();
    if (!layer) return;
    if (mode === "move") {
        layer.x = editorClamp(
            point.x - imageEditorState.dragOffsetX, 0, imageEditorState.sourceImage.naturalWidth
        );
        layer.y = editorClamp(
            point.y - imageEditorState.dragOffsetY, 0, imageEditorState.sourceImage.naturalHeight
        );
        dom.editorTextX.value = Math.round(layer.x);
        dom.editorTextY.value = Math.round(layer.y);
    } else if (start && mode === "rotate") {
        const angle = Math.atan2(
            point.y - start.bounds.centerY,
            point.x - start.bounds.centerX
        );
        layer.rotation = normalizeEditorRotation(
            start.rotation + (angle - start.pointerAngle) * 180 / Math.PI
        );
        dom.editorTextRotation.value = Math.round(layer.rotation);
    } else if (start && (mode === "scaleX" || mode === "scaleY")) {
        const local = rotateTextPointToLocal(point, start.bounds);
        if (mode === "scaleX") {
            layer.scaleX = editorClamp(
                Math.abs(local.x) / Math.max(1, start.bounds.width / 2), .1, 10
            );
            dom.editorTextScaleX.value = Math.round(layer.scaleX * 100);
        } else {
            layer.scaleY = editorClamp(
                Math.abs(local.y) / Math.max(1, start.bounds.height / 2), .1, 10
            );
            dom.editorTextScaleY.value = Math.round(layer.scaleY * 100);
        }
    } else if (start && mode.startsWith("uniform")) {
        const distance = Math.hypot(
            point.x - start.bounds.centerX,
            point.y - start.bounds.centerY
        );
        const factor = distance / start.pointerDistance;
        layer.scaleX = editorClamp(start.scaleX * factor, .1, 10);
        layer.scaleY = editorClamp(start.scaleY * factor, .1, 10);
        dom.editorTextScaleX.value = Math.round(layer.scaleX * 100);
        dom.editorTextScaleY.value = Math.round(layer.scaleY * 100);
    }
    requestImageEditorRender();
    event.preventDefault();
}

function updateTextTransformHoverCursor(event) {
    if (imageEditorState.bypass) {
        delete dom.imageEditorCanvas.dataset.transformMode;
        return;
    }
    const point = getImageEditorSourcePoint(event);
    const shape = getSelectedShapeLayer();
    const shapeBounds = shape ? imageEditorState.shapeBounds.get(shape.id) : null;
    const shapeHandle = shape && !shape.locked && shapeBounds
        ? getTextTransformHandleAtPoint(point, shapeBounds)
        : "";
    if (shapeHandle) {
        dom.imageEditorCanvas.dataset.transformMode = shapeHandle;
        return;
    }
    const imageLayer = getSelectedImageLayer();
    const imageBounds = imageLayer
        ? imageEditorState.imageBounds.get(imageLayer.id)
        : null;
    const imageHandle = imageLayer && !imageLayer.locked && imageBounds
        ? getTextTransformHandleAtPoint(point, imageBounds)
        : "";
    if (imageHandle) {
        dom.imageEditorCanvas.dataset.transformMode = imageHandle;
        return;
    }
    const layer = getSelectedTextLayer();
    const bounds = layer ? imageEditorState.textBounds.get(layer.id) : null;
    const handle = bounds ? getTextTransformHandleAtPoint(point, bounds) : "";
    if (handle) {
        dom.imageEditorCanvas.dataset.transformMode = handle;
    } else if (bounds && isPointInsideTextTransformBounds(point, bounds, 8)) {
        dom.imageEditorCanvas.dataset.transformMode = "move";
    } else {
        if (imageBounds && isPointInsideTextTransformBounds(point, imageBounds, 8)) {
            dom.imageEditorCanvas.dataset.transformMode =
                imageLayer.locked ? "locked" : "move";
            return;
        }
        if (shapeBounds && isPointInsideTextTransformBounds(point, shapeBounds, 8)) {
            dom.imageEditorCanvas.dataset.transformMode = shape.locked ? "locked" : "move";
            return;
        }
        const base = imageEditorState.selectedBaseLayer && imageEditorState.baseSelectable
            ? imageEditorState.config?.baseLayer
            : null;
        if (base?.visible && imageEditorState.baseBounds &&
            isPointInsideTextTransformBounds(point, imageEditorState.baseBounds, 8)) {
            dom.imageEditorCanvas.dataset.transformMode = base.locked ? "locked" : "move";
            return;
        }
        delete dom.imageEditorCanvas.dataset.transformMode;
    }
}

function endTextLayerDrag(event) {
    imageEditorState.draggingLayer = false;
    imageEditorState.textTransformMode = "";
    imageEditorState.transformStart = null;
    dom.imageEditorCanvas.classList.remove("dragging-text");
    delete dom.imageEditorCanvas.dataset.transformMode;
    updateImageEditorMagnetButton(false);
    try {
        dom.imageEditorCanvas.releasePointerCapture?.(event.pointerId);
    } catch (error) {
        // Pointer may already have been released.
    }
}

function getTextTransformHandleAtPoint(point, bounds) {
    const radius = 13 / Math.max(.1, getImageEditorDisplayScale());
    const order = [
        "rotate", "uniform", "uniformTopRight", "uniformTopLeft",
        "uniformBottomLeft", "scaleX", "scaleY"
    ];
    return order.find(name => {
        const handle = bounds.handles[name];
        return Math.hypot(point.x - handle.x, point.y - handle.y) <= radius;
    }) || "";
}

function rotateTextPointToLocal(point, bounds) {
    const radians = -bounds.rotation * Math.PI / 180;
    const dx = point.x - bounds.centerX;
    const dy = point.y - bounds.centerY;
    return {
        x: dx * Math.cos(radians) - dy * Math.sin(radians),
        y: dx * Math.sin(radians) + dy * Math.cos(radians)
    };
}

function isPointInsideTextTransformBounds(point, bounds, padding) {
    const local = rotateTextPointToLocal(point, bounds);
    return Math.abs(local.x) <= bounds.halfWidth + padding &&
        Math.abs(local.y) <= bounds.halfHeight + padding;
}

function normalizeEditorRotation(value) {
    let rotation = Number(value) || 0;
    while (rotation > 180) rotation -= 360;
    while (rotation < -180) rotation += 360;
    return rotation;
}

function getImageEditorSourcePoint(event) {
    const rect = dom.imageEditorCanvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * imageEditorState.sourceImage.naturalWidth /
            Math.max(1, rect.width),
        y: (event.clientY - rect.top) * imageEditorState.sourceImage.naturalHeight /
            Math.max(1, rect.height)
    };
}

function getImageEditorDisplayScale() {
    if (!imageEditorState.sourceImage) return imageEditorState.previewScale || 1;
    const rect = dom.imageEditorCanvas.getBoundingClientRect();
    return rect.width / Math.max(1, imageEditorState.sourceImage.naturalWidth);
}

function openImageEditorSaveChoice() {
    dom.imageEditorSaveChoice.style.display = "flex";
    dom.btnImageEditorNew.focus();
}

function closeImageEditorSaveChoice() {
    dom.imageEditorSaveChoice.style.display = "none";
}

async function saveImageEditorResult(saveMode) {
    const sourceIndex = imageEditorState.imageIndex;
    const sourceItem = images[sourceIndex];
    if (!sourceItem || !imageEditorState.sourceImage || imageEditorState.processing) return;
    const width = imageEditorState.sourceImage.naturalWidth;
    const height = imageEditorState.sourceImage.naturalHeight;
    if (width * height > 64000000) {
        alert("편집 결과가 너무 큽니다. 6,400만 픽셀 이하 이미지에서 저장하세요.");
        return;
    }

    imageEditorState.processing = true;
    dom.btnImageEditorReplace.disabled = true;
    dom.btnImageEditorNew.disabled = true;
    try {
        showLoading("이미지 편집 결과 생성 중...");
        updateLoading(8);
        await new Promise(resolve => requestAnimationFrame(resolve));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        renderImageEditorCanvas(
            canvas,
            imageEditorState.sourceImage,
            imageEditorState.config,
            false,
            1,
            false
        );
        if (imageEditorState.drawingHasContent) {
            canvas.getContext("2d").drawImage(
                dom.imageEditorDrawingCanvas,
                0,
                0,
                width,
                height
            );
        }
        updateLoading(76);
        const resultSrc = canvas.toDataURL("image/png");
        imageEditorState.config.drawingDataUrl = imageEditorState.drawingHasContent
            ? dom.imageEditorDrawingCanvas.toDataURL("image/png")
            : "";
        const config = cloneImageEditorConfig(imageEditorState.config);
        if (imageEditorState.externalReturn) {
            const callback = imageEditorState.externalReturn.onApply;
            clearImageEditorExternalReturn(true);
            imageEditorState.processing = false;
            closeImageEditor();
            await Promise.resolve(callback(resultSrc));
            updateLoading(100);
            return;
        }
        let resultIndex = sourceIndex;

        if (saveMode === "replace") {
            sourceItem.src = resultSrc;
            sourceItem.size = estimateDataUrlBytes(resultSrc);
            sourceItem.createdAt = sourceItem.createdAt || sourceItem.date || Date.now();
            sourceItem.modifiedAt = Date.now();
            sourceItem.mimeType = "image/png";
            sourceItem.imageEditSourceSrc = imageEditorState.sourceSrc;
            sourceItem.imageEditConfig = config;
            sourceItem.imageEditInfo = {
                preset: config.preset,
                textLayerCount: config.textLayers.length,
                width: width,
                height: height
            };
            applyDerivedImageMetadata(sourceItem, sourceItem, width, height, "Image Edit");
        } else {
            const sourcePath = sourceItem.path;
            const count = images.filter(item => item.imageEditParentPath === sourcePath).length + 1;
            const editedItem = {
                src: resultSrc,
                path: `${sourcePath}.edit_${count}`,
                group: "image-edited",
                date: Date.now(),
                size: estimateDataUrlBytes(resultSrc),
                mimeType: "image/png",
                isFav: false,
                imageEditParentPath: sourcePath,
                imageEditSourceSrc: imageEditorState.sourceSrc,
                imageEditConfig: config,
                imageEditInfo: {
                    preset: config.preset,
                    textLayerCount: config.textLayers.length,
                    width: width,
                    height: height
                }
            };
            applyDerivedImageMetadata(editedItem, sourceItem, width, height, "Image Edit");
            images.splice(sourceIndex + 1, 0, editedItem);
            resultIndex = sourceIndex + 1;
        }

        imageEditorState.processing = false;
        closeImageEditor();
        renderGallery();
        renderFavorites();
        dom.imageCount.innerText = "Images: " + images.length;
        saveCurrentImagesToDB();
        updateLoading(100);
        showImage(resultIndex);
    } catch (error) {
        console.error("Image editor save failed:", error);
        alert("이미지 편집 결과 저장 중 오류가 발생했습니다: " + error.message);
    } finally {
        hideLoading();
        imageEditorState.processing = false;
        dom.btnImageEditorReplace.disabled = false;
        dom.btnImageEditorNew.disabled = false;
    }
}

function updateImageEditorStatus() {
    if (imageEditorState.bypass) {
        dom.imageEditorStatus.innerText = "Bypass ON · 적용 전 원본";
        return;
    }
    const config = imageEditorState.config;
    const adjusted = IMAGE_EDITOR_PARAMS.some(key => Math.abs(config.adjustments[key]) > .0001) ||
        IMAGE_EDITOR_EFFECTS.some(key => config.effects[key] > .0001);
    const preset = IMAGE_EDITOR_PRESETS[config.preset]?.name ||
        (config.preset === "original" ? "Original" : "Custom");
    const hasDrawing = imageEditorState.drawingHasContent ||
        Boolean(config.drawingDataUrl);
    const fillLayerCount = config.emptyLayers.filter(layer => layer.fill?.enabled).length;
    dom.imageEditorStatus.innerText =
        `${preset} · ${adjusted ? "보정 적용" : "보정 없음"} · ` +
        `그리기 ${hasDrawing ? "적용" : "없음"} · ` +
        `색상 ${fillLayerCount}개 · Text ${config.textLayers.length}개`;
}

function createTextLayerId() {
    return `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatEditorControlValue(value) {
    const number = Number(value) || 0;
    return number > 0 ? `+${number}` : String(number);
}

function setEditorSelectValue(select, value) {
    if ([...select.options].some(option => option.value === value)) select.value = value;
    else select.selectedIndex = 0;
}

function validEditorHex(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

function editorHexToRgba(hex, alpha) {
    const normalized = validEditorHex(hex, "#000000").slice(1);
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${editorClamp(alpha, 0, 1)})`;
}

function editorSmoothStep(minimum, maximum, value) {
    const ratio = editorClamp((value - minimum) / (maximum - minimum), 0, 1);
    return ratio * ratio * (3 - 2 * ratio);
}

function editorClamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

document.addEventListener("DOMContentLoaded", initImageEditorFeature);
