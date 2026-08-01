/* =======================================================
   Browser-only & Google AI Studio Background Removal
   ======================================================= */

const REMBG_WEB_MODULE_URL = "https://unpkg.com/@bunnio/rembg-web@1.0.2/dist/index.js";
const REMBG_LOCAL_HUMAN_MODEL_PATHS = [
    "image_model/u2net_human_seg.onnx",
    "Image_model/u2net_human_seg.onnx",
    "models/u2net_human_seg.onnx",
    "u2net_human_seg.onnx"
];
const REMBG_REMOTE_HUMAN_MODEL_URL =
    "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx";
const REMBG_MODEL_DB_NAME = "FMAModelDatabase";
const REMBG_MODEL_STORE_NAME = "models";
const REMBG_MODEL_DB_KEY = "u2net_human_seg.onnx";
const REMBG_MIN_MODEL_BYTES = 100000000;
const BG_REMOVE_ENGINE_STORAGE = "fma_bg_remove_local_engine";
const BG_REMOVE_CUSTOM_BACKGROUND_STORAGE = "fma_bg_remove_custom_background";
const BG_REMOVE_BOUNDARY_STORAGE = "fma_bg_remove_boundary_strength";
const MEDIAPIPE_SELFIE_SEGMENTATION_SCRIPT =
    "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
const MEDIAPIPE_SELFIE_SEGMENTATION_ASSET_ROOT =
    "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/";

var rembgModulePromise = null;
var rembgHumanSessionPromise = null;
var rembgResolvedModelUrl = null;
var rembgResolvedModelSource = "unknown";
var rembgSelectedModelObjectUrl = null;
var rembgSelectedModelSource = null;
var rembgModelDownloadPromise = null;
var mediaPipeScriptPromise = null;
var mediaPipeSessionPromise = null;
var mediaPipePendingResult = null;
var customBackgroundRenderToken = 0;
var bgRemoveState = {
    imageIndex: -1,
    mode: "local",
    resultSrc: null,
    transparentResultSrc: null,
    resultWidth: 0,
    resultHeight: 0,
    processing: false,
    abortController: null,
    prompt: "",
    localEngine: "webgl",
    boundaryStrength: 50,
    customBackgroundEnabled: false,
    customBackgroundColor: "#3197a3",
    externalReturn: null
};

