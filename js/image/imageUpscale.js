/* =======================================================
   Local Canvas & Google AI Studio Image Upscale
   ======================================================= */

const AI_UPSCALE_MODEL = "gemini-3.1-flash-image";
const AI_UPSCALE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const AI_API_KEY_STORAGE = "fma_ai_studio_api_key";
const AI_KEY_USAGE_ENABLED_STORAGE = "fma_ai_key_usage_enabled";
const AI_ENABLED_STORAGE = "fma_ai_upscale_enabled";
const AI_BG_REMOVE_ENABLED_STORAGE = "fma_ai_bg_remove_enabled";
const AI_RESOLUTION_STORAGE = "fma_ai_upscale_resolution";
const AI_UPSCALE_PROMPT_STORAGE = "fma_ai_upscale_prompt";
const AI_BG_REMOVE_PROMPT_STORAGE = "fma_ai_bg_remove_prompt";
const STORY_APP_ENABLED_STORAGE = "fma_story_app_enabled";
const STORY_HTML_APP_ENABLED_STORAGE = "fma_story_html_app_enabled";
const AURA_APP_ENABLED_STORAGE = "fma_aura_app_enabled";
const AURA_GEMINI_APP_ENABLED_STORAGE = "fma_aura_gemini_app_enabled";
const BACKGROUND_GEMINI_APP_ENABLED_STORAGE = "fma_background_gemini_app_enabled";
const BG_REMOVER_APP_ENABLED_STORAGE = "fma_bg_remover_app_enabled";
const IMAGE_EXTEND_APP_ENABLED_STORAGE = "fma_image_extend_app_enabled";
const IMAGE_EXTEND_GEMINI_APP_ENABLED_STORAGE = "fma_image_extend_gemini_app_enabled";
const DEFAULT_AI_UPSCALE_PROMPT =
    "Upscale this exact image to a higher resolution. Preserve the original composition, identity, " +
    "facial features, body proportions, text, colors, lighting, textures, and every visible detail. " +
    "Do not add, remove, restyle, or reinterpret anything. Enhance fine detail and reduce compression " +
    "artifacts only.";
const DEFAULT_AI_BG_REMOVE_PROMPT =
    "Isolate the foreground person or main subject from this exact image. Preserve identity, face, hair " +
    "strands, body proportions, clothing, colors, lighting, edges, and every visible subject detail. " +
    "Do not crop, reposition, restyle, add, remove, or reinterpret the foreground. Replace the entire " +
    "background with a flat, uniform pure white background (#FFFFFF) with no shadows, texture, objects, " +
    "gradient, or reflections so a local segmentation pass can create a clean transparent PNG.";

var upscaleState = {
    imageIndex: -1,
    sourceImage: null,
    mode: "local",
    scale: 2,
    resizeMode: "scale",
    targetWidth: 0,
    targetHeight: 0,
    resultSrc: null,
    resultMimeType: "image/png",
    resultWidth: 0,
    resultHeight: 0,
    processing: false,
    abortController: null,
    prompt: ""
};

function upscaleImage(img, scale = 2) {
    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    return resizeImage(img, sourceWidth * scale, sourceHeight * scale);
}

function resizeImage(img, targetWidth, targetHeight) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = Math.max(1, Math.round(targetWidth));
    canvas.height = Math.max(1, Math.round(targetHeight));

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas;
}

function applySharpen(canvas, amount = 1.0) {
    if (amount <= 0) return canvas;

    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const output = ctx.createImageData(width, height);
    const dst = output.data;
    const centerWeight = 1 + amount * 4;

    for (let y = 0; y < height; y++) {
        const upY = y > 0 ? y - 1 : y;
        const downY = y < height - 1 ? y + 1 : y;

        for (let x = 0; x < width; x++) {
            const leftX = x > 0 ? x - 1 : x;
            const rightX = x < width - 1 ? x + 1 : x;
            const center = (y * width + x) * 4;
            const left = (y * width + leftX) * 4;
            const right = (y * width + rightX) * 4;
            const up = (upY * width + x) * 4;
            const down = (downY * width + x) * 4;

            dst[center] = data[center] * centerWeight -
                amount * (data[left] + data[right] + data[up] + data[down]);
            dst[center + 1] = data[center + 1] * centerWeight -
                amount * (data[left + 1] + data[right + 1] + data[up + 1] + data[down + 1]);
            dst[center + 2] = data[center + 2] * centerWeight -
                amount * (data[left + 2] + data[right + 2] + data[up + 2] + data[down + 2]);
            dst[center + 3] = data[center + 3];
        }
    }

    ctx.putImageData(output, 0, 0);
    return canvas;
}

