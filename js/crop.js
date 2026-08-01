/* =======================================================
   Non-destructive Image Crop Editor
   ======================================================= */

var cropState = {
    imageIndex: -1,
    image: null,
    selection: null,
    dragging: false,
    startX: 0,
    startY: 0,
    dragMode: null,
    moveOffsetX: 0,
    moveOffsetY: 0,
    resizeRatio: null,
    selectionCanMove: false,
    aspectRatio: null,
    previewSrc: "",
    layerApplyCallback: null,
    layerMode: false
};

function initCropEditor() {
    if (!dom.cropModal || !dom.cropCanvas) return;

    dom.btnCropClose.onclick = closeCropEditor;
    dom.btnCropCancel.onclick = closeCropEditor;
    dom.btnCropReset.onclick = resetCropSelection;
    dom.btnApplyCropSize.onclick = applyCropSizeFromInputs;
    dom.btnCropCreate.onclick = promptCropSaveChoice;
    dom.btnCropChoiceCancel.onclick = closeCropSaveChoice;
    dom.btnCropReplace.onclick = () => createCroppedImage("replace");
    dom.btnCropNew.onclick = () => createCroppedImage("new");

    document.querySelectorAll(".crop-ratio").forEach(button => {
        button.onclick = () => {
            const value = button.getAttribute("data-ratio");
            cropState.aspectRatio = value === "free" ? null : Number(value);
            dom.cropAspectLock.checked = cropState.aspectRatio !== null;
            document.querySelectorAll(".crop-ratio").forEach(item => {
                item.classList.toggle("active", item === button);
            });
            resetCropSelection();
        };
    });

    dom.cropWidthInput.oninput = () => syncCropLockedDimension("width");
    dom.cropHeightInput.oninput = () => syncCropLockedDimension("height");
    [dom.cropWidthInput, dom.cropHeightInput].forEach(input => {
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyCropSizeFromInputs();
            }
        });
    });

    dom.cropModal.addEventListener("mousedown", event => {
        if (event.target === dom.cropModal) closeCropEditor();
    });

    dom.cropCanvas.addEventListener("pointerdown", startCropSelection);
    dom.cropCanvas.addEventListener("pointermove", updateCropSelection);
    dom.cropCanvas.addEventListener("pointerup", finishCropSelection);
    dom.cropCanvas.addEventListener("pointercancel", finishCropSelection);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && dom.cropModal.style.display !== "none") {
            if (dom.cropSaveChoice && dom.cropSaveChoice.style.display !== "none") {
                closeCropSaveChoice();
            } else {
                closeCropEditor();
            }
        }
    });
}

function openCropEditor(index) {
    const item = images[index];
    if (!item || !dom.cropModal) return;
    cropState.layerApplyCallback = null;
    setCropEditorLayerMode(false);
    openCropEditorFromSource(item.src, index);
}

function openCropEditorForLayer(src, onApply) {
    if (!src || typeof onApply !== "function" || !dom.cropModal) return;
    cropState.layerApplyCallback = onApply;
    setCropEditorLayerMode(true);
    openCropEditorFromSource(src, -1);
}

function setCropEditorLayerMode(enabled) {
    cropState.layerMode = Boolean(enabled);
    dom.cropModal?.classList.toggle("editor-child-workspace", cropState.layerMode);
    if (dom.btnCropCreate) {
        dom.btnCropCreate.innerText = cropState.layerMode
            ? "이미지 편집으로 보내기"
            : "Crop 적용";
    }
    const note = dom.cropModal?.querySelector(".crop-note");
    if (note) {
        note.innerText = cropState.layerMode
            ? "Crop 결과는 갤러리가 아닌 현재 이미지 편집 레이어에 적용됩니다."
            : "적용 후 원본 대체 또는 새 이미지 생성을 선택할 수 있습니다.";
    }
}

function openCropEditorFromSource(src, imageIndex) {
    const sourceImage = new Image();
    sourceImage.onload = () => {
        cropState.imageIndex = imageIndex;
        cropState.image = sourceImage;
        cropState.aspectRatio = null;
        cropState.selection = null;
        dom.cropAspectLock.checked = false;
        dom.cropWidthInput.max = String(sourceImage.naturalWidth);
        dom.cropHeightInput.max = String(sourceImage.naturalHeight);

        document.querySelectorAll(".crop-ratio").forEach(button => {
            button.classList.toggle("active", button.getAttribute("data-ratio") === "free");
        });

        sizeCropCanvas(sourceImage);
        closeCropSaveChoice();
        dom.cropModal.style.display = "flex";
        document.body.classList.add("crop-open");
        resetCropSelection();
        dom.btnCropCreate.focus();
    };
    sourceImage.onerror = () => alert("Crop할 이미지를 불러올 수 없습니다.");
    sourceImage.src = src;
}