function initBackgroundRemoveFeature() {
    if (!dom.bgRemoveModal) return;

    dom.btnBgRemoveClose.onclick = closeBackgroundRemoveEditor;
    dom.btnBgRemoveCancel.onclick = closeBackgroundRemoveEditor;
    dom.btnBgRemoveAddGallery.onclick = addBackgroundRemoveResultToGallery;
    dom.btnRunBgRemove.onclick = runBackgroundRemoval;
    dom.btnBgEngineWebgl.onclick = () => setBackgroundRemoveLocalEngine("webgl");
    dom.btnBgEngineOnnx.onclick = () => setBackgroundRemoveLocalEngine("onnx");
    dom.bgBoundaryStrength.oninput = handleBackgroundBoundaryChange;
    dom.bgCustomBackgroundEnabled.onchange = handleCustomBackgroundSettingChange;
    dom.bgCustomBackgroundColor.oninput = handleCustomBackgroundSettingChange;
    dom.btnPrepareBgModel.onclick = prepareBackgroundRemoveModel;
    dom.btnSelectBgModel.onclick = () => dom.bgModelFileInput.click();
    dom.bgModelFileInput.onchange = handleBackgroundModelFileSelection;
    dom.btnResetAiBgPrompt.onclick = resetAiBackgroundRemovePrompt;
    dom.aiBgRemovePrompt.onchange = () => {
        writeUpscaleSetting(AI_BG_REMOVE_PROMPT_STORAGE, dom.aiBgRemovePrompt.value.trim());
    };
    dom.btnBgRemoveChoiceCancel.onclick = closeBgRemoveSaveChoice;
    dom.btnBgRemoveReplace.onclick = () => saveBackgroundRemoveResult("replace");
    dom.btnBgRemoveNew.onclick = () => saveBackgroundRemoveResult("new");

    dom.bgRemoveModal.addEventListener("mousedown", event => {
        if (event.target === dom.bgRemoveModal && !bgRemoveState.processing) {
            closeBackgroundRemoveEditor();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        if (dom.bgRemoveSaveChoice.style.display !== "none") {
            closeBgRemoveSaveChoice();
        } else if (dom.bgRemoveModal.style.display !== "none" && !bgRemoveState.processing) {
            closeBackgroundRemoveEditor();
        }
    });
}

function openBackgroundRemoveEditor(index, mode) {
    const item = images[index];
    if (!item) return;

    if (mode === "ai" && !isAiBackgroundRemoveEnabled()) {
        alert("Settings에서 AI Studio 배경 제거 버튼 표시를 먼저 활성화하세요.");
        openUpscaleSettings();
        return;
    }

    if (mode === "ai" && !getUsableAiStudioApiKey()) {
        alert(isAiKeyUsageEnabled()
            ? "AI Studio API 키를 먼저 설정하세요."
            : "설정에서 AI 키 사용을 다시 시작하세요.");
        openUpscaleSettings();
        return;
    }

    bgRemoveState.imageIndex = index;
    bgRemoveState.mode = mode === "ai" ? "ai" : "local";
    bgRemoveState.localEngine = readBackgroundRemoveLocalEngine();
    bgRemoveState.resultSrc = null;
    bgRemoveState.transparentResultSrc = null;
    bgRemoveState.processing = false;
    readBackgroundBoundarySetting();
    readCustomBackgroundSettings();

    const isAI = bgRemoveState.mode === "ai";
    dom.bgRemoveTitle.innerText = isAI ? "AI Studio 배경 제거" : "이미지 배경 제거";
    dom.bgRemoveSubtitle.innerText = isAI
        ? "Google Gemini 이미지 모델로 배경을 투명하게 제거합니다."
        : "브라우저 안에서 사람과 배경을 자동으로 분리합니다.";
    dom.bgRemovePreview.src = item.src;
    dom.bgRemoveModeBadge.innerText = isAI
        ? `Google AI Studio · ${getAiUpscaleResolution()}`
        : bgRemoveState.localEngine === "onnx"
            ? "Local · U²-Net ONNX"
            : "Local · MediaPipe WebGL";
    dom.localBgRemoveInfo.style.display = isAI ? "none" : "block";
    dom.aiBgRemoveInfo.style.display = isAI ? "block" : "none";
    dom.aiBgRemovePrompt.value = getAiBackgroundRemovePrompt();
    dom.bgRemoveFooterText.innerText = isAI
        ? "이미지는 배경 제거 실행 시 Google Gemini API로 전송됩니다."
        : "모든 이미지 처리는 현재 브라우저에서 실행됩니다.";
    dom.btnRunBgRemove.innerText = isAI ? "AI 배경 제거 실행" : "배경 제거 실행";
    dom.btnRunBgRemove.disabled = false;
    setBackgroundRemoveGalleryButtonVisible(false);
    updateBackgroundRemoveEngineUi(false);
    updateBackgroundBoundaryControl();
    updateCustomBackgroundControls();
    closeBgRemoveSaveChoice();
    setBgRemoveProgress(0, "실행 준비");
    dom.bgRemoveModal.style.display = "flex";
    dom.btnRunBgRemove.focus();
}

function openBackgroundRemoveEditorForExternal(src, onApply, options = {}) {
    if (!src || typeof onApply !== "function") return;
    const tempIndex = images.length;
    images.push({
        src,
        path: `$.temporary.story_bg_${Date.now()}`,
        group: "temporary-story-bg",
        date: Date.now(),
        size: estimateDataUrlBytes(src),
        mimeType: "image/png",
        isFav: false
    });
    openBackgroundRemoveEditor(tempIndex, "local");
    bgRemoveState.externalReturn = {
        tempIndex,
        onApply,
        className: String(options.className || "story-external-child")
    };
    dom.bgRemoveModal.classList.add(bgRemoveState.externalReturn.className);
    if (dom.btnBgRemoveAddGallery) {
        dom.btnBgRemoveAddGallery.innerText = options.applyLabel || "Story Image로 보내기";
    }
}

function clearBackgroundRemoveExternalReturn(removeTemporary = true) {
    const external = bgRemoveState.externalReturn;
    bgRemoveState.externalReturn = null;
    dom.bgRemoveModal?.classList.remove("story-external-child");
    dom.bgRemoveModal?.classList.remove("editor-child-workspace");
    if (external?.className) dom.bgRemoveModal?.classList.remove(external.className);
    if (dom.btnBgRemoveAddGallery) {
        dom.btnBgRemoveAddGallery.innerText = "갤러리에 추가";
    }
    if (!external || !removeTemporary) return;
    if (images[external.tempIndex]?.group === "temporary-story-bg") {
        images.splice(external.tempIndex, 1);
    }
}

function readBackgroundBoundarySetting() {
    try {
        const saved = Number(localStorage.getItem(BG_REMOVE_BOUNDARY_STORAGE));
        bgRemoveState.boundaryStrength = Number.isFinite(saved)
            ? Math.max(0, Math.min(100, saved))
            : 50;
    } catch (error) {
        bgRemoveState.boundaryStrength = 50;
    }
}

function updateBackgroundBoundaryControl() {
    dom.bgBoundaryStrength.value = String(bgRemoveState.boundaryStrength);
    dom.bgBoundaryStrengthValue.innerText = `${Math.round(bgRemoveState.boundaryStrength)}%`;
}

function handleBackgroundBoundaryChange() {
    bgRemoveState.boundaryStrength = Math.max(0, Math.min(100,
        Number(dom.bgBoundaryStrength.value) || 0
    ));
    dom.bgBoundaryStrengthValue.innerText = `${Math.round(bgRemoveState.boundaryStrength)}%`;
    try {
        localStorage.setItem(BG_REMOVE_BOUNDARY_STORAGE, String(bgRemoveState.boundaryStrength));
    } catch (error) {
        console.warn("Background boundary setting could not be saved:", error);
    }
}

async function applyBackgroundBoundaryStrength(src, strength = bgRemoveState.boundaryStrength) {
    const amount = Math.max(0, Math.min(100, Number(strength) || 0));
    if (Math.abs(amount - 50) < .5) return src;
    const image = await loadUpscaleImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const bias = (amount - 50) / 50;
    for (let index = 0; index < pixels.length; index += 4) {
        const normalized = pixels[index + 3] / 255;
        let adjusted;
        if (bias >= 0) {
            const cutoff = bias * .48;
            adjusted = normalized <= cutoff ? 0 : (normalized - cutoff) / (1 - cutoff);
            adjusted = Math.pow(Math.max(0, Math.min(1, adjusted)), 1 + bias * .65);
        } else if (normalized > 0) {
            const expansion = -bias * .48;
            adjusted = normalized + (1 - normalized) * expansion;
            adjusted = Math.pow(Math.max(0, Math.min(1, adjusted)), 1 + bias * .35);
        } else {
            adjusted = 0;
        }
        pixels[index + 3] = Math.round(Math.max(0, Math.min(1, adjusted)) * 255);
    }
    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
}

function resetAiBackgroundRemovePrompt() {
    dom.aiBgRemovePrompt.value = DEFAULT_AI_BG_REMOVE_PROMPT;
    writeUpscaleSetting(AI_BG_REMOVE_PROMPT_STORAGE, DEFAULT_AI_BG_REMOVE_PROMPT);
}

function closeBackgroundRemoveEditor() {
    if (bgRemoveState.processing) return;
    clearBackgroundRemoveExternalReturn(true);
    dom.bgRemoveModal.style.display = "none";
    dom.bgRemoveModal.classList.remove("ai-jena-child-workspace");
    closeBgRemoveSaveChoice();
    setBackgroundRemoveGalleryButtonVisible(false);
    bgRemoveState.imageIndex = -1;
    bgRemoveState.resultSrc = null;
    bgRemoveState.transparentResultSrc = null;
}

function readBackgroundRemoveLocalEngine() {
    try {
        return localStorage.getItem(BG_REMOVE_ENGINE_STORAGE) === "onnx"
            ? "onnx"
            : "webgl";
    } catch (error) {
        return "webgl";
    }
}

function setBackgroundRemoveLocalEngine(engine) {
    if (bgRemoveState.processing) return;
    bgRemoveState.localEngine = engine === "onnx" ? "onnx" : "webgl";
    try {
        localStorage.setItem(BG_REMOVE_ENGINE_STORAGE, bgRemoveState.localEngine);
    } catch (error) {
        console.warn("Background removal engine preference could not be saved:", error);
    }
    updateBackgroundRemoveEngineUi(true);
}

function updateBackgroundRemoveEngineUi(checkOnnxModel) {
    const useOnnx = bgRemoveState.localEngine === "onnx";

    dom.btnBgEngineWebgl?.classList.toggle("active", !useOnnx);
    dom.btnBgEngineWebgl?.setAttribute("aria-checked", String(!useOnnx));
    dom.btnBgEngineOnnx?.classList.toggle("active", useOnnx);
    dom.btnBgEngineOnnx?.setAttribute("aria-checked", String(useOnnx));
    if (dom.webglBgRemoveInfo) {
        dom.webglBgRemoveInfo.style.display = useOnnx ? "none" : "block";
    }
    if (dom.onnxBgRemoveSettings) {
        dom.onnxBgRemoveSettings.style.display = useOnnx ? "block" : "none";
    }

    if (bgRemoveState.mode === "local" && dom.bgRemoveModeBadge) {
        dom.bgRemoveModeBadge.innerText = useOnnx
            ? "Local · U²-Net ONNX"
            : "Local · MediaPipe WebGL";
    }
    if (useOnnx && checkOnnxModel) {
        updateBackgroundModelLocation().catch(error => {
            console.warn("ONNX model location check failed:", error);
        });
    }
}

function readCustomBackgroundSettings() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(BG_REMOVE_CUSTOM_BACKGROUND_STORAGE) || "null"
        );
        bgRemoveState.customBackgroundEnabled = saved?.enabled === true;
        bgRemoveState.customBackgroundColor = /^#[0-9a-f]{6}$/i.test(saved?.color || "")
            ? saved.color.toLowerCase()
            : "#3197a3";
    } catch (error) {
        bgRemoveState.customBackgroundEnabled = false;
        bgRemoveState.customBackgroundColor = "#3197a3";
    }
}

