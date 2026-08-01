/* =======================================================
   Preview & Display Logic
   ======================================================= */

async function showImage(i) {
    if (images.length === 0) return;
    if (i < 0) i = 0;
    if (i >= images.length) i = images.length - 1;
    currentIndex = i;
    if (typeof ensureImageOriginalLoaded === "function") {
        try {
            await ensureImageOriginalLoaded(i);
        } catch (error) {
            console.error("Lazy original load failed:", error);
            alert("선택한 이미지 원본을 불러오지 못했습니다: " + error.message);
        }
    }
    const displayPosition = getImageDisplayPosition(i);

    if (orientation === 'vert') {
        const target = dom.previewContainer.children[displayPosition];
        const targetMedia = target?.querySelector("img, video");
        if (targetMedia) targetMedia.src = images[i].src;
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        renderDynamicMeta(i);
        updatePreviewPageText();
        return;
    }

    // Horizontal Slide Mode
    dom.previewContainer.innerHTML = "";
    dom.previewContainer.style.flexDirection = "row";
    const firstSlot = createPreviewImageSlot(i, "preview");
    dom.previewContainer.appendChild(firstSlot);

    const secondIndex = getSecondVisibleImageIndex(i);
    if (secondIndex >= 0) {
        if (typeof ensureImageOriginalLoaded === "function") {
            await ensureImageOriginalLoaded(secondIndex);
        }
        const secondSlot = createPreviewImageSlot(secondIndex, "preview2");
        dom.previewContainer.appendChild(secondSlot);
    }

    dom.placeholder.style.display = "none";
    dom.previewMeta.style.display = "flex";
    dom.zoomInfo.style.display = "block";
    updatePreviewPageText();
    renderDynamicMeta(i);
    resetZoom();
}

function createPreviewImageSlot(index, imageId) {
    const slot = document.createElement("div");
    slot.className = "preview-image-slot";

    const item = images[index];
    const media = document.createElement(isVideoMedia(item) ? "video" : "img");
    media.id = imageId;
    media.draggable = false;
    media.src = item.src;
    media.style.display = "block";
    if (media.tagName === "VIDEO") {
        media.controls = true;
        media.playsInline = true;
        media.preload = "auto";
        media.setAttribute("playsinline", "");
        media.setAttribute("webkit-playsinline", "");
        media.setAttribute("aria-label", item.metadata?.title || `video ${index + 1}`);
    } else {
        media.alt = item.metadata?.title || `preview ${index + 1}`;
    }

    slot.appendChild(media);
    slot.appendChild(createImageMetadataCard(index, media));
    return slot;
}

function getSecondVisibleImageIndex(firstIndex) {
    if (viewMode !== 2) return -1;
    const nextPosition = getImageDisplayPosition(firstIndex) + 1;
    return nextPosition < getActiveImageOrder().length ? getImageIndexAtDisplayPosition(nextPosition) : -1;
}

function updatePreviewPageText() {
    if (!dom.pageText) return;
    if (images.length === 0) {
        dom.pageText.innerText = "0 / 0";
        return;
    }
    const order = getActiveImageOrder();
    dom.pageText.innerText = order.length
        ? `${getImageDisplayPosition(currentIndex) + 1} / ${order.length}`
        : "0 / 0";
}

