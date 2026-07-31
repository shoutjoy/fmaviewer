/* =======================================================
   AI Jena · Prompt/Mask based Gemini image chat editor
   ======================================================= */

var aiJenaState = {
    open: false,
    mode: "edit",
    sourceIndex: -1,
    sourceItem: null,
    sourceImage: null,
    resultSrc: "",
    resultMimeType: "image/jpeg",
    drawing: false,
    brushSize: 48,
    brushOpacity: .6,
    selectionTool: "brush",
    polygonPoints: [],
    polygonBaseImageData: null,
    completedPolygonPoints: [],
    polygonHoverPoint: null,
    polygonNearStart: false,
    polygonMoving: false,
    polygonMoveStart: null,
    polygonMoveOrigin: [],
    lastMaskPoint: null,
    abortController: null,
    processing: false,
    progress: 0,
    progressTimer: null,
    saving: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    panning: false,
    panPointerId: null,
    panStartX: 0,
    panStartY: 0,
    panOriginX: 0,
    panOriginY: 0,
    history: [],
    activeHistoryIndex: -1,
    historySessionKey: ""
};

var aiJenaHistorySessions = new Map();
const AI_JENA_HISTORY_DB_PREFIX = "ai_jena_history:";

function initAiJenaFeature() {
    if (!dom.aiJenaModal) return;
    dom.btnAiJenaClose.onclick = closeAiJena;
    dom.btnRunAiJena.onclick = runAiJena;
    dom.aiJenaPrompt.addEventListener("keydown", event => {
        if (event.key !== "Enter" || !event.ctrlKey || event.isComposing) return;
        event.preventDefault();
        runAiJena();
    });
    dom.btnStopAiJena.onclick = stopAiJena;
    dom.btnAddAiJenaResult.onclick = addAiJenaResult;
    dom.btnAiJenaChoiceCancel.onclick = closeAiJenaSaveChoice;
    dom.btnAiJenaReplace.onclick = () => saveAiJenaResult("replace");
    dom.btnAiJenaNew.onclick = () => saveAiJenaResult("new");
    dom.btnAiJenaClearMask.onclick = clearAiJenaMask;
    dom.btnClearAiJenaHistory.onclick = clearAllAiJenaHistory;
    dom.aiJenaBrushSize.oninput = () => {
        aiJenaState.brushSize = Number(dom.aiJenaBrushSize.value) || 48;
        dom.aiJenaBrushSizeValue.innerText = aiJenaState.brushSize + "px";
    };
    dom.aiJenaBrushOpacity.oninput = () => {
        aiJenaState.brushOpacity = (Number(dom.aiJenaBrushOpacity.value) || 60) / 100;
        dom.aiJenaBrushOpacityValue.innerText = `${Math.round(aiJenaState.brushOpacity * 100)}%`;
        if (aiJenaState.completedPolygonPoints.length >= 3) {
            renderAiJenaCompletedPolygon();
        }
    };
    document.querySelectorAll(".ai-jena-selection-tool").forEach(button => {
        button.onclick = () => setAiJenaSelectionTool(button.dataset.jenaTool);
    });
    dom.btnAiJenaClosePolygon.onclick = finishAiJenaPolygon;
    document.querySelectorAll(".ai-jena-mode").forEach(button => {
        button.onclick = () => setAiJenaMode(button.dataset.jenaMode);
    });
    dom.aiJenaMaskCanvas.addEventListener("pointerdown", beginAiJenaMaskStroke);
    dom.aiJenaMaskCanvas.addEventListener("pointermove", continueAiJenaMaskStroke);
    dom.aiJenaMaskCanvas.addEventListener("pointerup", endAiJenaMaskStroke);
    dom.aiJenaMaskCanvas.addEventListener("pointercancel", endAiJenaMaskStroke);
    dom.aiJenaStage.addEventListener("wheel", zoomAiJenaStage, { passive: false });
    dom.aiJenaStage.addEventListener("pointerdown", beginAiJenaStagePan);
    window.addEventListener("pointermove", continueAiJenaStagePan);
    window.addEventListener("pointerup", endAiJenaStagePan);
    window.addEventListener("pointercancel", endAiJenaStagePan);
    dom.btnAiJenaResetZoom.onclick = resetAiJenaZoom;
    dom.aiJenaModal.addEventListener("mousedown", event => {
        if (event.target === dom.aiJenaModal && !aiJenaState.processing) closeAiJena();
    });
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape" || dom.aiJenaModal.style.display === "none") return;
        if (dom.aiJenaSaveChoice.style.display !== "none") {
            closeAiJenaSaveChoice();
        } else if (!aiJenaState.processing) {
            closeAiJena();
        }
    });
    window.addEventListener("focus", updateAiJenaKeyStatus);
    updateAiJenaKeyStatus();
}

function updateAiJenaKeyStatus() {
    const ready = Boolean(getUsableAiStudioApiKey());
    document.querySelectorAll(".ai-jena-image-button").forEach(button => {
        button.classList.toggle("ready", ready);
        button.classList.toggle("unavailable", !ready);
        button.innerText = ready
            ? "✦ AI Jena"
            : "✦ AI Jena · API키를 먼저 설정하세요";
        button.title = ready
            ? "AI Studio 키 연결됨 · 이 이미지로 AI Jena 열기"
            : "Settings에서 AI Studio 키를 설정하세요.";
    });
    if (dom.aiJenaKeyStatus) {
        dom.aiJenaKeyStatus.innerText = ready ? "● AI Studio 키 연결됨" : "○ AI Studio 키 필요";
        dom.aiJenaKeyStatus.classList.toggle("ready", ready);
    }
}

