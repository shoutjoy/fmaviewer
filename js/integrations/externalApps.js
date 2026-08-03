/* =======================================================
   Embedded Story / Aura / BG Remover App Bridge
   ======================================================= */

const EXTERNAL_IMAGE_APPS = {
    story: {
        title: "Story Gemini",
        description: "공유 Gemini Story 앱을 별도 창에서 실행합니다.",
        path: "https://share.gemini.google/BklXvBlchLH2",
        external: true
    },
    storyHtml: {
        title: "Story Image · HTML",
        description: "브라우저에서 장면을 구성하고 생성·편집한 이미지를 FMA Viewer로 가져옵니다.",
        path: "App_src/Storyimage/storyimage_app.html",
        version: "20260801-4",
        currentLabel: "갤러리에 추가",
        allLabel: "히스토리 모두 추가"
    },
    aura: {
        title: "Aura Image",
        description: "Aura Image의 현재 생성 이미지 또는 전체 히스토리를 가져옵니다.",
        path: "App_src/AuraImage/aurapaste_studio_web_app_V436.html",
        currentLabel: "현재 이미지 넣기",
        allLabel: "히스토리 모두 넣기"
    },
    auraGemini: {
        title: "Aura Gemini",
        description: "공유 Gemini Aura 앱을 별도 창에서 실행합니다.",
        path: "https://gemini.google.com/share/f130963d5351",
        external: true
    },
    backgroundGemini: {
        title: "배경생성 Gemini",
        description: "공유 Gemini 배경생성 앱을 별도 창에서 실행합니다.",
        path: "https://gemini.google.com/share/f54d1096b1e0",
        external: true
    },
    bg: {
        title: "BG Remover App",
        description: "현재 누끼 결과 또는 보관소에 저장된 전체 결과를 가져옵니다.",
        path: "App_src/BGRemoverApp/bgremoverV2.html",
        version: "20260731-5",
        currentLabel: "현재 누끼 넣기",
        allLabel: "보관소 모두 넣기"
    }
};

var externalAppState = {
    key: null,
    requestId: null,
    loading: false,
    layout: "float",
    drag: null,
    sourcePickerRequestId: null,
    sourcePickerIndex: -1,
    sourcePickerApp: null,
    dockDrag: null,
    taskProgressTimer: null
};

function initExternalAppsFeature() {
    if (!dom.externalAppModal) return;
    dom.btnOpenStoryApp.onclick = () => openExternalImageApp("story");
    dom.btnOpenStoryHtmlApp.onclick = () => openExternalImageApp("storyHtml");
    dom.btnOpenAuraApp.onclick = () => openExternalImageApp("aura");
    dom.btnOpenAuraGeminiApp.onclick = () => openExternalImageApp("auraGemini");
    dom.btnOpenBackgroundGeminiApp.onclick = () => openExternalImageApp("backgroundGemini");
    dom.btnOpenBgApp.onclick = () => openExternalImageApp("bg");
    dom.btnCloseExternalApp.onclick = closeExternalImageApp;
    dom.btnReloadExternalApp.onclick = reloadExternalImageApp;
    dom.btnDockExternalApp.onclick = toggleExternalAppDock;
    dom.btnMinimizeExternalApp.onclick = toggleExternalAppMaximized;
    dom.btnImportExternalCurrent.onclick = () => requestExternalAppImages("current");
    dom.btnImportExternalAll.onclick = () => requestExternalAppImages("all");
    dom.externalAppFrame.addEventListener("load", handleExternalAppFrameLoad);
    dom.btnCloseExternalAppFmaPicker.onclick = () => closeExternalAppFmaPicker(true);
    dom.btnCancelExternalAppFmaPicker.onclick = () => closeExternalAppFmaPicker(true);
    dom.btnApplyExternalAppFmaPicker.onclick = applyExternalAppFmaPicker;
    dom.externalAppFmaPicker.addEventListener("mousedown", event => {
        if (event.target === dom.externalAppFmaPicker) closeExternalAppFmaPicker(true);
    });
    dom.externalAppDialog.querySelector(".external-app-header")
        ?.addEventListener("pointerdown", beginExternalAppDrag);
    window.addEventListener("pointermove", moveExternalAppDrag);
    window.addEventListener("pointerup", endExternalAppDrag);
    const dockHandle = dom.externalAppButtons?.querySelector(".external-app-drag-handle");
    const compactToggle = dom.externalAppButtons?.querySelector(".external-app-compact-toggle");
    dockHandle?.addEventListener("pointerdown", beginExternalAppDockDrag);
    compactToggle?.addEventListener("pointerdown", event => event.stopPropagation());
    compactToggle?.addEventListener("click", toggleExternalAppDockCompact);
    window.addEventListener("pointermove", moveExternalAppDockDrag);
    window.addEventListener("pointerup", endExternalAppDockDrag);
    restoreExternalAppDockCompact();
    window.addEventListener("message", handleExternalAppMessage);
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        if (dom.externalAppFmaPicker.style.display !== "none") {
            closeExternalAppFmaPicker(true);
        } else if (dom.externalAppModal.style.display !== "none") {
            closeExternalImageApp();
        }
    });
    refreshExternalAppButtons();
    restoreExternalAppDockPosition();
    window.addEventListener("resize", keepExternalAppDockInViewport);
}