function sizeCropCanvas(image) {
    const maxWidth = Math.min(1020, window.innerWidth - 90);
    const maxHeight = Math.min(650, window.innerHeight - 250);
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    dom.cropCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    dom.cropCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
}

function closeCropEditor() {
    if (!dom.cropModal) return;
    dom.cropModal.style.display = "none";
    dom.cropModal.classList.remove("ai-jena-child-workspace");
    document.body.classList.remove("crop-open");
    cropState.imageIndex = -1;
    cropState.image = null;
    cropState.selection = null;
    cropState.dragging = false;
    cropState.dragMode = null;
    cropState.selectionCanMove = false;
    cropState.previewSrc = "";
    cropState.layerApplyCallback = null;
    setCropEditorLayerMode(false);
    closeCropSaveChoice();
}

function resetCropSelection() {
    if (!cropState.image) return;
    const canvas = dom.cropCanvas;
    let width = canvas.width;
    let height = canvas.height;

    if (cropState.aspectRatio) {
        if (width / height > cropState.aspectRatio) {
            width = height * cropState.aspectRatio;
        } else {
            height = width / cropState.aspectRatio;
        }
    }

    cropState.selection = {
        x: (canvas.width - width) / 2,
        y: (canvas.height - height) / 2,
        width: width,
        height: height
    };
    cropState.selectionCanMove = cropState.aspectRatio !== null;
    dom.cropCanvas.style.cursor = cropState.selectionCanMove ? "move" : "crosshair";
    drawCropEditor();
}

function getCropPointer(event) {
    const rect = dom.cropCanvas.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(dom.cropCanvas.width, (event.clientX - rect.left) * dom.cropCanvas.width / rect.width)),
        y: Math.max(0, Math.min(dom.cropCanvas.height, (event.clientY - rect.top) * dom.cropCanvas.height / rect.height))
    };
}

function startCropSelection(event) {
    if (!cropState.image) return;
    const point = getCropPointer(event);
    cropState.dragging = true;
    const resizeHandle = getCropResizeHandle(point);

    if (resizeHandle) {
        cropState.dragMode = `resize-${resizeHandle}`;
        cropState.startX = resizeHandle === "sw"
            ? cropState.selection.x + cropState.selection.width
            : cropState.selection.x;
        cropState.startY = cropState.selection.y;
        cropState.resizeRatio = cropState.aspectRatio ||
            (dom.cropAspectLock.checked ? cropState.selection.width / cropState.selection.height : null);
        dom.cropCanvas.style.cursor = resizeHandle === "sw" ? "nesw-resize" : "nwse-resize";
    } else if (cropState.selectionCanMove && isPointInCropSelection(point)) {
        cropState.dragMode = "move";
        cropState.moveOffsetX = point.x - cropState.selection.x;
        cropState.moveOffsetY = point.y - cropState.selection.y;
        dom.cropCanvas.style.cursor = "grabbing";
    } else {
        cropState.dragMode = "select";
        cropState.startX = point.x;
        cropState.startY = point.y;
        cropState.selection = { x: point.x, y: point.y, width: 0, height: 0 };
        cropState.selectionCanMove = false;
        dom.cropCanvas.style.cursor = "crosshair";
    }

    dom.cropCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
}

function updateCropSelection(event) {
    const point = getCropPointer(event);

    if (!cropState.dragging) {
        const handle = getCropResizeHandle(point);
        dom.cropCanvas.style.cursor = handle
            ? handle === "sw" ? "nesw-resize" : "nwse-resize"
            : cropState.selectionCanMove && isPointInCropSelection(point) ? "move" : "crosshair";
        return;
    }

    if (cropState.dragMode === "move") {
        cropState.selection.x = Math.max(
            0,
            Math.min(dom.cropCanvas.width - cropState.selection.width, point.x - cropState.moveOffsetX)
        );
        cropState.selection.y = Math.max(
            0,
            Math.min(dom.cropCanvas.height - cropState.selection.height, point.y - cropState.moveOffsetY)
        );
    } else if (cropState.dragMode?.startsWith("resize-")) {
        cropState.selection = calculateCropSelection(
            cropState.startX,
            cropState.startY,
            point.x,
            point.y,
            cropState.resizeRatio,
            dom.cropCanvas.width,
            dom.cropCanvas.height
        );
    } else {
        cropState.selection = calculateCropSelection(
            cropState.startX,
            cropState.startY,
            point.x,
            point.y,
            cropState.aspectRatio,
            dom.cropCanvas.width,
            dom.cropCanvas.height
        );
    }

    drawCropEditor();
}

