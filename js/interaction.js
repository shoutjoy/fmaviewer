/* =======================================================
   Interactions (Zoom, Pan, Resize, Nav)
   ======================================================= */

let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;
let wheelNavAccumulator = 0;
let lastWheelNavTime = 0;
let fullscreenVideoStates = [];

function captureFullscreenVideoStates() {
    const root = dom.previewWrap || document.getElementById("previewWrap") || document;
    fullscreenVideoStates = Array.from(root.querySelectorAll("video")).map(video => ({
        video,
        currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
        shouldPlay: !video.paused && !video.ended,
        muted: video.muted,
        volume: video.volume,
        playbackRate: video.playbackRate
    }));
}

function restoreFullscreenVideoStates() {
    // fullscreenchange와 requestFullscreen Promise가 모두 호출될 수 있으므로
    // 한 번 캡처한 상태는 한 번만 소비합니다. ESC로 나갈 때 오래된 시간이
    // 다시 적용되는 것도 함께 방지합니다.
    const states = fullscreenVideoStates.splice(0);
    if (!states.length) return;

    const restore = state => {
        const video = state.video;
        if (!video?.isConnected) return;
        video.muted = state.muted;
        video.volume = state.volume;
        video.playbackRate = state.playbackRate;

        const restoreTimeAndPlayback = () => {
            if (Number.isFinite(state.currentTime) && Math.abs(video.currentTime - state.currentTime) > 0.15) {
                try { video.currentTime = state.currentTime; } catch (_) {}
            }
            if (state.shouldPlay && video.paused) {
                video.play().catch(error => {
                    console.warn("Fullscreen video resume was blocked:", error);
                });
            }
        };

        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            restoreTimeAndPlayback();
        } else {
            video.addEventListener("loadedmetadata", restoreTimeAndPlayback, { once: true });
            // 일부 Chromium/WebView 환경은 전체화면 전환 뒤 Blob 비디오를
            // HAVE_NOTHING 상태로 남겨 둡니다. 이때만 명시적으로 다시 준비합니다.
            if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
                try { video.load(); } catch (_) {}
            }
        }
    };

    requestAnimationFrame(() => requestAnimationFrame(() => states.forEach(restore)));
}

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
        // 비디오 위에서는 브라우저의 기본 미디어 조작을 우선합니다.
        if (e.target.closest?.("video")) return;

        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) zoom *= 1.1;
            else zoom /= 1.1;
            zoom = Math.max(0.1, Math.min(zoom, 5));
            updateZoom();
            return;
        }

        if (orientation === 'vert' || images.length === 0) return;

        e.preventDefault();
        const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        const now = Date.now();

        if (now - lastWheelNavTime > 500) wheelNavAccumulator = 0;
        wheelNavAccumulator += delta;

        if (Math.abs(wheelNavAccumulator) < 45 || now - lastWheelNavTime < 260) return;

        const direction = wheelNavAccumulator > 0 ? 1 : -1;
        wheelNavAccumulator = 0;
        lastWheelNavTime = now;
        navigateSortedImages(direction * navStep);
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

function centerPreviewImage() {
    offsetX = 0;
    offsetY = 0;
    updateZoom();
    if (orientation === "vert") {
        const position = getImageDisplayPosition(currentIndex);
        const target = dom.previewContainer.children[position];
        target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
}

function initPanelResize() {
    let isResizing = false;
    const storageKey = "fma_left_width_v2";
    const getDefaultWidth = () => Math.round(Math.min(420, Math.max(320, window.innerWidth * 0.22)));
    const savedWidth = Number(localStorage.getItem(storageKey));
    dom.leftPanel.style.width = `${Number.isFinite(savedWidth) && savedWidth >= 200
        ? Math.min(savedWidth, window.innerWidth - 360)
        : getDefaultWidth()}px`;

    dom.resizer.addEventListener("mousedown", () => isResizing = true);
    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        let newWidth = e.clientX;
        if (newWidth < 200) newWidth = 200;
        if (newWidth > window.innerWidth - 300) newWidth = window.innerWidth - 300;
        dom.leftPanel.style.width = newWidth + "px";
        localStorage.setItem(storageKey, newWidth);
    });
    document.addEventListener("mouseup", () => isResizing = false);
    dom.resizer.addEventListener("dblclick", () => {
        dom.leftPanel.style.width = `${getDefaultWidth()}px`;
        localStorage.removeItem(storageKey);
    });

    window.addEventListener("resize", () => {
        const currentWidth = dom.leftPanel.getBoundingClientRect().width;
        const maximum = Math.max(200, window.innerWidth - 360);
        if (currentWidth > maximum) dom.leftPanel.style.width = `${maximum}px`;
    });
}

function toggleFullscreen() {
    const elem = dom.previewWrap || document.getElementById("previewWrap") || document.body;
    captureFullscreenVideoStates();
    if (!document.fullscreenElement) {
        let request;
        if (elem.requestFullscreen) request = elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) request = elem.webkitRequestFullscreen();
        else if (elem.msRequestFullscreen) request = elem.msRequestFullscreen();
        Promise.resolve(request).then(restoreFullscreenVideoStates).catch(error => {
            console.error("Fullscreen request failed:", error);
        });
    } else {
        let request;
        if (document.exitFullscreen) request = document.exitFullscreen();
        else if (document.webkitExitFullscreen) request = document.webkitExitFullscreen();
        else if (document.msExitFullscreen) request = document.msExitFullscreen();
        Promise.resolve(request).then(restoreFullscreenVideoStates).catch(error => {
            console.error("Fullscreen exit failed:", error);
        });
    }
}

document.addEventListener("fullscreenchange", () => {
    restoreFullscreenVideoStates();
    if (document.fullscreenElement) {
        if (dom.zoomInfo) dom.zoomInfo.innerText = "Fullscreen (ESC to exit)";
    } else {
        updateZoom();
    }
});

document.addEventListener("webkitfullscreenchange", restoreFullscreenVideoStates);
