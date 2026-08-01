/* =======================================================
   Background Removal Mask Refinement Editor
   ======================================================= */

const MASK_POLYGON_PRESETS_STORAGE = "fma_mask_polygon_presets_v1";
const MASK_POLYGON_PRESET_LIMIT = 30;

var maskEditorState = {
    open: false,
    tool: "brush",
    action: "erase",
    brushSize: 48,
    strength: 1,
    brushType: "hard",
    width: 0,
    height: 0,
    fitScale: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    drawing: false,
    panning: false,
    lastPoint: null,
    panStart: null,
    polygonPoints: [],
    polygonHoverPoint: null,
    polygonNearStart: false,
    lastPolygonPoints: [],
    hasSelection: false,
    originalCanvas: null,
    initialCanvas: null,
    initialResultLabel: "자동 결과",
    undoHistory: [],
    redoHistory: [],
    undoLimit: 8,
    textLayers: [],
    selectedTextLayerId: null,
    textBounds: new Map(),
    textInteraction: "",
    textTransformStart: null,
    workspaceClass: "",
    onApply: null,
    onCancel: null
};

const MASK_EDITOR_WORKSPACE_CLASSES = [
    "story-external-child",
    "editor-child-workspace",
    "ai-jena-child-workspace"
];

function initBackgroundMaskEditor() {
    if (!dom.bgMaskEditorModal) return;

    document.querySelectorAll(".mask-tool").forEach(button => {
        button.onclick = () => setMaskEditorTool(button.dataset.maskTool);
    });
    document.querySelectorAll(".mask-action").forEach(button => {
        button.onclick = () => setMaskEditorAction(button.dataset.maskAction);
    });

    dom.maskBrushSize.oninput = () => {
        maskEditorState.brushSize = Number(dom.maskBrushSize.value) || 48;
        dom.maskBrushSizeValue.innerText = maskEditorState.brushSize + "px";
        updateMaskEditorCursorSize();
    };
    dom.maskBrushStrength.oninput = () => {
        maskEditorState.strength = (Number(dom.maskBrushStrength.value) || 100) / 100;
        dom.maskBrushStrengthValue.innerText = Math.round(maskEditorState.strength * 100) + "%";
    };
    bindMaskRangeStepper(dom.maskBrushSize, dom.btnMaskBrushSizeDown, dom.btnMaskBrushSizeUp);
    bindMaskRangeStepper(dom.maskBrushStrength, dom.btnMaskBrushStrengthDown, dom.btnMaskBrushStrengthUp);
    dom.maskBrushType.onchange = () => {
        maskEditorState.brushType = dom.maskBrushType.value;
        dom.maskEditorCursor.style.borderRadius =
            maskEditorState.brushType === "square" ? "2px" : "50%";
    };

    dom.btnMaskPolygonComplete.onclick = finalizeMaskPolygonSelection;
    dom.btnMaskApplySelection.onclick = applyMaskSelection;
    dom.btnMaskClearSelection.onclick = clearMaskSelection;
    dom.btnSaveMaskPolygon.onclick = saveMaskPolygonPreset;
    dom.btnLoadMaskPolygon.onclick = loadSelectedMaskPolygonPreset;
    dom.btnDeleteMaskPolygon.onclick = deleteSelectedMaskPolygonPreset;
    dom.btnMaskUndo.onclick = undoMaskEditor;
    dom.btnMaskRedo.onclick = redoMaskEditor;
    dom.btnMaskReset.onclick = resetMaskEditorResult;
    dom.btnMaskEditorFit.onclick = fitMaskEditorView;
    dom.btnMaskEditorFullscreen.onclick = toggleMaskEditorFullscreen;
    dom.btnMaskEditorClose.onclick = cancelBackgroundMaskEditor;
    dom.btnMaskSkip.onclick = () => completeBackgroundMaskEditor(true);
    dom.btnMaskApply.onclick = () => completeBackgroundMaskEditor(false);
    dom.btnMaskAddText.onclick = addMaskTextLayer;
    dom.btnMaskTextUp.onclick = () => moveMaskTextLayer(1);
    dom.btnMaskTextDown.onclick = () => moveMaskTextLayer(-1);
    dom.btnMaskDuplicateText.onclick = duplicateMaskTextLayer;
    dom.btnMaskDeleteText.onclick = deleteMaskTextLayer;
    bindMaskTextInspector();

    dom.maskEditorStage.addEventListener("pointerdown", handleMaskEditorPointerDown);
    dom.maskEditorStage.addEventListener("pointermove", handleMaskEditorPointerMove);
    dom.maskEditorStage.addEventListener("pointerup", handleMaskEditorPointerUp);
    dom.maskEditorStage.addEventListener("pointercancel", handleMaskEditorPointerUp);
    dom.maskEditorStage.addEventListener("pointerleave", event => {
        dom.maskEditorCursor.style.display = "none";
        if (maskEditorState.tool === "polygon") {
            maskEditorState.polygonHoverPoint = null;
            maskEditorState.polygonNearStart = false;
            renderMaskPolygonGuide();
        }
        if (maskEditorState.drawing || maskEditorState.textInteraction) {
            handleMaskEditorPointerUp(event);
        }
    });
    dom.maskEditorStage.addEventListener("wheel", handleMaskEditorWheel, { passive: false });
    dom.maskEditorStage.addEventListener("contextmenu", event => event.preventDefault());

    document.addEventListener("fullscreenchange", () => {
        if (maskEditorState.open) requestAnimationFrame(fitMaskEditorView);
    });
    window.addEventListener("resize", () => {
        if (maskEditorState.open && !document.fullscreenElement) {
            requestAnimationFrame(fitMaskEditorView);
        }
    });

    document.addEventListener("keydown", event => {
        if (!maskEditorState.open || !(event.ctrlKey || event.metaKey) ||
            event.key.toLowerCase() !== "z" || event.altKey) return;
        const target = event.target;
        if (target?.matches?.("input, textarea, select") || target?.isContentEditable) return;
        event.preventDefault();
        if (event.shiftKey) redoMaskEditor();
        else undoMaskEditor();
    });
    refreshMaskPolygonPresetSelect();
}

async function openBackgroundMaskEditor(options) {
    const originalImage = await loadUpscaleImage(options.originalSrc);
    const resultImage = await loadUpscaleImage(options.resultSrc);
    const width = resultImage.naturalWidth;
    const height = resultImage.naturalHeight;

    maskEditorState.open = true;
    maskEditorState.width = width;
    maskEditorState.height = height;
    maskEditorState.onApply = options.onApply || null;
    maskEditorState.onCancel = options.onCancel || null;
    setMaskEditorWorkspaceClass(options.workspaceClass);
    dom.btnMaskApply.innerText = options.applyLabel || "갤러리에 추가";
    dom.btnMaskSkip.innerText = options.skipLabel || "보정 없이 사용";
    maskEditorState.initialResultLabel = options.initialResultLabel || "자동 결과";
    dom.btnMaskReset.innerText = `${maskEditorState.initialResultLabel}로 초기화`;
    maskEditorState.polygonPoints = [];
    maskEditorState.polygonHoverPoint = null;
    maskEditorState.polygonNearStart = false;
    maskEditorState.lastPolygonPoints = [];
    maskEditorState.hasSelection = false;
    maskEditorState.undoHistory = [];
    maskEditorState.redoHistory = [];
    maskEditorState.textLayers = [];
    maskEditorState.selectedTextLayerId = null;
    maskEditorState.textBounds.clear();
    const snapshotBytes = Math.max(1, width * height * 4);
    maskEditorState.undoLimit = Math.max(
        1,
        Math.min(20, Math.floor((128 * 1024 * 1024) / snapshotBytes))
    );

    [dom.maskEditorCanvas, dom.maskSelectionCanvas, dom.maskGuideCanvas, dom.maskTextCanvas].forEach(canvas => {
        canvas.width = width;
        canvas.height = height;
    });
    dom.maskEditorCanvasStack.style.width = width + "px";
    dom.maskEditorCanvasStack.style.height = height + "px";

    const workingContext = dom.maskEditorCanvas.getContext("2d", { willReadFrequently: true });
    workingContext.clearRect(0, 0, width, height);
    workingContext.drawImage(resultImage, 0, 0, width, height);

    maskEditorState.initialCanvas = document.createElement("canvas");
    maskEditorState.initialCanvas.width = width;
    maskEditorState.initialCanvas.height = height;
    maskEditorState.initialCanvas.getContext("2d").drawImage(resultImage, 0, 0, width, height);

    maskEditorState.originalCanvas = document.createElement("canvas");
    maskEditorState.originalCanvas.width = width;
    maskEditorState.originalCanvas.height = height;
    maskEditorState.originalCanvas.getContext("2d", { willReadFrequently: true })
        .drawImage(originalImage, 0, 0, width, height);

    clearMaskSelection();
    renderMaskTextLayerList();
    syncMaskTextInspector();
    renderMaskTextCanvas();
    refreshMaskPolygonPresetSelect();
    updateMaskUndoButton();
    setMaskEditorTool("brush");
    setMaskEditorAction("erase", true);
    dom.bgMaskEditorModal.style.display = "flex";
    requestAnimationFrame(fitMaskEditorView);
}