function finishCropSelection(event) {
    if (!cropState.dragging) return;
    cropState.dragging = false;
    cropState.dragMode = null;
    cropState.resizeRatio = null;
    if (dom.cropCanvas.hasPointerCapture(event.pointerId)) {
        dom.cropCanvas.releasePointerCapture(event.pointerId);
    }
    if (!cropState.selection || cropState.selection.width < 3 || cropState.selection.height < 3) {
        resetCropSelection();
    } else {
        cropState.selectionCanMove = true;
        drawCropEditor();
    }
    dom.cropCanvas.style.cursor = cropState.selectionCanMove ? "move" : "crosshair";
}

function isPointInCropSelection(point) {
    const selection = cropState.selection;
    if (!selection || selection.width < 3 || selection.height < 3) return false;
    return point.x >= selection.x &&
        point.x <= selection.x + selection.width &&
        point.y >= selection.y &&
        point.y <= selection.y + selection.height;
}

function getCropResizeHandle(point) {
    const selection = cropState.selection;
    if (!selection || selection.width < 3 || selection.height < 3) return null;
    const hitRadius = 14;
    const handles = [
        { name: "sw", x: selection.x, y: selection.y + selection.height },
        { name: "se", x: selection.x + selection.width, y: selection.y + selection.height }
    ];
    return handles.find(handle =>
        Math.hypot(point.x - handle.x, point.y - handle.y) <= hitRadius
    )?.name || null;
}

function calculateCropSelection(startX, startY, endX, endY, ratio, maxWidth, maxHeight) {
    let deltaX = endX - startX;
    let deltaY = endY - startY;

    if (ratio) {
        const signX = deltaX < 0 ? -1 : 1;
        const signY = deltaY < 0 ? -1 : 1;
        let width = Math.abs(deltaX);
        let height = Math.abs(deltaY);

        if (width / Math.max(height, 0.001) > ratio) {
            height = width / ratio;
        } else {
            width = height * ratio;
        }

        width = Math.min(width, signX > 0 ? maxWidth - startX : startX);
        height = width / ratio;
        if (height > (signY > 0 ? maxHeight - startY : startY)) {
            height = signY > 0 ? maxHeight - startY : startY;
            width = height * ratio;
        }
        deltaX = width * signX;
        deltaY = height * signY;
    }

    const endClampedX = Math.max(0, Math.min(maxWidth, startX + deltaX));
    const endClampedY = Math.max(0, Math.min(maxHeight, startY + deltaY));
    return {
        x: Math.min(startX, endClampedX),
        y: Math.min(startY, endClampedY),
        width: Math.abs(endClampedX - startX),
        height: Math.abs(endClampedY - startY)
    };
}

function drawCropEditor() {
    if (!cropState.image) return;
    const canvas = dom.cropCanvas;
    const context = canvas.getContext("2d");
    const selection = cropState.selection;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(cropState.image, 0, 0, canvas.width, canvas.height);

    if (!selection) return;

    context.save();
    context.fillStyle = "rgba(0, 0, 0, 0.58)";
    context.beginPath();
    context.rect(0, 0, canvas.width, canvas.height);
    context.rect(selection.x, selection.y, selection.width, selection.height);
    context.fill("evenodd");

    context.strokeStyle = "#a5ff8a";
    context.lineWidth = 2;
    context.setLineDash([]);
    context.strokeRect(selection.x, selection.y, selection.width, selection.height);

    context.strokeStyle = "rgba(255, 255, 255, 0.7)";
    context.lineWidth = 1;
    context.setLineDash([5, 5]);
    context.beginPath();
    context.moveTo(selection.x + selection.width / 3, selection.y);
    context.lineTo(selection.x + selection.width / 3, selection.y + selection.height);
    context.moveTo(selection.x + selection.width * 2 / 3, selection.y);
    context.lineTo(selection.x + selection.width * 2 / 3, selection.y + selection.height);
    context.moveTo(selection.x, selection.y + selection.height / 3);
    context.lineTo(selection.x + selection.width, selection.y + selection.height / 3);
    context.moveTo(selection.x, selection.y + selection.height * 2 / 3);
    context.lineTo(selection.x + selection.width, selection.y + selection.height * 2 / 3);
    context.stroke();

    const handleRadius = 7;
    [selection.x, selection.x + selection.width].forEach(handleX => {
        context.beginPath();
        context.arc(handleX, selection.y + selection.height, handleRadius, 0, Math.PI * 2);
        context.fillStyle = "#a5ff8a";
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = "#102015";
        context.setLineDash([]);
        context.stroke();
    });
    context.restore();

    updateCropSelectionInfo();
}