function restoreExternalAppDockCompact() {
    if (!dom.externalAppButtons) return;
    // 앱을 열 때는 항상 작은 원형 버튼 도크로 시작한다.
    dom.externalAppButtons.classList.add("compact");
    const toggle = dom.externalAppButtons.querySelector(".external-app-compact-toggle");
    if (toggle) toggle.innerText = "◎";
}

function toggleExternalAppDockCompact(event) {
    event?.stopPropagation();
    if (!dom.externalAppButtons) return;
    const compact = !dom.externalAppButtons.classList.contains("compact");
    dom.externalAppButtons.classList.toggle("compact", compact);
    event.currentTarget.innerText = compact ? "◎" : "◉";
    try { localStorage.setItem("fma.externalAppDock.compact.v2", String(compact)); } catch (_) {}
    // 접기/펼치기를 반복해도 이전 크기의 좌표가 남지 않게 한다.
    // 매 전환 후 안전한 초기 위치(우측 하단)로 복귀한다.
    try { localStorage.removeItem("fma.externalAppDock.position.v3"); } catch (_) {}
    requestAnimationFrame(resetExternalAppDockPosition);
}

function restoreExternalAppDockPosition() {
    if (!dom.externalAppButtons) return;
    try {
        const saved = JSON.parse(localStorage.getItem("fma.externalAppDock.position.v3") || "null");
        if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) {
            resetExternalAppDockPosition();
            return;
        }
        const width = dom.externalAppButtons.offsetWidth || 54;
        const height = dom.externalAppButtons.offsetHeight || 300;
        dom.externalAppButtons.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 12, saved.left))}px`;
        dom.externalAppButtons.style.top = `${Math.max(58, Math.min(window.innerHeight - height - 8, saved.top))}px`;
        dom.externalAppButtons.style.right = "auto";
        dom.externalAppButtons.style.bottom = "auto";
    } catch (_) {}
}

function resetExternalAppDockPosition() {
    if (!dom.externalAppButtons) return;
    dom.externalAppButtons.style.left = "auto";
    dom.externalAppButtons.style.top = "auto";
    dom.externalAppButtons.style.right = "8px";
    dom.externalAppButtons.style.bottom = "8px";
}

function keepExternalAppDockInViewport() {
    if (!dom.externalAppButtons || dom.externalAppButtons.style.display === "none") return;
    const rect = dom.externalAppButtons.getBoundingClientRect();
    if (rect.right <= window.innerWidth - 6 && rect.bottom <= window.innerHeight - 6 &&
        rect.left >= 6 && rect.top >= 52) return;
    resetExternalAppDockPosition();
}

function beginExternalAppDockDrag(event) {
    if (event.button !== 0 || !dom.externalAppButtons) return;
    const rect = dom.externalAppButtons.getBoundingClientRect();
    externalAppState.dockDrag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
    };
    dom.externalAppButtons.style.left = `${rect.left}px`;
    dom.externalAppButtons.style.top = `${rect.top}px`;
    dom.externalAppButtons.style.right = "auto";
    dom.externalAppButtons.style.bottom = "auto";
    dom.externalAppButtons.classList.add("dragging");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
}

function moveExternalAppDockDrag(event) {
    const drag = externalAppState.dockDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = dom.externalAppButtons.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, event.clientX - drag.offsetX));
    const top = Math.max(58, Math.min(window.innerHeight - rect.height - 8, event.clientY - drag.offsetY));
    dom.externalAppButtons.style.left = `${left}px`;
    dom.externalAppButtons.style.top = `${top}px`;
    event.preventDefault();
}

function endExternalAppDockDrag(event) {
    const drag = externalAppState.dockDrag;
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
    externalAppState.dockDrag = null;
    dom.externalAppButtons?.classList.remove("dragging");
    if (!dom.externalAppButtons) return;
    const rect = dom.externalAppButtons.getBoundingClientRect();
    try {
        localStorage.setItem("fma.externalAppDock.position.v3", JSON.stringify({
            left: Math.round(rect.left), top: Math.round(rect.top)
        }));
    } catch (_) {}
}

function setExternalAppProgress(percent, message, options = {}) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    const isError = options.error === true;
    const isConnected = !externalAppState.loading && !isError;
    dom.externalAppStatus.innerText = isError ? "연결 오류" : (isConnected ? "연결됨" : "연결 중");
    dom.externalAppStatus.title = message || "";
    if (dom.externalAppProgressPercent) {
        dom.externalAppProgressPercent.innerText = `${Math.round(value)}%`;
    }
    if (dom.externalAppProgressBar) {
        dom.externalAppProgressBar.style.width = `${value}%`;
    }
    dom.externalAppProgress.classList.toggle("is-connected", isConnected);
    dom.externalAppProgress.classList.toggle("is-error", isError);
}

function hideExternalAppTaskProgress() {
    if (externalAppState.taskProgressTimer) {
        window.clearTimeout(externalAppState.taskProgressTimer);
        externalAppState.taskProgressTimer = null;
    }
    if (dom.externalAppTaskProgress) dom.externalAppTaskProgress.hidden = true;
}

function setExternalAppTaskProgress(percent, message, options = {}) {
    if (!["aura", "bg"].includes(externalAppState.key) || !dom.externalAppTaskProgress) {
        hideExternalAppTaskProgress();
        return;
    }
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    const isError = options.error === true;
    dom.externalAppTaskProgress.hidden = false;
    dom.externalAppTaskProgress.classList.toggle("is-error", isError);
    dom.externalAppTaskStatus.innerText = message || (isError ? "처리 오류" : "처리 중…");
    dom.externalAppTaskPercent.innerText = `${Math.round(value)}%`;
    dom.externalAppTaskBar.style.width = `${value}%`;
    dom.externalAppTaskProgress.querySelector('[role="progressbar"]')
        ?.setAttribute("aria-valuenow", String(Math.round(value)));
    if (externalAppState.taskProgressTimer) {
        window.clearTimeout(externalAppState.taskProgressTimer);
        externalAppState.taskProgressTimer = null;
    }
    if (value >= 100 && !isError) {
        externalAppState.taskProgressTimer = window.setTimeout(hideExternalAppTaskProgress, 1400);
    }
}

function setExternalAppLayout(layout) {
    const next = ["float", "dock", "maximized"].includes(layout) ? layout : "float";
    externalAppState.layout = next;
    dom.externalAppDialog.classList.toggle("is-docked", next === "dock");
    dom.externalAppDialog.classList.toggle("is-minimized", false);
    dom.externalAppDialog.classList.toggle("is-maximized", next === "maximized");
    dom.btnDockExternalApp.innerText = next === "dock" ? "▣ 팝업 전환" : "▣ 우측 Dock";
    dom.btnMinimizeExternalApp.innerText = next === "maximized" ? "▣ 원래 크기" : "□ 최대화";
    dom.btnMinimizeExternalApp.title = next === "maximized" ? "원래 창 크기로 돌아가기" : "앱 내부 전체화면으로 확대";
    dom.externalAppDialog.removeAttribute("style");
    try {
        localStorage.setItem("fma.externalApp.layout", next === "maximized" ? "float" : next);
    } catch (_) {}
}

function toggleExternalAppDock() {
    setExternalAppLayout(externalAppState.layout === "dock" ? "float" : "dock");
}

function toggleExternalAppMaximized() {
    setExternalAppLayout(externalAppState.layout === "maximized"
        ? (externalAppState.previousLayout || "float")
        : (externalAppState.previousLayout = externalAppState.layout, "maximized"));
}

function beginExternalAppDrag(event) {
    if (event.button !== 0 || event.target.closest("button") ||
        externalAppState.layout !== "float") return;
    const rect = dom.externalAppDialog.getBoundingClientRect();
    externalAppState.drag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
    };
    dom.externalAppDialog.style.left = `${rect.left}px`;
    dom.externalAppDialog.style.top = `${rect.top}px`;
    dom.externalAppDialog.style.transform = "none";
    dom.externalAppDialog.setPointerCapture?.(event.pointerId);
    event.preventDefault();
}

function moveExternalAppDrag(event) {
    if (!externalAppState.drag) return;
    const rect = dom.externalAppDialog.getBoundingClientRect();
    const left = Math.max(0, Math.min(
        window.innerWidth - rect.width,
        event.clientX - externalAppState.drag.offsetX
    ));
    const top = Math.max(0, Math.min(
        window.innerHeight - 58,
        event.clientY - externalAppState.drag.offsetY
    ));
    dom.externalAppDialog.style.left = `${left}px`;
    dom.externalAppDialog.style.top = `${top}px`;
}

function endExternalAppDrag() {
    externalAppState.drag = null;
}

function refreshExternalAppButtons() {
    if (!dom.externalAppButtons) return;
    const visibility = {
        story: typeof isStoryAppEnabled === "function" && isStoryAppEnabled(),
        storyHtml: typeof isStoryHtmlAppEnabled === "function" && isStoryHtmlAppEnabled(),
        aura: typeof isAuraAppEnabled === "function" && isAuraAppEnabled(),
        auraGemini: typeof isAuraGeminiAppEnabled === "function" && isAuraGeminiAppEnabled(),
        backgroundGemini: typeof isBackgroundGeminiAppEnabled === "function" && isBackgroundGeminiAppEnabled(),
        bg: typeof isBgRemoverAppEnabled === "function" && isBgRemoverAppEnabled()
    };
    dom.btnOpenStoryApp.style.display = visibility.story ? "inline-flex" : "none";
    dom.btnOpenStoryHtmlApp.style.display = visibility.storyHtml ? "inline-flex" : "none";
    dom.btnOpenAuraApp.style.display = visibility.aura ? "inline-flex" : "none";
    dom.btnOpenAuraGeminiApp.style.display = visibility.auraGemini ? "inline-flex" : "none";
    dom.btnOpenBackgroundGeminiApp.style.display = visibility.backgroundGemini ? "inline-flex" : "none";
    dom.btnOpenBgApp.style.display = visibility.bg ? "inline-flex" : "none";
    dom.externalAppButtons.style.display =
        Object.values(visibility).some(Boolean) ? "flex" : "none";
}

function openExternalImageApp(key) {
    const app = EXTERNAL_IMAGE_APPS[key];
    if (!app) return;
    if (app.external) {
        // 일부 브라우저는 정상적으로 연 외부 탭을 사용자가 닫은 뒤에도
        // window.open() 반환값을 null로 보고한다. 이 경우 불필요한 경고창을 띄우지 않는다.
        try {
            window.open(app.path, "_blank", "noopener,noreferrer");
        } catch (_) {}
        return;
    }
    externalAppState.key = key;
    externalAppState.requestId = null;
    externalAppState.loading = true;
    hideExternalAppTaskProgress();
    dom.externalAppTitle.innerText = app.title;
    dom.externalAppDescription.innerText = app.description;
    dom.btnImportExternalCurrent.innerText = app.currentLabel;
    dom.btnImportExternalAll.innerText = app.allLabel;
    setExternalAppProgress(5, `${app.title}을(를) 불러오는 중…`);
    dom.externalAppImportHint.innerText =
        key === "storyHtml"
            ? "스토리 앱에서 보낼 이미지를 체크한 뒤 선택 가져오기를 누르세요."
            : "앱에서 이미지를 만든 뒤 현재 또는 전체 가져오기를 누르세요.";
    setExternalAppImportDisabled(true);
    dom.externalAppModal.style.display = "flex";
    let savedLayout = "float";
    try {
        savedLayout = localStorage.getItem("fma.externalApp.layout") || "float";
    } catch (_) {}
    setExternalAppLayout(savedLayout);
    dom.externalAppFrame.src = buildExternalAppUrl(key, app.path);
}

function buildExternalAppUrl(key, path) {
    const url = new URL(path, document.baseURI);
    url.searchParams.set("fmaEmbed", "1");
    url.searchParams.set("app", key);
    if (EXTERNAL_IMAGE_APPS[key]?.version) {
        url.searchParams.set("v", EXTERNAL_IMAGE_APPS[key].version);
    }
    if (key === "storyHtml") {
        url.searchParams.set("addon", "fmaviewer");
        url.searchParams.set("origin", window.location.origin);
    }
    return url.href;
}

function closeExternalImageApp() {
    if (dom.externalAppFmaPicker?.style.display !== "none") {
        closeExternalAppFmaPicker(true);
    }
    dom.externalAppModal.style.display = "none";
    dom.externalAppFrame.src = "about:blank";
    hideExternalAppTaskProgress();
    externalAppState.key = null;
    externalAppState.requestId = null;
    externalAppState.loading = false;
}

function reloadExternalImageApp() {
    if (!externalAppState.key) return;
    const app = EXTERNAL_IMAGE_APPS[externalAppState.key];
    externalAppState.loading = true;
    hideExternalAppTaskProgress();
    setExternalAppImportDisabled(true);
    setExternalAppProgress(5, `${app.title}을(를) 다시 불러오는 중…`);
    dom.externalAppFrame.src = buildExternalAppUrl(externalAppState.key, app.path) +
        `&reload=${Date.now()}`;
}

function handleExternalAppFrameLoad() {
    if (!externalAppState.key || dom.externalAppFrame.src === "about:blank") return;
    externalAppState.loading = false;
    const appTitle = EXTERNAL_IMAGE_APPS[externalAppState.key]?.title || "이미지 앱";
    setExternalAppProgress(10, `${appTitle} 연결 준비 · 작업 중에도 갤러리를 탐색할 수 있습니다.`);
    setExternalAppImportDisabled(false);
    dom.externalAppFrame.contentWindow?.postMessage({
        type: "fma-app-host-ready",
        app: externalAppState.key
    }, "*");
    notifyExternalAppSharedApiKey();
}

function notifyExternalAppSharedApiKey() {
    if (!externalAppState.key || !dom.externalAppFrame?.contentWindow) return;
    dom.externalAppFrame.contentWindow.postMessage({
        type: "fma-app-shared-api-key-updated",
        key: typeof getAiStudioApiKey === "function" ? getAiStudioApiKey() : "",
        enabled: typeof isAiKeyUsageEnabled === "function" ? isAiKeyUsageEnabled() : true
    }, "*");
}

function requestExternalAppImages(mode) {
    if (!externalAppState.key || externalAppState.loading) return;
    externalAppState.requestId =
        `fma-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const requestId = externalAppState.requestId;
    setExternalAppImportDisabled(true);
    setExternalAppProgress(100, mode === "all"
        ? "전체 히스토리 준비 중…"
        : "선택 이미지 준비 중…");
    dom.externalAppFrame.contentWindow?.postMessage({
        type: "fma-app-request-images",
        app: externalAppState.key,
        mode: mode,
        requestId: requestId
    }, "*");
    window.setTimeout(() => {
        if (externalAppState.requestId !== requestId) return;
        setExternalAppProgress(100, "응답 대기 중 · 앱에서 이미지 생성을 확인하세요.");
        setExternalAppImportDisabled(false);
    }, 7000);
}