function hideBackgroundMaskEditor() {
    maskEditorState.open = false;
    maskEditorState.drawing = false;
    maskEditorState.panning = false;
    maskEditorState.undoHistory = [];
    maskEditorState.redoHistory = [];
    updateMaskUndoButton();
    dom.bgMaskEditorModal.style.display = "none";
    dom.btnMaskApply.innerText = "갤러리에 추가";
    dom.btnMaskSkip.innerText = "보정 없이 사용";
    dom.btnMaskReset.innerText = "자동 결과로 초기화";
    dom.maskEditorCursor.style.display = "none";
    setMaskEditorWorkspaceClass("");
    if (document.fullscreenElement === dom.bgMaskEditorDialog) {
        document.exitFullscreen().catch(() => {});
    }
}

function setMaskEditorWorkspaceClass(workspaceClass) {
    const nextClass = MASK_EDITOR_WORKSPACE_CLASSES.includes(workspaceClass)
        ? workspaceClass
        : "";
    MASK_EDITOR_WORKSPACE_CLASSES.forEach(className => {
        dom.bgMaskEditorModal.classList.toggle(className, className === nextClass);
    });
    maskEditorState.workspaceClass = nextClass;
}

function cancelBackgroundMaskEditor() {
    const callback = maskEditorState.onCancel;
    hideBackgroundMaskEditor();
    if (callback) callback();
}

function completeBackgroundMaskEditor(useInitialResult) {
    const sourceCanvas = useInitialResult
        ? maskEditorState.initialCanvas
        : dom.maskEditorCanvas;
    if (!sourceCanvas) return;

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = maskEditorState.width;
    outputCanvas.height = maskEditorState.height;
    outputCanvas.getContext("2d").drawImage(sourceCanvas, 0, 0);
    drawMaskTextLayersToCanvas(outputCanvas, false, false);
    const resultSrc = outputCanvas.toDataURL("image/png");
    const callback = maskEditorState.onApply;
    hideBackgroundMaskEditor();
    if (callback) callback(resultSrc);
}

function setMaskEditorTool(tool) {
    const allowed = ["brush", "paint-select", "polygon", "text"];
    maskEditorState.tool = allowed.includes(tool) ? tool : "brush";
    maskEditorState.polygonPoints = [];
    maskEditorState.polygonHoverPoint = null;
    maskEditorState.polygonNearStart = false;
    clearMaskGuideCanvas();

    document.querySelectorAll(".mask-tool").forEach(button => {
        button.classList.toggle("active", button.dataset.maskTool === maskEditorState.tool);
    });
    const selectionMode =
        maskEditorState.tool === "paint-select" || maskEditorState.tool === "polygon";
    dom.maskSelectionActions.style.display = selectionMode ? "flex" : "none";
    dom.btnMaskPolygonComplete.style.display =
        maskEditorState.tool === "polygon" ? "block" : "none";
    dom.maskPolygonPresetControls.style.display =
        maskEditorState.tool === "polygon" ? "flex" : "none";
    const textMode = maskEditorState.tool === "text";
    dom.maskPaintDirectionSection.style.display = textMode ? "none" : "flex";
    dom.maskBrushControlsSection.style.display = textMode ? "none" : "flex";
    dom.maskTextEditorPanel.style.display = textMode ? "flex" : "none";
    dom.maskTextCanvas.style.pointerEvents = "none";
    dom.maskEditorCursor.style.display = "none";
    renderMaskTextCanvas();
    updateMaskEditorStatus();
}

