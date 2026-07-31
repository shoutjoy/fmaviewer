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
        currentLabel: "현재 누끼 넣기",
        allLabel: "보관소 모두 넣기"
    }
};

var externalAppState = {
    key: null,
    requestId: null,
    loading: false,
    layout: "float",
    drag: null
};

function initExternalAppsFeature() {
    if (!dom.externalAppModal) return;
    dom.btnOpenStoryApp.onclick = () => openExternalImageApp("story");
    dom.btnOpenAuraApp.onclick = () => openExternalImageApp("aura");
    dom.btnOpenAuraGeminiApp.onclick = () => openExternalImageApp("auraGemini");
    dom.btnOpenBackgroundGeminiApp.onclick = () => openExternalImageApp("backgroundGemini");
    dom.btnOpenBgApp.onclick = () => openExternalImageApp("bg");
    dom.btnCloseExternalApp.onclick = closeExternalImageApp;
    dom.btnReloadExternalApp.onclick = reloadExternalImageApp;
    dom.btnDockExternalApp.onclick = toggleExternalAppDock;
    dom.btnMinimizeExternalApp.onclick = toggleExternalAppMinimized;
    dom.btnImportExternalCurrent.onclick = () => requestExternalAppImages("current");
    dom.btnImportExternalAll.onclick = () => requestExternalAppImages("all");
    dom.externalAppFrame.addEventListener("load", handleExternalAppFrameLoad);
    dom.externalAppDialog.querySelector(".external-app-header")
        ?.addEventListener("pointerdown", beginExternalAppDrag);
    window.addEventListener("pointermove", moveExternalAppDrag);
    window.addEventListener("pointerup", endExternalAppDrag);
    window.addEventListener("message", handleExternalAppMessage);
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && dom.externalAppModal.style.display !== "none") {
            closeExternalImageApp();
        }
    });
    refreshExternalAppButtons();
}

function setExternalAppProgress(percent, message, options = {}) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    if (message) dom.externalAppStatus.innerText = message;
    dom.externalAppProgressPercent.innerText = `${Math.round(value)}%`;
    dom.externalAppProgressBar.style.width = `${value}%`;
    const track = dom.externalAppProgress.querySelector('[role="progressbar"]');
    track?.setAttribute("aria-valuenow", String(Math.round(value)));
    dom.externalAppProgress.classList.toggle("is-error", options.error === true);
}

function setExternalAppLayout(layout) {
    const next = ["float", "dock", "minimized"].includes(layout) ? layout : "float";
    externalAppState.layout = next;
    dom.externalAppDialog.classList.toggle("is-docked", next === "dock");
    dom.externalAppDialog.classList.toggle("is-minimized", next === "minimized");
    dom.btnDockExternalApp.innerText = next === "dock" ? "▣ 팝업 전환" : "▣ 우측 Dock";
    dom.btnMinimizeExternalApp.innerText = next === "minimized" ? "□ 펼치기" : "— 최소화";
    dom.externalAppDialog.removeAttribute("style");
    try {
        localStorage.setItem("fma.externalApp.layout", next === "minimized" ? "float" : next);
    } catch (_) {}
}

function toggleExternalAppDock() {
    setExternalAppLayout(externalAppState.layout === "dock" ? "float" : "dock");
}

function toggleExternalAppMinimized() {
    setExternalAppLayout(externalAppState.layout === "minimized"
        ? (externalAppState.previousLayout || "float")
        : (externalAppState.previousLayout = externalAppState.layout, "minimized"));
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
        aura: typeof isAuraAppEnabled === "function" && isAuraAppEnabled(),
        auraGemini: typeof isAuraGeminiAppEnabled === "function" && isAuraGeminiAppEnabled(),
        backgroundGemini: typeof isBackgroundGeminiAppEnabled === "function" && isBackgroundGeminiAppEnabled(),
        bg: typeof isBgRemoverAppEnabled === "function" && isBgRemoverAppEnabled()
    };
    dom.btnOpenStoryApp.style.display = visibility.story ? "inline-flex" : "none";
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
        const opened = window.open(app.path, "_blank", "noopener,noreferrer");
        if (!opened) {
            alert(`${app.title} 창을 열지 못했습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도하세요.`);
        }
        return;
    }
    externalAppState.key = key;
    externalAppState.requestId = null;
    externalAppState.loading = true;
    dom.externalAppTitle.innerText = app.title;
    dom.externalAppDescription.innerText = app.description;
    dom.btnImportExternalCurrent.innerText = app.currentLabel;
    dom.btnImportExternalAll.innerText = app.allLabel;
    setExternalAppProgress(5, "Aura 앱을 불러오는 중…");
    dom.externalAppImportHint.innerText =
        key === "story"
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
    if (key === "story") {
        url.searchParams.set("addon", "fmaviewer");
        url.searchParams.set("origin", window.location.origin);
    }
    return url.href;
}