async function handleExternalAppMessage(event) {
    if (!externalAppState.key || event.source !== dom.externalAppFrame.contentWindow) return;
    const data = event.data || {};
    if (data.type === "fma-story-edit-request" &&
        data.app === "storyHtml" &&
        externalAppState.key === "storyHtml") {
        await openStoryHtmlChildEditor(data);
        return;
    }
    if (data.type === "fma-app-request-source-images" &&
        ["aura", "bg", "storyHtml"].includes(data.app)) {
        if (["bg", "storyHtml"].includes(data.app) && data.mode === "picker") {
            openExternalAppFmaPicker(data.requestId, data.app);
        } else {
            sendFmaSourceImagesToExternalApp(data.app, data.requestId, data.mode);
        }
        return;
    }
    if (data.type === "fma-app-request-shared-api-key") {
        notifyExternalAppSharedApiKey();
        return;
    }
    if (data.type === "fma-app-progress" &&
        (!data.app || data.app === externalAppState.key)) {
        setExternalAppTaskProgress(data.percent, data.message || "이미지 처리 중…", {
            error: data.status === "error"
        });
        return;
    }
    if (data.type === "fma-app-ready" || data.type === "storyboard-studio-ready") {
        const appTitle = EXTERNAL_IMAGE_APPS[externalAppState.key]?.title || "이미지 앱";
        setExternalAppProgress(0, `연결 완료 · ${appTitle} 작업을 시작할 수 있습니다.`);
        setExternalAppImportDisabled(false);
        notifyExternalAppSharedApiKey();
        return;
    }
    if (data.type === "fma-app-error") {
        externalAppState.requestId = null;
        setExternalAppTaskProgress(0, data.message || "이미지를 가져올 수 없습니다.", { error: true });
        setExternalAppImportDisabled(false);
        return;
    }
    if (data.type === "storyboard-studio-commit") {
        await importExternalAppImages(data.images, "storyHtml");
        return;
    }
    if (data.type !== "fma-app-images") return;
    if (data.app && data.app !== externalAppState.key) return;
    if (data.requestId && externalAppState.requestId &&
        data.requestId !== externalAppState.requestId) return;
    await importExternalAppImages(data.images, externalAppState.key);
}