function setMaskEditorAction(action, preserveSelection) {
    maskEditorState.action = action === "restore" ? "restore" : "erase";
    if (!preserveSelection && (maskEditorState.hasSelection || maskEditorState.polygonPoints.length)) {
        clearMaskSelection();
    }

    document.querySelectorAll(".mask-action").forEach(button => {
        const active = button.dataset.maskAction === maskEditorState.action;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    dom.maskActionHelp.innerText = maskEditorState.action === "erase"
        ? "남아 있는 배경을 투명하게 지웁니다."
        : "잘못 지워진 부분을 원본 이미지에서 복구합니다.";
    updateMaskEditorStatus();
}

function updateMaskEditorStatus(message) {
    if (message) {
        dom.maskEditorStatus.innerText = message;
        return;
    }
    const toolNames = {
        brush: "직접 붓",
        "paint-select": "칠해서 선택",
        polygon: "다각형 선택",
        text: "텍스트 편집"
    };
    dom.maskEditorStatus.innerText = maskEditorState.tool === "text"
        ? `${toolNames.text} · 레이어 ${maskEditorState.textLayers.length}개`
        : `${toolNames[maskEditorState.tool]} · ${maskEditorState.action === "erase" ? "지우기" : "복구"}`;
}

function fitMaskEditorView() {
    if (!maskEditorState.open || !maskEditorState.width || !dom.maskEditorStage.clientWidth) return;
    const padding = 34;
    const stageWidth = Math.max(1, dom.maskEditorStage.clientWidth - padding * 2);
    const stageHeight = Math.max(1, dom.maskEditorStage.clientHeight - padding * 2);
    maskEditorState.fitScale = Math.min(
        stageWidth / maskEditorState.width,
        stageHeight / maskEditorState.height,
        1
    );
    maskEditorState.zoom = 1;
    const scale = maskEditorState.fitScale;
    maskEditorState.panX =
        (dom.maskEditorStage.clientWidth - maskEditorState.width * scale) / 2;
    maskEditorState.panY =
        (dom.maskEditorStage.clientHeight - maskEditorState.height * scale) / 2;
    updateMaskEditorTransform();
}

function updateMaskEditorTransform() {
    const scale = getMaskEditorScale();
    dom.maskEditorCanvasStack.style.transform =
        `translate(${maskEditorState.panX}px, ${maskEditorState.panY}px) scale(${scale})`;
    dom.maskEditorZoomText.innerText = `맞춤 ${Math.round(maskEditorState.zoom * 100)}%`;
    updateMaskEditorCursorSize();
    renderMaskPolygonGuide();
    renderMaskTextCanvas();
}

function getMaskEditorScale() {
    return maskEditorState.fitScale * maskEditorState.zoom;
}

function handleMaskEditorWheel(event) {
    if (!maskEditorState.open || !event.altKey) return;
    event.preventDefault();

    const stageRect = dom.maskEditorStage.getBoundingClientRect();
    const cursorX = event.clientX - stageRect.left;
    const cursorY = event.clientY - stageRect.top;
    const oldScale = getMaskEditorScale();
    const imageX = (cursorX - maskEditorState.panX) / oldScale;
    const imageY = (cursorY - maskEditorState.panY) / oldScale;

    const zoomFactor = Math.exp(-event.deltaY * .0015);
    maskEditorState.zoom = maskClamp(maskEditorState.zoom * zoomFactor, .2, 12);
    const newScale = getMaskEditorScale();
    maskEditorState.panX = cursorX - imageX * newScale;
    maskEditorState.panY = cursorY - imageY * newScale;
    updateMaskEditorTransform();
}

function handleMaskEditorPointerDown(event) {
    if (!maskEditorState.open) return;

    if (event.altKey || event.button === 1) {
        event.preventDefault();
        maskEditorState.panning = true;
        maskEditorState.panStart = {
            clientX: event.clientX,
            clientY: event.clientY,
            panX: maskEditorState.panX,
            panY: maskEditorState.panY
        };
        dom.maskEditorStage.classList.add("panning");
        dom.maskEditorStage.setPointerCapture?.(event.pointerId);
        return;
    }

    const point = getMaskEditorPoint(event);
    if (!point.inside) return;

    if (maskEditorState.tool === "text") {
        beginMaskTextInteraction(event, point);
        return;
    }

    if (maskEditorState.tool === "polygon") {
        const first = maskEditorState.polygonPoints[0];
        const closeDistance = 14 / Math.max(.001, getMaskEditorScale());
        if (first && maskEditorState.polygonPoints.length >= 3 &&
            Math.hypot(point.x - first.x, point.y - first.y) <= closeDistance) {
            finalizeMaskPolygonSelection();
            return;
        }
        maskEditorState.polygonPoints.push({ x: point.x, y: point.y });
        maskEditorState.polygonHoverPoint = point;
        renderMaskPolygonGuide();
        updateMaskUndoButton();
        if (event.detail >= 2 && maskEditorState.polygonPoints.length >= 3) {
            finalizeMaskPolygonSelection();
        }
        return;
    }

    maskEditorState.drawing = true;
    maskEditorState.lastPoint = point;
    dom.maskEditorStage.setPointerCapture?.(event.pointerId);
    if (maskEditorState.tool === "brush") {
        pushMaskUndoSnapshot(
            maskEditorState.action === "erase" ? "붓 지우기" : "붓 복구"
        );
    }
    applyMaskStroke(point, point);
}

function handleMaskEditorPointerMove(event) {
    if (!maskEditorState.open) return;
    updateMaskEditorCursor(event);

    if (maskEditorState.panning && maskEditorState.panStart) {
        maskEditorState.panX =
            maskEditorState.panStart.panX + event.clientX - maskEditorState.panStart.clientX;
        maskEditorState.panY =
            maskEditorState.panStart.panY + event.clientY - maskEditorState.panStart.clientY;
        updateMaskEditorTransform();
        return;
    }
    if (maskEditorState.tool === "text") {
        continueMaskTextInteraction(event);
        return;
    }
    if (maskEditorState.tool === "polygon") {
        const point = getMaskEditorPoint(event);
        maskEditorState.polygonHoverPoint = point.inside ? point : null;
        const first = maskEditorState.polygonPoints[0];
        const closeDistance = 14 / Math.max(.001, getMaskEditorScale());
        maskEditorState.polygonNearStart = Boolean(
            first && point.inside && maskEditorState.polygonPoints.length >= 3 &&
            Math.hypot(point.x - first.x, point.y - first.y) <= closeDistance
        );
        renderMaskPolygonGuide();
        if (maskEditorState.polygonNearStart) {
            updateMaskEditorStatus("시작점에 연결됩니다 · 클릭하면 다각형 선택이 완성됩니다.");
        } else if (maskEditorState.polygonPoints.length) {
            updateMaskEditorStatus(`${maskEditorState.polygonPoints.length + 1}번 점 위치 · 선이 현재 위치까지 연결됩니다.`);
        }
        return;
    }
    if (!maskEditorState.drawing) return;

    const point = getMaskEditorPoint(event);
    if (!point.inside) return;
    applyMaskStroke(maskEditorState.lastPoint, point);
    maskEditorState.lastPoint = point;
}

function handleMaskEditorPointerUp(event) {
    if (maskEditorState.panning) {
        maskEditorState.panning = false;
        maskEditorState.panStart = null;
        dom.maskEditorStage.classList.remove("panning");
    }
    maskEditorState.drawing = false;
    maskEditorState.lastPoint = null;
    if (maskEditorState.textInteraction) {
        maskEditorState.textInteraction = "";
        maskEditorState.textTransformStart = null;
        delete dom.maskEditorStage.dataset.textTransform;
    }
    try {
        dom.maskEditorStage.releasePointerCapture?.(event.pointerId);
    } catch (error) {
        // Pointer may already be released when leaving the editor.
    }
}

function getMaskEditorPoint(event) {
    const stageRect = dom.maskEditorStage.getBoundingClientRect();
    const scale = getMaskEditorScale();
    const x = (event.clientX - stageRect.left - maskEditorState.panX) / scale;
    const y = (event.clientY - stageRect.top - maskEditorState.panY) / scale;
    return {
        x: maskClamp(x, 0, Math.max(0, maskEditorState.width - 1)),
        y: maskClamp(y, 0, Math.max(0, maskEditorState.height - 1)),
        inside: x >= 0 && y >= 0 &&
            x < maskEditorState.width && y < maskEditorState.height
    };
}

function applyMaskStroke(fromPoint, toPoint) {
    const distance = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);
    const spacing = Math.max(1, maskEditorState.brushSize / 5);
    const steps = Math.max(1, Math.ceil(distance / spacing));

    for (let step = 0; step <= steps; step++) {
        const ratio = step / steps;
        const x = fromPoint.x + (toPoint.x - fromPoint.x) * ratio;
        const y = fromPoint.y + (toPoint.y - fromPoint.y) * ratio;
        if (maskEditorState.tool === "brush") {
            applyDirectMaskBrush(x, y);
        } else {
            paintMaskSelection(x, y);
        }
    }
}

function applyDirectMaskBrush(centerX, centerY) {
    const radius = maskEditorState.brushSize / 2;
    const left = Math.max(0, Math.floor(centerX - radius - 1));
    const top = Math.max(0, Math.floor(centerY - radius - 1));
    const right = Math.min(maskEditorState.width, Math.ceil(centerX + radius + 1));
    const bottom = Math.min(maskEditorState.height, Math.ceil(centerY + radius + 1));
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return;

    const context = dom.maskEditorCanvas.getContext("2d", { willReadFrequently: true });
    const originalContext =
        maskEditorState.originalCanvas.getContext("2d", { willReadFrequently: true });
    const current = context.getImageData(left, top, width, height);
    const original = originalContext.getImageData(left, top, width, height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const absoluteX = left + x + .5;
            const absoluteY = top + y + .5;
            const dx = absoluteX - centerX;
            const dy = absoluteY - centerY;
            let weight = 1;

            if (maskEditorState.brushType !== "square") {
                const distance = Math.hypot(dx, dy);
                if (distance > radius) continue;
                if (maskEditorState.brushType === "soft") {
                    weight = Math.max(0, 1 - distance / radius);
                    weight = weight * weight * (3 - 2 * weight);
                } else if (maskEditorState.brushType === "spread") {
                    const normalized = distance / Math.max(1, radius);
                    weight = Math.exp(-normalized * normalized * 3.2);
                } else if (maskEditorState.brushType === "watercolor") {
                    const normalized = distance / Math.max(1, radius);
                    const angle = Math.atan2(dy, dx);
                    const edge = .78 + .14 * Math.sin(angle * 9 + radius * .11) +
                        .08 * maskBrushNoise(absoluteX * .11, absoluteY * .11);
                    if (normalized > edge) continue;
                    const grain = maskBrushNoise(absoluteX * .37, absoluteY * .37);
                    weight = (.2 + (1 - normalized) * .42) * (.58 + grain * .42);
                }
            } else if (Math.abs(dx) > radius || Math.abs(dy) > radius) {
                continue;
            }

            const factor = maskEditorState.strength * weight;
            const index = (y * width + x) * 4;
            if (maskEditorState.action === "erase") {
                current.data[index + 3] =
                    Math.round(current.data[index + 3] * (1 - factor));
            } else {
                restoreMaskPixel(current.data, original.data, index, factor);
            }
        }
    }
    context.putImageData(current, left, top);
}

