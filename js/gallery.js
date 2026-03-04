/* =======================================================
   Gallery & Favorites Logic
   ======================================================= */

function renderGallery() {
    const fragment = document.createDocumentFragment();
    let sortedImages = [...images];
    if (sortMode === 'date') sortedImages.sort((a, b) => b.date - a.date);
    else if (sortMode === 'size') sortedImages.sort((a, b) => b.size - a.size);

    const groups = {};
    sortedImages.forEach(img => {
        const groupName = (sortMode === 'group') ? img.group : 'All Images';
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push({ ...img, realIndex: images.indexOf(img) });
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
        if (a === 'added') return -1;
        if (b === 'added') return 1;
        return a.localeCompare(b);
    });

    sortedKeys.forEach(g => {
        const title = document.createElement("div");
        title.className = "groupTitle";
        title.innerText = (sortMode === 'group') ? g : `${g} (${sortedImages.length})`;
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