async function openStoryHtmlChildEditor(data) {
    const requestId = String(data.requestId || "");
    const tool = String(data.tool || "").toLowerCase();
    const source = data.image?.dataUrl || data.image?.src || "";
    if (!requestId || !source.startsWith("data:image")) {
        postStoryHtmlEditResult(requestId, tool, "", "편집할 Story 이미지를 읽을 수 없습니다.");
        return;
    }

    const onApply = resultSrc => {
        postStoryHtmlEditResult(requestId, tool, resultSrc);
    };
    try {
        if (tool === "crop" && typeof openCropEditorForLayer === "function") {
            openCropEditorForLayer(source, onApply);
            return;
        }
        if (["bgr", "bg", "bgremove", "background-remove"].includes(tool) &&
            typeof openBackgroundRemoveEditorForExternal === "function") {
            openBackgroundRemoveEditorForExternal(source, onApply);
            return;
        }
        if (tool === "edit" && typeof openImageEditorForExternal === "function") {
            await openImageEditorForExternal(source, onApply);
            return;
        }
        throw new Error("요청한 편집 도구를 사용할 수 없습니다.");
    } catch (error) {
        console.error("Story Image child editor failed:", error);
        postStoryHtmlEditResult(requestId, tool, "", error.message);
    }
}

function postStoryHtmlEditResult(requestId, tool, dataUrl, errorMessage = "") {
    if (!dom.externalAppFrame?.contentWindow) return;
    dom.externalAppFrame.contentWindow.postMessage({
        type: "fma-story-edit-result",
        app: "storyHtml",
        requestId,
        tool,
        dataUrl: dataUrl || "",
        error: errorMessage || ""
    }, "*");
}