function renderDynamicMeta(i) {
    if (!dom.metaDynamicArea) return;
    dom.metaDynamicArea.innerHTML = "";

    const createMetaItem = (idx) => {
        const item = images[idx];
        const container = document.createElement("div");
        container.className = "meta-item";
        container.style.flex = "1";
        container.style.minWidth = "0";

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "actions meta-item-actions";
        actionsDiv.style.display = "flex";
        actionsDiv.style.gap = "5px";

        const favBtn = document.createElement("button");
        favBtn.innerText = item.isFav ? "★" : "☆";
        favBtn.className = "meta-action-button meta-favorite-button";
        favBtn.title = item.isFav ? "즐겨찾기 해제" : "즐겨찾기 추가";
        favBtn.setAttribute("aria-label", favBtn.title);
        favBtn.style.color = item.isFav ? "#ffd700" : "#fff";
        favBtn.onclick = () => {
            toggleFav(idx);
            renderDynamicMeta(i);
        };

        const downBtn = document.createElement("button");
        const videoItem = isVideoMedia(item);
        downBtn.innerText = "⇩";
        downBtn.className = "meta-action-button meta-download-button";
        downBtn.title = videoItem ? "영상 다운로드" : "이미지 다운로드";
        downBtn.setAttribute("aria-label", downBtn.title);
        downBtn.onclick = () => {
            const a = document.createElement("a");
            a.href = item.src;
            a.download = videoItem ? `video_${idx}.${getMediaFileExtension(item)}` : `image_${idx}.${getMediaFileExtension(item)}`;
            a.click();
        };

        const cropBtn = document.createElement("button");
        cropBtn.innerText = "Crop";
        cropBtn.className = "meta-action-button meta-crop-button";
        cropBtn.onclick = () => openCropEditor(idx);

        const editBtn = document.createElement("button");
        editBtn.innerText = "Edit";
        editBtn.className = "meta-action-button meta-edit-button";
        editBtn.onclick = () => openImageEditor(idx);

        const upscaleBtn = document.createElement("button");
        upscaleBtn.innerText = "Upscale";
        upscaleBtn.className = "meta-action-button meta-upscale-button";
        upscaleBtn.onclick = () => openUpscaleEditor(idx, "local");

        const bgRemoveBtn = document.createElement("button");
        bgRemoveBtn.innerText = "BG Remove";
        bgRemoveBtn.className = "meta-action-button meta-bg-remove-button";
        bgRemoveBtn.onclick = () => openBackgroundRemoveEditor(idx, "local");

        actionsDiv.appendChild(favBtn);
        actionsDiv.appendChild(downBtn);
        if (videoItem) {
            editBtn.onclick = () => openVideoEditor(idx);
            actionsDiv.appendChild(editBtn);
        } else {
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(cropBtn);
            actionsDiv.appendChild(bgRemoveBtn);
        }

        if (!videoItem && typeof isAiBackgroundRemoveEnabled === "function" && isAiBackgroundRemoveEnabled()) {
            const aiBgRemoveBtn = document.createElement("button");
            aiBgRemoveBtn.innerText = "AI BG Remove";
            aiBgRemoveBtn.className = "meta-action-button meta-ai-bg-remove-button";
            aiBgRemoveBtn.onclick = () => openBackgroundRemoveEditor(idx, "ai");
            actionsDiv.appendChild(aiBgRemoveBtn);
        }

        if (!videoItem) actionsDiv.appendChild(upscaleBtn);

        const aiJenaBtn = document.createElement("button");
        aiJenaBtn.className = "meta-action-button ai-jena-header-button ai-jena-image-button";
        const aiJenaReady = typeof getUsableAiStudioApiKey === "function" &&
            Boolean(getUsableAiStudioApiKey());
        const aiJenaHasKey = typeof getAiStudioApiKey === "function" && Boolean(getAiStudioApiKey());
        aiJenaBtn.classList.toggle("ready", aiJenaReady);
        aiJenaBtn.classList.toggle("unavailable", !aiJenaReady);
        aiJenaBtn.style.display = aiJenaHasKey ? "inline-flex" : "none";
        aiJenaBtn.disabled = !aiJenaReady;
        aiJenaBtn.onclick = aiJenaReady ? () => openAiJena(idx) : null;
        aiJenaBtn.innerText = aiJenaReady ? "✦ AI Jena" : "✦";
        aiJenaBtn.title = aiJenaReady
            ? "이 이미지로 AI Jena 열기"
            : "AI API 키 사용이 중지되어 있습니다.";
        if (!videoItem) actionsDiv.appendChild(aiJenaBtn);

        if (!videoItem && typeof isAiUpscaleEnabled === "function" && isAiUpscaleEnabled()) {
            const aiUpscaleBtn = document.createElement("button");
            aiUpscaleBtn.innerText = "AI Upscale";
            aiUpscaleBtn.className = "meta-action-button meta-ai-upscale-button";
            aiUpscaleBtn.onclick = () => openUpscaleEditor(idx, "ai");
            actionsDiv.appendChild(aiUpscaleBtn);
        }

        container.appendChild(actionsDiv);

        return container;
    };

    dom.metaDynamicArea.appendChild(createMetaItem(i));
    const secondIndex = getSecondVisibleImageIndex(i);
    dom.previewMeta?.classList.toggle("dual-meta", secondIndex >= 0);
    if (secondIndex >= 0) {
        const divider = document.createElement("div");
        divider.className = "meta-divider";
        divider.style.width = "1px";
        divider.style.backgroundColor = "rgba(255,255,255,0.1)";
        dom.metaDynamicArea.appendChild(divider);
        dom.metaDynamicArea.appendChild(createMetaItem(secondIndex));
    }
}

function switchViewMode(mode) {
    viewMode = mode;
    navStep = mode === 2 ? 2 : 1;
    dom.previewContainer.classList.toggle("dual-view", mode === 2);
    updateModeButtons();
    updateStepButtons();
    showImage(currentIndex);
}

function toggleOrientation() {
    orientation = (orientation === 'horz') ? 'vert' : 'horz';
    dom.btnOrientation.innerText = (orientation === 'horz') ? "Dir: Horz" : "Dir: Vert";

    if (orientation === 'vert') {
        alert("세로 스크롤 모드로 전환되었습니다.");
        document.body.classList.add('vertical-mode');
        renderVerticalPreview();
    } else {
        document.body.classList.remove('vertical-mode');
        showImage(currentIndex);
    }
    updateStepButtons();
}

function renderVerticalPreview() {
    const fragment = document.createDocumentFragment();
    getActiveImageOrder().forEach(idx => {
        const img = images[idx];
        const item = document.createElement("div");
        item.className = "vertical-preview-item";
        const el = document.createElement(isVideoMedia(img) ? 'video' : 'img');
        el.src = img.thumbnailSrc || img.src;
        if (idx === currentIndex) el.id = "preview";
        el.className = "vert-img";
        el.setAttribute('draggable', 'false');
        if (el.tagName === "VIDEO") {
            el.controls = true;
            el.playsInline = true;
            el.preload = "metadata";
        }
        el.onclick = async () => {
            await showImage(idx);
            if (orientation === "vert") renderVerticalPreview();
        };
        item.appendChild(el);
        item.appendChild(createImageMetadataCard(idx, el));
        fragment.appendChild(item);
    });
    dom.previewContainer.innerHTML = "";
    dom.previewContainer.appendChild(fragment);
    updatePreviewPageText();

    setTimeout(() => {
        const target = document.getElementById("preview");
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

function getMediaFileExtension(item) {
    const subtype = String(item?.mimeType || "").split("/")[1]?.split(";")[0];
    if (subtype) return subtype.replace("quicktime", "mov").replace("jpeg", "jpg");
    return isVideoMedia(item) ? "mp4" : "png";
}