function initUpscaleFeature() {
    if (!dom.upscaleModal || !dom.settingsModal) return;

    dom.btnSettings.onclick = openUpscaleSettings;
    dom.btnSettingsClose.onclick = closeUpscaleSettings;
    dom.btnSettingsCancel.onclick = closeUpscaleSettings;
    dom.btnSettingsSave.onclick = saveUpscaleSettings;
    dom.btnClearApiKey.onclick = clearUpscaleApiKey;
    dom.btnToggleApiKey.onclick = toggleApiKeyVisibility;
    dom.btnApplySharedApiKey.onclick = applySharedAiApiKey;
    dom.btnToggleAiKeyUsage.onclick = toggleAiKeyUsage;
    dom.btnResetAiUpscalePrompt.onclick = resetAiUpscalePrompt;
    dom.aiUpscalePrompt.onchange = () => {
        writeUpscaleSetting(AI_UPSCALE_PROMPT_STORAGE, dom.aiUpscalePrompt.value.trim());
    };

    dom.btnUpscaleClose.onclick = closeUpscaleEditor;
    dom.btnUpscaleCancel.onclick = closeUpscaleEditor;
    dom.btnRunUpscale.onclick = runSelectedUpscale;
    dom.btnUpscaleChoiceCancel.onclick = closeUpscaleSaveChoice;
    dom.btnUpscaleReplace.onclick = () => saveUpscaleResult("replace");
    dom.btnUpscaleNew.onclick = () => saveUpscaleResult("new");

    document.querySelectorAll(".upscale-scale").forEach(button => {
        button.onclick = () => {
            upscaleState.scale = Number(button.getAttribute("data-scale")) || 2;
            setUpscaleResizeMode("scale");
            document.querySelectorAll(".upscale-scale").forEach(item => {
                item.classList.toggle("active", item === button);
            });
            updateUpscaleDimensions();
        };
    });

    document.querySelectorAll(".upscale-resize-mode").forEach(button => {
        button.onclick = () => setUpscaleResizeMode(button.getAttribute("data-resize-mode"));
    });

    dom.upscaleTargetWidth.oninput = () => handleUpscaleDimensionInput("width");
    dom.upscaleTargetHeight.oninput = () => handleUpscaleDimensionInput("height");
    dom.upscaleAspectLock.onchange = () => {
        if (dom.upscaleAspectLock.checked) handleUpscaleDimensionInput("width");
        updateUpscaleDimensions();
    };

    dom.sharpenAmount.oninput = () => {
        dom.sharpenValue.innerText = Number(dom.sharpenAmount.value).toFixed(1);
    };

    dom.settingsModal.addEventListener("mousedown", event => {
        if (event.target === dom.settingsModal) closeUpscaleSettings();
    });
    dom.upscaleModal.addEventListener("mousedown", event => {
        if (event.target === dom.upscaleModal && !upscaleState.processing) closeUpscaleEditor();
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        if (dom.upscaleSaveChoice.style.display !== "none") {
            closeUpscaleSaveChoice();
        } else if (dom.upscaleModal.style.display !== "none" && !upscaleState.processing) {
            closeUpscaleEditor();
        } else if (dom.settingsModal.style.display !== "none") {
            closeUpscaleSettings();
        }
    });
}

function readUpscaleSetting(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : value;
    } catch (error) {
        console.warn("Settings read failed:", error);
        return fallback;
    }
}

function writeUpscaleSetting(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (error) {
        console.warn("Settings save failed:", error);
    }
}

function isAiUpscaleEnabled() {
    return readUpscaleSetting(AI_ENABLED_STORAGE, "false") === "true";
}

function isAiBackgroundRemoveEnabled() {
    return readUpscaleSetting(AI_BG_REMOVE_ENABLED_STORAGE, "false") === "true";
}

function getAiUpscaleResolution() {
    return readUpscaleSetting(AI_RESOLUTION_STORAGE, "2K") === "4K" ? "4K" : "2K";
}

function getAiStudioApiKey() {
    return readUpscaleSetting(AI_API_KEY_STORAGE, "").trim();
}

