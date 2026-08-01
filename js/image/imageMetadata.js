/* =======================================================
   Image Metadata Cards & Editor
   ======================================================= */

var metadataEditorIndex = -1;
var metadataEditorWindow = null;
var metadataPopupPayload = null;

function initImageMetadataFeature() {
    if (!dom.imageMetadataModal) return;
    dom.btnMetadataClose.onclick = closeImageMetadataEditor;
    dom.btnMetadataCancel.onclick = closeImageMetadataEditor;
    dom.btnMetadataSave.onclick = saveImageMetadata;
    dom.btnAddMetadataField.onclick = () => addMetadataCustomField("", "");
    dom.imageMetadataModal.addEventListener("mousedown", event => {
        if (event.target === dom.imageMetadataModal) closeImageMetadataEditor();
    });
    window.addEventListener("message", handleMetadataWindowMessage);
}

function createImageMetadataCard(index, imageElement) {
    const item = images[index];
    const card = document.createElement("div");
    card.className = "image-metadata-card";
    card.dataset.imageIndex = String(index);

    const content = document.createElement("div");
    content.className = "image-metadata-summary";
    card.appendChild(content);

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "metadata-edit-button";
    editButton.innerText = "✎ 메타정보 편집";
    editButton.onclick = event => {
        event.stopPropagation();
        openImageMetadataEditor(index);
    };
    card.appendChild(editButton);
    if (index === currentIndex && dom.previewBottomControls) {
        dom.previewBottomControls.hidden = false;
        card.appendChild(dom.previewBottomControls);
    }

    const refresh = () => {
        if (imageElement?.naturalWidth) {
            item.width = imageElement.naturalWidth;
            item.height = imageElement.naturalHeight;
        }
        renderImageMetadataSummary(content, item);
    };
    if (imageElement) {
        imageElement.addEventListener("load", refresh, { once: true });
        imageElement.addEventListener("loadedmetadata", () => {
            if (imageElement.videoWidth) {
                item.width = imageElement.videoWidth;
                item.height = imageElement.videoHeight;
                item.duration = Number(imageElement.duration) || item.duration || 0;
            }
            renderImageMetadataSummary(content, item);
        }, { once: true });
    }
    refresh();
    return card;
}

function renderImageMetadataSummary(container, item) {
    container.innerHTML = "";
    const metadata = item.metadata || {};
    const width = Number(item.width) || 0;
    const height = Number(item.height) || 0;
    const ratio = width && height ? formatMetadataRatio(width, height) : "확인 중";
    const values = [
        ["용량", formatMetadataBytes(item.size || estimateDataUrlBytes(item.src))],
        ["종류", getImageTypeLabel(item)],
        ["해상도", width && height ? `${width} × ${height}` : "확인 중"],
        ["비율", ratio],
        ["생성일", formatMetadataDate(item.createdAt || item.date)],
        ["그룹", item.group || "미지정"]
    ];
    if (isVideoMedia(item) && Number(item.duration) > 0) {
        values.splice(4, 0, ["재생시간", `${Number(item.duration).toFixed(1)}초`]);
    }

    values.forEach(([label, value]) => {
        const chip = document.createElement("span");
        chip.className = "metadata-chip";
        const labelElement = document.createElement("b");
        labelElement.innerText = label;
        const valueElement = document.createElement("em");
        valueElement.innerText = value;
        chip.append(labelElement, valueElement);
        container.appendChild(chip);
    });

    if (metadata.title || metadata.author || metadata.keywords) {
        const customSummary = document.createElement("span");
        customSummary.className = "metadata-user-summary";
        customSummary.innerText = [
            metadata.title,
            metadata.author,
            Array.isArray(metadata.keywords) ? metadata.keywords.join(", ") : metadata.keywords
        ].filter(Boolean).join(" · ");
        container.appendChild(customSummary);
    }
}