function updateCustomBackgroundControls() {
    if (!dom.bgCustomBackgroundEnabled) return;
    dom.bgCustomBackgroundEnabled.checked = bgRemoveState.customBackgroundEnabled;
    dom.bgCustomBackgroundColor.value = bgRemoveState.customBackgroundColor;
    dom.bgCustomBackgroundColor.disabled = !bgRemoveState.customBackgroundEnabled;
    dom.bgCustomBackgroundColorValue.value =
        bgRemoveState.customBackgroundColor.toUpperCase();
    dom.bgCustomBackgroundColorValue.innerText =
        bgRemoveState.customBackgroundColor.toUpperCase();
}

function handleCustomBackgroundSettingChange() {
    bgRemoveState.customBackgroundEnabled = dom.bgCustomBackgroundEnabled.checked;
    bgRemoveState.customBackgroundColor = /^#[0-9a-f]{6}$/i.test(
        dom.bgCustomBackgroundColor.value
    ) ? dom.bgCustomBackgroundColor.value.toLowerCase() : "#3197a3";
    updateCustomBackgroundControls();
    try {
        localStorage.setItem(
            BG_REMOVE_CUSTOM_BACKGROUND_STORAGE,
            JSON.stringify({
                enabled: bgRemoveState.customBackgroundEnabled,
                color: bgRemoveState.customBackgroundColor
            })
        );
    } catch (error) {
        console.warn("Custom background setting could not be saved:", error);
    }
    if (bgRemoveState.transparentResultSrc && !bgRemoveState.processing) {
        refreshCustomBackgroundPreview();
    }
}

async function refreshCustomBackgroundPreview() {
    const transparentSrc = bgRemoveState.transparentResultSrc;
    if (!transparentSrc) return;
    const token = ++customBackgroundRenderToken;
    try {
        const resultSrc = await applyCustomBackgroundToResult(transparentSrc);
        if (token !== customBackgroundRenderToken) return;
        bgRemoveState.resultSrc = resultSrc;
        dom.bgRemovePreview.src = resultSrc;
        setBgRemoveProgress(
            100,
            bgRemoveState.customBackgroundEnabled
                ? `커스텀 배경 ${bgRemoveState.customBackgroundColor.toUpperCase()} 적용 완료`
                : "투명 배경 결과"
        );
    } catch (error) {
        console.warn("Custom background preview failed:", error);
    }
}

async function applyCustomBackgroundToResult(transparentSrc) {
    if (!bgRemoveState.customBackgroundEnabled) return transparentSrc;
    const image = await loadUpscaleImage(transparentSrc);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("커스텀 배경을 합성할 Canvas를 만들 수 없습니다.");
    context.fillStyle = bgRemoveState.customBackgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
}

function loadMediaPipeSelfieSegmentationScript() {
    if (window.SelfieSegmentation) {
        return Promise.resolve(window.SelfieSegmentation);
    }
    if (!mediaPipeScriptPromise) {
        mediaPipeScriptPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector(
                `script[src="${MEDIAPIPE_SELFIE_SEGMENTATION_SCRIPT}"]`
            );
            const script = existing || document.createElement("script");
            const handleLoad = () => {
                if (window.SelfieSegmentation) {
                    resolve(window.SelfieSegmentation);
                } else {
                    reject(new Error("MediaPipe Selfie Segmentation을 초기화할 수 없습니다."));
                }
            };
            const handleError = () => reject(
                new Error("MediaPipe WebGL 엔진 파일을 불러오지 못했습니다.")
            );

            script.addEventListener("load", handleLoad, { once: true });
            script.addEventListener("error", handleError, { once: true });
            if (!existing) {
                script.src = MEDIAPIPE_SELFIE_SEGMENTATION_SCRIPT;
                script.crossOrigin = "anonymous";
                document.head.appendChild(script);
            }
        }).catch(error => {
            mediaPipeScriptPromise = null;
            throw error;
        });
    }
    return mediaPipeScriptPromise;
}

async function getMediaPipeSegmentationSession() {
    if (!mediaPipeSessionPromise) {
        mediaPipeSessionPromise = loadMediaPipeSelfieSegmentationScript()
            .then(SelfieSegmentation => {
                const session = new SelfieSegmentation({
                    locateFile: file => MEDIAPIPE_SELFIE_SEGMENTATION_ASSET_ROOT + file
                });
                session.setOptions({ modelSelection: 1 });
                session.onResults(results => {
                    const pending = mediaPipePendingResult;
                    if (!pending || pending.session !== session) return;
                    mediaPipePendingResult = null;
                    pending.resolve(results);
                });
                return session;
            })
            .catch(error => {
                mediaPipeSessionPromise = null;
                throw error;
            });
    }
    return mediaPipeSessionPromise;
}