async function sendFmaSourceImagesToExternalApp(appKey, requestId, mode = "current", selectedIndices = null) {
    if (externalAppState.key !== appKey || !dom.externalAppFrame?.contentWindow) return;
    const order = typeof getActiveImageOrder === "function"
        ? getActiveImageOrder()
        : images.map((_, index) => index);
    const sourceOrder = Array.isArray(selectedIndices)
        ? selectedIndices
        : mode === "all"
            ? order
            : images[currentIndex] ? [currentIndex] : [];
    for (const rawIndex of sourceOrder) {
        if (typeof ensureImageOriginalLoaded === "function") {
            await ensureImageOriginalLoaded(rawIndex);
        }
    }
    const payload = [];
    for (let displayIndex = 0; displayIndex < sourceOrder.length; displayIndex++) {
        const rawIndex = sourceOrder[displayIndex];
        const item = images[rawIndex];
        if (!item?.src) continue;
        const dataUrl = await externalAppImageSourceToDataUrl(item.src);
        if (!dataUrl.startsWith("data:image")) continue;
        payload.push({
            id: `fma-source-${rawIndex}-${displayIndex}`,
            rawIndex,
            displayIndex,
            dataUrl,
            name: item.name || item.metadata?.title || item.path || `FMA_Image_${displayIndex + 1}`
        });
    }
    dom.externalAppFrame.contentWindow.postMessage({
        type: "fma-app-source-images",
        app: appKey,
        requestId,
        images: payload
    }, "*");
}