async function openImageMetadataEditor(index) {
    const item = images[index];
    if (!item) return;
    metadataEditorIndex = index;

    // Open synchronously from the click handler so browsers do not block the
    // movable editor while image dimensions/EXIF are being read asynchronously.
    const popup = window.open(
        "metadata_window.html?v=20260731-1",
        "fmaMetadataEditor",
        "popup=yes,width=980,height=820,resizable=yes,scrollbars=yes"
    );
    if (popup) {
        metadataEditorWindow = popup;
        metadataPopupPayload = buildMetadataPopupPayload(item, index);
        popup.focus();
    }

    if (!item.width || !item.height) {
        try {
            const image = await loadUpscaleImage(item.src);
            item.width = image.naturalWidth;
            item.height = image.naturalHeight;
        } catch (error) {
            console.warn("Metadata dimensions unavailable:", error);
        }
    }

    if (popup) {
        metadataPopupPayload = buildMetadataPopupPayload(item, index);
        await loadEmbeddedImageMetadata(item);
        metadataPopupPayload = buildMetadataPopupPayload(item, index);
        sendMetadataPopupPayload();
        return;
    }

    // Pop-up blocking fallback: retain the in-page editor.
    const metadata = item.metadata || {};
    dom.metadataPath.value = item.path || "";
    dom.metadataGroup.value = item.group || "";
    dom.metadataCreatedAt.value = toMetadataDateTimeLocal(item.createdAt || item.date);
    dom.metadataTitleField.value = metadata.title || "";
    dom.metadataAuthor.value = metadata.author || "";
    dom.metadataCopyright.value = metadata.copyright || "";
    dom.metadataKeywords.value = Array.isArray(metadata.keywords)
        ? metadata.keywords.join(", ")
        : metadata.keywords || "";
    dom.metadataDescription.value = metadata.description || "";
    dom.metadataCustomFields.innerHTML = "";
    Object.entries(metadata.custom || {}).forEach(([key, value]) => {
        addMetadataCustomField(key, String(value ?? ""));
    });
    if (Object.keys(metadata.custom || {}).length === 0) addMetadataCustomField("", "");

    renderMetadataTechnicalGrid(item);
    dom.embeddedMetadataView.innerText = "원본 메타정보를 읽는 중...";
    dom.imageMetadataModal.style.display = "flex";
    dom.metadataTitleField.focus();
    await loadEmbeddedImageMetadata(item);
}

function buildMetadataPopupPayload(item, index) {
    const width = Number(item.width) || 0;
    const height = Number(item.height) || 0;
    return {
        index,
        token: item.dbRecordId || `${item.path || "image"}|${item.date || 0}`,
        item: {
            path: item.path || "",
            group: item.group || "",
            createdAt: toMetadataDateTimeLocal(item.createdAt || item.date),
            metadata: typeof structuredClone === "function"
                ? structuredClone(item.metadata || {})
                : JSON.parse(JSON.stringify(item.metadata || {}))
        },
        technical: [
            ["파일 형식", item.mimeType || getImageTypeLabel(item)],
            ["파일 용량", formatMetadataBytes(item.size || estimateDataUrlBytes(item.src))],
            ["픽셀 크기", width && height ? `${width} × ${height}px` : "알 수 없음"],
            ["화면 비율", width && height ? formatMetadataRatio(width, height) : "알 수 없음"],
            ["즐겨찾기", item.isFav ? "예" : "아니오"],
            ["처리 이력", getImageProcessingLabel(item)]
        ],
        embeddedText: item.embeddedMetadata && Object.keys(item.embeddedMetadata).length
            ? JSON.stringify(item.embeddedMetadata, null, 2)
            : "이 이미지에 읽을 수 있는 EXIF · XMP · IPTC 정보가 없습니다."
    };
}

function sendMetadataPopupPayload() {
    if (!metadataEditorWindow || metadataEditorWindow.closed || !metadataPopupPayload) return;
    metadataEditorWindow.postMessage(
        { type: "fma-metadata-data", payload: metadataPopupPayload },
        window.location.origin === "null" ? "*" : window.location.origin
    );
}