function maskBrushNoise(x, y) {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return value - Math.floor(value);
}

function paintMaskSelection(centerX, centerY) {
    const context = dom.maskSelectionCanvas.getContext("2d");
    const radius = maskEditorState.brushSize / 2;
    const rgb = maskEditorState.action === "erase" ? "255,67,100" : "82,241,186";
    context.fillStyle = `rgb(${rgb})`;
    if (maskEditorState.brushType === "square") {
        context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    } else if (maskEditorState.brushType === "spread") {
        const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, `rgba(${rgb},.9)`);
        gradient.addColorStop(.42, `rgba(${rgb},.55)`);
        gradient.addColorStop(1, `rgba(${rgb},0)`);
        context.fillStyle = gradient;
        context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    } else if (maskEditorState.brushType === "watercolor") {
        context.save();
        context.globalAlpha = .2;
        for (let index = 0; index < 9; index++) {
            const angle = index * 2.399963;
            const offset = radius * (.04 + (index % 3) * .035);
            context.beginPath();
            context.ellipse(
                centerX + Math.cos(angle) * offset,
                centerY + Math.sin(angle) * offset,
                radius * (.78 + (index % 4) * .035),
                radius * (.72 + ((index + 2) % 4) * .04),
                angle * .3, 0, Math.PI * 2
            );
            context.fill();
        }
        context.restore();
    } else {
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.fill();
    }
    maskEditorState.hasSelection = true;
    updateMaskUndoButton();
}

function finalizeMaskPolygonSelection() {
    if (maskEditorState.polygonPoints.length < 3) {
        updateMaskEditorStatus("다각형은 점을 3개 이상 찍어야 합니다.");
        return;
    }
    const points = maskEditorState.polygonPoints.map(point => ({ x: point.x, y: point.y }));
    paintMaskPolygonSelection(points);
    maskEditorState.lastPolygonPoints = points;
    maskEditorState.polygonPoints = [];
    maskEditorState.polygonHoverPoint = null;
    maskEditorState.polygonNearStart = false;
    clearMaskGuideCanvas();
    updateMaskUndoButton();
    updateMaskEditorStatus("다각형 선택 완료 · 선택영역 적용을 누르세요.");
}

function paintMaskPolygonSelection(points) {
    if (!Array.isArray(points) || points.length < 3) return false;
    const context = dom.maskSelectionCanvas.getContext("2d");
    context.fillStyle = maskEditorState.action === "erase" ? "#ff4364" : "#52f1ba";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();
    maskEditorState.hasSelection = true;
    return true;
}

function readMaskPolygonPresets() {
    try {
        const value = JSON.parse(localStorage.getItem(MASK_POLYGON_PRESETS_STORAGE) || "[]");
        return Array.isArray(value) ? value.filter(preset =>
            preset && typeof preset.id === "string" && Array.isArray(preset.points)
        ) : [];
    } catch (error) {
        console.warn("Polygon preset read failed:", error);
        return [];
    }
}

function writeMaskPolygonPresets(presets) {
    try {
        localStorage.setItem(
            MASK_POLYGON_PRESETS_STORAGE,
            JSON.stringify(presets.slice(0, MASK_POLYGON_PRESET_LIMIT))
        );
        return true;
    } catch (error) {
        console.warn("Polygon preset save failed:", error);
        updateMaskEditorStatus("다각형 영역을 브라우저 저장소에 저장하지 못했습니다.");
        return false;
    }
}

function refreshMaskPolygonPresetSelect(selectedId) {
    if (!dom.maskPolygonPresetSelect) return;
    const presets = readMaskPolygonPresets();
    dom.maskPolygonPresetSelect.innerHTML = "";
    if (!presets.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "저장한 영역 없음";
        dom.maskPolygonPresetSelect.appendChild(option);
    } else {
        presets.forEach(preset => {
            const option = document.createElement("option");
            option.value = preset.id;
            option.textContent = `${preset.name} · ${preset.points.length}점`;
            dom.maskPolygonPresetSelect.appendChild(option);
        });
        dom.maskPolygonPresetSelect.value =
            presets.some(preset => preset.id === selectedId) ? selectedId : presets[0].id;
    }
    const available = presets.length > 0;
    dom.btnLoadMaskPolygon.disabled = !available;
    dom.btnDeleteMaskPolygon.disabled = !available;
    renderMaskPolygonPresetList(presets, dom.maskPolygonPresetSelect.value);
}

function bindMaskRangeStepper(input, decreaseButton, increaseButton) {
    if (!input || !decreaseButton || !increaseButton) return;
    const changeBy = delta => {
        const min = Number(input.min);
        const max = Number(input.max);
        const current = Number(input.value) || 0;
        input.value = String(maskClamp(current + delta, min, max));
        input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    decreaseButton.onclick = () => changeBy(-1);
    increaseButton.onclick = () => changeBy(1);
}

function renderMaskPolygonPresetList(presets, selectedId) {
    if (!dom.maskPolygonPresetList) return;
    dom.maskPolygonPresetList.innerHTML = "";
    if (!presets.length) {
        const empty = document.createElement("div");
        empty.className = "mask-polygon-preset-empty";
        empty.textContent = "저장된 다각형 영역이 없습니다.";
        dom.maskPolygonPresetList.appendChild(empty);
        return;
    }
    presets.forEach(preset => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mask-polygon-preset-item";
        button.classList.toggle("active", preset.id === selectedId);
        button.dataset.presetId = preset.id;
        button.innerHTML = `<span>${escapeHtml(preset.name)}</span><small>${preset.points.length}점 · 불러오기</small>`;
        button.onclick = () => {
            dom.maskPolygonPresetSelect.value = preset.id;
            loadSelectedMaskPolygonPreset();
            renderMaskPolygonPresetList(presets, preset.id);
        };
        dom.maskPolygonPresetList.appendChild(button);
    });
}