function getSourceCropRect() {
    const selection = cropState.selection;
    const image = cropState.image;
    if (!selection || !image) return null;

    const scaleX = image.naturalWidth / dom.cropCanvas.width;
    const scaleY = image.naturalHeight / dom.cropCanvas.height;
    const x = Math.max(0, Math.round(selection.x * scaleX));
    const y = Math.max(0, Math.round(selection.y * scaleY));
    const width = Math.min(image.naturalWidth - x, Math.max(1, Math.round(selection.width * scaleX)));
    const height = Math.min(image.naturalHeight - y, Math.max(1, Math.round(selection.height * scaleY)));
    return { x: x, y: y, width: width, height: height };
}

function updateCropSelectionInfo() {
    const sourceRect = getSourceCropRect();
    if (!sourceRect) {
        dom.cropSelectionInfo.innerText = "선택 영역 없음";
        return;
    }
    dom.cropSelectionInfo.innerText = `${sourceRect.width} × ${sourceRect.height}px`;
    if (document.activeElement !== dom.cropWidthInput) {
        dom.cropWidthInput.value = String(sourceRect.width);
    }
    if (document.activeElement !== dom.cropHeightInput) {
        dom.cropHeightInput.value = String(sourceRect.height);
    }
}

function getCropInputAspectRatio() {
    const sourceRect = getSourceCropRect();
    if (cropState.aspectRatio) return cropState.aspectRatio;
    if (sourceRect?.width && sourceRect?.height) return sourceRect.width / sourceRect.height;
    if (cropState.image) return cropState.image.naturalWidth / cropState.image.naturalHeight;
    return 1;
}

function syncCropLockedDimension(changedDimension) {
    if (!dom.cropAspectLock.checked || !cropState.image) return;
    const ratio = getCropInputAspectRatio();
    if (changedDimension === "width") {
        const width = Number(dom.cropWidthInput.value);
        if (Number.isFinite(width) && width > 0) {
            dom.cropHeightInput.value = String(Math.max(1, Math.round(width / ratio)));
        }
    } else {
        const height = Number(dom.cropHeightInput.value);
        if (Number.isFinite(height) && height > 0) {
            dom.cropWidthInput.value = String(Math.max(1, Math.round(height * ratio)));
        }
    }
}

function applyCropSizeFromInputs() {
    const image = cropState.image;
    if (!image) return;

    const requestedWidth = Math.round(Number(dom.cropWidthInput.value));
    const requestedHeight = Math.round(Number(dom.cropHeightInput.value));
    if (!Number.isFinite(requestedWidth) || !Number.isFinite(requestedHeight) ||
        requestedWidth < 1 || requestedHeight < 1) {
        alert("Crop 가로·세로 값을 1px 이상의 숫자로 입력하세요.");
        return;
    }

    const width = Math.min(image.naturalWidth, requestedWidth);
    const height = Math.min(image.naturalHeight, requestedHeight);
    const currentRect = getSourceCropRect() || {
        x: 0,
        y: 0,
        width: image.naturalWidth,
        height: image.naturalHeight
    };
    const centerX = currentRect.x + currentRect.width / 2;
    const centerY = currentRect.y + currentRect.height / 2;
    const sourceX = Math.max(0, Math.min(image.naturalWidth - width, centerX - width / 2));
    const sourceY = Math.max(0, Math.min(image.naturalHeight - height, centerY - height / 2));
    const scaleX = dom.cropCanvas.width / image.naturalWidth;
    const scaleY = dom.cropCanvas.height / image.naturalHeight;

    cropState.selection = {
        x: sourceX * scaleX,
        y: sourceY * scaleY,
        width: width * scaleX,
        height: height * scaleY
    };
    cropState.selectionCanMove = true;
    cropState.aspectRatio = dom.cropAspectLock.checked ? width / height : null;
    document.querySelectorAll(".crop-ratio").forEach(button => {
        const value = button.getAttribute("data-ratio");
        const ratio = value === "free" ? null : Number(value);
        button.classList.toggle(
            "active",
            cropState.aspectRatio === null
                ? value === "free"
                : ratio !== null && Math.abs(ratio - cropState.aspectRatio) < 0.0001
        );
    });
    dom.cropWidthInput.value = String(width);
    dom.cropHeightInput.value = String(height);
    dom.cropCanvas.style.cursor = "move";
    drawCropEditor();
}