function requestMediaPipeSegmentation(session, image, signal) {
    if (mediaPipePendingResult) {
        return Promise.reject(new Error("이미 다른 WebGL 배경 제거 작업이 진행 중입니다."));
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = callback => value => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            signal?.removeEventListener("abort", handleAbort);
            if (mediaPipePendingResult?.resolve === resolveResult) {
                mediaPipePendingResult = null;
            }
            callback(value);
        };
        const resolveResult = finish(resolve);
        const rejectResult = finish(reject);
        const handleAbort = () => rejectResult(
            new DOMException("사용자가 처리를 정지했습니다.", "AbortError")
        );
        const timeoutId = setTimeout(() => {
            rejectResult(new Error("MediaPipe WebGL 분석 시간이 초과되었습니다."));
        }, 60000);

        mediaPipePendingResult = {
            session: session,
            resolve: resolveResult,
            reject: rejectResult
        };
        signal?.addEventListener("abort", handleAbort, { once: true });
        if (signal?.aborted) {
            handleAbort();
            return;
        }

        try {
            Promise.resolve(session.send({ image })).catch(rejectResult);
        } catch (error) {
            rejectResult(error);
        }
    });
}

async function runWebGlBackgroundRemoval(src, signal, startPercent, endPercent) {
    const start = Number.isFinite(startPercent) ? startPercent : 4;
    const end = Number.isFinite(endPercent) ? endPercent : 94;
    const image = await loadUpscaleImage(src);
    if (signal?.aborted) {
        throw new DOMException("사용자가 처리를 정지했습니다.", "AbortError");
    }

    setBgRemoveProgress(start, "MediaPipe WebGL 엔진 불러오는 중");
    const session = await getMediaPipeSegmentationSession();
    setBgRemoveProgress(start + (end - start) * .3, "WebGL로 전경과 배경 분석 중");
    const results = await requestMediaPipeSegmentation(session, image, signal);
    if (!results?.segmentationMask) {
        throw new Error("MediaPipe WebGL 엔진이 분리 마스크를 반환하지 않았습니다.");
    }

    setBgRemoveProgress(start + (end - start) * .82, "투명 PNG 합성 중");
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const rawMaskCanvas = document.createElement("canvas");
    rawMaskCanvas.width = width;
    rawMaskCanvas.height = height;
    const rawMaskContext = rawMaskCanvas.getContext("2d", { willReadFrequently: true });
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
    if (!rawMaskContext || !maskContext || !outputContext) {
        throw new Error("WebGL 배경 제거 결과를 합성할 Canvas를 만들 수 없습니다.");
    }

    // BG Remover 앱과 같은 기본 매팅 보정값(Threshold 30, Blur 2px)을 적용한다.
    rawMaskContext.drawImage(results.segmentationMask, 0, 0, width, height);
    const rawMask = rawMaskContext.getImageData(0, 0, width, height);
    const threshold = 30;
    for (let index = 0; index < rawMask.data.length; index += 4) {
        const alpha = rawMask.data[index + 3];
        const value = alpha < threshold
            ? 0
            : ((alpha - threshold) / (255 - threshold)) * 255;
        rawMask.data[index] = value;
        rawMask.data[index + 1] = value;
        rawMask.data[index + 2] = value;
        rawMask.data[index + 3] = 255;
    }
    rawMaskContext.putImageData(rawMask, 0, 0);
    maskContext.fillStyle = "#000";
    maskContext.fillRect(0, 0, width, height);
    maskContext.filter = "blur(2px)";
    maskContext.drawImage(rawMaskCanvas, 0, 0);
    maskContext.filter = "none";

    outputContext.drawImage(image, 0, 0, width, height);
    const outputPixels = outputContext.getImageData(0, 0, width, height);
    const maskPixels = maskContext.getImageData(0, 0, width, height).data;
    for (let index = 0; index < outputPixels.data.length; index += 4) {
        outputPixels.data[index + 3] = maskPixels[index];
    }
    outputContext.putImageData(outputPixels, 0, 0);
    setBgRemoveProgress(end, "WebGL 배경 제거 결과 확인");
    return outputCanvas.toDataURL("image/png");
}

async function loadRembgModule() {
    if (!rembgModulePromise) {
        rembgModulePromise = import(REMBG_WEB_MODULE_URL).then(async module => {
            rembgResolvedModelUrl = await resolveBackgroundModelUrl();
            module.rembgConfig.setCustomModelPath("u2net_human_seg", rembgResolvedModelUrl);
            return module;
        }).catch(error => {
            rembgModulePromise = null;
            throw error;
        });
    }
    return rembgModulePromise;
}

async function resolveBackgroundModelUrl() {
    if (rembgSelectedModelObjectUrl) {
        rembgResolvedModelSource = rembgSelectedModelSource || "selected";
        return rembgSelectedModelObjectUrl;
    }

    for (const relativePath of REMBG_LOCAL_HUMAN_MODEL_PATHS) {
        const candidateUrl = new URL(relativePath, document.baseURI).href;
        if (await isUsableBackgroundModelUrl(candidateUrl)) {
            rembgResolvedModelSource = "local";
            return candidateUrl;
        }
    }

    const savedModel = await loadSavedBackgroundModel();
    if (savedModel) {
        setSelectedBackgroundModelBlob(savedModel, "saved");
        rembgResolvedModelSource = "saved";
        return rembgSelectedModelObjectUrl;
    }

    rembgResolvedModelSource = "remote";
    return REMBG_REMOTE_HUMAN_MODEL_URL;
}

async function isUsableBackgroundModelUrl(url) {
    try {
        const response = await fetch(url, {
            method: "HEAD",
            cache: "no-store"
        });
        if (!response.ok) return false;
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        const contentLength = Number(response.headers.get("content-length")) || 0;
        if (/text\/html|application\/json/.test(contentType)) return false;
        return contentLength === 0 || contentLength >= REMBG_MIN_MODEL_BYTES;
    } catch (error) {
        console.warn("Background model URL check failed:", url, error);
        return false;
    }
}

async function updateBackgroundModelLocation() {
    if (!dom.bgModelLocation) return;
    dom.bgModelLocation.classList.remove("available", "remote");
    dom.bgModelLocation.innerHTML =
        '모델 경로와 브라우저 저장소를 확인하는 중...';

    const modelUrl = await resolveBackgroundModelUrl();
    const sourceMessages = {
        local: `✓ 앱 폴더 모델 발견: <code>${getRelativeBackgroundModelPath(modelUrl)}</code>`,
        selected: "✓ 직접 선택한 ONNX 모델을 사용합니다.",
        saved: "✓ 브라우저 저장소에 보관된 ONNX 모델을 사용합니다.",
        downloaded: "✓ 다운로드한 ONNX 모델이 자동 연결되었습니다.",
        remote: "저장된 모델 없음 · 자동 다운로드 후 연결할 수 있습니다."
    };
    const localReady = rembgResolvedModelSource !== "remote";
    dom.bgModelLocation.classList.add(localReady ? "available" : "remote");
    dom.bgModelLocation.innerHTML =
        sourceMessages[rembgResolvedModelSource] || sourceMessages.remote;
}