function isAiKeyUsageEnabled() {
    return readUpscaleSetting(AI_KEY_USAGE_ENABLED_STORAGE, "true") !== "false";
}

function getUsableAiStudioApiKey() {
    return isAiKeyUsageEnabled() ? getAiStudioApiKey() : "";
}

function isStoryAppEnabled() {
    return readUpscaleSetting(STORY_APP_ENABLED_STORAGE, "false") === "true";
}

function isStoryHtmlAppEnabled() {
    return readUpscaleSetting(STORY_HTML_APP_ENABLED_STORAGE, "true") === "true";
}

function isAuraAppEnabled() {
    return readUpscaleSetting(AURA_APP_ENABLED_STORAGE, "true") === "true";
}

function isAuraGeminiAppEnabled() {
    return readUpscaleSetting(AURA_GEMINI_APP_ENABLED_STORAGE, "false") === "true";
}

function isBackgroundGeminiAppEnabled() {
    return readUpscaleSetting(BACKGROUND_GEMINI_APP_ENABLED_STORAGE, "false") === "true";
}

function isBgRemoverAppEnabled() {
    return readUpscaleSetting(BG_REMOVER_APP_ENABLED_STORAGE, "true") === "true";
}

function isImageExtendAppEnabled() {
    return readUpscaleSetting(IMAGE_EXTEND_APP_ENABLED_STORAGE, "true") === "true";
}

function isImageExtendGeminiAppEnabled() {
    return readUpscaleSetting(IMAGE_EXTEND_GEMINI_APP_ENABLED_STORAGE, "false") === "true";
}

function getAiUpscalePrompt() {
    return readUpscaleSetting(AI_UPSCALE_PROMPT_STORAGE, DEFAULT_AI_UPSCALE_PROMPT)
        || DEFAULT_AI_UPSCALE_PROMPT;
}

function getAiBackgroundRemovePrompt() {
    return readUpscaleSetting(AI_BG_REMOVE_PROMPT_STORAGE, DEFAULT_AI_BG_REMOVE_PROMPT)
        || DEFAULT_AI_BG_REMOVE_PROMPT;
}

function resetAiUpscalePrompt() {
    dom.aiUpscalePrompt.value = DEFAULT_AI_UPSCALE_PROMPT;
    writeUpscaleSetting(AI_UPSCALE_PROMPT_STORAGE, DEFAULT_AI_UPSCALE_PROMPT);
}

function openUpscaleSettings() {
    dom.aiStudioApiKey.value = getAiStudioApiKey();
    dom.enableAiUpscale.checked = isAiUpscaleEnabled();
    dom.enableAiBgRemove.checked = isAiBackgroundRemoveEnabled();
    dom.enableStoryApp.checked = isStoryAppEnabled();
    dom.enableStoryHtmlApp.checked = isStoryHtmlAppEnabled();
    dom.enableAuraApp.checked = isAuraAppEnabled();
    dom.enableAuraGeminiApp.checked = isAuraGeminiAppEnabled();
    dom.enableBackgroundGeminiApp.checked = isBackgroundGeminiAppEnabled();
    dom.enableBgRemoverApp.checked = isBgRemoverAppEnabled();
    dom.enableImageExtendApp.checked = isImageExtendAppEnabled();
    dom.enableImageExtendGeminiApp.checked = isImageExtendGeminiAppEnabled();
    dom.aiUpscaleResolution.value = getAiUpscaleResolution();
    dom.aiStudioApiKey.type = "password";
    dom.btnToggleApiKey.innerText = "표시";
    refreshAiKeyUsageButton();
    refreshAiKeyUsageStatus();
    dom.settingsModal.style.display = "flex";
    dom.aiStudioApiKey.focus();
}

function refreshAiKeyUsageButton() {
    if (!dom.btnToggleAiKeyUsage) return;
    const enabled = isAiKeyUsageEnabled();
    dom.btnToggleAiKeyUsage.innerText = enabled ? "키 사용 중지" : "키 사용 시작";
    dom.btnToggleAiKeyUsage.classList.toggle("paused", !enabled);
    dom.btnToggleAiKeyUsage.title = enabled
        ? "저장된 키를 유지한 채 모든 AI 호출을 차단합니다."
        : "저장된 키의 AI 사용을 다시 허용합니다.";
}