function handleMetadataWindowMessage(event) {
    if (event.source !== metadataEditorWindow) return;
    const data = event.data || {};
    if (data.type === "fma-metadata-ready") {
        sendMetadataPopupPayload();
        return;
    }
    if (data.type !== "fma-metadata-save") return;
    let index = images.findIndex(item =>
        (item.dbRecordId || `${item.path || "image"}|${item.date || 0}`) === data.token
    );
    if (index < 0) index = Number(data.index);
    const item = images[index];
    if (!item) return;
    const values = data.values || {};
    const parsedDate = Date.parse(values.createdAt);
    item.path = values.path || item.path;
    item.group = values.group || "added";
    if (Number.isFinite(parsedDate)) {
        item.createdAt = parsedDate;
        item.date = parsedDate;
    }
    item.modifiedAt = Date.now();
    item.metadata = values.metadata || {};
    renderGallery();
    renderFavorites();
    saveCurrentImagesToDB();
    showImage(index);
}

function closeImageMetadataEditor() {
    dom.imageMetadataModal.style.display = "none";
    metadataEditorIndex = -1;
}

function renderMetadataTechnicalGrid(item) {
    const width = Number(item.width) || 0;
    const height = Number(item.height) || 0;
    const processing = getImageProcessingLabel(item);
    const rows = [
        ["파일 형식", item.mimeType || getImageTypeLabel(item)],
        ["파일 용량", formatMetadataBytes(item.size || estimateDataUrlBytes(item.src))],
        ["픽셀 크기", width && height ? `${width} × ${height}px` : "알 수 없음"],
        ["화면 비율", width && height ? formatMetadataRatio(width, height) : "알 수 없음"],
        ["즐겨찾기", item.isFav ? "예" : "아니오"],
        ["처리 이력", processing]
    ];
    dom.metadataTechnicalGrid.innerHTML = "";
    rows.forEach(([label, value]) => {
        const row = document.createElement("div");
        const labelElement = document.createElement("span");
        labelElement.innerText = label;
        const valueElement = document.createElement("b");
        valueElement.innerText = value;
        row.append(labelElement, valueElement);
        dom.metadataTechnicalGrid.appendChild(row);
    });
}

function addMetadataCustomField(key, value) {
    const row = document.createElement("div");
    row.className = "metadata-custom-row";
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.placeholder = "항목 이름";
    keyInput.value = key;
    keyInput.className = "metadata-custom-key";
    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.placeholder = "값";
    valueInput.value = value;
    valueInput.className = "metadata-custom-value";
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.innerText = "×";
    removeButton.ariaLabel = "사용자 메타정보 삭제";
    removeButton.onclick = () => row.remove();
    row.append(keyInput, valueInput, removeButton);
    dom.metadataCustomFields.appendChild(row);
}

function saveImageMetadata() {
    const item = images[metadataEditorIndex];
    if (!item) return;

    const custom = {};
    dom.metadataCustomFields.querySelectorAll(".metadata-custom-row").forEach(row => {
        const key = row.querySelector(".metadata-custom-key").value.trim();
        const value = row.querySelector(".metadata-custom-value").value.trim();
        if (key) custom[key] = value;
    });

    const parsedDate = Date.parse(dom.metadataCreatedAt.value);
    item.path = dom.metadataPath.value.trim() || item.path;
    item.group = dom.metadataGroup.value.trim() || "added";
    if (Number.isFinite(parsedDate)) {
        item.createdAt = parsedDate;
        item.date = parsedDate;
    }
    item.modifiedAt = Date.now();
    item.metadata = {
        title: dom.metadataTitleField.value.trim(),
        author: dom.metadataAuthor.value.trim(),
        copyright: dom.metadataCopyright.value.trim(),
        description: dom.metadataDescription.value.trim(),
        keywords: dom.metadataKeywords.value.split(",").map(value => value.trim()).filter(Boolean),
        custom: custom
    };

    const index = metadataEditorIndex;
    closeImageMetadataEditor();
    renderGallery();
    renderFavorites();
    saveCurrentImagesToDB();
    showImage(index);
}