async function getHumanSegmentationSession(module) {
    if (!rembgHumanSessionPromise) {
        rembgHumanSessionPromise = (async () => {
            const session = await Promise.resolve(module.newSession(
                "u2net_human_seg",
                undefined,
                {
                    bypassSessionCache: true,
                    bypassModelCache: true,
                    onProgress: updateBgRemoveProgress
                }
            ));

            // newSession()은 모델 파일을 지연 로드할 수 있으므로, 준비 단계에서
            // 실제 ONNX 세션까지 열어 성공 여부를 확정한다.
            if (typeof session?.initialize === "function") {
                await session.initialize();
            }
            return session;
        })().catch(error => {
            rembgHumanSessionPromise = null;
            throw error;
        });
    }
    return rembgHumanSessionPromise;
}

async function getHumanSegmentationSessionWithRecovery(module) {
    try {
        return await getHumanSegmentationSession(module);
    } catch (firstError) {
        console.warn("Model session initialization failed; clearing rembg cache and retrying.", firstError);
        await clearBackgroundModelRuntimeCache(module);
        module.rembgConfig.setCustomModelPath("u2net_human_seg", rembgResolvedModelUrl);
        return getHumanSegmentationSession(module);
    }
}

async function handleBackgroundModelFileSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".onnx")) {
        alert("ONNX 모델 파일(.onnx)을 선택하세요.");
        return;
    }
    if (file.size < REMBG_MIN_MODEL_BYTES) {
        alert(
            "선택한 모델 파일이 너무 작습니다. u2net_human_seg.onnx 원본 파일은 약 176MB입니다."
        );
        return;
    }

    dom.btnSelectBgModel.disabled = true;
    dom.btnPrepareBgModel.disabled = true;
    setBgRemoveProgress(2, "선택한 모델을 브라우저 저장소에 보관 중");

    try {
        const currentModule = await rembgModulePromise?.catch(() => null);
        if (currentModule) await clearBackgroundModelRuntimeCache(currentModule);
        setSelectedBackgroundModelBlob(file, "selected");
        rembgResolvedModelSource = "selected";
        rembgResolvedModelUrl = rembgSelectedModelObjectUrl;
        rembgModulePromise = null;
        rembgHumanSessionPromise = null;

        try {
            await saveBackgroundModel(file);
            dom.bgModelLocation.classList.remove("remote");
            dom.bgModelLocation.classList.add("available");
            dom.bgModelLocation.innerHTML =
                `✓ 선택한 모델 저장 완료: <code>${escapeBackgroundModelText(file.name)}</code> ` +
                `(${formatBackgroundModelBytes(file.size)})`;
        } catch (storageError) {
            console.warn("Model persistence failed; using for current session only.", storageError);
            dom.bgModelLocation.classList.remove("remote");
            dom.bgModelLocation.classList.add("available");
            dom.bgModelLocation.innerHTML =
                "✓ 선택한 모델을 현재 실행에서 사용합니다. 브라우저 저장 공간이 부족해 영구 보관은 실패했습니다.";
        }

        await prepareBackgroundRemoveModel();
    } catch (error) {
        console.error("Selected model setup failed:", error);
        setBgRemoveProgress(0, "선택한 모델 준비 실패");
        alert("선택한 모델을 준비하지 못했습니다: " + getBackgroundRemoveErrorMessage(error));
    } finally {
        dom.btnSelectBgModel.disabled = false;
        if (!rembgHumanSessionPromise) dom.btnPrepareBgModel.disabled = false;
    }
}

async function ensureBackgroundModelConnected() {
    const modelUrl = await resolveBackgroundModelUrl();
    if (rembgResolvedModelSource !== "remote") return modelUrl;
    return downloadAndConnectBackgroundModel();
}

async function downloadAndConnectBackgroundModel() {
    if (rembgModelDownloadPromise) return rembgModelDownloadPromise;

    rembgModelDownloadPromise = (async () => {
        setBgRemoveProgress(2, "원본 모델 다운로드 연결 중");
        const response = await fetch(REMBG_REMOTE_HUMAN_MODEL_URL, {
            cache: "no-store"
        });
        if (!response.ok) {
            throw new Error(`모델 다운로드 HTTP ${response.status}`);
        }

        const totalBytes = Number(response.headers.get("content-length")) || 0;
        let modelBlob;
        if (response.body?.getReader) {
            const reader = response.body.getReader();
            const chunks = [];
            let receivedBytes = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                receivedBytes += value.byteLength;
                const downloadProgress = totalBytes
                    ? Math.min(74, 4 + (receivedBytes / totalBytes) * 70)
                    : Math.min(74, 4 + receivedBytes / 2500000);
                setBgRemoveProgress(
                    downloadProgress,
                    `모델 다운로드 중 · ${formatBackgroundModelBytes(receivedBytes)}` +
                    (totalBytes ? ` / ${formatBackgroundModelBytes(totalBytes)}` : "")
                );
            }
            modelBlob = new Blob(chunks, { type: "application/octet-stream" });
        } else {
            modelBlob = await response.blob();
        }

        if (modelBlob.size < REMBG_MIN_MODEL_BYTES) {
            throw new Error(
                `다운로드된 모델 크기가 올바르지 않습니다 (${formatBackgroundModelBytes(modelBlob.size)}).`
            );
        }

        setBgRemoveProgress(76, "다운로드한 모델 자동 연결 중");
        setSelectedBackgroundModelBlob(modelBlob, "downloaded");
        rembgResolvedModelSource = "downloaded";
        rembgResolvedModelUrl = rembgSelectedModelObjectUrl;
        rembgModulePromise = null;
        rembgHumanSessionPromise = null;

        try {
            await saveBackgroundModel(modelBlob);
            rembgResolvedModelSource = "saved";
            rembgSelectedModelSource = "saved";
        } catch (storageError) {
            console.warn("Downloaded model persistence failed; using current session.", storageError);
        }

        if (dom.bgModelLocation) {
            dom.bgModelLocation.classList.remove("remote");
            dom.bgModelLocation.classList.add("available");
            dom.bgModelLocation.innerHTML =
                "✓ 모델 다운로드 및 자동 연결 완료" +
                (rembgResolvedModelSource === "saved"
                    ? " · 다음 실행에도 자동으로 사용합니다."
                    : " · 현재 실행에서 사용합니다.");
        }
        return rembgResolvedModelUrl;
    })().finally(() => {
        rembgModelDownloadPromise = null;
    });

    return rembgModelDownloadPromise;
}