function promptCropSaveChoice() {
    const sourceRect = getSourceCropRect();
    const sourceItem = images[cropState.imageIndex];
    if (!sourceRect || (!sourceItem && !cropState.layerApplyCallback) ||
        sourceRect.width < 1 || sourceRect.height < 1) {
        alert("Crop할 영역을 선택하세요.");
        return;
    }
    cropState.previewSrc = buildCroppedImageSource(sourceRect);
    if (cropState.layerApplyCallback) {
        const callback = cropState.layerApplyCallback;
        const result = cropState.previewSrc;
        cropState.layerApplyCallback = null;
        Promise.resolve(callback(result, sourceRect))
            .then(closeCropEditor)
            .catch(error => {
                console.error("Layer crop apply failed:", error);
                alert("레이어 Crop 결과를 적용하지 못했습니다: " + error.message);
            });
        return;
    }
    dom.cropResultPreview.src = cropState.previewSrc;
    dom.cropResultDimensions.innerText = `${sourceRect.width} × ${sourceRect.height}px`;
    dom.cropSaveChoice.style.display = "flex";
    dom.btnCropNew.focus();
}

function closeCropSaveChoice() {
    if (dom.cropSaveChoice) dom.cropSaveChoice.style.display = "none";
}

function createCroppedImage(saveMode) {
    const sourceRect = getSourceCropRect();
    const sourceItem = images[cropState.imageIndex];
    if (!sourceRect || !sourceItem) return;

    try {
        const croppedSource = cropState.previewSrc || buildCroppedImageSource(sourceRect);
        const sourceIndex = cropState.imageIndex;
        let resultIndex = sourceIndex;

        if (saveMode === "replace") {
            const editTime = Date.now();
            sourceItem.createdAt = sourceItem.createdAt || sourceItem.date || editTime;
            sourceItem.src = croppedSource;
            sourceItem.size = estimateDataUrlBytes(croppedSource);
            sourceItem.modifiedAt = editTime;
            sourceItem.mimeType = "image/png";
            sourceItem.cropRect = sourceRect;
            applyDerivedImageMetadata(
                sourceItem,
                sourceItem,
                sourceRect.width,
                sourceRect.height,
                "Crop"
            );
        } else {
            const cropNumber = images.filter(item => item.cropSourcePath === sourceItem.path).length + 1;
            const croppedItem = {
                src: croppedSource,
                path: `${sourceItem.path}.crop_${cropNumber}`,
                group: "cropped",
                date: Date.now(),
                createdAt: Date.now(),
                size: estimateDataUrlBytes(croppedSource),
                mimeType: "image/png",
                isFav: false,
                cropSourcePath: sourceItem.path,
                cropRect: sourceRect
            };
            applyDerivedImageMetadata(
                croppedItem,
                sourceItem,
                sourceRect.width,
                sourceRect.height,
                "Crop"
            );
            images.splice(sourceIndex + 1, 0, croppedItem);
            resultIndex = sourceIndex + 1;
        }

        closeCropEditor();
        renderGallery();
        renderFavorites();
        dom.imageCount.innerText = "Images: " + images.length;
        saveCurrentImagesToDB();
        showImage(resultIndex);
    } catch (error) {
        console.error("Crop error:", error);
        alert("Crop 이미지 생성 중 오류가 발생했습니다: " + error.message);
    }
}

function buildCroppedImageSource(sourceRect) {
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = sourceRect.width;
    outputCanvas.height = sourceRect.height;
    const context = outputCanvas.getContext("2d");
    context.drawImage(
        cropState.image,
        sourceRect.x,
        sourceRect.y,
        sourceRect.width,
        sourceRect.height,
        0,
        0,
        sourceRect.width,
        sourceRect.height
    );
    return outputCanvas.toDataURL("image/png");
}

document.addEventListener("DOMContentLoaded", initCropEditor);