function refreshAiKeyUsageStatus() {
    const hasKey = Boolean(getAiStudioApiKey());
    if (!hasKey) {
        setSharedApiKeyStatus("API 키가 저장되어 있지 않습니다.");
    } else if (isAiKeyUsageEnabled()) {
        setSharedApiKeyStatus("● 키가 사용 중입니다.", "success");
    } else {
        setSharedApiKeyStatus("● 키가 중지되었습니다.", "error");
    }
}

function toggleAiKeyUsage() {
    const nextEnabled = !isAiKeyUsageEnabled();
    writeUpscaleSetting(AI_KEY_USAGE_ENABLED_STORAGE, String(nextEnabled));
    refreshAiKeyUsageButton();
    refreshAiKeyUsageStatus();
    if (!nextEnabled) {
        upscaleState.abortController?.abort();
        if (typeof bgRemoveState !== "undefined") bgRemoveState.abortController?.abort();
    }
    if (typeof notifyExternalAppSharedApiKey === "function") {
        notifyExternalAppSharedApiKey();
    }
    if (typeof updateAiJenaKeyStatus === "function") updateAiJenaKeyStatus();
    if (images.length > 0 && typeof renderDynamicMeta === "function") renderDynamicMeta(currentIndex);
}

function setSharedApiKeyStatus(message, type = "") {
    if (!dom.sharedApiKeyStatus) return;
    dom.sharedApiKeyStatus.innerText = message;
    dom.sharedApiKeyStatus.classList.toggle("success", type === "success");
    dom.sharedApiKeyStatus.classList.toggle("error", type === "error");
}

function applySharedAiApiKey() {
    const key = dom.aiStudioApiKey.value.trim();
    if (!key) {
        setSharedApiKeyStatus("적용할 Google AI Studio API 키를 입력하세요.", "error");
        dom.aiStudioApiKey.focus();
        return;
    }
    writeUpscaleSetting(AI_API_KEY_STORAGE, key);
    writeUpscaleSetting(AI_KEY_USAGE_ENABLED_STORAGE, "true");
    refreshAiKeyUsageButton();
    setSharedApiKeyStatus("● 키가 사용 중입니다.", "success");
    if (typeof notifyExternalAppSharedApiKey === "function") {
        notifyExternalAppSharedApiKey();
    }
    if (typeof updateAiJenaKeyStatus === "function") updateAiJenaKeyStatus();
    if (images.length > 0 && typeof renderDynamicMeta === "function") renderDynamicMeta(currentIndex);
}

function closeUpscaleSettings() {
    dom.settingsModal.style.display = "none";
    dom.aiStudioApiKey.value = "";
}

function saveUpscaleSettings() {
    const key = dom.aiStudioApiKey.value.trim();
    writeUpscaleSetting(AI_API_KEY_STORAGE, key);
    if (typeof notifyExternalAppSharedApiKey === "function") {
        notifyExternalAppSharedApiKey();
    }
    writeUpscaleSetting(AI_ENABLED_STORAGE, String(dom.enableAiUpscale.checked));
    writeUpscaleSetting(AI_BG_REMOVE_ENABLED_STORAGE, String(dom.enableAiBgRemove.checked));
    writeUpscaleSetting(STORY_APP_ENABLED_STORAGE, String(dom.enableStoryApp.checked));
    writeUpscaleSetting(STORY_HTML_APP_ENABLED_STORAGE, String(dom.enableStoryHtmlApp.checked));
    writeUpscaleSetting(AURA_APP_ENABLED_STORAGE, String(dom.enableAuraApp.checked));
    writeUpscaleSetting(AURA_GEMINI_APP_ENABLED_STORAGE, String(dom.enableAuraGeminiApp.checked));
    writeUpscaleSetting(BACKGROUND_GEMINI_APP_ENABLED_STORAGE, String(dom.enableBackgroundGeminiApp.checked));
    writeUpscaleSetting(BG_REMOVER_APP_ENABLED_STORAGE, String(dom.enableBgRemoverApp.checked));
    writeUpscaleSetting(IMAGE_EXTEND_APP_ENABLED_STORAGE, String(dom.enableImageExtendApp.checked));
    writeUpscaleSetting(IMAGE_EXTEND_GEMINI_APP_ENABLED_STORAGE, String(dom.enableImageExtendGeminiApp.checked));
    writeUpscaleSetting(AI_RESOLUTION_STORAGE, dom.aiUpscaleResolution.value === "4K" ? "4K" : "2K");
    closeUpscaleSettings();

    if (images.length > 0 && typeof renderDynamicMeta === "function") {
        renderDynamicMeta(currentIndex);
    }
    if (typeof refreshExternalAppButtons === "function") refreshExternalAppButtons();
}

