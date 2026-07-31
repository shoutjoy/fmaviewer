/* =======================================================
   Preview & Display Logic
   ======================================================= */

function showImage(i) {
    if (images.length === 0) return;
    if (i < 0) i = 0;
    if (i >= images.length) i = images.length - 1;
    currentIndex = i;
    const displayPosition = getImageDisplayPosition(i);

    if (orientation === 'vert') {
        const target = dom.previewContainer.children[displayPosition];
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

    const image = document.createElement("img");
    image.id = imageId;
    image.alt = images[index].metadata?.title || `preview ${index + 1}`;
    image.draggable = false;
    image.src = images[index].src;
    image.style.display = "block";

    slot.appendChild(image);
    slot.appendChild(createImageMetadataCard(index, image));
    return slot;
}

function getSecondVisibleImageIndex(firstIndex) {
    if (viewMode !== 2) return -1;
    const nextPosition = getImageDisplayPosition(firstIndex) + 1;
    return nextPosition < images.length ? getImageIndexAtDisplayPosition(nextPosition) : -1;
}

function updatePreviewPageText() {
    if (!dom.pageText) return;
    if (images.length === 0) {
        dom.pageText.innerText = "0 / 0";
        return;
    }
    dom.pageText.innerText = `${getImageDisplayPosition(currentIndex) + 1} / ${images.length}`;
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

        const pathDiv = document.createElement("div");
        pathDiv.className = "path";
        pathDiv.style.fontSize = "11px";
        pathDiv.style.marginBottom = "8px";
        pathDiv.style.opacity = "0.8";
        pathDiv.style.wordBreak = "break-all";
        pathDiv.innerText = item.path;
        container.appendChild(pathDiv);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "actions meta-item-actions";
        actionsDiv.style.display = "flex";
        actionsDiv.style.gap = "8px";

        const favBtn = document.createElement("button");
        favBtn.innerText = item.isFav ? "★ Favorited" : "☆ Favorite";
        favBtn.className = "meta-action-button meta-favorite-button";
        favBtn.style.color = item.isFav ? "#ffd700" : "#fff";
        favBtn.onclick = () => {
            toggleFav(idx);
            renderDynamicMeta(i);
        };

        const downBtn = document.createElement("button");
        downBtn.innerText = "Download Image";
        downBtn.className = "meta-action-button meta-download-button";
        downBtn.onclick = () => {
            const a = document.createElement("a");
            a.href = item.src;
            a.download = `image_${idx}.png`;
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
        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(cropBtn);
        actionsDiv.appendChild(bgRemoveBtn);

        if (typeof isAiBackgroundRemoveEnabled === "function" && isAiBackgroundRemoveEnabled()) {
            const aiBgRemoveBtn = document.createElement("button");
            aiBgRemoveBtn.innerText = "AI BG Remove";
            aiBgRemoveBtn.className = "meta-action-button meta-ai-bg-remove-button";
            aiBgRemoveBtn.onclick = () => openBackgroundRemoveEditor(idx, "ai");
            actionsDiv.appendChild(aiBgRemoveBtn);
        }

        actionsDiv.appendChild(upscaleBtn);

        const aiJenaBtn = document.createElement("button");
        aiJenaBtn.className = "meta-action-button ai-jena-header-button ai-jena-image-button";
        aiJenaBtn.onclick = () => openAiJena(idx);
        const aiJenaReady = typeof getUsableAiStudioApiKey === "function" &&
            Boolean(getUsableAiStudioApiKey());
        aiJenaBtn.classList.toggle("ready", aiJenaReady);
        aiJenaBtn.classList.toggle("unavailable", !aiJenaReady);
        aiJenaBtn.innerText = aiJenaReady
            ? "✦ AI Jena"
            : "✦ AI Jena · API키를 먼저 설정하세요";
        aiJenaBtn.title = aiJenaReady
            ? "이 이미지로 AI Jena 열기"
            : "Settings에서 AI Studio 키를 설정하세요.";
        actionsDiv.appendChild(aiJenaBtn);

        if (typeof isAiUpscaleEnabled === "function" && isAiUpscaleEnabled()) {
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
    dom.previewContainer.classList.toggle("dual-view", mode === 2);
    updateModeButtons();
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
        const el = document.createElement('img');
        el.src = img.src;
        if (idx === currentIndex) el.id = "preview";
        el.className = "vert-img";
        el.setAttribute('draggable', 'false');
        el.onclick = () => {
            currentIndex = idx;
            dom.metaDynamicArea && renderDynamicMeta(idx);
            updatePreviewPageText();
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