function setSelectedBackgroundModelBlob(blob, source) {
    if (rembgSelectedModelObjectUrl) URL.revokeObjectURL(rembgSelectedModelObjectUrl);
    rembgSelectedModelObjectUrl = URL.createObjectURL(blob);
    rembgSelectedModelSource = source || "selected";
}

function openBackgroundModelDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(REMBG_MODEL_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(REMBG_MODEL_STORE_NAME)) {
                database.createObjectStore(REMBG_MODEL_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("모델 저장소를 열 수 없습니다."));
    });
}

async function saveBackgroundModel(blob) {
    const database = await openBackgroundModelDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(REMBG_MODEL_STORE_NAME, "readwrite");
        transaction.objectStore(REMBG_MODEL_STORE_NAME).put(blob, REMBG_MODEL_DB_KEY);
        const fail = () => {
            database.close();
            reject(transaction.error || new Error("모델 파일 저장에 실패했습니다."));
        };
        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = fail;
        transaction.onabort = fail;
    });
}

async function loadSavedBackgroundModel() {
    try {
        const database = await openBackgroundModelDatabase();
        return await new Promise((resolve, reject) => {
            const transaction = database.transaction(REMBG_MODEL_STORE_NAME, "readonly");
            const request = transaction.objectStore(REMBG_MODEL_STORE_NAME).get(REMBG_MODEL_DB_KEY);
            request.onsuccess = () => {
                database.close();
                const blob = request.result;
                resolve(blob instanceof Blob && blob.size >= REMBG_MIN_MODEL_BYTES ? blob : null);
            };
            request.onerror = () => {
                database.close();
                reject(request.error);
            };
        });
    } catch (error) {
        console.warn("Saved background model unavailable:", error);
        return null;
    }
}

async function clearBackgroundModelRuntimeCache(module) {
    rembgHumanSessionPromise = null;
    try {
        if (typeof module.disposeAllSessions === "function") {
            await module.disposeAllSessions();
        } else if (typeof module.clearSessionCache === "function") {
            module.clearSessionCache();
        }
    } catch (error) {
        console.warn("Session cache clear failed:", error);
    }
    try {
        if (typeof module.clearModelCacheForModel === "function") {
            await module.clearModelCacheForModel("u2net_human_seg");
        }
    } catch (error) {
        console.warn("Model cache clear failed:", error);
    }
}

function getRelativeBackgroundModelPath(url) {
    try {
        const absolute = new URL(url);
        const base = new URL(document.baseURI);
        if (absolute.origin === base.origin) {
            return decodeURIComponent(absolute.pathname.split("/").slice(-2).join("/"));
        }
    } catch (error) {
        // Keep the generic local label below.
    }
    return "image_model/u2net_human_seg.onnx";
}

function formatBackgroundModelBytes(bytes) {
    return (Number(bytes) / 1048576).toFixed(1) + "MB";
}

function escapeBackgroundModelText(value) {
    const element = document.createElement("span");
    element.innerText = value;
    return element.innerHTML;
}

async function prepareBackgroundRemoveModel() {
    if (bgRemoveState.processing) return;

    bgRemoveState.processing = true;
    dom.btnPrepareBgModel.disabled = true;
    dom.btnRunBgRemove.disabled = true;
    dom.btnPrepareBgModel.innerText = "모델 준비 중...";

    try {
        setBgRemoveProgress(1, "자동 모델 탐색 중");
        await ensureBackgroundModelConnected();
        setBgRemoveProgress(78, "배경 제거 라이브러리 불러오는 중");
        const module = await loadRembgModule();
        const sourceStatus = {
            local: "앱 폴더의 ONNX 모델 불러오는 중",
            selected: "직접 선택한 ONNX 모델 불러오는 중",
            saved: "브라우저 저장소의 ONNX 모델 불러오는 중",
            downloaded: "다운로드한 ONNX 모델 불러오는 중",
            remote: "원본 서버에서 약 176MB 모델 다운로드 및 초기화"
        };
        setBgRemoveProgress(82, sourceStatus[rembgResolvedModelSource] || sourceStatus.remote);
        await getHumanSegmentationSessionWithRecovery(module);
        setBgRemoveProgress(100, "모델 실제 로드 및 자동 연결 완료");
        dom.btnPrepareBgModel.innerText = "✓ 모델 준비 완료";
        await updateBackgroundModelLocation();
    } catch (error) {
        console.error("Background model preparation error:", error);
        rembgHumanSessionPromise = null;
        setBgRemoveProgress(0, "자동 연결 실패 · ONNX 파일을 수동 선택하세요");
        dom.btnPrepareBgModel.innerText = "↻ 자동 연결 다시 시도";
        dom.btnPrepareBgModel.disabled = false;
        alert(
            "모델 자동 연결에 실패했습니다. 오른쪽의 'ONNX 수동 선택'으로 " +
            "u2net_human_seg.onnx 파일을 지정하세요.\n\n원인: " +
            getBackgroundRemoveErrorMessage(error)
        );
    } finally {
        bgRemoveState.processing = false;
        dom.btnRunBgRemove.disabled = false;
    }
}

