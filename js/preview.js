/* =======================================================
   Preview & Display Logic
   ======================================================= */

function showImage(i) {
    if (images.length === 0) return;
    if (i < 0) i = 0;
    if (i >= images.length) i = images.length - 1;
    currentIndex = i;

    if (orientation === 'vert') {
        const target = dom.previewContainer.children[i];
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        renderDynamicMeta(i);
        return;
    }

    // Horizontal Slide Mode
    dom.previewContainer.innerHTML = '<img id="preview" alt="preview" draggable="false"><img id="preview2" alt="preview2" style="display:none;" draggable="false">';
    dom.previewContainer.style.flexDirection = "row";
    const p1 = document.getElementById("preview");
    const p2 = document.getElementById("preview2");

    p1.src = images[i].src;
    p1.style.display = "block";

    if (viewMode === 2 && i < images.length - 1) {
        p2.src = images[i + 1].src;
        p2.style.display = "block";
    }

    dom.placeholder.style.display = "none";
    dom.previewMeta.style.display = "block";
    dom.zoomInfo.style.display = "block";
    if (dom.pageText) dom.pageText.innerText = `${currentIndex + 1} / ${images.length}`;
    renderDynamicMeta(i);
    zoom = 1;
    updateZoom();
}

function renderDynamicMeta(i) {
    if (!dom.metaDynamicArea) return;
    dom.metaDynamicArea.innerHTML = "";

    const createMetaItem = (idx) => {
        const item = images[idx];
        const container = document.createElement("div");
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
        actionsDiv.style.display = "flex";
        actionsDiv.style.gap = "8px";

        const favBtn = document.createElement("button");
        favBtn.innerText = item.isFav ? "★ Favorited" : "☆ Favorite";
        favBtn.style.color = item.isFav ? "#ffd700" : "#fff";
        favBtn.style.fontSize = "11px";
        favBtn.onclick = () => {
            toggleFav(idx);
            renderDynamicMeta(i);
        };

        const downBtn = document.createElement("button");
        downBtn.innerText = "Download Image";
        downBtn.style.fontSize = "11px";
        downBtn.onclick = () => {
            const a = document.createElement("a");
            a.href = item.src;
            a.download = `image_${idx}.png`;
            a.click();
        };

        actionsDiv.appendChild(favBtn);
        actionsDiv.appendChild(downBtn);
        container.appendChild(actionsDiv);

        return container;
    };

    dom.metaDynamicArea.appendChild(createMetaItem(i));
    if (viewMode === 2 && i < images.length - 1) {
        const divider = document.createElement("div");
        divider.style.width = "1px";
        divider.style.backgroundColor = "rgba(255,255,255,0.1)";
        dom.metaDynamicArea.appendChild(divider);
        dom.metaDynamicArea.appendChild(createMetaItem(i + 1));
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
    images.forEach((img, idx) => {
        const el = document.createElement('img');
        el.src = img.src;
        if (idx === currentIndex) el.id = "preview";
        el.className = "vert-img";
        el.setAttribute('draggable', 'false');
        el.onclick = () => { currentIndex = idx; dom.metaDynamicArea && renderDynamicMeta(idx); };
        fragment.appendChild(el);
    });
    dom.previewContainer.innerHTML = "";
    dom.previewContainer.appendChild(fragment);
    if (dom.pageText) dom.pageText.innerText = `${currentIndex + 1} / ${images.length}`;

    setTimeout(() => {
        const target = document.getElementById("preview");
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}
