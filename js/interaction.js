/* =======================================================
   Interactions (Zoom, Pan, Resize, Nav)
   ======================================================= */

let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

function setupDragPan() {
    dom.previewContainer.addEventListener("mousedown", (e) => {
        if (e.target.tagName !== 'IMG') return;
        isDragging = true;
        startX = e.clientX - offsetX;
        startY = e.clientY - offsetY;
        dom.previewContainer.style.cursor = "grabbing";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;
        updateZoom();
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
        dom.previewContainer.style.cursor = "auto";
    });

    dom.previewContainer.onwheel = e => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) zoom *= 1.1;
            else zoom /= 1.1;
            zoom = Math.max(0.1, Math.min(zoom, 5));
            updateZoom();
        }
    };
}

function updateZoom() {
    const p1 = document.getElementById("preview");
    const p2 = document.getElementById("preview2");
    if (p1) p1.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
    if (p2 && p2.style.display !== "none") p2.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;

    if (dom.zoomInfo) dom.zoomInfo.innerText = "Zoom " + zoom.toFixed(2);
    if (dom.zoomText) dom.zoomText.innerText = Math.round(zoom * 100) + "%";
}

function resetZoom() {
    zoom = 1; offsetX = 0; offsetY = 0; updateZoom();
}

function initPanelResize() {
    let isResizing = false;
    const savedWidth = localStorage.getItem("fma_left_width");
    if (savedWidth) dom.leftPanel.style.width = savedWidth + "px";

    dom.resizer.addEventListener("mousedown", () => isResizing = true);
    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > window.innerWidth - 300) newWidth = window.innerWidth - 300;
        dom.leftPanel.style.width = newWidth + "px";
        localStorage.setItem("fma_left_width", newWidth);
    });
    document.addEventListener("mouseup", () => isResizing = false);
    dom.resizer.addEventListener("dblclick", () => {
        dom.leftPanel.style.width = "380px";
        localStorage.removeItem("fma_left_width");
    });
}

function toggleFullscreen() {
    const elem = dom.preview || document.body;
    if (!document.fullscreenElement) elem.requestFullscreen();
    else document.exitFullscreen();
}

document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
        if (dom.zoomInfo) dom.zoomInfo.innerText = "Fullscreen (ESC to exit)";
    } else {
        updateZoom();
    }
});