async function openAiJena(imageIndex = currentIndex) {
    updateAiJenaKeyStatus();
    if (!getUsableAiStudioApiKey()) {
        alert(isAiKeyUsageEnabled()
            ? "[API키를 먼저 설정하세요]\nSettings에서 Google AI Studio API 키를 입력하세요."
            : "[API키 사용이 중지되어 있습니다]\nSettings에서 AI 키 사용을 다시 시작하세요.");
        openUpscaleSettings();
        return;
    }
    aiJenaState.open = true;
    aiJenaState.sourceIndex = images[imageIndex] ? imageIndex : -1;
    aiJenaState.sourceItem = images[aiJenaState.sourceIndex] || null;
    aiJenaState.resultSrc = "";
    aiJenaState.processing = false;
    aiJenaState.historySessionKey = aiJenaState.sourceItem?.path ||
        `image-${aiJenaState.sourceIndex}`;
    resetAiJenaHistory();
    dom.aiJenaResultPreview.style.display = "none";
    dom.btnAddAiJenaResult.disabled = true;
    closeAiJenaSaveChoice();
    dom.aiJenaChatHistory.innerHTML =
        '<div class="ai-jena-message assistant">현재 이미지를 프롬프트로 수정하거나 새 이미지를 생성할 수 있습니다.</div>';
    dom.aiJenaModal.style.display = "flex";
    resetAiJenaZoom();
    setAiJenaMode(aiJenaState.sourceItem ? "edit" : "generate");
    if (aiJenaState.sourceItem) {
        try {
            const savedHistory = await loadAiJenaHistorySession(aiJenaState.historySessionKey);
            if (Array.isArray(savedHistory)) {
                aiJenaState.history = savedHistory.map(entry => ({ ...entry }));
                renderAiJenaHistory();
                if (aiJenaState.history.length) {
                    await selectAiJenaHistoryEntry(aiJenaState.history.length - 1, false);
                } else {
                    aiJenaState.sourceImage = await loadUpscaleImage(aiJenaState.sourceItem.src);
                    drawAiJenaSource();
                }
            } else {
                aiJenaState.sourceImage = await loadUpscaleImage(aiJenaState.sourceItem.src);
                drawAiJenaSource();
                await addAiJenaOriginalHistoryEntry(aiJenaState.sourceItem);
            }
        } catch (error) {
            aiJenaState.sourceImage = null;
            setAiJenaMode("generate");
        }
    } else {
        aiJenaState.sourceImage = null;
        drawAiJenaSource();
    }
    dom.aiJenaPrompt.focus();
}

function closeAiJena() {
    if (aiJenaState.processing) {
        stopAiJena();
        return;
    }
    aiJenaState.open = false;
    closeAiJenaSaveChoice();
    dom.aiJenaModal.style.display = "none";
}

function setAiJenaMode(mode) {
    const allowed = ["edit", "clothes", "pose", "generate"];
    aiJenaState.mode = allowed.includes(mode) ? mode : "edit";
    if (!aiJenaState.sourceItem && aiJenaState.mode !== "generate") {
        aiJenaState.mode = "generate";
    }
    document.querySelectorAll(".ai-jena-mode").forEach(button => {
        button.classList.toggle("active", button.dataset.jenaMode === aiJenaState.mode);
    });
    const maskMode = aiJenaState.mode === "clothes";
    dom.aiJenaBrushControls.style.display = maskMode ? "flex" : "none";
    dom.aiJenaMaskCanvas.style.pointerEvents = maskMode ? "auto" : "none";
    dom.aiJenaPrompt.placeholder = {
        edit: "예: 배경을 밤의 서울 거리로 바꾸되 인물은 그대로 유지해줘.",
        clothes: "붓 또는 다각형으로 영역을 선택한 뒤, 주변 배경과 자연스럽게 어울리도록 바꿀 내용을 입력하세요.",
        pose: "예: 인물이 양손을 허리에 둔 자연스러운 전신 포즈로 바꿔줘.",
        generate: "생성할 이미지의 인물, 배경, 구도, 조명과 스타일을 설명하세요."
    }[aiJenaState.mode];
}

function drawAiJenaSource() {
    const width = aiJenaState.sourceImage?.naturalWidth || 1024;
    const height = aiJenaState.sourceImage?.naturalHeight || 1024;
    [dom.aiJenaCanvas, dom.aiJenaMaskCanvas].forEach(canvas => {
        canvas.width = width;
        canvas.height = height;
    });
    const context = dom.aiJenaCanvas.getContext("2d");
    context.clearRect(0, 0, width, height);
    if (aiJenaState.sourceImage) context.drawImage(aiJenaState.sourceImage, 0, 0, width, height);
    else {
        context.fillStyle = "#101722";
        context.fillRect(0, 0, width, height);
        context.fillStyle = "#7fddff";
        context.font = "bold 40px sans-serif";
        context.textAlign = "center";
        context.fillText("AI Jena Generate", width / 2, height / 2);
    }
    clearAiJenaMask();
}

function applyAiJenaViewportTransform() {
    dom.aiJenaCanvasStack.style.transform =
        `translate(${aiJenaState.panX}px, ${aiJenaState.panY}px) scale(${aiJenaState.zoom})`;
    dom.btnAiJenaResetZoom.innerText =
        `${Math.round(aiJenaState.zoom * 100)}% · Alt+휠`;
}

function resetAiJenaZoom(event) {
    event?.stopPropagation();
    aiJenaState.zoom = 1;
    aiJenaState.panX = 0;
    aiJenaState.panY = 0;
    aiJenaState.panning = false;
    aiJenaState.panPointerId = null;
    dom.aiJenaStage.classList.remove("panning");
    applyAiJenaViewportTransform();
}

function zoomAiJenaStage(event) {
    if (!event.altKey || !aiJenaState.open) return;
    if (event.target.closest?.(".ai-jena-history-panel, .ai-jena-zoom-badge")) return;
    event.preventDefault();
    const oldZoom = aiJenaState.zoom;
    const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
    const nextZoom = Math.max(.25, Math.min(8, oldZoom * factor));
    if (Math.abs(nextZoom - oldZoom) < .001) return;

    const stackRect = dom.aiJenaCanvasStack.getBoundingClientRect();
    const baseCenterX = (stackRect.left + stackRect.right) / 2 - aiJenaState.panX;
    const baseCenterY = (stackRect.top + stackRect.bottom) / 2 - aiJenaState.panY;
    const localX = (event.clientX - baseCenterX - aiJenaState.panX) / oldZoom;
    const localY = (event.clientY - baseCenterY - aiJenaState.panY) / oldZoom;
    aiJenaState.panX = event.clientX - baseCenterX - localX * nextZoom;
    aiJenaState.panY = event.clientY - baseCenterY - localY * nextZoom;
    aiJenaState.zoom = nextZoom;
    applyAiJenaViewportTransform();
}

