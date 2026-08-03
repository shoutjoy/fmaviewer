/* =======================================================
   Gallery & Favorites Logic
   ======================================================= */

function renderGallery() {
    const fragment = document.createDocumentFragment();
    const imageIndex = new Map(images.map((item, index) => [item, index]));
    let sortedImages = images.filter(item => {
        if (mediaFilter === "video") return isVideoMedia(item);
        if (mediaFilter === "image") return !isVideoMedia(item);
        return true;
    });
    if (sortMode === 'latest') sortedImages.sort((a, b) =>
        getMediaCreatedTimestamp(b) - getMediaCreatedTimestamp(a) || imageIndex.get(b) - imageIndex.get(a));
    else if (sortMode === 'modified') sortedImages.sort((a, b) =>
        getMediaModifiedTimestamp(b) - getMediaModifiedTimestamp(a) || imageIndex.get(b) - imageIndex.get(a));
    else if (sortMode === 'oldest') sortedImages.sort((a, b) =>
        getMediaCreatedTimestamp(a) - getMediaCreatedTimestamp(b) || imageIndex.get(a) - imageIndex.get(b));
    else if (sortMode === 'size') sortedImages.sort((a, b) => (b.size || 0) - (a.size || 0));
    else if (sortMode === 'type') {
        sortedImages.sort((a, b) => {
            const typeCompare = getImageTypeLabel(a).localeCompare(getImageTypeLabel(b));
            return typeCompare || getMediaCreatedTimestamp(b) - getMediaCreatedTimestamp(a);
        });
    }

    const groups = {};
    sortedImages.forEach(img => {
        const mediaName = isVideoMedia(img) ? "영상" : "이미지";
        const groupName = sortMode === 'group'
            ? `${mediaName} · ${img.group || "other"}`
            : sortMode === 'type'
                ? getImageTypeLabel(img)
                : mediaName;
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push({ ...img, realIndex: imageIndex.get(img) });
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
        if (a === 'added') return -1;
        if (b === 'added') return 1;
        return a.localeCompare(b);
    });

    sortedImageOrder = sortedKeys.flatMap(groupName =>
        groups[groupName].map(image => image.realIndex)
    );

    sortedKeys.forEach(g => {
        const title = document.createElement("div");
        title.className = "groupTitle";
        const sortTitles = {
            latest: mediaFilter === "video" ? "최신 생성 영상" : mediaFilter === "image" ? "최신 생성 이미지" : "최신 생성 미디어",
            modified: mediaFilter === "video" ? "최근 수정 영상" : mediaFilter === "image" ? "최근 수정 이미지" : "최근 수정 미디어",
            oldest: mediaFilter === "video" ? "오래된 영상" : mediaFilter === "image" ? "오래된 이미지" : "오래된 미디어",
            size: "파일 크기순"
        };
        title.innerText = (sortMode === 'group' || sortMode === 'type')
            ? `${g} (${groups[g].length})`
            : `${sortTitles[sortMode] || g} (${sortedImages.length})`;
        fragment.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "galleryGrid";

        groups[g].forEach(img => {
            const div = document.createElement("div");
            div.className = "thumb" + (img.isFav ? " is-fav" : "");
            div.dataset.imageRecordId = img.dbRecordId || "";
            const media = createGalleryMediaElement(img);
            div.appendChild(media);
            const badge = document.createElement("span");
            badge.className = `thumb-media-badge ${isVideoMedia(img) ? "video" : "image"}`;
            if (isVideoMedia(img)) badge.innerText = "▶ VIDEO";
            else {
                badge.append(document.createTextNode("IMAGE"));
                if (img.aiJenaRaw) {
                    const raw = document.createElement("em");
                    raw.innerText = "RAW";
                    badge.appendChild(raw);
                }
            }
            div.appendChild(badge);
            const overlay = document.createElement("div");
            overlay.className = "thumb-overlay";
            overlay.innerHTML = `<button class="overlay-btn fav">★</button><button class="overlay-btn ext">Ext</button><button class="overlay-btn del">Del</button>`;
            div.appendChild(overlay);
            div.onclick = () => showImage(img.realIndex);
            div.querySelector('.fav').onclick = (e) => { e.stopPropagation(); toggleFav(img.realIndex); };
            div.querySelector('.ext').onclick = async (e) => {
                e.stopPropagation();
                if (typeof ensureImageOriginalLoaded === "function") {
                    await ensureImageOriginalLoaded(img.realIndex);
                }
                openExternal(images[img.realIndex].src, images[img.realIndex]);
            };
            div.querySelector('.del').onclick = (e) => { e.stopPropagation(); removeImage(img.realIndex); };
            grid.appendChild(div);
        });
        fragment.appendChild(grid);
    });

    dom.gallery.innerHTML = "";
    dom.gallery.appendChild(fragment);
    if (typeof updatePreviewPageText === "function") updatePreviewPageText();
}