async function externalAppImageSourceToDataUrl(source) {
    if (String(source).startsWith("data:image")) return String(source);
    const blob = await fetch(source).then(response => {
        if (!response.ok) throw new Error(`이미지 원본을 읽지 못했습니다 (${response.status})`);
        return response.blob();
    });
    if (!blob.type.startsWith("image/")) throw new Error("선택한 항목은 이미지가 아닙니다.");
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("이미지 변환에 실패했습니다."));
        reader.readAsDataURL(blob);
    });
}

function getExternalAppFmaPickerOrder() {
    const order = images
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item && item.mediaType !== "video");
    if (sortMode === "latest") order.sort((a, b) => getMediaCreatedTimestamp(b.item) - getMediaCreatedTimestamp(a.item));
    else if (sortMode === "modified") order.sort((a, b) => getMediaModifiedTimestamp(b.item) - getMediaModifiedTimestamp(a.item));
    else if (sortMode === "oldest") order.sort((a, b) => getMediaCreatedTimestamp(a.item) - getMediaCreatedTimestamp(b.item));
    else if (sortMode === "size") order.sort((a, b) => (b.item.size || 0) - (a.item.size || 0));
    else if (sortMode === "type") order.sort((a, b) => {
        const typeA = String(a.item.mimeType || a.item.path || a.item.name || "");
        const typeB = String(b.item.mimeType || b.item.path || b.item.name || "");
        return typeA.localeCompare(typeB);
    });
    return order.map(({ index }) => index);
}