function beginAiJenaStagePan(event) {
    if (!event.altKey || event.button !== 0 || !aiJenaState.open) return;
    if (event.target.closest?.(".ai-jena-history-panel, .ai-jena-zoom-badge")) return;
    aiJenaState.panning = true;
    aiJenaState.panPointerId = event.pointerId;
    aiJenaState.panStartX = event.clientX;
    aiJenaState.panStartY = event.clientY;
    aiJenaState.panOriginX = aiJenaState.panX;
    aiJenaState.panOriginY = aiJenaState.panY;
    dom.aiJenaStage.classList.add("panning");
    event.preventDefault();
}

function continueAiJenaStagePan(event) {
    if (!aiJenaState.panning || event.pointerId !== aiJenaState.panPointerId) return;
    aiJenaState.panX = aiJenaState.panOriginX + event.clientX - aiJenaState.panStartX;
    aiJenaState.panY = aiJenaState.panOriginY + event.clientY - aiJenaState.panStartY;
    applyAiJenaViewportTransform();
    event.preventDefault();
}

function endAiJenaStagePan(event) {
    if (!aiJenaState.panning || event.pointerId !== aiJenaState.panPointerId) return;
    aiJenaState.panning = false;
    aiJenaState.panPointerId = null;
    dom.aiJenaStage.classList.remove("panning");
}

function getAiJenaCanvasPoint(event) {
    const rect = dom.aiJenaMaskCanvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * dom.aiJenaMaskCanvas.width / Math.max(1, rect.width),
        y: (event.clientY - rect.top) * dom.aiJenaMaskCanvas.height / Math.max(1, rect.height)
    };
}

function beginAiJenaMaskStroke(event) {
    if (event.altKey || aiJenaState.panning) return;
    if (aiJenaState.mode !== "clothes") return;
    const point = getAiJenaCanvasPoint(event);
    if (aiJenaState.selectionTool === "polygon") {
        if (aiJenaState.completedPolygonPoints.length &&
            isPointInsideAiJenaPolygon(point, aiJenaState.completedPolygonPoints)) {
            aiJenaState.polygonMoving = true;
            aiJenaState.polygonMoveStart = point;
            aiJenaState.polygonMoveOrigin =
                aiJenaState.completedPolygonPoints.map(vertex => ({ ...vertex }));
            dom.aiJenaMaskCanvas.setPointerCapture?.(event.pointerId);
            dom.aiJenaMaskCanvas.style.cursor = "grabbing";
            updateAiJenaSelectionStatus("↔ 선택영역 이동 중…", "moving");
            event.preventDefault();
            return;
        }
        if (aiJenaState.completedPolygonPoints.length) {
            updateAiJenaSelectionStatus(
                "완성된 선택영역 안을 드래그해 이동하거나, 선택영역 지우기로 새 다각형을 시작하세요.",
                "complete"
            );
            event.preventDefault();
            return;
        }
        if (aiJenaState.polygonPoints.length >= 3 &&
            getAiJenaPointDistance(point, aiJenaState.polygonPoints[0]) <=
            getAiJenaPolygonCloseRadius()) {
            finishAiJenaPolygon();
            event.preventDefault();
            return;
        }
        if (!aiJenaState.polygonPoints.length) {
            const context = dom.aiJenaMaskCanvas.getContext("2d");
            aiJenaState.polygonBaseImageData = context.getImageData(
                0, 0, dom.aiJenaMaskCanvas.width, dom.aiJenaMaskCanvas.height
            );
        }
        aiJenaState.polygonPoints.push(point);
        aiJenaState.polygonHoverPoint = point;
        drawAiJenaPolygonPreview();
        updateAiJenaPolygonDrawingStatus();
        event.preventDefault();
        return;
    }
    aiJenaState.drawing = true;
    aiJenaState.lastMaskPoint = point;
    dom.aiJenaMaskCanvas.setPointerCapture?.(event.pointerId);
    paintAiJenaMask(point, point);
}

function continueAiJenaMaskStroke(event) {
    if (event.altKey || aiJenaState.panning) return;
    const point = getAiJenaCanvasPoint(event);
    if (aiJenaState.polygonMoving) {
        moveAiJenaCompletedPolygon(point);
        event.preventDefault();
        return;
    }
    if (aiJenaState.selectionTool === "polygon" && aiJenaState.polygonPoints.length) {
        aiJenaState.polygonHoverPoint = point;
        aiJenaState.polygonNearStart =
            aiJenaState.polygonPoints.length >= 3 &&
            getAiJenaPointDistance(point, aiJenaState.polygonPoints[0]) <=
            getAiJenaPolygonCloseRadius();
        drawAiJenaPolygonPreview();
        updateAiJenaPolygonDrawingStatus();
        dom.aiJenaMaskCanvas.style.cursor =
            aiJenaState.polygonNearStart ? "pointer" : "crosshair";
        return;
    }
    if (!aiJenaState.drawing) return;
    paintAiJenaMask(aiJenaState.lastMaskPoint || point, point);
    aiJenaState.lastMaskPoint = point;
}

function endAiJenaMaskStroke(event) {
    if (aiJenaState.polygonMoving) {
        aiJenaState.polygonMoving = false;
        aiJenaState.polygonMoveStart = null;
        aiJenaState.polygonMoveOrigin = [];
        dom.aiJenaMaskCanvas.style.cursor = "move";
        updateAiJenaSelectionStatus(
            "✓ 다각형 선택 완료 · 내부를 드래그하여 이동할 수 있습니다.",
            "complete"
        );
    }
    aiJenaState.drawing = false;
    aiJenaState.lastMaskPoint = null;
    try {
        dom.aiJenaMaskCanvas.releasePointerCapture?.(event.pointerId);
    } catch (error) {}
}

