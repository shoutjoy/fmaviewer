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
    bypass: false,
    previewScale: 1,
    renderRequested: false,
    textBounds: new Map(),
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
    panPointerStart: null
};

function createDefaultImageEditorConfig() {
    const adjustments = {};
    const effects = {};
    IMAGE_EDITOR_PARAMS.forEach(key => adjustments[key] = 0);
    IMAGE_EDITOR_EFFECTS.forEach(key => effects[key] = 0);
    return {
        version: 1,
        preset: "original",
        adjustments: adjustments,
        effects: effects,
        imageLayers: [],
        textLayers: [],
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
    base.drawingDataUrl = typeof config.drawingDataUrl === "string"
        ? config.drawingDataUrl
        : "";
    return base;
}

function normalizeImageLayer(layer) {
    return {
        id: String(layer?.id || `image-layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
        name: String(layer?.name || "Image Layer"),
        src: String(layer?.src || ""),
        visible: layer?.visible !== false,
        opacity: editorClamp(Number(layer?.opacity ?? 1), 0, 1),
        rotation: editorClamp(Number(layer?.rotation) || 0, -180, 180),
        x: Number(layer?.x) || 0,
        y: Number(layer?.y) || 0,
        width: Math.max(1, Number(layer?.width) || 100),
        height: Math.max(1, Number(layer?.height) || 100)
    };
}

function normalizeTextLayer(layer) {
    return {
        id: String(layer?.id || createTextLayerId()),
        name: String(layer?.name || "Text"),
        text: String(layer?.text ?? "새 텍스트"),
        visible: layer?.visible !== false,
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
            enabled: layer?.shadow?.enabled !== false,
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
        button.onclick = () => applyImageEditorPreset(button.dataset.editorPreset);
    });
    dom.imageAdjustmentControls.querySelectorAll("label[data-param]").forEach(label => {
        const input = label.querySelector("input");
        input.oninput = () => {
            imageEditorState.config.adjustments[label.dataset.param] = Number(input.value) / 100;
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
            imageEditorState.config.effects[label.dataset.effect] = Number(input.value) / 100;
            setImageEditorPreset("custom", "Custom");
            label.querySelector("b").innerText = input.value;
            requestImageEditorRender();
        };
    });

    dom.btnImageEditorBypass.onclick = toggleImageEditorBypass;
    dom.btnImageEditorUndo.onclick = undoImageEditorDrawing;
    dom.btnImageEditorResetZoom.onclick = resetImageEditorViewport;
    dom.btnImageEditorReset.onclick = resetEntireImageEditor;
    dom.btnResetImageAdjustments.onclick = resetImageEditorAdjustments;
    dom.btnAddTextLayer.onclick = addImageEditorTextLayer;
    initImageEditorLayerTabs();
    initImageLayerControls();
    initImageEditorQuickTextControls();
    initImageEditorFontManager();
    initImageEditorDrawingTools();
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
        if (imageEditorState.imageIndex >= 0) sizeImageEditorCanvas();
    });
    dom.imageEditorModal.addEventListener("mousedown", event => {
        if (event.target === dom.imageEditorModal && !imageEditorState.processing) {
            closeImageEditor();
        }
    });
    document.addEventListener("keydown", event => {
        if (dom.imageEditorModal.style.display === "none") return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" &&
            !event.target.closest("input, textarea, select, [contenteditable='true']")) {
            event.preventDefault();
            undoImageEditorDrawing();
            return;
        }
        if (event.key === "Escape" && !imageEditorState.processing) {
            if (dom.imageEditorSaveChoice.style.display !== "none") closeImageEditorSaveChoice();
            else closeImageEditor();
        }
    });
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
        input.parentNode.insertBefore(wrapper, input);
        wrapper.append(minus, input, plus);
    });
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
        10,
        18
    );
    applyImageEditorFontSize(size, false);
    dom.imageEditorFontSize.oninput = () => {
        applyImageEditorFontSize(Number(dom.imageEditorFontSize.value), true);
    };
}

function applyImageEditorFontSize(value, persist) {
    const size = Math.round(editorClamp(Number(value) || IMAGE_EDITOR_UI_FONT_DEFAULT, 10, 18));
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

function getImageEditorTextDefaults() {
    const fallback = {
        fontFamily: "Pretendard, sans-serif",
        fontSize: 64,
        color: "#ffffff",
        fontWeight: "700",
        shadow: true
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
    if (!IMAGE_EDITOR_DRAWING_DEFAULTS[tool]) tool = "pencil";
    imageEditorState.drawingTool = tool;
    document.querySelectorAll(".editor-drawing-tool").forEach(button => {
        button.classList.toggle("active", button.dataset.drawingTool === tool);
    });
    syncImageEditorDrawingControls();
    setImageEditorDrawingActive(true);
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

function handleImageEditorWheel(event) {
    if (!event.altKey || imageEditorState.imageIndex < 0) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    imageEditorState.zoom = editorClamp(imageEditorState.zoom * factor, .25, 8);
    applyImageEditorViewport();
}

function beginImageEditorPan(event) {
    if (!event.altKey || !event.target.closest(".image-editor-canvas-wrap")) return;
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
        await preloadImageEditorLayers(imageEditorState.config.imageLayers);
        await initializeImageEditorDrawingLayer(imageEditorState.config.drawingDataUrl);
        imageEditorState.selectedLayerId =
            imageEditorState.config.textLayers.at(-1)?.id || null;
        imageEditorState.selectedImageLayerId =
            imageEditorState.config.imageLayers.at(-1)?.id || null;
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
        requestAnimationFrame(sizeImageEditorCanvas);
    } catch (error) {
        console.error("Image editor open failed:", error);
        alert("편집할 이미지를 불러올 수 없습니다: " + error.message);
    }
}

function closeImageEditor() {
    if (imageEditorState.processing) return;
    dom.imageEditorModal.style.display = "none";
    closeImageEditorSaveChoice();
    imageEditorState.imageIndex = -1;
    imageEditorState.sourceImage = null;
    imageEditorState.sourceSrc = "";
    imageEditorState.config = null;
    imageEditorState.selectedLayerId = null;
    imageEditorState.selectedImageLayerId = null;
    imageEditorState.textBounds.clear();
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
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.restore();

    if (bypass) {
        imageEditorState.textBounds.clear();
        return canvas;
    }
    applyImageEditorAdjustments(canvas, config.adjustments);
    applyImageEditorAtmosphere(canvas, config.effects);
    drawImageEditorImageLayers(canvas, config.imageLayers || [], scale);
    drawImageEditorTextLayers(canvas, config.textLayers, scale, showSelection);
    return canvas;
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
    imageEditorState.textBounds.clear();
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
            rotate: "↻"
        }[type], point.x, point.y);
    });
    context.restore();
}

function applyImageEditorPreset(key) {
    const preset = IMAGE_EDITOR_PRESETS[key];
    if (!preset || !imageEditorState.config) return;
    IMAGE_EDITOR_PARAMS.forEach(name => {
        imageEditorState.config.adjustments[name] = Number(preset.values[name]) || 0;
    });
    IMAGE_EDITOR_EFFECTS.forEach(name => {
        imageEditorState.config.effects[name] = Number(preset.values[name]) || 0;
    });
    setImageEditorPreset(key, preset.name);
    syncImageAdjustmentControls();
    requestImageEditorRender();
}

function setImageEditorPreset(key, displayName) {
    imageEditorState.config.preset = key;
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
    dom.imageAdjustmentControls.querySelectorAll("label[data-param]").forEach(label => {
        const value = Math.round(imageEditorState.config.adjustments[label.dataset.param] * 100);
        label.querySelector("input").value = String(value);
        label.querySelector("b").innerText = formatEditorControlValue(value);
    });
    dom.imageEffectControls.querySelectorAll("label[data-effect]").forEach(label => {
        const value = Math.round(imageEditorState.config.effects[label.dataset.effect] * 100);
        label.querySelector("input").value = String(value);
        label.querySelector("b").innerText = value;
    });
}

function resetImageEditorAdjustments() {
    IMAGE_EDITOR_PARAMS.forEach(key => imageEditorState.config.adjustments[key] = 0);
    IMAGE_EDITOR_EFFECTS.forEach(key => imageEditorState.config.effects[key] = 0);
    setImageEditorPreset("original", "Original");
    syncImageAdjustmentControls();
    requestImageEditorRender();
}

function resetEntireImageEditor() {
    if (!confirm("모든 보정, 이미지·텍스트 레이어와 그리기를 초기화할까요?")) return;
    imageEditorState.config = createDefaultImageEditorConfig();
    imageEditorState.selectedLayerId = null;
    imageEditorState.selectedImageLayerId = null;
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
    setImageEditorSidebarTab("layer");
}

function setImageEditorSidebarTab(tab) {
    const text = tab === "text";
    dom.btnEditorLayerTab.classList.toggle("active", !text);
    dom.btnEditorTextTab.classList.toggle("active", text);
    dom.btnEditorLayerTab.setAttribute("aria-selected", String(!text));
    dom.btnEditorTextTab.setAttribute("aria-selected", String(text));
    dom.editorLayerTabPanel.style.display = text ? "none" : "block";
    dom.editorTextTabPanel.style.display = text ? "block" : "none";
}

function initImageLayerControls() {
    dom.btnAddImageLayer.onclick = () => dom.imageLayerFileInput.click();
    dom.imageLayerFileInput.onchange = async () => {
        const files = [...(dom.imageLayerFileInput.files || [])].filter(file =>
            file.type.startsWith("image/")
        );
        for (const file of files) await addImageEditorImageLayer(file);
        dom.imageLayerFileInput.value = "";
    };
    dom.btnImageLayerUp.onclick = () => moveSelectedImageLayer(1);
    dom.btnImageLayerDown.onclick = () => moveSelectedImageLayer(-1);
    dom.btnDuplicateImageLayer.onclick = duplicateSelectedImageLayer;
    dom.btnDeleteImageLayer.onclick = deleteSelectedImageLayer;
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
            if (!layer) return;
            layer[key] = parse(input.value);
            requestImageEditorRender();
        };
    });
}

async function addImageEditorImageLayer(file) {
    if (!imageEditorState.config || !imageEditorState.sourceImage) return;
    const src = await readImageEditorFile(file);
    const image = await loadUpscaleImage(src);
    const maxWidth = imageEditorState.sourceImage.naturalWidth * .55;
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const layer = normalizeImageLayer({
        name: file.name || `Image ${imageEditorState.config.imageLayers.length + 1}`,
        src,
        width,
        height,
        x: Math.round((imageEditorState.sourceImage.naturalWidth - width) / 2),
        y: Math.round((imageEditorState.sourceImage.naturalHeight - height) / 2)
    });
    imageEditorState.imageLayerCache.set(layer.id, image);
    imageEditorState.config.imageLayers.push(layer);
    imageEditorState.selectedImageLayerId = layer.id;
    renderImageLayerList();
    syncImageLayerInspector();
    requestImageEditorRender();
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

function drawImageEditorImageLayers(canvas, layers, scale) {
    const context = canvas.getContext("2d");
    (layers || []).forEach(layer => {
        if (!layer.visible) return;
        const image = imageEditorState.imageLayerCache.get(layer.id);
        if (!image) return;
        const x = layer.x * scale;
        const y = layer.y * scale;
        const width = layer.width * scale;
        const height = layer.height * scale;
        context.save();
        context.globalAlpha = layer.opacity;
        context.translate(x + width / 2, y + height / 2);
        context.rotate(layer.rotation * Math.PI / 180);
        context.drawImage(image, -width / 2, -height / 2, width, height);
        context.restore();
    });
}

function renderImageLayerList() {
    if (!imageEditorState.config) return;
    dom.imageLayerList.innerHTML = "";
    [...imageEditorState.config.imageLayers].reverse().forEach(layer => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "editor-layer-item image-layer-item";
        item.classList.toggle("active", layer.id === imageEditorState.selectedImageLayerId);
        const visibility = document.createElement("span");
        visibility.className = "layer-visibility";
        visibility.innerText = layer.visible ? "◉" : "○";
        visibility.onclick = event => {
            event.stopPropagation();
            layer.visible = !layer.visible;
            renderImageLayerList();
            requestImageEditorRender();
        };
        const details = document.createElement("div");
        const title = document.createElement("b");
        title.innerText = layer.name;
        const preview = document.createElement("small");
        preview.innerText = `${Math.round(layer.width)} × ${Math.round(layer.height)} · Alpha ${Math.round(layer.opacity * 100)}%`;
        details.append(title, preview);
        const type = document.createElement("em");
        type.innerText = "IMG";
        item.append(visibility, details, type);
        item.onclick = () => {
            imageEditorState.selectedImageLayerId = layer.id;
            renderImageLayerList();
            syncImageLayerInspector();
            requestImageEditorRender();
        };
        dom.imageLayerList.appendChild(item);
    });
    syncImageLayerInspector();
}

function getSelectedImageLayer() {
    return imageEditorState.config?.imageLayers.find(
        layer => layer.id === imageEditorState.selectedImageLayerId
    ) || null;
}

function syncImageLayerInspector() {
    const layer = getSelectedImageLayer();
    dom.imageLayerInspector.style.display = layer ? "flex" : "none";
    dom.imageLayerEmpty.style.display = layer ? "none" : "block";
    [dom.btnImageLayerUp, dom.btnImageLayerDown, dom.btnDuplicateImageLayer,
        dom.btnDeleteImageLayer].forEach(button => button.disabled = !layer);
    if (!layer) return;
    dom.imageLayerOpacity.value = Math.round(layer.opacity * 100);
    dom.imageLayerRotation.value = Math.round(layer.rotation);
    dom.imageLayerX.value = Math.round(layer.x);
    dom.imageLayerY.value = Math.round(layer.y);
    dom.imageLayerWidth.value = Math.round(layer.width);
    dom.imageLayerHeight.value = Math.round(layer.height);
}

function moveSelectedImageLayer(direction) {
    const layers = imageEditorState.config.imageLayers;
    const index = layers.findIndex(layer => layer.id === imageEditorState.selectedImageLayerId);
    const next = editorClamp(index + direction, 0, layers.length - 1);
    if (index < 0 || index === next) return;
    [layers[index], layers[next]] = [layers[next], layers[index]];
    renderImageLayerList();
    requestImageEditorRender();
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
    imageEditorState.selectedImageLayerId = clone.id;
    renderImageLayerList();
    requestImageEditorRender();
}

function deleteSelectedImageLayer() {
    const selected = getSelectedImageLayer();
    if (!selected) return;
    const layers = imageEditorState.config.imageLayers;
    const index = layers.indexOf(selected);
    layers.splice(index, 1);
    imageEditorState.imageLayerCache.delete(selected.id);
    imageEditorState.selectedImageLayerId = layers[Math.min(index, layers.length - 1)]?.id || null;
    renderImageLayerList();
    requestImageEditorRender();
}

function initImageEditorQuickTextControls() {
    const change = (sizeDelta, rotationDelta) => {
        const layer = getSelectedTextLayer();
        if (!layer) return;
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

function addImageEditorTextLayer() {
    const image = imageEditorState.sourceImage;
    const count = imageEditorState.config.textLayers.length + 1;
    const defaults = getImageEditorTextDefaults();
    const layer = normalizeTextLayer({
        id: createTextLayerId(),
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
    imageEditorState.config.textLayers.push(layer);
    imageEditorState.selectedLayerId = layer.id;
    setImageEditorSidebarTab("text");
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
    dom.editorTextContent.focus();
    dom.editorTextContent.select();
}

function renderImageEditorLayerList() {
    dom.imageEditorLayerList.innerHTML = "";
    const base = document.createElement("div");
    base.className = "editor-layer-item base-layer";
    base.innerHTML = "<span>▣</span><div><b>Image</b><small>보정 · 필터 베이스</small></div><em>잠금</em>";
    dom.imageEditorLayerList.appendChild(base);

    [...imageEditorState.config.textLayers].reverse().forEach(layer => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "editor-layer-item text-layer-item";
        item.classList.toggle("active", layer.id === imageEditorState.selectedLayerId);
        const visibility = document.createElement("span");
        visibility.className = "layer-visibility";
        visibility.innerText = layer.visible ? "◉" : "○";
        visibility.title = layer.visible ? "레이어 숨기기" : "레이어 보이기";
        visibility.onclick = event => {
            event.stopPropagation();
            layer.visible = !layer.visible;
            renderImageEditorLayerList();
            requestImageEditorRender();
        };
        const details = document.createElement("div");
        const title = document.createElement("b");
        title.innerText = layer.name;
        const preview = document.createElement("small");
        preview.innerText = layer.text.replace(/\s+/g, " ").slice(0, 28) || "빈 텍스트";
        details.append(title, preview);
        const type = document.createElement("em");
        type.innerText = "T";
        item.append(visibility, details, type);
        item.onclick = () => selectImageEditorTextLayer(layer.id);
        dom.imageEditorLayerList.appendChild(item);
    });
    updateTextLayerActionState();
}

function selectImageEditorTextLayer(id) {
    imageEditorState.selectedLayerId = id;
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
}

function getSelectedTextLayer() {
    return imageEditorState.config?.textLayers.find(
        layer => layer.id === imageEditorState.selectedLayerId
    ) || null;
}

function moveSelectedTextLayer(direction) {
    const layers = imageEditorState.config.textLayers;
    const index = layers.findIndex(layer => layer.id === imageEditorState.selectedLayerId);
    const next = editorClamp(index + direction, 0, layers.length - 1);
    if (index < 0 || index === next) return;
    [layers[index], layers[next]] = [layers[next], layers[index]];
    renderImageEditorLayerList();
    requestImageEditorRender();
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
    imageEditorState.selectedLayerId = clone.id;
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
}

function deleteSelectedTextLayer() {
    const selected = getSelectedTextLayer();
    if (!selected) return;
    const layers = imageEditorState.config.textLayers;
    const index = layers.indexOf(selected);
    layers.splice(index, 1);
    imageEditorState.selectedLayerId = layers[Math.min(index, layers.length - 1)]?.id || null;
    renderImageEditorLayerList();
    syncTextLayerInspector();
    requestImageEditorRender();
}

function updateTextLayerActionState() {
    const selected = getSelectedTextLayer();
    const disabled = !selected;
    dom.btnMoveLayerUp.disabled = disabled;
    dom.btnMoveLayerDown.disabled = disabled;
    dom.btnDuplicateTextLayer.disabled = disabled;
    dom.btnDeleteTextLayer.disabled = disabled;
    dom.textLayerInspector.style.display = selected ? "flex" : "none";
    dom.textLayerEmpty.style.display = selected ? "none" : "block";
    dom.imageEditorTextQuickControls.style.display = selected ? "flex" : "none";
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
            if (!layer) return;
            layer[key] = parse(element.value);
            if (key === "text") {
                layer.name = element.value.replace(/\s+/g, " ").trim().slice(0, 18) || "Text";
                renderImageEditorLayerList();
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
    if (!layer) return;
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
    if (imageEditorState.bypass || imageEditorState.drawingActive || event.altKey) return;
    const point = getImageEditorSourcePoint(event);
    const selected = getSelectedTextLayer();
    const selectedBounds = selected
        ? imageEditorState.textBounds.get(selected.id)
        : null;
    const handle = selectedBounds
        ? getTextTransformHandleAtPoint(point, selectedBounds)
        : "";
    if (selected && selectedBounds && handle) {
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
    const layers = [...imageEditorState.config.textLayers].reverse();
    const hit = layers.find(layer => {
        if (!layer.visible) return false;
        const bounds = imageEditorState.textBounds.get(layer.id);
        return bounds && isPointInsideTextTransformBounds(point, bounds, 8);
    });
    if (!hit) return;
    selectImageEditorTextLayer(hit.id);
    imageEditorState.draggingLayer = true;
    imageEditorState.textTransformMode = "move";
    imageEditorState.transformStart = null;
    imageEditorState.dragOffsetX = point.x - hit.x;
    imageEditorState.dragOffsetY = point.y - hit.y;
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
    const layer = getSelectedTextLayer();
    if (!layer) return;
    const point = getImageEditorSourcePoint(event);
    const mode = imageEditorState.textTransformMode;
    const start = imageEditorState.transformStart;
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
    } else if (start && mode === "uniform") {
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
    const layer = getSelectedTextLayer();
    const bounds = layer ? imageEditorState.textBounds.get(layer.id) : null;
    const handle = bounds ? getTextTransformHandleAtPoint(point, bounds) : "";
    if (handle) {
        dom.imageEditorCanvas.dataset.transformMode = handle;
    } else if (bounds && isPointInsideTextTransformBounds(point, bounds, 8)) {
        dom.imageEditorCanvas.dataset.transformMode = "move";
    } else {
        delete dom.imageEditorCanvas.dataset.transformMode;
    }
}

function endTextLayerDrag(event) {
    imageEditorState.draggingLayer = false;
    imageEditorState.textTransformMode = "";
    imageEditorState.transformStart = null;
    dom.imageEditorCanvas.classList.remove("dragging-text");
    delete dom.imageEditorCanvas.dataset.transformMode;
    try {
        dom.imageEditorCanvas.releasePointerCapture?.(event.pointerId);
    } catch (error) {
        // Pointer may already have been released.
    }
}

function getTextTransformHandleAtPoint(point, bounds) {
    const radius = 13 / Math.max(.1, getImageEditorDisplayScale());
    const order = ["rotate", "uniform", "scaleX", "scaleY"];
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
        let resultIndex = sourceIndex;

        if (saveMode === "replace") {
            sourceItem.src = resultSrc;
            sourceItem.size = estimateDataUrlBytes(resultSrc);
            sourceItem.date = Date.now();
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
    dom.imageEditorStatus.innerText =
        `${preset} · ${adjusted ? "보정 적용" : "보정 없음"} · ` +
        `그리기 ${hasDrawing ? "적용" : "없음"} · Text ${config.textLayers.length}개`;
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