async function loadEmbeddedImageMetadata(item) {
    if (item.embeddedMetadataScanned) {
        renderEmbeddedMetadata(item.embeddedMetadata);
        return;
    }
    if (!window.exifr?.parse) {
        dom.embeddedMetadataView.innerText = "EXIF 분석 라이브러리를 불러오지 못했습니다.";
        return;
    }

    try {
        const blob = await (await fetch(item.src)).blob();
        const parsed = await window.exifr.parse(blob, true);
        item.embeddedMetadata = sanitizeEmbeddedMetadata(parsed || {});
        item.embeddedMetadataScanned = true;
        renderEmbeddedMetadata(item.embeddedMetadata);
        saveCurrentImagesToDB();
    } catch (error) {
        console.warn("Embedded metadata parse failed:", error);
        item.embeddedMetadata = {};
        item.embeddedMetadataScanned = true;
        dom.embeddedMetadataView.innerText =
            "이 이미지에 읽을 수 있는 EXIF · XMP · IPTC 정보가 없습니다.";
    }
}

function renderEmbeddedMetadata(metadata) {
    if (!metadata || Object.keys(metadata).length === 0) {
        dom.embeddedMetadataView.innerText =
            "이 이미지에 읽을 수 있는 EXIF · XMP · IPTC 정보가 없습니다.";
        return;
    }
    dom.embeddedMetadataView.innerText = JSON.stringify(metadata, null, 2);
}

function sanitizeEmbeddedMetadata(value, depth = 0) {
    if (depth > 6 || value == null) return value;
    if (value instanceof Date) return value.toISOString();
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Blob) {
        return `[binary ${value.byteLength || value.size || 0} bytes]`;
    }
    if (Array.isArray(value)) {
        return value.slice(0, 200).map(item => sanitizeEmbeddedMetadata(item, depth + 1));
    }
    if (typeof value === "object") {
        const output = {};
        Object.entries(value).slice(0, 500).forEach(([key, item]) => {
            if (/thumbnail|makerNote/i.test(key) && typeof item === "object") {
                output[key] = "[binary metadata omitted]";
            } else {
                output[key] = sanitizeEmbeddedMetadata(item, depth + 1);
            }
        });
        return output;
    }
    return typeof value === "bigint" ? String(value) : value;
}

function getImageProcessingLabel(item) {
    const labels = [];
    if (item.cropRect) labels.push("Crop");
    if (item.upscaleMethod) labels.push(item.upscaleMethod === "ai" ? "AI Upscale" : "Canvas Upscale");
    if (item.backgroundRemoveMethod) {
        labels.push(item.backgroundRemoveMethod === "ai" ? "AI BG Remove" : "Local BG Remove");
    }
    if (item.imageEditConfig) labels.push("Image Edit");
    return labels.length ? labels.join(" → ") : "원본 또는 추가 이미지";
}

function applyDerivedImageMetadata(target, source, width, height, processLabel) {
    const sourceMetadata = source?.metadata || {};
    const currentTitle = sourceMetadata.title || "";
    target.width = Number(width) || target.width;
    target.height = Number(height) || target.height;
    target.modifiedAt = Date.now();
    target.embeddedMetadata = {};
    target.embeddedMetadataScanned = false;
    target.metadata = {
        ...sourceMetadata,
        title: currentTitle
            ? `${currentTitle} · ${processLabel}`
            : processLabel,
        keywords: Array.isArray(sourceMetadata.keywords)
            ? [...sourceMetadata.keywords]
            : sourceMetadata.keywords || [],
        custom: { ...(sourceMetadata.custom || {}) }
    };
}

function formatMetadataBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return value + " B";
    if (value < 1048576) return (value / 1024).toFixed(1) + " KB";
    return (value / 1048576).toFixed(2) + " MB";
}

function estimateDataUrlBytes(src) {
    const base64 = String(src || "").split(",")[1] || "";
    return Math.max(0, Math.floor(base64.length * .75));
}

function formatMetadataDate(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function toMetadataDateTimeLocal(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function formatMetadataRatio(width, height) {
    const divisor = metadataGreatestCommonDivisor(width, height);
    const left = Math.round(width / divisor);
    const right = Math.round(height / divisor);
    if (left > 100 || right > 100) return (width / height).toFixed(2) + ":1";
    return `${left}:${right}`;
}

function metadataGreatestCommonDivisor(a, b) {
    let left = Math.abs(Math.round(a));
    let right = Math.abs(Math.round(b));
    while (right) {
        const next = left % right;
        left = right;
        right = next;
    }
    return left || 1;
}

document.addEventListener("DOMContentLoaded", initImageMetadataFeature);