function clearUpscaleApiKey() {
    writeUpscaleSetting(AI_API_KEY_STORAGE, "");
    dom.aiStudioApiKey.value = "";
    dom.enableAiUpscale.checked = false;
    dom.enableAiBgRemove.checked = false;
    setSharedApiKeyStatus("공통 키가 삭제되었습니다. 앱별 전용 키는 그대로 유지됩니다.");
    writeUpscaleSetting(AI_ENABLED_STORAGE, "false");
    writeUpscaleSetting(AI_BG_REMOVE_ENABLED_STORAGE, "false");
    if (typeof notifyExternalAppSharedApiKey === "function") {
        notifyExternalAppSharedApiKey();
    }
    if (images.length > 0 && typeof renderDynamicMeta === "function") {
        renderDynamicMeta(currentIndex);
    }
}

function toggleApiKeyVisibility() {
    const show = dom.aiStudioApiKey.type === "password";
    dom.aiStudioApiKey.type = show ? "text" : "password";
    dom.btnToggleApiKey.innerText = show ? "숨김" : "표시";
}

function openUpscaleEditor(index, mode) {
    const item = images[index];
    if (!item) return;

    if (mode === "ai" && !getUsableAiStudioApiKey()) {
        alert(isAiKeyUsageEnabled()
            ? "AI Studio API 키를 먼저 설정하세요."
            : "설정에서 AI 키 사용을 다시 시작하세요.");
        openUpscaleSettings();
        return;
    }

    const sourceImage = new Image();
    sourceImage.onload = () => {
        upscaleState.imageIndex = index;
        upscaleState.sourceImage = sourceImage;
        upscaleState.mode = mode === "ai" ? "ai" : "local";
        upscaleState.scale = 2;
        upscaleState.resizeMode = "scale";
        upscaleState.targetWidth = sourceImage.naturalWidth * 2;
        upscaleState.targetHeight = sourceImage.naturalHeight * 2;
        upscaleState.resultSrc = null;
        upscaleState.processing = false;

        dom.upscalePreview.src = item.src;
        dom.sharpenAmount.value = "0.7";
        dom.sharpenValue.innerText = "0.7";
        document.querySelectorAll(".upscale-scale").forEach(button => {
            button.classList.toggle("active", button.getAttribute("data-scale") === "2");
        });
        document.querySelectorAll(".upscale-resize-mode").forEach(button => {
            button.classList.toggle("active", button.getAttribute("data-resize-mode") === "scale");
        });
        dom.upscaleTargetWidth.value = String(upscaleState.targetWidth);
        dom.upscaleTargetHeight.value = String(upscaleState.targetHeight);
        dom.upscaleAspectLock.checked = true;

        const isAI = upscaleState.mode === "ai";
        dom.upscaleTitle.innerText = isAI ? "AI Studio 이미지 업스케일" : "이미지 업스케일";
        dom.upscaleSubtitle.innerText = isAI
            ? "Google Gemini 이미지 모델로 고해상도 디테일을 생성합니다."
            : "Canvas 고품질 보간과 샤픈 필터로 해상도를 높입니다.";
        dom.localUpscaleControls.style.display = isAI ? "none" : "flex";
        dom.aiUpscaleControls.style.display = isAI ? "flex" : "none";
        dom.aiResolutionText.innerText = getAiUpscaleResolution();
        dom.aiUpscalePrompt.value = getAiUpscalePrompt();
        dom.upscaleModeLabel.innerText = isAI
            ? `Google AI Studio · ${getAiUpscaleResolution()}`
            : "Local Canvas Upscale";
        dom.btnRunUpscale.innerText = isAI ? "AI 업스케일 실행" : "업스케일 실행";
        dom.btnRunUpscale.disabled = false;
        closeUpscaleSaveChoice();
        updateUpscaleDimensions();
        dom.upscaleModal.style.display = "flex";
        dom.btnRunUpscale.focus();
    };
    sourceImage.onerror = () => alert("업스케일할 이미지를 불러올 수 없습니다.");
    sourceImage.src = item.src;
}

