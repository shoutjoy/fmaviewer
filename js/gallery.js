/* =======================================================
   Gallery & Favorites Logic
   ======================================================= */

function renderGallery() {
    const fragment = document.createDocumentFragment();
    let sortedImages = [...images];
    if (sortMode === 'latest') sortedImages.sort((a, b) => (b.date || 0) - (a.date || 0));
    else if (sortMode === 'oldest') sortedImages.sort((a, b) => (a.date || 0) - (b.date || 0));
    else if (sortMode === 'size') sortedImages.sort((a, b) => (b.size || 0) - (a.size || 0));
    else if (sortMode === 'type') {
        sortedImages.sort((a, b) => {
            const typeCompare = getImageTypeLabel(a).localeCompare(getImageTypeLabel(b));
            return typeCompare || (b.date || 0) - (a.date || 0);
        });
    }

    const groups = {};
    sortedImages.forEach(img => {
        const groupName = sortMode === 'group'
            ? img.group
            : sortMode === 'type'
                ? getImageTypeLabel(img)
                : 'All Images';
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push({ ...img, realIndex: images.indexOf(img) });
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
            latest: "최신 이미지",
            oldest: "오래된 이미지",
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
            div.innerHTML = `
                <img src="${img.src}" loading="lazy">
                <div class="thumb-overlay">
                    <button class="overlay-btn fav">★</button>
                    <button class="overlay-btn ext" data-src="${img.src}">Ext</button>
                    <button class="overlay-btn del">Del</button>
                </div>
            `;
            div.onclick = () => showImage(img.realIndex);
            div.querySelector('.fav').onclick = (e) => { e.stopPropagation(); toggleFav(img.realIndex); };
            div.querySelector('.ext').onclick = (e) => { e.stopPropagation(); openExternal(img.src); };
            div.querySelector('.del').onclick = (e) => { e.stopPropagation(); removeImage(img.realIndex); };
            grid.appendChild(div);
        });
        fragment.appendChild(grid);
    });

    dom.gallery.innerHTML = "";
    dom.gallery.appendChild(fragment);
    if (typeof updatePreviewPageText === "function") updatePreviewPageText();
}

function getActiveImageOrder() {
    const isValid = sortedImageOrder.length === images.length &&
        sortedImageOrder.every(index => Number.isInteger(index) && index >= 0 && index < images.length) &&
        new Set(sortedImageOrder).size === images.length;
    return isValid ? sortedImageOrder : images.map((_, index) => index);
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
    if (images.length === 0) return;
    showImage(getAdjacentSortedImageIndex(currentIndex, offset));
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
    const favs = images.filter(img => img.isFav);
    favs.forEach(img => {
        const realIdx = images.indexOf(img);
        const div = document.createElement("div");
        div.className = "thumb is-fav";
        div.innerHTML = `<img src="${img.src}"><div class="thumb-overlay"><button class="overlay-btn fav">Clear</button></div>`;
        div.onclick = () => showImage(realIdx);
        div.querySelector('.fav').onclick = (e) => { e.stopPropagation(); toggleFav(realIdx); };
        fragment.appendChild(div);
    });
    dom.favList.innerHTML = "";
    dom.favList.appendChild(fragment);
}

function removeImage(i) {
    if (confirm("이 이미지를 프로젝트에서 제거할까요?")) {
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