function paintAiJenaMask(from, point) {
    const context = dom.aiJenaMaskCanvas.getContext("2d");
    context.strokeStyle = `rgba(255, 70, 105, ${aiJenaState.brushOpacity})`;
    context.fillStyle = `rgba(255, 70, 105, ${aiJenaState.brushOpacity})`;
    context.lineWidth = aiJenaState.brushSize;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.beginPath();
    context.arc(point.x, point.y, aiJenaState.brushSize / 2, 0, Math.PI * 2);
    context.fill();
}

function clearAiJenaMask() {
    const canvas = dom.aiJenaMaskCanvas;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    aiJenaState.polygonPoints = [];
    aiJenaState.polygonBaseImageData = null;
    aiJenaState.completedPolygonPoints = [];
    aiJenaState.polygonHoverPoint = null;
    aiJenaState.polygonNearStart = false;
    aiJenaState.polygonMoving = false;
    dom.aiJenaMaskCanvas.style.cursor = "crosshair";
    updateAiJenaSelectionStatus("붓으로 칠하거나 다각형 점을 찍으세요.");
}

function setAiJenaSelectionTool(tool) {
    const nextTool = tool === "polygon" ? "polygon" : "brush";
    if (aiJenaState.selectionTool === "polygon" && nextTool === "brush") {
        if (aiJenaState.completedPolygonPoints.length >= 3) {
            commitAiJenaCompletedPolygonToMask();
        } else if (aiJenaState.polygonBaseImageData) {
            dom.aiJenaMaskCanvas.getContext("2d")
                .putImageData(aiJenaState.polygonBaseImageData, 0, 0);
            aiJenaState.polygonPoints = [];
            aiJenaState.polygonHoverPoint = null;
            aiJenaState.polygonNearStart = false;
            aiJenaState.polygonBaseImageData = null;
        }
    }
    aiJenaState.selectionTool = nextTool;
    document.querySelectorAll(".ai-jena-selection-tool").forEach(button => {
        button.classList.toggle("active", button.dataset.jenaTool === aiJenaState.selectionTool);
    });
    dom.btnAiJenaClosePolygon.style.display =
        aiJenaState.selectionTool === "polygon" ? "block" : "none";
    dom.aiJenaMaskCanvas.style.cursor =
        aiJenaState.selectionTool === "polygon" ? "crosshair" : "crosshair";
    if (aiJenaState.selectionTool === "polygon") {
        updateAiJenaSelectionStatus(
            aiJenaState.completedPolygonPoints.length
                ? "✓ 다각형 선택 완료 · 내부를 드래그하여 이동할 수 있습니다."
                : "점을 3개 이상 찍고 시작점을 다시 누르면 완료됩니다.",
            aiJenaState.completedPolygonPoints.length ? "complete" : ""
        );
    } else {
        updateAiJenaSelectionStatus("이미지 위에 변경할 영역을 붓으로 칠하세요.");
    }
}