function closeUpscaleEditor() {
    if (upscaleState.processing) return;
    dom.upscaleModal.style.display = "none";
    closeUpscaleSaveChoice();
    upscaleState.imageIndex = -1;
    upscaleState.sourceImage = null;
    upscaleState.resultSrc = null;
}

function updateUpscaleDimensions() {
    if (!upscaleState.sourceImage) return;
    const width = upscaleState.sourceImage.naturalWidth;
    const height = upscaleState.sourceImage.naturalHeight;

    if (upscaleState.mode === "ai") {
        dom.upscaleDimensionInfo.innerText = `${width} × ${height} → ${getAiUpscaleResolution()} AI 출력`;
    } else {
        const target = getUpscaleTargetDimensions();
        dom.upscaleDimensionInfo.innerText =
            `${width} × ${height} → ${target.width} × ${target.height}`;
    }
}

function setUpscaleResizeMode(mode) {
    upscaleState.resizeMode = mode === "dimensions" ? "dimensions" : "scale";
    document.querySelectorAll(".upscale-resize-mode").forEach(button => {
        button.classList.toggle(
            "active",
            button.getAttribute("data-resize-mode") === upscaleState.resizeMode
        );
    });

    if (upscaleState.sourceImage && upscaleState.resizeMode === "scale") {
        upscaleState.targetWidth = upscaleState.sourceImage.naturalWidth * upscaleState.scale;
        upscaleState.targetHeight = upscaleState.sourceImage.naturalHeight * upscaleState.scale;
        dom.upscaleTargetWidth.value = String(upscaleState.targetWidth);
        dom.upscaleTargetHeight.value = String(upscaleState.targetHeight);
    }

    if (upscaleState.mode === "local") {
        dom.upscaleModeLabel.innerText =
            upscaleState.resizeMode === "dimensions" ? "Local Canvas Resize" : "Local Canvas Upscale";
        dom.btnRunUpscale.innerText =
            upscaleState.resizeMode === "dimensions" ? "Resize 실행" : "업스케일 실행";
    }
    updateUpscaleDimensions();
}

function handleUpscaleDimensionInput(changedDimension) {
    if (!upscaleState.sourceImage) return;
    setUpscaleResizeMode("dimensions");

    const sourceRatio =
        upscaleState.sourceImage.naturalWidth / upscaleState.sourceImage.naturalHeight;
    if (dom.upscaleAspectLock.checked) {
        if (changedDimension === "width") {
            const width = Number(dom.upscaleTargetWidth.value);
            if (Number.isFinite(width) && width > 0) {
                dom.upscaleTargetHeight.value = String(Math.max(1, Math.round(width / sourceRatio)));
            }
        } else {
            const height = Number(dom.upscaleTargetHeight.value);
            if (Number.isFinite(height) && height > 0) {
                dom.upscaleTargetWidth.value = String(Math.max(1, Math.round(height * sourceRatio)));
            }
        }
    }

    upscaleState.targetWidth = Math.round(Number(dom.upscaleTargetWidth.value)) || 0;
    upscaleState.targetHeight = Math.round(Number(dom.upscaleTargetHeight.value)) || 0;
    updateUpscaleDimensions();
}

function getUpscaleTargetDimensions() {
    if (!upscaleState.sourceImage) return { width: 0, height: 0 };
    if (upscaleState.resizeMode === "scale") {
        return {
            width: Math.round(upscaleState.sourceImage.naturalWidth * upscaleState.scale),
            height: Math.round(upscaleState.sourceImage.naturalHeight * upscaleState.scale)
        };
    }
    return {
        width: Math.round(Number(dom.upscaleTargetWidth.value)) || 0,
        height: Math.round(Number(dom.upscaleTargetHeight.value)) || 0
    };
}