function parseMediaTimestamp(value) {
    if (value == null || value === "") return 0;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getMediaCreatedTimestamp(item) {
    return parseMediaTimestamp(item?.createdAt) ||
        parseMediaTimestamp(item?.metadata?.createdAt) ||
        parseMediaTimestamp(item?.date);
}

function getMediaModifiedTimestamp(item) {
    return parseMediaTimestamp(item?.modifiedAt) ||
        parseMediaTimestamp(item?.metadata?.modifiedAt) ||
        getMediaCreatedTimestamp(item);
}

function getActiveImageOrder() {
    const expected = images.map((item, index) => ({ item, index }))
        .filter(({ item }) => mediaFilter === "all" || (mediaFilter === "video") === isVideoMedia(item))
        .map(({ index }) => index);
    const expectedSet = new Set(expected);
    const isValid = sortedImageOrder.length === expected.length &&
        sortedImageOrder.every(index => Number.isInteger(index) && index >= 0 && index < images.length) &&
        new Set(sortedImageOrder).size === expected.length &&
        sortedImageOrder.every(index => expectedSet.has(index));
    return isValid ? sortedImageOrder : expected;
}

function getLatestVisibleMediaIndex() {
    const visible = images.map((item, index) => ({ item, index }))
        .filter(({ item }) => mediaFilter === "all" ||
            (mediaFilter === "video") === isVideoMedia(item));
    if (!visible.length) return -1;
    visible.sort((a, b) => getMediaCreatedTimestamp(b.item) - getMediaCreatedTimestamp(a.item));
    return visible[0].index;
}

function getImageDisplayPosition(rawIndex) {
    const position = getActiveImageOrder().indexOf(rawIndex);
    return position >= 0 ? position : 0;
}

function getImageIndexAtDisplayPosition(position) {
    const order = getActiveImageOrder();
    if (order.length === 0) return -1;
    const clampedPosition = Math.max(0, Math.min(order.length - 1, position));
    return order[clampedPosition];
}

function getAdjacentSortedImageIndex(rawIndex, offset) {
    return getImageIndexAtDisplayPosition(getImageDisplayPosition(rawIndex) + offset);
}

function navigateSortedImages(offset) {
    if (getActiveImageOrder().length === 0) return;
    showImage(getAdjacentSortedImageIndex(currentIndex, offset));
}

function isVideoMedia(item) {
    const mime = String(item?.mimeType || "").toLowerCase();
    return item?.mediaType === "video" || mime.startsWith("video/") ||
        /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#])/i.test(String(item?.path || ""));
}

function createGalleryMediaElement(item) {
    if (isVideoMedia(item) && !item.thumbnailSrc) {
        const video = document.createElement("video");
        video.src = item.src;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.setAttribute("aria-label", item.metadata?.title || item.path || "영상");
        return video;
    }
    const image = document.createElement("img");
    image.src = item.thumbnailSrc || item.src;
    image.loading = "lazy";
    image.alt = item.metadata?.title || item.path || "이미지";
    return image;
}

function getImageTypeLabel(image) {
    const mime = image.mimeType || String(image.src || "").match(/^data:([^;,]+)/)?.[1] || "";
    const mimeSubtype = mime.split("/")[1];
    if (mimeSubtype) {
        const normalized = mimeSubtype.replace("svg+xml", "svg").replace("jpeg", "jpg");
        return normalized.toUpperCase();
    }

    const extension = String(image.path || "").match(/\.([a-z0-9]+)(?:$|[?#])/i)?.[1];
    return extension ? extension.toUpperCase() : "OTHER";
}

function toggleFav(i) {
    images[i].isFav = !images[i].isFav;
    renderGallery();
    renderFavorites();
    saveCurrentImagesToDB();
}

function renderFavorites() {
    const fragment = document.createDocumentFragment();
    const imageIndex = new Map(images.map((item, index) => [item, index]));
    const favs = images.filter(img => img.isFav && (
        mediaFilter === "all" || (mediaFilter === "video") === isVideoMedia(img)
    ));
    favs.forEach(img => {
        const realIdx = imageIndex.get(img);
        const div = document.createElement("div");
        div.className = "thumb is-fav";
        div.dataset.imageRecordId = img.dbRecordId || "";
        div.appendChild(createGalleryMediaElement(img));
        const overlay = document.createElement("div");
        overlay.className = "thumb-overlay";
        overlay.innerHTML = `<button class="overlay-btn fav">Clear</button>`;
        div.appendChild(overlay);
        div.onclick = () => showImage(realIdx);
        div.querySelector('.fav').onclick = (e) => { e.stopPropagation(); toggleFav(realIdx); };
        fragment.appendChild(div);
    });
    dom.favList.innerHTML = "";
    dom.favList.appendChild(fragment);
}

function removeImage(i) {
    if (confirm(`이 ${isVideoMedia(images[i]) ? "영상" : "이미지"}을 프로젝트에서 제거할까요?`)) {
        const removedItem = images.splice(i, 1)[0];
        deletedImages.push({ index: i, item: removedItem });
        if (currentIndex >= images.length) currentIndex = Math.max(0, images.length - 1);
        renderGallery();
        renderFavorites();
        dom.imageCount.innerText = "Images: " + images.length;
        saveCurrentImagesToDB();
    }
}

function restoreLastDeleted() {
    if (deletedImages.length === 0) {
        alert("복구할 수 있는 삭제된 이미지가 없습니다.");
        return;
    }
    const restored = deletedImages.pop();
    images.splice(restored.index, 0, restored.item);
    renderGallery();
    renderFavorites();
    dom.imageCount.innerText = "Images: " + images.length;
    saveCurrentImagesToDB();
    showImage(restored.index);
}