function saveMaskPolygonPreset() {
    const points = maskEditorState.polygonPoints.length >= 3
        ? maskEditorState.polygonPoints
        : maskEditorState.lastPolygonPoints;
    if (!Array.isArray(points) || points.length < 3) {
        updateMaskEditorStatus("저장할 다각형을 먼저 3점 이상 지정하세요.");
        return;
    }
    const name = dom.maskPolygonPresetName.value.trim();
    if (!name) {
        updateMaskEditorStatus("저장할 다각형 영역의 이름을 입력하세요.");
        dom.maskPolygonPresetName.focus();
        return;
    }

    const presets = readMaskPolygonPresets();
    const existing = presets.find(preset => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const id = existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const preset = {
        id: id,
        name: name,
        updatedAt: Date.now(),
        points: points.map(point => ({
            x: maskClamp(point.x / Math.max(1, maskEditorState.width), 0, 1),
            y: maskClamp(point.y / Math.max(1, maskEditorState.height), 0, 1)
        }))
    };
    const nextPresets = [preset, ...presets.filter(item => item.id !== id)];
    if (!writeMaskPolygonPresets(nextPresets)) return;
    dom.maskPolygonPresetName.value = "";
    refreshMaskPolygonPresetSelect(id);
    updateMaskEditorStatus(`다각형 영역 '${name}' 저장 완료`);
}

function loadSelectedMaskPolygonPreset() {
    const selectedId = dom.maskPolygonPresetSelect.value;
    const preset = readMaskPolygonPresets().find(item => item.id === selectedId);
    if (!preset || preset.points.length < 3) {
        updateMaskEditorStatus("불러올 다각형 영역을 선택하세요.");
        return;
    }
    const points = preset.points.map(point => ({
        x: maskClamp(Number(point.x) * maskEditorState.width, 0, maskEditorState.width - 1),
        y: maskClamp(Number(point.y) * maskEditorState.height, 0, maskEditorState.height - 1)
    }));
    clearMaskSelection();
    paintMaskPolygonSelection(points);
    maskEditorState.lastPolygonPoints = points;
    maskEditorState.polygonPoints = points.map(point => ({ ...point }));
    maskEditorState.polygonHoverPoint = null;
    maskEditorState.polygonNearStart = false;
    setMaskEditorTool("polygon");
    renderMaskPolygonGuide();
    updateMaskUndoButton();
    updateMaskEditorStatus(`'${preset.name}' 영역을 다시 활성화했습니다 · 이동하거나 선택영역 적용을 누르세요.`);
}

function deleteSelectedMaskPolygonPreset() {
    const selectedId = dom.maskPolygonPresetSelect.value;
    if (!selectedId) return;
    const presets = readMaskPolygonPresets();
    const preset = presets.find(item => item.id === selectedId);
    if (!preset) return;
    if (!confirm(`저장한 다각형 영역 '${preset.name}'을 삭제할까요?`)) return;
    if (!writeMaskPolygonPresets(presets.filter(item => item.id !== selectedId))) return;
    refreshMaskPolygonPresetSelect();
    updateMaskEditorStatus(`'${preset.name}' 영역을 삭제했습니다.`);
}

function renderMaskPolygonGuide() {
    clearMaskGuideCanvas();
    if (!maskEditorState.polygonPoints.length) return;

    const context = dom.maskGuideCanvas.getContext("2d");
    const visualScale = Math.max(.001, getMaskEditorScale());
    const color = maskEditorState.action === "erase" ? "#ff5d72" : "#77f5d1";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2 / visualScale;
    context.setLineDash([7 / visualScale, 5 / visualScale]);
    context.beginPath();
    context.moveTo(maskEditorState.polygonPoints[0].x, maskEditorState.polygonPoints[0].y);
    maskEditorState.polygonPoints.slice(1).forEach(point => context.lineTo(point.x, point.y));
    if (maskEditorState.polygonHoverPoint) {
        const target = maskEditorState.polygonNearStart
            ? maskEditorState.polygonPoints[0]
            : maskEditorState.polygonHoverPoint;
        context.lineTo(target.x, target.y);
    }
    context.stroke();
    context.setLineDash([]);

    if (maskEditorState.polygonPoints.length >= 3) {
        context.save();
        context.fillStyle = maskEditorState.action === "erase"
            ? "rgba(255, 67, 100, .18)"
            : "rgba(82, 241, 186, .18)";
        context.beginPath();
        context.moveTo(maskEditorState.polygonPoints[0].x, maskEditorState.polygonPoints[0].y);
        maskEditorState.polygonPoints.slice(1).forEach(point => context.lineTo(point.x, point.y));
        if (maskEditorState.polygonNearStart) context.closePath();
        context.fill();
        context.restore();
    }

    maskEditorState.polygonPoints.forEach((point, index) => {
        context.beginPath();
        context.arc(point.x, point.y,
            (index === 0 && maskEditorState.polygonNearStart ? 8 : 5) / visualScale,
            0, Math.PI * 2);
        context.fill();
        context.save();
        context.font = `bold ${11 / visualScale}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.lineWidth = 3 / visualScale;
        context.strokeStyle = "rgba(5, 9, 14, .95)";
        context.fillStyle = "#ffffff";
        const labelY = point.y - 13 / visualScale;
        context.strokeText(String(index + 1), point.x, labelY);
        context.fillText(String(index + 1), point.x, labelY);
        context.restore();
    });

    if (maskEditorState.polygonNearStart) {
        const first = maskEditorState.polygonPoints[0];
        context.save();
        context.strokeStyle = "#fff36f";
        context.lineWidth = 3 / visualScale;
        context.beginPath();
        context.arc(first.x, first.y, 13 / visualScale, 0, Math.PI * 2);
        context.stroke();
        context.restore();
    }
}

function clearMaskGuideCanvas() {
    const context = dom.maskGuideCanvas.getContext("2d");
    context.clearRect(0, 0, maskEditorState.width, maskEditorState.height);
}

function clearMaskSelection() {
    if (!dom.maskSelectionCanvas) return;
    dom.maskSelectionCanvas.getContext("2d")
        .clearRect(0, 0, maskEditorState.width, maskEditorState.height);
    maskEditorState.hasSelection = false;
    maskEditorState.polygonPoints = [];
    maskEditorState.polygonHoverPoint = null;
    maskEditorState.polygonNearStart = false;
    clearMaskGuideCanvas();
    updateMaskUndoButton();
    updateMaskEditorStatus();
}

function applyMaskSelection() {
    if (maskEditorState.polygonPoints.length >= 3) finalizeMaskPolygonSelection();
    if (!maskEditorState.hasSelection) {
        updateMaskEditorStatus("먼저 칠하거나 다각형으로 영역을 선택하세요.");
        return;
    }

    pushMaskUndoSnapshot(
        maskEditorState.action === "erase" ? "선택영역 지우기" : "선택영역 복구"
    );
    const workingContext =
        dom.maskEditorCanvas.getContext("2d", { willReadFrequently: true });
    const originalContext =
        maskEditorState.originalCanvas.getContext("2d", { willReadFrequently: true });
    const selectionContext =
        dom.maskSelectionCanvas.getContext("2d", { willReadFrequently: true });
    const current =
        workingContext.getImageData(0, 0, maskEditorState.width, maskEditorState.height);
    const original =
        originalContext.getImageData(0, 0, maskEditorState.width, maskEditorState.height);
    const selection =
        selectionContext.getImageData(0, 0, maskEditorState.width, maskEditorState.height);

    for (let index = 0; index < current.data.length; index += 4) {
        const selected = selection.data[index + 3] / 255;
        if (selected <= 0) continue;
        const factor = selected * maskEditorState.strength;
        if (maskEditorState.action === "erase") {
            current.data[index + 3] =
                Math.round(current.data[index + 3] * (1 - factor));
        } else {
            restoreMaskPixel(current.data, original.data, index, factor);
        }
    }

    workingContext.putImageData(current, 0, 0);
    clearMaskSelection();
    updateMaskEditorStatus("선택영역 편집을 적용했습니다.");
}

function resetMaskEditorResult() {
    if (!maskEditorState.initialCanvas) return;
    pushMaskUndoSnapshot("자동 결과 초기화");
    const context = dom.maskEditorCanvas.getContext("2d");
    context.clearRect(0, 0, maskEditorState.width, maskEditorState.height);
    context.drawImage(maskEditorState.initialCanvas, 0, 0);
    maskEditorState.textLayers = [];
    maskEditorState.selectedTextLayerId = null;
    renderMaskTextLayerList();
    syncMaskTextInspector();
    renderMaskTextCanvas();
    clearMaskSelection();
    updateMaskEditorStatus(`${maskEditorState.initialResultLabel}로 초기화했습니다.`);
}

function pushMaskUndoSnapshot(label) {
    if (!maskEditorState.open || !maskEditorState.width || !maskEditorState.height) return;
    try {
        pushMaskHistoryEntry(
            maskEditorState.undoHistory,
            captureMaskEditorSnapshot(label)
        );
        maskEditorState.redoHistory = [];
        updateMaskUndoButton();
    } catch (error) {
        console.warn("Undo snapshot unavailable:", error);
        updateMaskEditorStatus("메모리 부족으로 이 작업의 Undo 기록을 만들지 못했습니다.");
    }
}

function undoMaskEditor() {
    if (!maskEditorState.open) return;
    maskEditorState.drawing = false;
    maskEditorState.lastPoint = null;

    if (maskEditorState.polygonPoints.length > 0) {
        maskEditorState.polygonPoints.pop();
        renderMaskPolygonGuide();
        updateMaskUndoButton();
        updateMaskEditorStatus("마지막 다각형 점을 취소했습니다.");
        return;
    }

    if (maskEditorState.hasSelection) {
        clearMaskSelection();
        updateMaskEditorStatus("적용 전 선택영역을 취소했습니다.");
        return;
    }

    const snapshot = maskEditorState.undoHistory.pop();
    if (!snapshot) {
        updateMaskEditorStatus("되돌릴 편집 기록이 없습니다.");
        updateMaskUndoButton();
        return;
    }

    pushMaskHistoryEntry(
        maskEditorState.redoHistory,
        captureMaskEditorSnapshot(snapshot.label)
    );
    restoreMaskEditorSnapshot(snapshot);
    updateMaskUndoButton();
    updateMaskEditorStatus(`${snapshot.label} 작업을 되돌렸습니다.`);
}

function redoMaskEditor() {
    if (!maskEditorState.open) return;
    maskEditorState.drawing = false;
    maskEditorState.lastPoint = null;

    const snapshot = maskEditorState.redoHistory.pop();
    if (!snapshot) {
        updateMaskEditorStatus("다시 실행할 편집 기록이 없습니다.");
        updateMaskUndoButton();
        return;
    }

    pushMaskHistoryEntry(
        maskEditorState.undoHistory,
        captureMaskEditorSnapshot(snapshot.label)
    );
    restoreMaskEditorSnapshot(snapshot);
    updateMaskUndoButton();
    updateMaskEditorStatus(`${snapshot.label} 작업을 다시 실행했습니다.`);
}

function captureMaskEditorSnapshot(label) {
    const context = dom.maskEditorCanvas.getContext("2d", { willReadFrequently: true });
    return {
        imageData: context.getImageData(
            0, 0, maskEditorState.width, maskEditorState.height
        ),
        textLayers: cloneMaskTextLayers(),
        selectedTextLayerId: maskEditorState.selectedTextLayerId,
        label: label || "편집"
    };
}

function restoreMaskEditorSnapshot(snapshot) {
    if (snapshot.imageData) {
        dom.maskEditorCanvas.getContext("2d").putImageData(snapshot.imageData, 0, 0);
    }
    maskEditorState.textLayers = (snapshot.textLayers || []).map(normalizeTextLayer);
    maskEditorState.selectedTextLayerId = snapshot.selectedTextLayerId || null;
    renderMaskTextLayerList();
    syncMaskTextInspector();
    renderMaskTextCanvas();
    clearMaskSelection();
}

function pushMaskHistoryEntry(history, snapshot) {
    history.push(snapshot);
    while (history.length > maskEditorState.undoLimit) history.shift();
}

function updateMaskUndoButton() {
    if (!dom.btnMaskUndo) return;
    const pendingSelection =
        maskEditorState.hasSelection || maskEditorState.polygonPoints.length > 0;
    const count = maskEditorState.undoHistory.length;
    dom.btnMaskUndo.disabled = !maskEditorState.open || (!pendingSelection && count === 0);
    dom.btnMaskUndo.innerHTML =
        `↶ Undo <kbd>Ctrl+Z</kbd>${count > 0 ? ` <span>${count}</span>` : ""}`;
    const redoCount = maskEditorState.redoHistory.length;
    dom.btnMaskRedo.disabled = !maskEditorState.open || redoCount === 0;
    dom.btnMaskRedo.innerHTML =
        `↷ Redo <kbd>Ctrl+Shift+Z</kbd>${redoCount > 0 ? ` <span>${redoCount}</span>` : ""}`;
}

function updateMaskEditorCursor(event) {
    if (maskEditorState.panning || event.altKey ||
        maskEditorState.tool === "polygon" || maskEditorState.tool === "text") {
        dom.maskEditorCursor.style.display = "none";
        return;
    }
    const stageRect = dom.maskEditorStage.getBoundingClientRect();
    const point = getMaskEditorPoint(event);
    if (!point.inside) {
        dom.maskEditorCursor.style.display = "none";
        return;
    }
    dom.maskEditorCursor.style.display = "block";
    dom.maskEditorCursor.style.left = event.clientX - stageRect.left + "px";
    dom.maskEditorCursor.style.top = event.clientY - stageRect.top + "px";
    dom.maskEditorCursor.style.borderColor =
        maskEditorState.action === "erase" ? "#ff7187" : "#77f5d1";
    updateMaskEditorCursorSize();
}

function updateMaskEditorCursorSize() {
    if (!dom.maskEditorCursor) return;
    const size = Math.max(3, maskEditorState.brushSize * getMaskEditorScale());
    dom.maskEditorCursor.style.width = size + "px";
    dom.maskEditorCursor.style.height = size + "px";
}

function cloneMaskTextLayers() {
    return JSON.parse(JSON.stringify(maskEditorState.textLayers || []));
}

function pushMaskTextUndoSnapshot(label) {
    pushMaskUndoSnapshot(label || "텍스트 편집");
}

function addMaskTextLayer() {
    pushMaskTextUndoSnapshot("텍스트 추가");
    const count = maskEditorState.textLayers.length + 1;
    const layer = normalizeTextLayer({
        id: createTextLayerId(),
        name: `Text ${count}`,
        text: count === 1 ? "새 텍스트" : `새 텍스트 ${count}`,
        x: maskEditorState.width / 2,
        y: maskEditorState.height / 2,
        align: "center",
        fontSize: Math.max(24, Math.round(Math.min(maskEditorState.width, maskEditorState.height) * .065)),
        shadow: {
            enabled: true,
            blur: 10,
            distance: 6,
            angle: 45,
            color: "#000000",
            opacity: .65
        }
    });
    maskEditorState.textLayers.push(layer);
    maskEditorState.selectedTextLayerId = layer.id;
    renderMaskTextLayerList();
    syncMaskTextInspector();
    renderMaskTextCanvas();
    updateMaskEditorStatus();
    dom.maskTextContent.focus();
    dom.maskTextContent.select();
}

function getSelectedMaskTextLayer() {
    return maskEditorState.textLayers.find(
        layer => layer.id === maskEditorState.selectedTextLayerId
    ) || null;
}

function selectMaskTextLayer(id) {
    maskEditorState.selectedTextLayerId = id;
    renderMaskTextLayerList();
    syncMaskTextInspector();
    renderMaskTextCanvas();
}

function duplicateMaskTextLayer() {
    const source = getSelectedMaskTextLayer();
    if (!source) return;
    pushMaskTextUndoSnapshot("텍스트 복제");
    const clone = normalizeTextLayer(JSON.parse(JSON.stringify(source)));
    clone.id = createTextLayerId();
    clone.name = source.name + " Copy";
    clone.x += 20;
    clone.y += 20;
    maskEditorState.textLayers.push(clone);
    maskEditorState.selectedTextLayerId = clone.id;
    renderMaskTextLayerList();
    syncMaskTextInspector();
    renderMaskTextCanvas();
    updateMaskEditorStatus();
}

function moveMaskTextLayer(direction) {
    const index = maskEditorState.textLayers.findIndex(
        layer => layer.id === maskEditorState.selectedTextLayerId
    );
    if (index < 0) return;
    const next = maskClamp(index + direction, 0, maskEditorState.textLayers.length - 1);
    if (next === index) return;
    pushMaskTextUndoSnapshot("텍스트 레이어 순서");
    [
        maskEditorState.textLayers[index],
        maskEditorState.textLayers[next]
    ] = [
        maskEditorState.textLayers[next],
        maskEditorState.textLayers[index]
    ];
    renderMaskTextLayerList();
    renderMaskTextCanvas();
}

function deleteMaskTextLayer() {
    const index = maskEditorState.textLayers.findIndex(
        layer => layer.id === maskEditorState.selectedTextLayerId
    );
    if (index < 0) return;
    pushMaskTextUndoSnapshot("텍스트 삭제");
    maskEditorState.textLayers.splice(index, 1);
    maskEditorState.selectedTextLayerId =
        maskEditorState.textLayers[Math.min(index, maskEditorState.textLayers.length - 1)]?.id || null;
    renderMaskTextLayerList();
    syncMaskTextInspector();
    renderMaskTextCanvas();
    updateMaskEditorStatus();
}

function renderMaskTextLayerList() {
    dom.maskTextLayerList.innerHTML = "";
    [...maskEditorState.textLayers].reverse().forEach(layer => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "mask-text-layer-item";
        item.classList.toggle("active", layer.id === maskEditorState.selectedTextLayerId);
        item.innerHTML = `<b>T</b><span></span>`;
        item.querySelector("span").innerText =
            layer.text.replace(/\s+/g, " ").slice(0, 24) || "빈 텍스트";
        item.onclick = () => selectMaskTextLayer(layer.id);
        dom.maskTextLayerList.appendChild(item);
    });
    const disabled = !getSelectedMaskTextLayer();
    dom.btnMaskTextUp.disabled = disabled;
    dom.btnMaskTextDown.disabled = disabled;
    dom.btnMaskDuplicateText.disabled = disabled;
    dom.btnMaskDeleteText.disabled = disabled;
}

function bindMaskTextInspector() {
    const bindings = [
        [dom.maskTextContent, "text", value => value],
        [dom.maskTextFont, "fontFamily", value => value],
        [dom.maskTextSize, "fontSize", value => maskClamp(Number(value) || 64, 8, 500)],
        [dom.maskTextColor, "color", value => value],
        [dom.maskTextOpacity, "opacity", value => maskClamp((Number(value) || 0) / 100, 0, 1)],
        [dom.maskTextX, "x", value => Number(value) || 0],
        [dom.maskTextY, "y", value => Number(value) || 0],
        [dom.maskTextWeight, "fontWeight", value => value],
        [dom.maskTextAlign, "align", value => value],
        [dom.maskTextRotation, "rotation", value => normalizeEditorRotation(value)],
        [dom.maskTextScaleX, "scaleX", value => maskClamp((Number(value) || 100) / 100, .1, 10)],
        [dom.maskTextScaleY, "scaleY", value => maskClamp((Number(value) || 100) / 100, .1, 10)]
    ];
    bindings.forEach(([element, key, parse]) => {
        element.onfocus = () => {
            if (getSelectedMaskTextLayer()) pushMaskTextUndoSnapshot("텍스트 속성");
        };
        element.oninput = () => {
            const layer = getSelectedMaskTextLayer();
            if (!layer) return;
            layer[key] = parse(element.value);
            if (key === "text") {
                layer.name = layer.text.replace(/\s+/g, " ").trim().slice(0, 18) || "Text";
                renderMaskTextLayerList();
            }
            renderMaskTextCanvas();
        };
    });
    dom.maskTextShadowEnabled.onpointerdown = () => {
        if (getSelectedMaskTextLayer()) pushMaskTextUndoSnapshot("텍스트 그림자");
    };
    dom.maskTextShadowEnabled.onchange = updateMaskTextShadow;
    [
        dom.maskTextShadowBlur,
        dom.maskTextShadowDistance,
        dom.maskTextShadowAngle,
        dom.maskTextShadowColor,
        dom.maskTextShadowOpacity
    ].forEach(element => {
        element.onfocus = () => {
            if (getSelectedMaskTextLayer()) pushMaskTextUndoSnapshot("텍스트 그림자");
        };
        element.oninput = updateMaskTextShadow;
    });
}

function updateMaskTextShadow() {
    const layer = getSelectedMaskTextLayer();
    if (!layer) return;
    layer.shadow.enabled = dom.maskTextShadowEnabled.checked;
    layer.shadow.blur = maskClamp(Number(dom.maskTextShadowBlur.value) || 0, 0, 100);
    layer.shadow.distance = maskClamp(Number(dom.maskTextShadowDistance.value) || 0, 0, 200);
    layer.shadow.angle = maskClamp(Number(dom.maskTextShadowAngle.value) || 0, 0, 360);
    layer.shadow.color = dom.maskTextShadowColor.value;
    layer.shadow.opacity = maskClamp(Number(dom.maskTextShadowOpacity.value) / 100, 0, 1);
    renderMaskTextCanvas();
}

function syncMaskTextInspector() {
    const layer = getSelectedMaskTextLayer();
    dom.maskTextInspector.style.display = layer ? "flex" : "none";
    renderMaskTextLayerList();
    if (!layer) return;
    dom.maskTextContent.value = layer.text;
    setEditorSelectValue(dom.maskTextFont, layer.fontFamily);
    dom.maskTextSize.value = Math.round(layer.fontSize);
    dom.maskTextColor.value = layer.color;
    dom.maskTextOpacity.value = Math.round(layer.opacity * 100);
    dom.maskTextX.value = Math.round(layer.x);
    dom.maskTextY.value = Math.round(layer.y);
    setEditorSelectValue(dom.maskTextWeight, layer.fontWeight);
    setEditorSelectValue(dom.maskTextAlign, layer.align);
    dom.maskTextRotation.value = Math.round(layer.rotation);
    dom.maskTextScaleX.value = Math.round(layer.scaleX * 100);
    dom.maskTextScaleY.value = Math.round(layer.scaleY * 100);
    dom.maskTextShadowEnabled.checked = layer.shadow.enabled;
    dom.maskTextShadowBlur.value = Math.round(layer.shadow.blur);
    dom.maskTextShadowDistance.value = Math.round(layer.shadow.distance);
    dom.maskTextShadowAngle.value = Math.round(layer.shadow.angle);
    dom.maskTextShadowColor.value = layer.shadow.color;
    dom.maskTextShadowOpacity.value = Math.round(layer.shadow.opacity * 100);
}

function renderMaskTextCanvas() {
    if (!dom.maskTextCanvas) return;
    drawMaskTextLayersToCanvas(
        dom.maskTextCanvas,
        maskEditorState.tool === "text",
        true
    );
}

function drawMaskTextLayersToCanvas(canvas, showSelection, clearCanvas) {
    const context = canvas.getContext("2d");
    if (clearCanvas !== false) context.clearRect(0, 0, canvas.width, canvas.height);
    maskEditorState.textBounds.clear();
    maskEditorState.textLayers.forEach(layer => {
        if (!layer.visible) return;
        const size = layer.fontSize;
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
        let left = layer.x;
        if (layer.align === "center") left -= width / 2;
        else if (layer.align === "right") left -= width;
        const centerX = left + width / 2;
        const centerY = layer.y + height / 2;
        context.translate(centerX, centerY);
        context.rotate(layer.rotation * Math.PI / 180);
        context.scale(layer.scaleX, layer.scaleY);
        if (layer.shadow.enabled) {
            const radians = layer.shadow.angle * Math.PI / 180;
            context.shadowOffsetX = Math.cos(radians) * layer.shadow.distance;
            context.shadowOffsetY = Math.sin(radians) * layer.shadow.distance;
            context.shadowBlur = layer.shadow.blur;
            context.shadowColor = editorHexToRgba(layer.shadow.color, layer.shadow.opacity);
        }
        lines.forEach((line, index) => {
            context.fillText(line, layer.x - centerX, layer.y + index * lineHeight - centerY);
        });
        context.restore();
        const bounds = createMaskTextBounds(
            centerX, centerY, width, height, layer.scaleX, layer.scaleY, layer.rotation
        );
        maskEditorState.textBounds.set(layer.id, bounds);
        if (showSelection && layer.id === maskEditorState.selectedTextLayerId) {
            drawMaskTextSelection(context, bounds);
        }
    });
}

function createMaskTextBounds(centerX, centerY, width, height, scaleX, scaleY, rotation) {
    const radians = rotation * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const halfWidth = width * scaleX / 2;
    const halfHeight = height * scaleY / 2;
    const transform = (dx, dy) => ({
        x: centerX + dx * cosine - dy * sine,
        y: centerY + dx * sine + dy * cosine
    });
    const gap = 30 / Math.max(.05, getMaskEditorScale());
    return {
        centerX, centerY, width, height, halfWidth, halfHeight, rotation,
        corners: [
            transform(-halfWidth, -halfHeight),
            transform(halfWidth, -halfHeight),
            transform(halfWidth, halfHeight),
            transform(-halfWidth, halfHeight)
        ],
        handles: {
            scaleX: transform(halfWidth, 0),
            scaleY: transform(0, halfHeight),
            uniform: transform(halfWidth, halfHeight),
            rotate: transform(0, -halfHeight - gap)
        }
    };
}

function drawMaskTextSelection(context, bounds) {
    const scale = Math.max(.05, getMaskEditorScale());
    const radius = 7 / scale;
    context.save();
    context.globalAlpha = 1;
    context.strokeStyle = "#7fddff";
    context.lineWidth = 1.5 / scale;
    context.setLineDash([5 / scale, 4 / scale]);
    context.beginPath();
    context.moveTo(bounds.corners[0].x, bounds.corners[0].y);
    bounds.corners.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.closePath();
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(
        (bounds.corners[0].x + bounds.corners[1].x) / 2,
        (bounds.corners[0].y + bounds.corners[1].y) / 2
    );
    context.lineTo(bounds.handles.rotate.x, bounds.handles.rotate.y);
    context.stroke();
    Object.entries(bounds.handles).forEach(([type, point]) => {
        context.beginPath();
        context.arc(point.x, point.y, type === "rotate" ? radius * 1.15 : radius, 0, Math.PI * 2);
        context.fillStyle = type === "rotate" ? "#a78bfa" : "#101722";
        context.fill();
        context.strokeStyle = type === "rotate" ? "#ffffff" : "#7fddff";
        context.stroke();
        context.fillStyle = "#ffffff";
        context.font = `bold ${10 / scale}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText({ scaleX: "↔", scaleY: "↕", uniform: "↘", rotate: "↻" }[type], point.x, point.y);
    });
    context.restore();
}

function beginMaskTextInteraction(event, point) {
    const selected = getSelectedMaskTextLayer();
    const selectedBounds = selected ? maskEditorState.textBounds.get(selected.id) : null;
    const handle = selectedBounds ? getMaskTextHandle(point, selectedBounds) : "";
    if (selected && selectedBounds && handle) {
        pushMaskTextUndoSnapshot("텍스트 변형");
        maskEditorState.textInteraction = handle;
        maskEditorState.textTransformStart = {
            rotation: selected.rotation,
            scaleX: selected.scaleX,
            scaleY: selected.scaleY,
            bounds: selectedBounds,
            pointerAngle: Math.atan2(point.y - selectedBounds.centerY, point.x - selectedBounds.centerX),
            pointerDistance: Math.max(1, Math.hypot(
                point.x - selectedBounds.centerX,
                point.y - selectedBounds.centerY
            ))
        };
    } else {
        const hit = [...maskEditorState.textLayers].reverse().find(layer => {
            const bounds = maskEditorState.textBounds.get(layer.id);
            return bounds && isPointInsideMaskText(point, bounds, 8 / getMaskEditorScale());
        });
        if (!hit) return;
        selectMaskTextLayer(hit.id);
        pushMaskTextUndoSnapshot("텍스트 이동");
        maskEditorState.textInteraction = "move";
        maskEditorState.textTransformStart = {
            offsetX: point.x - hit.x,
            offsetY: point.y - hit.y
        };
    }
    dom.maskEditorStage.dataset.textTransform = maskEditorState.textInteraction;
    dom.maskEditorStage.setPointerCapture?.(event.pointerId);
    event.preventDefault();
}

function continueMaskTextInteraction(event) {
    const point = getMaskEditorPoint(event);
    if (!point.inside) return;
    if (!maskEditorState.textInteraction) {
        updateMaskTextHoverCursor(point);
        return;
    }
    const layer = getSelectedMaskTextLayer();
    const start = maskEditorState.textTransformStart;
    if (!layer || !start) return;
    const mode = maskEditorState.textInteraction;
    if (mode === "move") {
        layer.x = maskClamp(point.x - start.offsetX, 0, maskEditorState.width);
        layer.y = maskClamp(point.y - start.offsetY, 0, maskEditorState.height);
        dom.maskTextX.value = Math.round(layer.x);
        dom.maskTextY.value = Math.round(layer.y);
    } else if (mode === "rotate") {
        const angle = Math.atan2(point.y - start.bounds.centerY, point.x - start.bounds.centerX);
        layer.rotation = normalizeEditorRotation(
            start.rotation + (angle - start.pointerAngle) * 180 / Math.PI
        );
        dom.maskTextRotation.value = Math.round(layer.rotation);
    } else if (mode === "scaleX" || mode === "scaleY") {
        const local = maskTextPointToLocal(point, start.bounds);
        if (mode === "scaleX") {
            layer.scaleX = maskClamp(Math.abs(local.x) / Math.max(1, start.bounds.width / 2), .1, 10);
            dom.maskTextScaleX.value = Math.round(layer.scaleX * 100);
        } else {
            layer.scaleY = maskClamp(Math.abs(local.y) / Math.max(1, start.bounds.height / 2), .1, 10);
            dom.maskTextScaleY.value = Math.round(layer.scaleY * 100);
        }
    } else if (mode === "uniform") {
        const distance = Math.hypot(point.x - start.bounds.centerX, point.y - start.bounds.centerY);
        const factor = distance / start.pointerDistance;
        layer.scaleX = maskClamp(start.scaleX * factor, .1, 10);
        layer.scaleY = maskClamp(start.scaleY * factor, .1, 10);
        dom.maskTextScaleX.value = Math.round(layer.scaleX * 100);
        dom.maskTextScaleY.value = Math.round(layer.scaleY * 100);
    }
    renderMaskTextCanvas();
    event.preventDefault();
}

function getMaskTextHandle(point, bounds) {
    const radius = 13 / Math.max(.05, getMaskEditorScale());
    return ["rotate", "uniform", "scaleX", "scaleY"].find(name => {
        const handle = bounds.handles[name];
        return Math.hypot(point.x - handle.x, point.y - handle.y) <= radius;
    }) || "";
}

function maskTextPointToLocal(point, bounds) {
    const radians = -bounds.rotation * Math.PI / 180;
    const dx = point.x - bounds.centerX;
    const dy = point.y - bounds.centerY;
    return {
        x: dx * Math.cos(radians) - dy * Math.sin(radians),
        y: dx * Math.sin(radians) + dy * Math.cos(radians)
    };
}

function isPointInsideMaskText(point, bounds, padding) {
    const local = maskTextPointToLocal(point, bounds);
    return Math.abs(local.x) <= bounds.halfWidth + padding &&
        Math.abs(local.y) <= bounds.halfHeight + padding;
}

function updateMaskTextHoverCursor(point) {
    const layer = getSelectedMaskTextLayer();
    const bounds = layer ? maskEditorState.textBounds.get(layer.id) : null;
    const handle = bounds ? getMaskTextHandle(point, bounds) : "";
    if (handle) dom.maskEditorStage.dataset.textTransform = handle;
    else if (bounds && isPointInsideMaskText(point, bounds, 8 / getMaskEditorScale())) {
        dom.maskEditorStage.dataset.textTransform = "move";
    } else {
        delete dom.maskEditorStage.dataset.textTransform;
    }
}

async function toggleMaskEditorFullscreen() {
    try {
        if (document.fullscreenElement === dom.bgMaskEditorDialog) {
            await document.exitFullscreen();
        } else if (dom.bgMaskEditorDialog.requestFullscreen) {
            await dom.bgMaskEditorDialog.requestFullscreen();
        }
    } catch (error) {
        console.warn("Fullscreen unavailable:", error);
    }
}

function blendMaskValue(currentValue, originalValue, factor) {
    return Math.round(currentValue + (originalValue - currentValue) * factor);
}

function restoreMaskPixel(current, original, index, factor) {
    const currentAlpha = current[index + 3];
    const originalAlpha = original[index + 3];
    if (originalAlpha < currentAlpha) return;
    current[index] = blendMaskValue(current[index], original[index], factor);
    current[index + 1] = blendMaskValue(current[index + 1], original[index + 1], factor);
    current[index + 2] = blendMaskValue(current[index + 2], original[index + 2], factor);
    current[index + 3] = blendMaskValue(currentAlpha, originalAlpha, factor);
}

function maskClamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

document.addEventListener("DOMContentLoaded", initBackgroundMaskEditor);