async function runSelectedUpscale() {
    if (upscaleState.processing) {
        if (upscaleState.abortController) {
            upscaleState.abortController.abort();
            dom.btnRunUpscale.innerText = "정지 처리 중...";
        }
        return;
    }
    if (!upscaleState.sourceImage) return;

    upscaleState.processing = true;
    upscaleState.abortController = upscaleState.mode === "ai" ? new AbortController() : null;
    dom.btnRunUpscale.disabled = upscaleState.mode !== "ai";
    const originalButtonText = dom.btnRunUpscale.innerText;
    dom.btnRunUpscale.innerText = upscaleState.mode === "ai" ? "■ AI 처리 정지" : "처리 중...";

    try {
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (upscaleState.mode === "ai") {
            upscaleState.prompt = dom.aiUpscalePrompt.value.trim() || getAiUpscalePrompt();
            writeUpscaleSetting(AI_UPSCALE_PROMPT_STORAGE, upscaleState.prompt);
            const result = await runAiStudioUpscale(
                images[upscaleState.imageIndex],
                upscaleState.abortController.signal
            );
            upscaleState.resultSrc = result.src;
            upscaleState.resultMimeType = result.mimeType;
        } else {
            upscaleState.prompt = "";
            const target = getUpscaleTargetDimensions();
            const outputWidth = target.width;
            const outputHeight = target.height;
            if (outputWidth < 1 || outputHeight < 1) {
                throw new Error("출력 가로·세로 값을 1px 이상의 숫자로 입력하세요.");
            }
            if (outputWidth > 32768 || outputHeight > 32768) {
                throw new Error("가로와 세로는 각각 32,768px 이하여야 합니다.");
            }
            if (outputWidth * outputHeight > 64000000) {
                throw new Error("출력 이미지가 너무 큽니다. 가로·세로 값을 더 작게 입력하세요.");
            }

            let canvas = resizeImage(upscaleState.sourceImage, outputWidth, outputHeight);
            canvas = applySharpen(canvas, Number(dom.sharpenAmount.value));
            upscaleState.resultSrc = canvas.toDataURL("image/png");
            upscaleState.resultMimeType = "image/png";
        }

        const resultImage = await loadUpscaleImage(upscaleState.resultSrc);
        upscaleState.resultWidth = resultImage.naturalWidth;
        upscaleState.resultHeight = resultImage.naturalHeight;
        dom.upscalePreview.src = upscaleState.resultSrc;
        dom.upscaleDimensionInfo.innerText =
            `${upscaleState.sourceImage.naturalWidth} × ${upscaleState.sourceImage.naturalHeight}` +
            ` → ${upscaleState.resultWidth} × ${upscaleState.resultHeight}`;
        dom.upscaleSaveChoice.style.display = "flex";
        dom.btnUpscaleNew.focus();
    } catch (error) {
        console.error("Upscale error:", error);
        if (error.name === "AbortError") {
            dom.upscaleDimensionInfo.innerText = "AI 업스케일이 사용자 요청으로 정지되었습니다.";
        } else {
            alert("업스케일 중 오류가 발생했습니다: " + error.message);
        }
    } finally {
        upscaleState.processing = false;
        upscaleState.abortController = null;
        dom.btnRunUpscale.disabled = false;
        dom.btnRunUpscale.innerText = originalButtonText;
    }
}

function loadUpscaleImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("업스케일 결과 이미지를 읽을 수 없습니다."));
        image.src = src;
    });
}

async function getAiImagePayload(item) {
    const match = String(item.src || "").match(/^data:([^;,]+);base64,(.+)$/);
    const supportedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (match && supportedTypes.includes(match[1])) {
        return { mimeType: match[1], data: match[2] };
    }

    const image = await loadUpscaleImage(item.src);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    const png = canvas.toDataURL("image/png").split(",");
    return { mimeType: "image/png", data: png[1] };
}

async function runAiStudioUpscale(item, signal) {
    return runAiStudioImageEdit(
        item,
        dom.aiUpscalePrompt?.value.trim() || getAiUpscalePrompt(),
        getAiUpscaleResolution(),
        signal
    );
}

async function runAiStudioImageEdit(item, prompt, imageSize, signal) {
    const apiKey = getUsableAiStudioApiKey();
    if (!apiKey) {
        throw new Error(isAiKeyUsageEnabled()
            ? "AI Studio API 키가 설정되지 않았습니다."
            : "설정에서 AI 키 사용이 중지되어 있습니다.");
    }

    const payload = await getAiImagePayload(item);
    const response = await fetch(AI_UPSCALE_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
        },
        signal,
        body: JSON.stringify({
            model: AI_UPSCALE_MODEL,
            input: [
                {
                    type: "image",
                    mime_type: payload.mimeType,
                    data: payload.data
                },
                {
                    type: "text",
                    text: prompt
                }
            ],
            response_format: {
                type: "image",
                mime_type: "image/jpeg",
                image_size: imageSize || getAiUpscaleResolution()
            }
        })
    });

    const responseData = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = responseData?.error?.message || `Google API 요청 실패 (${response.status})`;
        throw new Error(message);
    }

    const imageBlock = findGeneratedImageBlock(responseData);
    if (!imageBlock) throw new Error("Google API 응답에서 이미지 결과를 찾지 못했습니다.");

    return {
        src: `data:${imageBlock.mimeType || "image/jpeg"};base64,${imageBlock.data}`,
        mimeType: imageBlock.mimeType || "image/jpeg"
    };
}