function closeExternalImageApp() {
    dom.externalAppModal.style.display = "none";
    dom.externalAppFrame.src = "about:blank";
    externalAppState.key = null;
    externalAppState.requestId = null;
    externalAppState.loading = false;
}

function reloadExternalImageApp() {
    if (!externalAppState.key) return;
    const app = EXTERNAL_IMAGE_APPS[externalAppState.key];
    externalAppState.loading = true;
    setExternalAppImportDisabled(true);
    setExternalAppProgress(5, "Aura 앱을 다시 불러오는 중…");
    dom.externalAppFrame.src = buildExternalAppUrl(externalAppState.key, app.path) +
        `&reload=${Date.now()}`;
}

function handleExternalAppFrameLoad() {
    if (!externalAppState.key || dom.externalAppFrame.src === "about:blank") return;
    externalAppState.loading = false;
    setExternalAppProgress(10, "Aura 연결 준비 · 생성 중에도 갤러리를 탐색할 수 있습니다.");
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
    dom.externalAppStatus.innerText = mode === "all"
        ? "전체 히스토리 준비 중…"
        : "선택 이미지 준비 중…";
    dom.externalAppFrame.contentWindow?.postMessage({
        type: "fma-app-request-images",
        app: externalAppState.key,
        mode: mode,
        requestId: requestId
    }, "*");
    window.setTimeout(() => {
        if (externalAppState.requestId !== requestId) return;
        dom.externalAppStatus.innerText = "응답 대기 중 · 앱에서 이미지 생성을 확인하세요.";
        setExternalAppImportDisabled(false);
    }, 7000);
}

async function handleExternalAppMessage(event) {
    if (!externalAppState.key || event.source !== dom.externalAppFrame.contentWindow) return;
    const data = event.data || {};
    if (data.type === "fma-app-request-source-images" && data.app === "aura") {
        sendFmaSourceImagesToAura(data.requestId);
        return;
    }
    if (data.type === "fma-app-request-shared-api-key") {
        notifyExternalAppSharedApiKey();
        return;
    }
    if (data.type === "fma-app-progress" &&
        (!data.app || data.app === externalAppState.key)) {
        setExternalAppProgress(data.percent, data.message || "Aura 이미지 처리 중…", {
            error: data.status === "error"
        });
        return;
    }
    if (data.type === "fma-app-ready" || data.type === "storyboard-studio-ready") {
        setExternalAppProgress(0, "연결 완료 · Aura 작업을 시작할 수 있습니다.");
        setExternalAppImportDisabled(false);
        notifyExternalAppSharedApiKey();
        return;
    }
    if (data.type === "fma-app-error") {
        externalAppState.requestId = null;
        setExternalAppProgress(0, data.message || "이미지를 가져올 수 없습니다.", { error: true });
        setExternalAppImportDisabled(false);
        return;
    }
    if (data.type === "storyboard-studio-commit") {
        await importExternalAppImages(data.images, "story");
        return;
    }
    if (data.type !== "fma-app-images") return;
    if (data.app && data.app !== externalAppState.key) return;
    if (data.requestId && externalAppState.requestId &&
        data.requestId !== externalAppState.requestId) return;
    await importExternalAppImages(data.images, externalAppState.key);
}

function sendFmaSourceImagesToAura(requestId) {
    if (externalAppState.key !== "aura" || !dom.externalAppFrame?.contentWindow) return;
    const order = typeof getActiveImageOrder === "function"
        ? getActiveImageOrder()
        : images.map((_, index) => index);
    const payload = order
        .map((rawIndex, displayIndex) => {
            const item = images[rawIndex];
            if (!item?.src || !String(item.src).startsWith("data:image")) return null;
            return {
                id: `fma-source-${rawIndex}-${displayIndex}`,
                rawIndex,
                displayIndex,
                dataUrl: item.src,
                name: item.name || item.metadata?.title || item.path || `FMA_Image_${displayIndex + 1}`
            };
        })
        .filter(Boolean);
    dom.externalAppFrame.contentWindow.postMessage({
        type: "fma-app-source-images",
        app: "aura",
        requestId,
        images: payload
    }, "*");
}

async function importExternalAppImages(payload, appKey) {
    externalAppState.requestId = null;
    const entries = Array.isArray(payload) ? payload : [];
    if (!entries.length) {
        dom.externalAppStatus.innerText = "가져올 이미지가 없습니다.";
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
        dom.externalAppStatus.innerText = "지원되는 이미지 결과를 찾지 못했습니다.";
        setExternalAppImportDisabled(false);
        return;
    }
    const firstIndex = images.length;
    await handleAddImages(files);
    const sourceGroup = {
        story: "story-app",
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