function drawAiJenaPolygonPreview() {
    const points = aiJenaState.polygonPoints;
    if (!points.length) return;
    const context = dom.aiJenaMaskCanvas.getContext("2d");
    if (aiJenaState.polygonBaseImageData) {
        context.putImageData(aiJenaState.polygonBaseImageData, 0, 0);
    }
    context.save();
    context.strokeStyle = "#7fddff";
    context.lineWidth = Math.max(2, dom.aiJenaMaskCanvas.width / 500);
    context.setLineDash([10, 7]);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    if (aiJenaState.polygonHoverPoint) {
        context.lineTo(aiJenaState.polygonHoverPoint.x, aiJenaState.polygonHoverPoint.y);
    }
    context.stroke();
    points.forEach((point, index) => {
        const radius = getAiJenaPolygonPointRadius(index === 0 ? 1.18 : 1);
        context.setLineDash([]);
        context.fillStyle = index === 0 ? "#a5ff8a" : "#7fddff";
        context.strokeStyle = "#071018";
        context.lineWidth = Math.max(2, dom.aiJenaMaskCanvas.width / 650);
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = "#071018";
        context.font = `bold ${Math.max(11, radius * 1.35)}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(index + 1), point.x, point.y);
    });
    if (aiJenaState.polygonNearStart) {
        const start = points[0];
        context.strokeStyle = "#fff36f";
        context.lineWidth = Math.max(3, dom.aiJenaMaskCanvas.width / 400);
        context.beginPath();
        context.arc(start.x, start.y, getAiJenaPolygonCloseRadius(), 0, Math.PI * 2);
        context.stroke();
    }
    context.restore();
}

function finishAiJenaPolygon() {
    const points = aiJenaState.polygonPoints;
    if (points.length < 3) {
        alert("다각형은 최소 3개의 점을 선택하세요.");
        return;
    }
    const context = dom.aiJenaMaskCanvas.getContext("2d");
    if (aiJenaState.polygonBaseImageData) {
        context.putImageData(aiJenaState.polygonBaseImageData, 0, 0);
    }
    aiJenaState.completedPolygonPoints = points.map(point => ({ ...point }));
    aiJenaState.polygonPoints = [];
    aiJenaState.polygonHoverPoint = null;
    aiJenaState.polygonNearStart = false;
    renderAiJenaCompletedPolygon();
    dom.aiJenaMaskCanvas.style.cursor = "move";
    updateAiJenaSelectionStatus(
        "✓ 다각형 선택 완료 · 내부를 드래그하여 이동할 수 있습니다.",
        "complete"
    );
}

function renderAiJenaCompletedPolygon() {
    const context = dom.aiJenaMaskCanvas.getContext("2d");
    if (aiJenaState.polygonBaseImageData) {
        context.putImageData(aiJenaState.polygonBaseImageData, 0, 0);
    }
    const points = aiJenaState.completedPolygonPoints;
    if (points.length < 3) return;
    context.save();
    context.fillStyle = `rgba(255, 70, 105, ${aiJenaState.brushOpacity})`;
    context.strokeStyle = "#7fddff";
    context.lineWidth = Math.max(3, dom.aiJenaMaskCanvas.width / 450);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();
    context.stroke();
    points.forEach((point, index) => {
        const radius = getAiJenaPolygonPointRadius(index === 0 ? 1.18 : 1);
        context.fillStyle = index === 0 ? "#a5ff8a" : "#7fddff";
        context.strokeStyle = "#071018";
        context.lineWidth = Math.max(2, dom.aiJenaMaskCanvas.width / 650);
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    });
    const first = points[0];
    context.fillStyle = "#a5ff8a";
    context.font = `bold ${Math.max(15, getAiJenaPolygonPointRadius() * 1.6)}px sans-serif`;
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText("✓ 닫힘", first.x + getAiJenaPolygonPointRadius(1.4), first.y);
    context.restore();
}

function commitAiJenaCompletedPolygonToMask() {
    const context = dom.aiJenaMaskCanvas.getContext("2d");
    if (aiJenaState.polygonBaseImageData) {
        context.putImageData(aiJenaState.polygonBaseImageData, 0, 0);
    } else {
        context.clearRect(0, 0, dom.aiJenaMaskCanvas.width, dom.aiJenaMaskCanvas.height);
    }
    const points = aiJenaState.completedPolygonPoints;
    if (points.length >= 3) {
        context.save();
        context.fillStyle = `rgba(255, 70, 105, ${aiJenaState.brushOpacity})`;
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(point => context.lineTo(point.x, point.y));
        context.closePath();
        context.fill();
        context.restore();
    }
    aiJenaState.completedPolygonPoints = [];
    aiJenaState.polygonPoints = [];
    aiJenaState.polygonHoverPoint = null;
    aiJenaState.polygonNearStart = false;
    aiJenaState.polygonBaseImageData = null;
}

function moveAiJenaCompletedPolygon(point) {
    const start = aiJenaState.polygonMoveStart;
    const origin = aiJenaState.polygonMoveOrigin;
    if (!start || !origin.length) return;
    let dx = point.x - start.x;
    let dy = point.y - start.y;
    const minX = Math.min(...origin.map(vertex => vertex.x));
    const maxX = Math.max(...origin.map(vertex => vertex.x));
    const minY = Math.min(...origin.map(vertex => vertex.y));
    const maxY = Math.max(...origin.map(vertex => vertex.y));
    dx = Math.max(-minX, Math.min(dom.aiJenaMaskCanvas.width - maxX, dx));
    dy = Math.max(-minY, Math.min(dom.aiJenaMaskCanvas.height - maxY, dy));
    aiJenaState.completedPolygonPoints =
        origin.map(vertex => ({ x: vertex.x + dx, y: vertex.y + dy }));
    renderAiJenaCompletedPolygon();
}

function isPointInsideAiJenaPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        const deltaY = b.y - a.y;
        const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
            point.x < (b.x - a.x) * (point.y - a.y) /
            (Math.abs(deltaY) < .000001 ? .000001 : deltaY) + a.x;
        if (intersects) inside = !inside;
    }
    return inside;
}

function getAiJenaPointDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function getAiJenaPolygonPointRadius(multiplier = 1) {
    const rect = dom.aiJenaMaskCanvas.getBoundingClientRect();
    return Math.max(7, 10 * dom.aiJenaMaskCanvas.width / Math.max(1, rect.width)) * multiplier;
}

function getAiJenaPolygonCloseRadius() {
    return getAiJenaPolygonPointRadius(2.2);
}

function updateAiJenaPolygonDrawingStatus() {
    const count = aiJenaState.polygonPoints.length;
    if (aiJenaState.polygonNearStart) {
        updateAiJenaSelectionStatus(
            "● 시작점과 연결됩니다 · 클릭하면 다각형 선택이 완료됩니다.",
            "closing"
        );
    } else {
        updateAiJenaSelectionStatus(
            `${count}개 점 선택 · ${count < 3 ? "최소 3개 점이 필요합니다." : "시작점(1번)을 클릭해 닫으세요."}`
        );
    }
}

function updateAiJenaSelectionStatus(message, state = "") {
    if (!dom.aiJenaSelectionStatus) return;
    dom.aiJenaSelectionStatus.innerText = message;
    dom.aiJenaSelectionStatus.classList.toggle("complete", state === "complete");
    dom.aiJenaSelectionStatus.classList.toggle("closing", state === "closing");
    dom.aiJenaSelectionStatus.classList.toggle("moving", state === "moving");
}

function hasAiJenaSelection() {
    if (!dom.aiJenaUseSelection.checked) return false;
    const cleanSelection = createAiJenaCleanSelectionCanvas();
    const context = cleanSelection.getContext("2d");
    const pixels = context.getImageData(
        0, 0, cleanSelection.width, cleanSelection.height
    ).data;
    for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) return true;
    }
    return false;
}

function buildAiJenaPrompt(userPrompt) {
    const safeguards =
        " Preserve the person's identity, facial features, body proportions, image framing, and all " +
        "details that the request does not explicitly ask to change. Return only the edited/generated image.";
    const selectionActive = aiJenaState.mode === "clothes" && hasAiJenaSelection();
    if (selectionActive) {
        return "The first image is the original and the second image is a selection mask. " +
            "Modify ONLY pixels inside the white/selected mask according to this request: " +
            userPrompt +
            ". Use the surrounding background, perspective, lighting, shadows, texture and nearby objects as context " +
            "so the generated content fits naturally. Preserve every unselected pixel, identity, face, pose and framing exactly. " +
            "Blend the mask boundary seamlessly without changing outside pixels. Return only the edited image.";
    }
    const prefix = {
        edit: "Edit the provided image according to this request: ",
        clothes:
            "A selection mask is required. Modify only that selected region using its surrounding visual context. Request: ",
        pose:
            "Change the full-body pose according to the request while preserving identity, clothing design, " +
            "background, lighting and overall visual style. Request: ",
        generate:
            "Generate a new high-quality image according to this request. If a reference image is provided, " +
            "use it only as the requested identity/style reference: "
    }[aiJenaState.mode];
    return prefix + userPrompt + safeguards;
}

function createAiJenaSelectionMaskPayload() {
    const overlay = dom.aiJenaMaskCanvas;
    const mask = document.createElement("canvas");
    mask.width = overlay.width;
    mask.height = overlay.height;
    const context = mask.getContext("2d");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, mask.width, mask.height);
    const cleanSelection = createAiJenaCleanSelectionCanvas();
    const cleanContext = cleanSelection.getContext("2d");
    const data = cleanContext.getImageData(0, 0, overlay.width, overlay.height);
    const pixels = data.data;
    const maskData = context.getImageData(0, 0, mask.width, mask.height);
    for (let index = 0; index < pixels.length; index += 4) {
        const selected = pixels[index + 3];
        maskData.data[index] = selected;
        maskData.data[index + 1] = selected;
        maskData.data[index + 2] = selected;
        maskData.data[index + 3] = 255;
    }
    context.putImageData(maskData, 0, 0);
    return {
        mimeType: "image/png",
        data: mask.toDataURL("image/png").split(",")[1]
    };
}

function createAiJenaCleanSelectionCanvas() {
    const overlay = dom.aiJenaMaskCanvas;
    const cleanSelection = document.createElement("canvas");
    cleanSelection.width = overlay.width;
    cleanSelection.height = overlay.height;
    const cleanContext = cleanSelection.getContext("2d");
    if (aiJenaState.polygonBaseImageData) {
        cleanContext.putImageData(aiJenaState.polygonBaseImageData, 0, 0);
    } else {
        cleanContext.drawImage(overlay, 0, 0);
    }
    if (aiJenaState.completedPolygonPoints.length >= 3) {
        const points = aiJenaState.completedPolygonPoints;
        cleanContext.fillStyle = `rgba(255, 70, 105, ${aiJenaState.brushOpacity})`;
        cleanContext.beginPath();
        cleanContext.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(point => cleanContext.lineTo(point.x, point.y));
        cleanContext.closePath();
        cleanContext.fill();
    }
    return cleanSelection;
}

async function runAiJena() {
    const prompt = dom.aiJenaPrompt.value.trim();
    if (!prompt || aiJenaState.processing) {
        if (!prompt) alert("이미지 수정 또는 생성 프롬프트를 입력하세요.");
        return;
    }
    if (aiJenaState.mode !== "generate" && !aiJenaState.sourceItem) {
        alert("먼저 FMA Viewer에서 수정할 이미지를 선택하세요.");
        return;
    }
    if (aiJenaState.mode === "clothes" && !hasAiJenaSelection()) {
        alert("선택영역 수정은 붓 또는 다각형으로 바꿀 영역을 먼저 선택하세요.");
        return;
    }
    aiJenaState.processing = true;
    aiJenaState.abortController = new AbortController();
    dom.btnRunAiJena.disabled = true;
    dom.btnStopAiJena.style.display = "inline-block";
    startAiJenaProgress();
    appendAiJenaMessage("user", prompt);
    try {
        const result = await requestAiJenaImage(
            buildAiJenaPrompt(prompt),
            aiJenaState.abortController.signal
        );
        aiJenaState.resultSrc = result.src;
        aiJenaState.resultMimeType = result.mimeType;
        await addAiJenaHistoryResult(result, prompt);
        finishAiJenaProgress(100, "요청하신대로 이미지 생성을 완료했습니다.");
        appendAiJenaMessage(
            "assistant",
            "이미지 결과를 히스토리에 저장했습니다. 선택한 결과에서 계속 수정하거나 갤러리로 보낼 수 있습니다."
        );
    } catch (error) {
        if (error.name === "AbortError") {
            finishAiJenaProgress(0, "사용자가 AI 작업을 정지했습니다.");
            appendAiJenaMessage("assistant", "작업이 정지되었습니다.");
        } else {
            console.error("AI Jena error:", error);
            finishAiJenaProgress(0, "AI 처리 실패");
            appendAiJenaMessage("assistant", "오류: " + error.message);
        }
    } finally {
        aiJenaState.processing = false;
        aiJenaState.abortController = null;
        dom.btnRunAiJena.disabled = false;
        dom.btnStopAiJena.style.display = "none";
    }
}

function setAiJenaProgress(percent, message) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    aiJenaState.progress = value;
    dom.aiJenaProgressText.innerText = message || "요청하신대로 생성하는 중입니다.";
    dom.aiJenaProgressBar.style.width = `${value}%`;
    dom.aiJenaProgressPercent.innerText = `${Math.round(value)}%`;
    dom.aiJenaProgressBar.parentElement?.setAttribute("aria-valuenow", String(Math.round(value)));
}

function startAiJenaProgress() {
    clearInterval(aiJenaState.progressTimer);
    setAiJenaProgress(6, "요청하신대로 생성하는 중입니다.");
    aiJenaState.progressTimer = window.setInterval(() => {
        const current = aiJenaState.progress;
        const increment = current < 35 ? 7 : current < 70 ? 3 : 1;
        setAiJenaProgress(Math.min(92, current + increment), "요청하신대로 생성하는 중입니다.");
    }, 850);
}

function finishAiJenaProgress(percent, message) {
    clearInterval(aiJenaState.progressTimer);
    aiJenaState.progressTimer = null;
    setAiJenaProgress(percent, message);
}

async function requestAiJenaImage(prompt, signal) {
    const apiKey = getUsableAiStudioApiKey();
    if (!apiKey) throw new Error("AI Studio API 키가 없거나 사용이 중지되어 있습니다.");
    const input = [];
    if (aiJenaState.sourceItem) {
        const payload = await getAiImagePayload(aiJenaState.sourceItem);
        input.push({ type: "image", mime_type: payload.mimeType, data: payload.data });
    }
    if (aiJenaState.mode === "clothes" && hasAiJenaSelection()) {
        const mask = createAiJenaSelectionMaskPayload();
        input.push({ type: "image", mime_type: mask.mimeType, data: mask.data });
    }
    input.push({ type: "text", text: prompt });
    const response = await fetch(AI_UPSCALE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal,
        body: JSON.stringify({
            model: AI_UPSCALE_MODEL,
            input,
            response_format: {
                type: "image",
                mime_type: "image/jpeg",
                image_size: getAiUpscaleResolution()
            }
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error?.message || `Google API 요청 실패 (${response.status})`);
    }
    const image = findGeneratedImageBlock(data);
    if (!image) throw new Error("Google API 응답에 이미지가 없습니다.");
    return {
        src: `data:${image.mimeType || "image/jpeg"};base64,${image.data}`,
        mimeType: image.mimeType || "image/jpeg"
    };
}

function stopAiJena() {
    aiJenaState.abortController?.abort();
}

function appendAiJenaMessage(role, text) {
    const message = document.createElement("div");
    message.className = `ai-jena-message ${role}`;
    message.innerText = text;
    dom.aiJenaChatHistory.appendChild(message);
    dom.aiJenaChatHistory.scrollTop = dom.aiJenaChatHistory.scrollHeight;
}

function resetAiJenaHistory() {
    aiJenaState.history = [];
    aiJenaState.activeHistoryIndex = -1;
    dom.aiJenaHistoryList.innerHTML = "";
    dom.aiJenaHistoryCount.innerText = "0";
}

async function addAiJenaOriginalHistoryEntry(item) {
    if (!item?.src) return;
    aiJenaState.history.push({
        id: `original-${Date.now()}`,
        src: item.src,
        mimeType: item.mimeType || "image/png",
        path: item.path || "original",
        label: "원본",
        prompt: "",
        mode: "original",
        original: true,
        createdAt: Date.now()
    });
    aiJenaState.activeHistoryIndex = 0;
    await persistAiJenaHistorySession();
    renderAiJenaHistory();
}

async function addAiJenaHistoryResult(result, prompt) {
    const generatedCount = aiJenaState.history.filter(entry => !entry.original).length + 1;
    aiJenaState.history.push({
        id: `result-${Date.now()}-${generatedCount}`,
        src: result.src,
        mimeType: result.mimeType || "image/jpeg",
        path: `ai-jena-history-${generatedCount}`,
        label: `생성 ${generatedCount}`,
        prompt,
        mode: aiJenaState.mode,
        original: false,
        createdAt: Date.now()
    });
    await persistAiJenaHistorySession();
    renderAiJenaHistory();
    await selectAiJenaHistoryEntry(aiJenaState.history.length - 1, false);
}

async function persistAiJenaHistorySession() {
    if (!aiJenaState.historySessionKey) return;
    const history = aiJenaState.history.map(entry => ({ ...entry }));
    aiJenaHistorySessions.set(aiJenaState.historySessionKey, history);
    try {
        const db = await openFmaDatabase();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction("fma_store", "readwrite");
            transaction.objectStore("fma_store").put(
                {
                    sessionKey: aiJenaState.historySessionKey,
                    updatedAt: Date.now(),
                    history
                },
                AI_JENA_HISTORY_DB_PREFIX + aiJenaState.historySessionKey
            );
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        db.close();
    } catch (error) {
        console.warn("AI Jena history persistence failed:", error);
    }
}

async function loadAiJenaHistorySession(sessionKey) {
    if (!sessionKey) return null;
    if (aiJenaHistorySessions.has(sessionKey)) {
        return aiJenaHistorySessions.get(sessionKey).map(entry => ({ ...entry }));
    }
    try {
        const db = await openFmaDatabase();
        const stored = await new Promise((resolve, reject) => {
            const transaction = db.transaction("fma_store", "readonly");
            const request = transaction.objectStore("fma_store")
                .get(AI_JENA_HISTORY_DB_PREFIX + sessionKey);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        if (!stored || !Array.isArray(stored.history)) return null;
        const history = stored.history.map(entry => ({ ...entry }));
        aiJenaHistorySessions.set(sessionKey, history);
        return history;
    } catch (error) {
        console.warn("AI Jena history restore failed:", error);
        return null;
    }
}

function renderAiJenaHistory() {
    dom.aiJenaHistoryList.innerHTML = "";
    dom.aiJenaHistoryCount.innerText = String(aiJenaState.history.length);
    dom.btnClearAiJenaHistory.disabled = aiJenaState.history.length === 0;
    if (!aiJenaState.history.length) {
        const empty = document.createElement("div");
        empty.className = "ai-jena-history-empty";
        empty.innerText = "저장된 작업이 없습니다.";
        dom.aiJenaHistoryList.appendChild(empty);
    }
    aiJenaState.history.forEach((entry, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "ai-jena-history-entry";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ai-jena-history-item";
        button.classList.toggle("active", index === aiJenaState.activeHistoryIndex);
        button.title = entry.original
            ? "원본 이미지에서 다시 편집"
            : `${entry.label} 결과에서 편집 계속하기`;
        const image = document.createElement("img");
        image.src = entry.src;
        image.alt = entry.label;
        const label = document.createElement("span");
        label.innerText = entry.label;
        button.append(image, label);
        button.onclick = () => selectAiJenaHistoryEntry(index, true);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ai-jena-history-delete";
        remove.innerText = "×";
        remove.title = `${entry.label} 히스토리 삭제`;
        remove.setAttribute("aria-label", `${entry.label} 히스토리 삭제`);
        remove.onclick = event => {
            event.stopPropagation();
            deleteAiJenaHistoryEntry(index);
        };
        wrapper.append(button, remove);
        dom.aiJenaHistoryList.appendChild(wrapper);
    });
    const active = dom.aiJenaHistoryList.querySelector(".active");
    active?.scrollIntoView({ block: "nearest" });
}

async function deleteAiJenaHistoryEntry(index) {
    if (aiJenaState.processing) return;
    const entry = aiJenaState.history[index];
    if (!entry || !confirm(`"${entry.label}" 히스토리를 지울까요?`)) return;
    const wasActive = index === aiJenaState.activeHistoryIndex;
    aiJenaState.history.splice(index, 1);
    if (index < aiJenaState.activeHistoryIndex) aiJenaState.activeHistoryIndex -= 1;
    else if (wasActive) aiJenaState.activeHistoryIndex = -1;
    await persistAiJenaHistorySession();
    renderAiJenaHistory();
    if (wasActive && aiJenaState.history.length) {
        await selectAiJenaHistoryEntry(
            Math.min(index, aiJenaState.history.length - 1),
            false
        );
    }
}

async function clearAllAiJenaHistory() {
    if (aiJenaState.processing || !aiJenaState.history.length) return;
    if (!confirm("AI Jena 히스토리를 모두 지울까요? 이 작업은 되돌릴 수 없습니다.")) return;
    aiJenaState.history = [];
    aiJenaState.activeHistoryIndex = -1;
    await persistAiJenaHistorySession();
    renderAiJenaHistory();
}

async function selectAiJenaHistoryEntry(index, announce = true) {
    const entry = aiJenaState.history[index];
    if (!entry || aiJenaState.processing) return;
    try {
        const image = await loadUpscaleImage(entry.src);
        aiJenaState.activeHistoryIndex = index;
        aiJenaState.sourceImage = image;
        aiJenaState.sourceItem = {
            src: entry.src,
            path: entry.path,
            mimeType: entry.mimeType
        };
        aiJenaState.resultSrc = entry.original ? "" : entry.src;
        aiJenaState.resultMimeType = entry.mimeType;
        dom.btnAddAiJenaResult.disabled = entry.original;
        dom.aiJenaResultPreview.style.display = "none";
        drawAiJenaSource();
        renderAiJenaHistory();
        if (entry.prompt) dom.aiJenaPrompt.value = entry.prompt;
        if (announce) {
            appendAiJenaMessage(
                "assistant",
                `${entry.label} 시점으로 이동했습니다. 이 이미지를 기준으로 편집을 계속할 수 있습니다.`
            );
        }
    } catch (error) {
        console.error("AI Jena history selection failed:", error);
        alert("선택한 AI 히스토리 이미지를 불러오지 못했습니다.");
    }
}

async function addAiJenaResult() {
    if (!aiJenaState.resultSrc || aiJenaState.saving) return;
    const canReplace = aiJenaState.sourceIndex >= 0 && Boolean(images[aiJenaState.sourceIndex]);
    dom.btnAiJenaReplace.disabled = !canReplace;
    dom.btnAiJenaReplace.title = canReplace
        ? "현재 원본 이미지를 AI 결과로 대체합니다."
        : "대체할 원본 이미지가 없어 새 이미지 생성만 사용할 수 있습니다.";
    dom.aiJenaSaveChoice.style.display = "flex";
    dom.btnAiJenaNew.focus();
}

function closeAiJenaSaveChoice() {
    if (dom.aiJenaSaveChoice) dom.aiJenaSaveChoice.style.display = "none";
}

async function saveAiJenaResult(saveMode) {
    if (!aiJenaState.resultSrc || aiJenaState.saving) return;
    aiJenaState.saving = true;
    dom.btnAiJenaReplace.disabled = true;
    dom.btnAiJenaNew.disabled = true;
    try {
        const source = images[aiJenaState.sourceIndex] || images[currentIndex] || null;
        const resultImage = await loadUpscaleImage(aiJenaState.resultSrc);
        const count = images.filter(item => item.group === "ai-jena").length + 1;
        const aiJenaInfo = {
            mode: aiJenaState.mode,
            prompt: dom.aiJenaPrompt.value.trim()
        };
        let resultIndex;
        if (saveMode === "replace" && source) {
            source.src = aiJenaState.resultSrc;
            source.date = Date.now();
            source.size = estimateDataUrlBytes(aiJenaState.resultSrc);
            source.mimeType = aiJenaState.resultMimeType;
            source.aiJenaInfo = aiJenaInfo;
            applyDerivedImageMetadata(
                source,
                source,
                resultImage.naturalWidth,
                resultImage.naturalHeight,
                "AI Jena"
            );
            resultIndex = images.indexOf(source);
        } else {
            const basePath = source?.path || "generated";
            let resultPath = `${basePath}.ai_jena_${count}`;
            let uniqueNumber = count;
            while (images.some(item => item.path === resultPath)) {
                uniqueNumber += 1;
                resultPath = `${basePath}.ai_jena_${uniqueNumber}`;
            }
            const item = {
                src: aiJenaState.resultSrc,
                path: resultPath,
                group: "ai-jena",
                date: Date.now(),
                size: estimateDataUrlBytes(aiJenaState.resultSrc),
                mimeType: aiJenaState.resultMimeType,
                isFav: false,
                aiJenaInfo
            };
            applyDerivedImageMetadata(
                item,
                source || item,
                resultImage.naturalWidth,
                resultImage.naturalHeight,
                "AI Jena"
            );
            resultIndex = source ? Math.max(0, images.indexOf(source)) + 1 : images.length;
            images.splice(resultIndex, 0, item);
        }
        renderGallery();
        renderFavorites();
        dom.imageCount.innerText = "Images: " + images.length;
        await saveCurrentImagesToDB();
        closeAiJena();
        showImage(Math.max(0, resultIndex));
    } catch (error) {
        console.error("AI Jena gallery save failed:", error);
        alert("AI Jena 결과를 갤러리에 저장하지 못했습니다: " + error.message);
    } finally {
        aiJenaState.saving = false;
        dom.btnAiJenaNew.disabled = false;
        dom.btnAiJenaReplace.disabled =
            !(aiJenaState.sourceIndex >= 0 && Boolean(images[aiJenaState.sourceIndex]));
    }
}

document.addEventListener("DOMContentLoaded", initAiJenaFeature);