function openExternalAppFmaPicker(requestId, appKey = externalAppState.key || "bg") {
    externalAppState.sourcePickerRequestId = requestId || `${appKey}-picker-${Date.now()}`;
    externalAppState.sourcePickerApp = appKey;
    externalAppState.sourcePickerIndex = -1;
    const label = appKey === "storyHtml" ? "Story Image 참고 이미지" : "BG Remover";
    const title = document.getElementById("externalAppFmaPickerTitle");
    const description = title?.parentElement?.querySelector("p");
    if (title) title.innerText = "FMA 갤러리에서 이미지 선택";
    if (description) description.innerText = `${label}로 가져갈 이미지를 선택하세요.`;
    if (dom.btnApplyExternalAppFmaPicker) dom.btnApplyExternalAppFmaPicker.innerText = `${label}로 가져오기`;
    renderExternalAppFmaPicker();
    dom.externalAppFmaPicker.style.display = "flex";
}

function renderExternalAppFmaPicker() {
    const order = getExternalAppFmaPickerOrder();
    dom.externalAppFmaPickerGrid.innerHTML = "";
    order.forEach(index => {
        const item = images[index];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "editor-fma-picker-item";
        button.classList.toggle("active", index === externalAppState.sourcePickerIndex);
        button.setAttribute("aria-pressed", index === externalAppState.sourcePickerIndex ? "true" : "false");
        const preview = document.createElement("img");
        preview.src = item.thumbnailSrc || item.src;
        preview.alt = item.name || `FMA 이미지 ${index + 1}`;
        const label = document.createElement("span");
        label.innerText = item.name || item.metadata?.title || item.path || `이미지 ${index + 1}`;
        button.append(preview, label);
        button.onclick = () => {
            externalAppState.sourcePickerIndex = index;
            renderExternalAppFmaPicker();
        };
        button.ondblclick = () => {
            externalAppState.sourcePickerIndex = index;
            applyExternalAppFmaPicker();
        };
        dom.externalAppFmaPickerGrid.appendChild(button);
    });
    const selected = externalAppState.sourcePickerIndex;
    dom.btnApplyExternalAppFmaPicker.disabled = selected < 0 || !images[selected];
    dom.externalAppFmaPickerStatus.innerText = selected >= 0 && images[selected]
        ? `${images[selected].name || images[selected].path || "선택 이미지"} · 가져올 준비 완료`
        : order.length ? "이미지를 선택하세요." : "FMA 갤러리에 선택할 이미지가 없습니다.";
}