async function runBackgroundRemoval() {
    const item = images[bgRemoveState.imageIndex];
    if (bgRemoveState.processing) {
        bgRemoveState.abortController?.abort();
        dom.btnRunBgRemove.innerText = "정지 처리 중...";
        setBgRemoveProgress(0, "정지 요청됨");
        return;
    }
    if (!item) return;

    bgRemoveState.resultSrc = null;
    bgRemoveState.transparentResultSrc = null;
    setBackgroundRemoveGalleryButtonVisible(false);
    bgRemoveState.processing = true;
    bgRemoveState.abortController = new AbortController();
    dom.btnRunBgRemove.disabled = false;
    const originalButtonText = dom.btnRunBgRemove.innerText;
    dom.btnRunBgRemove.innerText = bgRemoveState.mode === "ai"
        ? "■ AI 처리 정지"
        : bgRemoveState.localEngine === "onnx"
            ? "■ ONNX 처리 정지"
            : "■ WebGL 처리 정지";

    try {
        const throwIfStopped = () => {
            if (bgRemoveState.abortController?.signal.aborted) {
                throw new DOMException("사용자가 처리를 정지했습니다.", "AbortError");
            }
        };
        if (bgRemoveState.mode === "ai") {
            setBgRemoveProgress(8, "Google AI Studio 요청 준비");
            bgRemoveState.prompt =
                dom.aiBgRemovePrompt.value.trim() || getAiBackgroundRemovePrompt();
            writeUpscaleSetting(AI_BG_REMOVE_PROMPT_STORAGE, bgRemoveState.prompt);
            const result = await runAiStudioImageEdit(
                item,
                bgRemoveState.prompt,
                getAiUpscaleResolution(),
                bgRemoveState.abortController.signal
            );
            throwIfStopped();
            setBgRemoveProgress(48, "AI JPEG 결과에 투명 배경 생성 중");
            if (bgRemoveState.localEngine === "onnx") {
                await ensureBackgroundModelConnected();
                const module = await loadRembgModule();
                const session = await getHumanSegmentationSessionWithRecovery(module);
                throwIfStopped();
                const aiResultBlob = await dataUrlToBlob(result.src);
                const transparentBlob = await module.remove(aiResultBlob, {
                    session: session,
                    postProcessMask: true,
                    onProgress: info => {
                        const progress = Number(info?.progress);
                        setBgRemoveProgress(
                            Number.isFinite(progress) ? 48 + progress * .44 : 55,
                            "AI 결과의 배경을 투명하게 변환 중"
                        );
                    }
                });
                throwIfStopped();
                bgRemoveState.resultSrc = await blobToDataUrl(transparentBlob);
            } else {
                bgRemoveState.resultSrc = await runWebGlBackgroundRemoval(
                    result.src,
                    bgRemoveState.abortController.signal,
                    48,
                    94
                );
            }
            setBgRemoveProgress(94, "투명 PNG 결과 확인");
        } else {
            bgRemoveState.prompt = "";
            if (bgRemoveState.localEngine === "onnx") {
                setBgRemoveProgress(2, "자동 연결된 ONNX 모델 확인");
                await ensureBackgroundModelConnected();
                setBgRemoveProgress(78, "ONNX 배경 제거 라이브러리 로드");
                const module = await loadRembgModule();
                setBgRemoveProgress(82, "사람 분리 모델 실제 로드 및 초기화");
                const session = await getHumanSegmentationSessionWithRecovery(module);
                throwIfStopped();
                dom.btnPrepareBgModel.innerText = "✓ 모델 준비 완료";
                dom.btnPrepareBgModel.disabled = true;
                const inputBlob = await dataUrlToBlob(item.src);
                const resultBlob = await module.remove(inputBlob, {
                    session: session,
                    postProcessMask: true,
                    onProgress: updateBgRemoveProgress
                });
                throwIfStopped();
                bgRemoveState.resultSrc = await blobToDataUrl(resultBlob);
            } else {
                bgRemoveState.resultSrc = await runWebGlBackgroundRemoval(
                    item.src,
                    bgRemoveState.abortController.signal,
                    4,
                    94
                );
            }
        }

        setBgRemoveProgress(96, `경계 밀착도 ${Math.round(bgRemoveState.boundaryStrength)}% 적용 중`);
        bgRemoveState.resultSrc = await applyBackgroundBoundaryStrength(
            bgRemoveState.resultSrc,
            bgRemoveState.boundaryStrength
        );
        const resultImage = await loadUpscaleImage(bgRemoveState.resultSrc);
        bgRemoveState.resultWidth = resultImage.naturalWidth;
        bgRemoveState.resultHeight = resultImage.naturalHeight;
        dom.bgRemovePreview.src = bgRemoveState.resultSrc;
        setBgRemoveProgress(100, "배경 제거 완료");
        const automaticResult = bgRemoveState.resultSrc;
        await openBackgroundMaskEditor({
            originalSrc: item.src,
            resultSrc: automaticResult,
            onApply: resultSrc => acceptBackgroundMaskResult(resultSrc),
            onCancel: () => acceptBackgroundMaskResult(automaticResult)
        });
    } catch (error) {
        console.error("Background removal error:", error);
        if (error.name === "AbortError") {
            setBgRemoveProgress(0, "사용자 요청으로 정지됨");
        } else {
            setBgRemoveProgress(0, "처리 실패");
            alert("배경 제거 중 오류가 발생했습니다: " + getBackgroundRemoveErrorMessage(error));
        }
    } finally {
        bgRemoveState.processing = false;
        bgRemoveState.abortController = null;
        dom.btnRunBgRemove.disabled = false;
        dom.btnRunBgRemove.innerText = originalButtonText;
    }
}

async function acceptBackgroundMaskResult(resultSrc) {
    bgRemoveState.transparentResultSrc = resultSrc;
    bgRemoveState.resultSrc = await applyCustomBackgroundToResult(resultSrc);
    dom.bgRemovePreview.src = bgRemoveState.resultSrc;
    setBgRemoveProgress(
        100,
        bgRemoveState.customBackgroundEnabled
            ? `배경 제거 및 ${bgRemoveState.customBackgroundColor.toUpperCase()} 배경 합성 완료`
            : "배경 제거 완료"
    );
    try {
        const resultImage = await loadUpscaleImage(bgRemoveState.resultSrc);
        bgRemoveState.resultWidth = resultImage.naturalWidth;
        bgRemoveState.resultHeight = resultImage.naturalHeight;
    } catch (error) {
        console.warn("Edited background result dimensions unavailable:", error);
    }
    setBackgroundRemoveGalleryButtonVisible(true);
    dom.bgRemoveSaveChoice.style.display = "flex";
    dom.btnBgRemoveNew.focus();
}

function setBackgroundRemoveGalleryButtonVisible(visible) {
    if (!dom.btnBgRemoveAddGallery) return;
    dom.btnBgRemoveAddGallery.disabled = !visible;
}

function addBackgroundRemoveResultToGallery() {
    if (!bgRemoveState.resultSrc || bgRemoveState.processing) return;
    saveBackgroundRemoveResult("new");
    if (typeof updateImportStatus === "function") {
        updateImportStatus("배경 제거 결과를 갤러리에 새 이미지로 추가했습니다.");
    }
}