function findGeneratedImageBlock(value, depth = 0) {
    if (!value || depth > 8) return null;

    if (typeof value === "object" && !Array.isArray(value)) {
        if (value.type === "image" && typeof value.data === "string") {
            return { data: value.data, mimeType: value.mime_type || value.mimeType };
        }
        if (value.inlineData && typeof value.inlineData.data === "string") {
            return {
                data: value.inlineData.data,
                mimeType: value.inlineData.mimeType || value.inlineData.mime_type
            };
        }
    }

    const children = Array.isArray(value) ? value : typeof value === "object" ? Object.values(value) : [];
    for (const child of children) {
        const found = findGeneratedImageBlock(child, depth + 1);
        if (found) return found;
    }
    return null;
}

function closeUpscaleSaveChoice() {
    if (dom.upscaleSaveChoice) dom.upscaleSaveChoice.style.display = "none";
}

function saveUpscaleResult(saveMode) {
    const sourceIndex = upscaleState.imageIndex;
    const sourceItem = images[sourceIndex];
    if (!sourceItem || !upscaleState.resultSrc) return;

    const method = upscaleState.mode === "ai"
        ? "ai"
        : upscaleState.resizeMode === "dimensions" ? "resize" : "canvas";
    let resultIndex = sourceIndex;

    if (saveMode === "replace") {
        const editTime = Date.now();
        sourceItem.createdAt = sourceItem.createdAt || sourceItem.date || editTime;
        sourceItem.src = upscaleState.resultSrc;
        sourceItem.size = estimateDataUrlBytes(upscaleState.resultSrc);
        sourceItem.modifiedAt = editTime;
        sourceItem.mimeType = upscaleState.resultMimeType;
        sourceItem.upscaleInfo = {
            method: method,
            width: upscaleState.resultWidth,
            height: upscaleState.resultHeight,
            prompt: upscaleState.prompt || undefined
        };
        applyDerivedImageMetadata(
            sourceItem,
            sourceItem,
            upscaleState.resultWidth,
            upscaleState.resultHeight,
            method === "ai" ? "AI Upscale" : method === "resize" ? "Resize" : "Upscale"
        );
    } else {
        const sourcePath = sourceItem.path;
        const suffix = method === "ai" ? "ai_upscale" : method === "resize" ? "resize" : "upscale";
        const count = images.filter(item => item.upscaleSourcePath === sourcePath && item.upscaleMethod === method).length + 1;
        images.splice(sourceIndex + 1, 0, {
            src: upscaleState.resultSrc,
            path: `${sourcePath}.${suffix}_${count}`,
            group: method === "ai" ? "ai-upscaled" : method === "resize" ? "resized" : "upscaled",
            date: Date.now(),
            createdAt: Date.now(),
            size: estimateDataUrlBytes(upscaleState.resultSrc),
            mimeType: upscaleState.resultMimeType,
            isFav: false,
            upscaleSourcePath: sourcePath,
            upscaleMethod: method,
            upscaleInfo: {
                method: method,
                width: upscaleState.resultWidth,
                height: upscaleState.resultHeight,
                prompt: upscaleState.prompt || undefined
            }
        });
        applyDerivedImageMetadata(
            images[sourceIndex + 1],
            sourceItem,
            upscaleState.resultWidth,
            upscaleState.resultHeight,
            method === "ai" ? "AI Upscale" : method === "resize" ? "Resize" : "Upscale"
        );
        resultIndex = sourceIndex + 1;
    }

    closeUpscaleEditor();
    renderGallery();
    renderFavorites();
    dom.imageCount.innerText = "Images: " + images.length;
    saveCurrentImagesToDB();
    showImage(resultIndex);
}

document.addEventListener("DOMContentLoaded", initUpscaleFeature);