async function applyExternalAppFmaPicker() {
    const index = externalAppState.sourcePickerIndex;
    const requestId = externalAppState.sourcePickerRequestId;
    const appKey = externalAppState.sourcePickerApp || externalAppState.key || "bg";
    if (index < 0 || !images[index] || !requestId) return;
    dom.btnApplyExternalAppFmaPicker.disabled = true;
    dom.externalAppFmaPickerStatus.innerText = "선택한 원본 이미지를 준비하는 중…";
    try {
        await sendFmaSourceImagesToExternalApp(appKey, requestId, "picker", [index]);
        closeExternalAppFmaPicker(false);
        setExternalAppProgress(45, "선택한 FMA 이미지를 앱으로 보내는 중…");
    } catch (error) {
        dom.externalAppFmaPickerStatus.innerText = `이미지를 가져오지 못했습니다: ${error.message}`;
        dom.btnApplyExternalAppFmaPicker.disabled = false;
    }
}

function closeExternalAppFmaPicker(cancelRequest = false) {
    if (!dom.externalAppFmaPicker) return;
    const requestId = externalAppState.sourcePickerRequestId;
    const appKey = externalAppState.sourcePickerApp;
    dom.externalAppFmaPicker.style.display = "none";
    externalAppState.sourcePickerRequestId = null;
    externalAppState.sourcePickerIndex = -1;
    externalAppState.sourcePickerApp = null;
    if (cancelRequest && requestId && appKey && externalAppState.key === appKey) {
        dom.externalAppFrame.contentWindow?.postMessage({
            type: "fma-app-source-images",
            app: appKey,
            requestId,
            images: []
        }, "*");
    }
}

async function importExternalAppImages(payload, appKey) {
    externalAppState.requestId = null;
    const entries = Array.isArray(payload) ? payload : [];
    if (!entries.length) {
        setExternalAppProgress(100, "가져올 이미지가 없습니다.");
        setExternalAppImportDisabled(false);
        return;
    }
    const files = [];
    for (let index = 0; index < entries.length; index++) {
        const entry = typeof entries[index] === "string"
            ? { dataUrl: entries[index] }
            : entries[index] || {};
        const dataUrl = entry.dataUrl || entry.src || entry.image;
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image")) continue;
        const blob = await fetch(dataUrl).then(response => response.blob());
        const extension = getExternalImageExtension(blob.type);
        const appName = EXTERNAL_IMAGE_APPS[appKey]?.title.replace(/\s+/g, "_") || "App";
        files.push(new File(
            [blob],
            entry.name || `${appName}_${String(index + 1).padStart(2, "0")}.${extension}`,
            { type: blob.type || entry.mimeType || "image/png", lastModified: Date.now() }
        ));
    }
    if (!files.length) {
        setExternalAppProgress(100, "지원되는 이미지 결과를 찾지 못했습니다.");
        setExternalAppImportDisabled(false);
        return;
    }
    const firstIndex = images.length;
    await handleAddImages(files, {
        background: true,
        loadingTitle: `갤러리에 ${files.length}개 이미지 추가 중…`,
        statusMessage: `${files.length}개 이미지를 갤러리에 추가했습니다.`
    });
    const sourceGroup = {
        story: "story-app",
        storyHtml: "story-html-app",
        aura: "aura-app",
        bg: "bg-remover-app"
    }[appKey] || "app-import";
    images.slice(firstIndex).forEach((item, index) => {
        item.group = sourceGroup;
        item.path = `$.apps.${appKey}.${files[index]?.name || `image_${index + 1}`}`;
        item.metadata = {
            ...(item.metadata || {}),
            sourceApp: EXTERNAL_IMAGE_APPS[appKey]?.title || appKey,
            importedAt: new Date().toISOString()
        };
    });
    renderGallery();
    saveCurrentImagesToDB();
    if (images[firstIndex]) showImage(firstIndex);
    setExternalAppProgress(100, `${files.length}개 이미지를 FMA Viewer에 추가했습니다.`);
    dom.externalAppImportHint.innerText = "가져오기 완료 · 앱에서 계속 작업할 수 있습니다.";
    setExternalAppImportDisabled(false);
}

function setExternalAppImportDisabled(disabled) {
    dom.btnImportExternalCurrent.disabled = disabled;
    dom.btnImportExternalAll.disabled = disabled;
}

function getExternalImageExtension(mimeType) {
    const extensions = {
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif"
    };
    return extensions[mimeType] || "png";
}

document.addEventListener("DOMContentLoaded", initExternalAppsFeature);