function getBackgroundRemoveErrorMessage(error) {
    const message = error?.message || String(error);
    if (/mediapipe|selfie segmentation|webgl/i.test(message)) {
        return "MediaPipe WebGL 엔진을 실행하지 못했습니다. 인터넷 연결과 브라우저의 WebGL 사용 설정을 " +
            "확인하거나, 'ONNX 모델 적용'을 선택해 다시 시도하세요. 원인: " + message;
    }
    if (/resolve module specifier|onnxruntime-web/i.test(message)) {
        return "ONNX Runtime 모듈을 불러오지 못했습니다. 앱을 새로고침한 뒤 다시 시도하세요.";
    }
    if (/fetch|cors|network/i.test(message)) {
        return "모델 자동 다운로드 또는 읽기에 실패했습니다. 'ONNX 수동 선택'으로 " +
            "u2net_human_seg.onnx를 직접 지정한 뒤 다시 시도하세요. 상세 원인: " + message;
    }
    if (/protobuf|onnx|model|session|invalid/i.test(message)) {
        return "ONNX 모델 초기화에 실패했습니다. 손상 캐시를 정리해 재시도했지만 실패했습니다. " +
            "'ONNX 수동 선택'으로 약 176MB 원본 모델을 직접 지정하세요. 원인: " + message;
    }
    return message;
}

function updateBgRemoveProgress(info) {
    if (typeof info === "number") {
        setBgRemoveProgress(info, "배경 제거 처리 중");
        return;
    }

    const progress = Number(info?.progress);
    const stepNames = {
        downloading: "모델 다운로드 중",
        processing: "전경과 배경 분리 중",
        postprocessing: "가장자리 다듬는 중",
        complete: "배경 제거 완료"
    };
    const status = info?.message || stepNames[info?.step] || "배경 제거 처리 중";
    setBgRemoveProgress(Number.isFinite(progress) ? progress : 10, status);
}

function setBgRemoveProgress(percent, status) {
    const safePercent = Math.max(0, Math.min(100, Math.round(percent || 0)));
    dom.bgRemoveProgressBar.style.width = safePercent + "%";
    dom.bgRemovePercent.innerText = safePercent + "%";
    dom.bgRemoveStatus.innerText = status || "처리 중";
}

async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error("원본 이미지 데이터를 읽을 수 없습니다.");
    return response.blob();
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("배경 제거 결과를 변환할 수 없습니다."));
        reader.readAsDataURL(blob);
    });
}

async function convertBackgroundResultToPng(src) {
    const image = await loadUpscaleImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("AI 결과 PNG 변환을 위한 Canvas를 만들 수 없습니다.");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
}

function closeBgRemoveSaveChoice() {
    if (dom.bgRemoveSaveChoice) dom.bgRemoveSaveChoice.style.display = "none";
}

function saveBackgroundRemoveResult(saveMode) {
    const sourceIndex = bgRemoveState.imageIndex;
    const sourceItem = images[sourceIndex];
    if (!sourceItem || !bgRemoveState.resultSrc) return;

    if (bgRemoveState.externalReturn) {
        const callback = bgRemoveState.externalReturn.onApply;
        const resultSrc = bgRemoveState.resultSrc;
        clearBackgroundRemoveExternalReturn(true);
        closeBackgroundRemoveEditor();
        Promise.resolve(callback(resultSrc)).catch(error => {
            console.error("Story background result callback failed:", error);
        });
        return;
    }

    const method = bgRemoveState.mode === "ai"
        ? "ai"
        : bgRemoveState.localEngine === "onnx"
            ? "rembg-web"
            : "mediapipe-webgl";
    let resultIndex = sourceIndex;

    if (saveMode === "replace") {
        const editTime = Date.now();
        sourceItem.createdAt = sourceItem.createdAt || sourceItem.date || editTime;
        sourceItem.src = bgRemoveState.resultSrc;
        sourceItem.size = estimateDataUrlBytes(bgRemoveState.resultSrc);
        sourceItem.modifiedAt = editTime;
        sourceItem.mimeType = "image/png";
        sourceItem.backgroundRemoveSourcePath =
            sourceItem.backgroundRemoveSourcePath || sourceItem.path;
        sourceItem.backgroundRemoveMethod = method;
        sourceItem.backgroundRemoveInfo = {
            method: method,
            engine: bgRemoveState.localEngine,
            customBackground: bgRemoveState.customBackgroundEnabled
                ? bgRemoveState.customBackgroundColor
                : null,
            boundaryStrength: bgRemoveState.boundaryStrength,
            width: bgRemoveState.resultWidth,
            height: bgRemoveState.resultHeight,
            prompt: bgRemoveState.prompt || undefined
        };
        applyDerivedImageMetadata(
            sourceItem,
            sourceItem,
            bgRemoveState.resultWidth,
            bgRemoveState.resultHeight,
            method === "ai" ? "AI BG Remove" : "BG Remove"
        );
    } else {
        const sourcePath = sourceItem.path;
        const suffix = method === "ai"
            ? "ai_bg_remove"
            : method === "mediapipe-webgl"
                ? "webgl_bg_remove"
                : "bg_remove";
        const count = images.filter(item =>
            item.backgroundRemoveSourcePath === sourcePath && item.backgroundRemoveMethod === method
        ).length + 1;

        const backgroundRemovedItem = {
            src: bgRemoveState.resultSrc,
            path: `${sourcePath}.${suffix}_${count}`,
            group: method === "ai" ? "ai-bg-removed" : "background-removed",
            date: Date.now(),
            createdAt: Date.now(),
            size: estimateDataUrlBytes(bgRemoveState.resultSrc),
            mimeType: "image/png",
            isFav: false,
            backgroundRemoveSourcePath: sourcePath,
            backgroundRemoveMethod: method,
            backgroundRemoveInfo: {
                method: method,
                engine: bgRemoveState.localEngine,
                customBackground: bgRemoveState.customBackgroundEnabled
                    ? bgRemoveState.customBackgroundColor
                    : null,
                boundaryStrength: bgRemoveState.boundaryStrength,
                width: bgRemoveState.resultWidth,
                height: bgRemoveState.resultHeight,
                prompt: bgRemoveState.prompt || undefined
            }
        };
        applyDerivedImageMetadata(
            backgroundRemovedItem,
            sourceItem,
            bgRemoveState.resultWidth,
            bgRemoveState.resultHeight,
            method === "ai" ? "AI BG Remove" : "BG Remove"
        );
        images.splice(sourceIndex + 1, 0, backgroundRemovedItem);
        resultIndex = sourceIndex + 1;
    }

    closeBackgroundRemoveEditor();
    renderGallery();
    renderFavorites();
    dom.imageCount.innerText = "Images: " + images.length;
    saveCurrentImagesToDB();
    showImage(resultIndex);
}

document.addEventListener("DOMContentLoaded", initBackgroundRemoveFeature);
