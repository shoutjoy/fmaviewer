/* =======================================================
   AI Jena · Prompt/Mask based Gemini image chat editor
   ======================================================= */

var aiJenaState = {
    open: false,
    mode: "edit",
    sourceIndex: -1,
    sourceItem: null,
    sourceImage: null,
    resultSrc: "",
    resultMimeType: "image/jpeg",
    videoResultUrl: "",
    videoResultBlob: null,
    videoOperationName: "",
    drawing: false,
    brushSize: 48,
    brushOpacity: .6,
    selectionTool: "brush",
    polygonPoints: [],
    polygonBaseImageData: null,
    completedPolygonPoints: [],
    polygonHoverPoint: null,
    polygonNearStart: false,
    polygonMoving: false,
    polygonMoveStart: null,
    polygonMoveOrigin: [],
    lastMaskPoint: null,
    abortController: null,
    processing: false,
    progress: 0,
    progressTimer: null,
    saving: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    panning: false,
    panPointerId: null,
    panStartX: 0,
    panStartY: 0,
    panOriginX: 0,
    panOriginY: 0,
    history: [],
    activeHistoryIndex: -1,
    historySessionKey: "",
    historyWidth: 104,
    historyResizing: false,
    historyResizeStartX: 0,
    historyResizeStartWidth: 104,
    referencePreviewDragging: false,
    referencePreviewDragX: 0,
    referencePreviewDragY: 0,
    uiFontSize: 12,
    selectedPose: "",
    references: { face: null, clothing: null, background: null, pose: null },
    referencePickerRole: "",
    referencePickerIndex: -1,
    customPoseLibrary: {}
};

var aiJenaHistorySessions = new Map();
var aiJenaNoticeTimer = null;
const AI_JENA_HISTORY_DB_PREFIX = "ai_jena_history:";
const AI_JENA_REFERENCE_PRESET_INDEX_KEY = "ai_jena_reference_presets:index";
const AI_JENA_REFERENCE_PRESET_PREFIX = "ai_jena_reference_preset:";
const AI_JENA_CUSTOM_POSE_DB_KEY = "ai_jena_custom_pose_library:v1";
const AI_JENA_POSE_LIBRARY = {
    "서있는 자세": [
        "정면에 편안히 서서 양팔을 자연스럽게 내린 자세", "한 손을 허리에 두고 다른 손은 내린 자신감 있는 자세",
        "양손을 허리에 두고 발을 어깨너비로 벌린 자세", "한쪽 다리에 체중을 싣고 반대쪽 무릎을 살짝 굽힌 자세",
        "다리를 교차하고 벽에 가볍게 기대어 선 자세", "양손을 등 뒤로 모으고 바르게 선 자세",
        "한 손으로 머리카락을 만지며 서 있는 자세", "양손을 주머니에 넣고 시선을 카메라에 둔 자세",
        "발끝을 살짝 벌리고 상체를 앞으로 기울인 자세", "뒤돌아선 상태에서 어깨너머로 카메라를 보는 자세"
    ],
    "앉은 자세": [
        "의자에 바르게 앉아 두 손을 무릎 위에 둔 자세", "의자에 비스듬히 앉아 다리를 우아하게 교차한 자세",
        "의자 등받이에 기대어 한 팔을 걸친 자세", "바닥에 양반다리로 앉아 편안하게 미소 짓는 자세",
        "한쪽 무릎을 세우고 바닥에 앉은 캐주얼 자세", "계단에 앉아 팔꿈치를 무릎에 올린 자세",
        "소파 끝에 앉아 상체를 살짝 앞으로 기울인 자세", "높은 스툴에 앉아 한쪽 발을 발판에 올린 자세",
        "옆으로 앉아 고개만 카메라 쪽으로 돌린 자세", "책상에 앉아 턱을 한 손에 괸 자세"
    ],
    "옆·회전 자세": [
        "완전한 측면으로 서서 얼굴만 카메라 쪽으로 돌린 자세", "몸을 45도 돌리고 시선은 정면을 향한 자세",
        "허리를 비틀어 상체와 골반 방향이 다른 역동적인 자세", "걸어가다 뒤를 돌아보는 자연스러운 자세",
        "어깨를 앞으로 내밀고 옆선을 강조한 자세", "한쪽 어깨를 벽에 기대고 측면을 보이는 자세",
        "뒷모습 중심으로 고개만 살짝 돌린 자세", "치맛자락이나 코트를 잡고 몸을 회전시키는 자세",
        "발은 정면, 상체는 옆으로 튼 자세", "양팔을 벌리며 반 바퀴 회전하는 순간의 자세"
    ],
    "반누운 자세": [
        "소파 팔걸이에 기대어 비스듬히 반누운 자세", "침대 헤드에 등을 기대고 다리를 뻗은 자세",
        "한쪽 팔꿈치로 상체를 받치고 반누운 자세", "쿠션을 등 뒤에 두고 무릎을 세운 편안한 자세",
        "잔디 위에서 두 팔로 뒤를 받치고 반누운 자세", "선베드에 기대어 얼굴을 햇빛 쪽으로 향한 자세",
        "옆으로 기대 한 손으로 머리를 받친 자세", "소파에 깊게 기대 한쪽 다리를 교차한 자세",
        "계단에 기대어 상체를 뒤로 젖힌 자세", "바닥에 앉아 벽에 기대고 다리를 길게 뻗은 자세"
    ],
    "누운 자세": [
        "등을 대고 누워 두 팔을 머리 위로 뻗은 자세", "옆으로 누워 한 손으로 머리를 받친 자세",
        "엎드려 누워 두 발을 뒤로 들어 올린 자세", "무릎을 세우고 편안히 천장을 보는 자세",
        "옆으로 웅크려 평온하게 잠든 듯한 자세", "침대 끝에 머리카락을 늘어뜨리고 누운 자세",
        "잔디에 누워 팔로 눈가를 가린 자세", "바닥에 대각선으로 누워 한쪽 다리를 굽힌 자세",
        "배를 대고 누워 팔꿈치로 상체를 들어 올린 자세", "꽃잎이나 천 위에 누워 카메라를 정면으로 보는 자세"
    ],
    "사진 촬영 자세": [
        "얼굴 가까이 손가락 브이 포즈를 한 클로즈업", "양손으로 얼굴 아래 꽃받침을 만든 자세",
        "카메라를 향해 한 손을 내미는 원근감 자세", "손으로 햇빛을 가리며 위를 바라보는 자세",
        "머리카락을 넘기는 순간을 포착한 자연스러운 자세", "커피잔을 들고 창밖을 바라보는 라이프스타일 자세",
        "거울을 보며 휴대폰으로 셀카를 찍는 자세", "난간에 기대어 먼 곳을 바라보는 여행 사진 자세",
        "재킷 깃을 잡고 카메라를 응시하는 인물 사진 자세", "두 손으로 카메라 프레임 모양을 만든 유쾌한 자세"
    ],
    "패션 자세": [
        "런웨이를 걷는 긴 보폭의 캣워크 자세", "한 손으로 재킷을 어깨에 걸친 에디토리얼 자세",
        "골반을 한쪽으로 밀고 의상 실루엣을 강조한 자세", "코트 자락을 펼쳐 움직임을 강조한 자세",
        "가방을 들고 한쪽 발을 앞으로 내민 광고 자세", "선글라스를 살짝 내리고 카메라를 보는 자세",
        "양팔을 교차하고 강한 표정을 짓는 하이패션 자세", "벽에 손을 짚고 긴 신체선을 강조한 자세",
        "한쪽 무릎을 굽혀 신발과 다리선을 보여주는 자세", "옷의 소재를 잡아 펼치며 디테일을 보여주는 자세"
    ],
    "운동·무술 자세": [
        "앞으로 전력 질주하는 달리기 자세", "출발선에서 몸을 낮춘 육상 스타트 자세",
        "한 다리로 균형을 잡는 요가 나무 자세", "양팔과 한 다리를 길게 뻗은 체조 균형 자세",
        "높이 점프하며 무릎을 접은 역동적인 자세", "복싱 가드를 올리고 잽을 준비하는 자세",
        "태권도 옆차기를 하는 순간의 자세", "검술에서 검을 앞으로 겨눈 준비 자세",
        "농구공을 들고 슛을 준비하는 자세", "테니스 라켓으로 포핸드 스윙을 하는 자세"
    ],
    "사랑·행복": [
        "두 손으로 큰 하트 모양을 만드는 행복한 자세", "손가락 하트를 볼 옆에 두고 환하게 웃는 자세",
        "사랑하는 사람을 포옹하듯 두 팔을 앞으로 벌린 자세", "꽃다발을 가슴에 안고 수줍게 미소 짓는 자세",
        "두 손을 가슴 위에 얹고 감사함을 표현하는 자세", "기쁨에 겨워 두 팔을 높이 올린 자세",
        "눈을 감고 활짝 웃으며 몸을 살짝 뒤로 젖힌 자세", "볼에 손을 대고 설레는 표정을 짓는 자세",
        "입맞춤을 보내는 손동작과 밝은 표정의 자세", "친구와 어깨동무하는 듯 옆으로 팔을 뻗은 자세"
    ],
    "감정·드라마": [
        "팔짱을 끼고 단호하게 카메라를 응시하는 자세", "한 손으로 입을 가리고 놀란 표정을 짓는 자세",
        "고개를 숙이고 두 손을 모은 사색적인 자세", "주먹을 쥐고 환호하는 승리의 자세",
        "한 손을 이마에 대고 걱정하는 자세", "눈물을 닦듯 손끝을 눈가에 댄 감성적인 자세",
        "양손을 벌리고 이유를 묻는 듯한 유쾌한 자세", "어깨를 움츠리고 수줍게 시선을 피하는 자세",
        "손가락을 입술에 대고 조용히 하라는 자세", "바람을 맞으며 두 팔을 펼친 자유로운 자세"
    ]
};
const AI_JENA_BUILTIN_POSE_LIBRARY = JSON.parse(JSON.stringify(AI_JENA_POSE_LIBRARY));

function initAiJenaFeature() {
    if (!dom.aiJenaModal) return;
    dom.btnAiJenaClose.onclick = closeAiJena;
    dom.btnRunAiJena.onclick = runAiJena;
    dom.btnRunAiJenaVideo.onclick = () => {
        setAiJenaMode("video");
        if (dom.aiJenaPrompt.value.trim()) runAiJena();
        else dom.aiJenaPrompt.focus();
    };
    dom.btnDownloadAiJenaVideo.onclick = downloadAiJenaVideo;
    if (dom.aiJenaVideoDuration) {
        dom.aiJenaVideoDuration.value = String(normalizeAiJenaVideoDuration(
            localStorage.getItem("fmaAiJenaVideoDuration"),
            8
        ));
        dom.aiJenaVideoDuration.addEventListener("change", () => {
            const duration = normalizeAiJenaVideoDuration(dom.aiJenaVideoDuration.value, 8);
            dom.aiJenaVideoDuration.value = String(duration);
            localStorage.setItem("fmaAiJenaVideoDuration", String(duration));
        });
    }
    dom.aiJenaPrompt.addEventListener("keydown", event => {
        if (event.key !== "Enter" || !event.ctrlKey || event.isComposing) return;
        event.preventDefault();
        runAiJena();
    });
    dom.btnStopAiJena.onclick = stopAiJena;
    dom.btnAddAiJenaResult.onclick = addAiJenaResult;
    dom.btnAiJenaChoiceCancel.onclick = closeAiJenaSaveChoice;
    dom.btnAiJenaReplace.onclick = () => saveAiJenaResult("replace");
    dom.btnAiJenaNew.onclick = () => saveAiJenaResult("new");
    dom.btnAiJenaClearMask.onclick = clearAiJenaMask;
    dom.btnClearAiJenaHistory.onclick = clearAllAiJenaHistory;
    dom.btnSendAllAiJenaHistory.onclick = sendAllAiJenaHistoryToGallery;
    initAiJenaFontControls();
    initAiJenaPoseLibrary();
    document.querySelectorAll("[data-jena-reference]").forEach(card => {
        const input = card.querySelector("input[type='file']");
        const role = card.dataset.jenaReference;
        card.querySelector("[data-jena-ref-pc]").onclick = event => {
            event.stopPropagation();
            card.focus();
            input.click();
        };
        card.querySelector("[data-jena-ref-paste]").onclick = event => {
            event.stopPropagation();
            pasteAiJenaReferenceFromClipboard(role, card);
        };
        card.querySelector("[data-jena-ref-fma]").onclick = event => {
            event.stopPropagation();
            card.focus();
            openAiJenaFmaPicker(role);
        };
        card.querySelector("[data-jena-ref-view]").onclick = event => {
            event.stopPropagation();
            openAiJenaReferencePreview(role);
        };
        card.querySelector("[data-jena-ref-remove]").onclick = event => {
            event.stopPropagation();
            removeAiJenaReference(role);
        };
        input.onchange = async () => {
            const file = input.files?.[0];
            input.value = "";
            if (!file) return;
            await setAiJenaReferenceFromFile(role, file, file.name);
        };
        card.addEventListener("paste", event => handleAiJenaReferencePaste(event, role, card));
        card.addEventListener("dragover", event => {
            if (!Array.from(event.dataTransfer?.items || []).some(item => item.type.startsWith("image/"))) return;
            event.preventDefault();
            card.classList.add("paste-target");
        });
        card.addEventListener("dragleave", () => card.classList.remove("paste-target"));
        card.addEventListener("drop", async event => {
            card.classList.remove("paste-target");
            const file = Array.from(event.dataTransfer?.files || []).find(item => item.type.startsWith("image/"));
            if (!file) return;
            event.preventDefault();
            event.stopPropagation();
            await setAiJenaReferenceFromFile(role, file, file.name);
        });
        card.addEventListener("contextmenu", event => {
            event.preventDefault();
            aiJenaState.references[role] = null;
            renderAiJenaReferences();
        });
    });
    dom.btnCloseAiJenaFmaPicker.onclick = closeAiJenaFmaPicker;
    dom.btnCancelAiJenaFmaPicker.onclick = closeAiJenaFmaPicker;
    dom.btnApplyAiJenaFmaPicker.onclick = applyAiJenaFmaPickerSelection;
    dom.aiJenaFmaPicker.addEventListener("mousedown", event => {
        if (event.target === dom.aiJenaFmaPicker) closeAiJenaFmaPicker();
    });
    initAiJenaReferencePreview();
    initAiJenaHistoryResizer();
    dom.btnClearAiJenaReferences.onclick = clearAiJenaReferences;
    initAiJenaReferenceStorage();
    dom.aiJenaBrushSize.oninput = () => {
        aiJenaState.brushSize = Number(dom.aiJenaBrushSize.value) || 48;
        dom.aiJenaBrushSizeValue.innerText = aiJenaState.brushSize + "px";
    };
    dom.aiJenaBrushOpacity.oninput = () => {
        aiJenaState.brushOpacity = (Number(dom.aiJenaBrushOpacity.value) || 60) / 100;
        dom.aiJenaBrushOpacityValue.innerText = `${Math.round(aiJenaState.brushOpacity * 100)}%`;
        if (aiJenaState.completedPolygonPoints.length >= 3) {
            renderAiJenaCompletedPolygon();
        }
    };
    document.querySelectorAll(".ai-jena-selection-tool").forEach(button => {
        button.onclick = () => setAiJenaSelectionTool(button.dataset.jenaTool);
    });
    dom.btnAiJenaClosePolygon.onclick = finishAiJenaPolygon;
    document.querySelectorAll(".ai-jena-mode").forEach(button => {
        button.onclick = () => setAiJenaMode(button.dataset.jenaMode);
    });
    dom.aiJenaMaskCanvas.addEventListener("pointerdown", beginAiJenaMaskStroke);
    dom.aiJenaMaskCanvas.addEventListener("pointermove", continueAiJenaMaskStroke);
    dom.aiJenaMaskCanvas.addEventListener("pointerup", endAiJenaMaskStroke);
    dom.aiJenaMaskCanvas.addEventListener("pointercancel", endAiJenaMaskStroke);
    dom.aiJenaStage.addEventListener("wheel", zoomAiJenaStage, { passive: false });
    dom.aiJenaStage.addEventListener("pointerdown", beginAiJenaStagePan);
    window.addEventListener("pointermove", continueAiJenaStagePan);
    window.addEventListener("pointerup", endAiJenaStagePan);
    window.addEventListener("pointercancel", endAiJenaStagePan);
    dom.btnAiJenaResetZoom.onclick = resetAiJenaZoom;
    dom.aiJenaModal.addEventListener("mousedown", event => {
        if (event.target === dom.aiJenaModal && !aiJenaState.processing) closeAiJena();
    });
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape" || dom.aiJenaModal.style.display === "none") return;
        if (dom.aiJenaReferencePreview?.style.display !== "none") {
            closeAiJenaReferencePreview();
        } else if (dom.aiJenaFmaPicker.style.display !== "none") {
            closeAiJenaFmaPicker();
        } else if (dom.aiJenaSaveChoice.style.display !== "none") {
            closeAiJenaSaveChoice();
        } else if (!aiJenaState.processing) {
            closeAiJena();
        }
    });
    window.addEventListener("focus", updateAiJenaKeyStatus);
    updateAiJenaKeyStatus();
}

function updateAiJenaKeyStatus() {
    const hasKey = Boolean(getAiStudioApiKey());
    const usageEnabled = isAiKeyUsageEnabled();
    const ready = Boolean(getUsableAiStudioApiKey());
    document.querySelectorAll(".ai-jena-image-button").forEach(button => {
        button.style.display = hasKey ? "inline-flex" : "none";
        button.disabled = !ready;
        button.classList.toggle("ready", ready);
        button.classList.toggle("unavailable", !ready);
        button.innerText = ready ? "✦ AI Jena" : "✦";
        button.title = ready
            ? "AI Studio 키 연결됨 · 이 이미지로 AI Jena 열기"
            : usageEnabled ? "" : "AI API 키 사용이 중지되어 있습니다.";
    });
    if (dom.aiJenaKeyStatus) {
        dom.aiJenaKeyStatus.innerText = ready ? "● AI Studio 키 연결됨" : "○ AI Studio 키 필요";
        dom.aiJenaKeyStatus.classList.toggle("ready", ready);
    }
}

async function openAiJena(imageIndex = currentIndex) {
    updateAiJenaKeyStatus();
    if (!getUsableAiStudioApiKey()) {
        return;
    }
    aiJenaState.open = true;
    aiJenaState.sourceIndex = images[imageIndex] ? imageIndex : -1;
    aiJenaState.sourceItem = images[aiJenaState.sourceIndex] || null;
    await markAiJenaRawSource(aiJenaState.sourceItem);
    aiJenaState.resultSrc = "";
    clearAiJenaVideoResult();
    aiJenaState.processing = false;
    clearAiJenaReferences();
    dom.aiJenaReferenceStorage.open = false;
    aiJenaState.historySessionKey = aiJenaState.sourceItem?.path ||
        `image-${aiJenaState.sourceIndex}`;
    resetAiJenaHistory();
    dom.aiJenaResultPreview.style.display = "none";
    dom.btnAddAiJenaResult.disabled = true;
    closeAiJenaSaveChoice();
    dom.aiJenaChatHistory.innerHTML =
        '<div class="ai-jena-message assistant">현재 이미지를 프롬프트로 수정하거나 새 이미지를 생성할 수 있습니다.</div>';
    dom.aiJenaModal.style.display = "flex";
    resetAiJenaZoom();
    setAiJenaMode(aiJenaState.sourceItem ? "edit" : "generate");
    if (aiJenaState.sourceItem) {
        try {
            const savedHistory = await loadAiJenaHistorySession(aiJenaState.historySessionKey);
            if (Array.isArray(savedHistory)) {
                aiJenaState.history = savedHistory.map(entry => ({ ...entry }));
                renderAiJenaHistory();
                if (aiJenaState.history.length) {
                    await selectAiJenaHistoryEntry(aiJenaState.history.length - 1, false);
                } else {
                    aiJenaState.sourceImage = await loadUpscaleImage(aiJenaState.sourceItem.src);
                    drawAiJenaSource();
                }
            } else {
                aiJenaState.sourceImage = await loadUpscaleImage(aiJenaState.sourceItem.src);
                drawAiJenaSource();
                await addAiJenaOriginalHistoryEntry(aiJenaState.sourceItem);
            }
        } catch (error) {
            aiJenaState.sourceImage = null;
            setAiJenaMode("generate");
        }
    } else {
        aiJenaState.sourceImage = null;
        drawAiJenaSource();
    }
    dom.aiJenaPrompt.focus();
}

async function markAiJenaRawSource(item) {
    if (!item || item.aiJenaRaw || isVideoMedia(item)) return;
    item.aiJenaRaw = true;
    renderGallery();
    if (typeof saveCurrentImagesToDB === "function") await saveCurrentImagesToDB();
}

function closeAiJena() {
    if (aiJenaState.processing) {
        stopAiJena();
        return;
    }
    aiJenaState.open = false;
    closeAiJenaFmaPicker();
    closeAiJenaSaveChoice();
    dom.aiJenaModal.style.display = "none";
}

function setAiJenaMode(mode) {
    const allowed = ["edit", "clothes", "pose", "tryon", "generate", "video"];
    aiJenaState.mode = allowed.includes(mode) ? mode : "edit";
    if (!aiJenaState.sourceItem && !["generate", "video"].includes(aiJenaState.mode)) {
        aiJenaState.mode = "generate";
    }
    document.querySelectorAll(".ai-jena-mode").forEach(button => {
        button.classList.toggle("active", button.dataset.jenaMode === aiJenaState.mode);
    });
    const maskMode = aiJenaState.mode === "clothes";
    dom.aiJenaBrushControls.style.display = maskMode ? "flex" : "none";
    dom.aiJenaMaskCanvas.style.pointerEvents = maskMode ? "auto" : "none";
    dom.aiJenaPoseLibrary.style.display = ["pose", "tryon"].includes(aiJenaState.mode) ? "flex" : "none";
    dom.aiJenaVideoOptions.style.display = aiJenaState.mode === "video" ? "flex" : "none";
    dom.btnRunAiJenaVideo.style.display = aiJenaState.mode === "video" ? "inline-flex" : "none";
    dom.btnRunAiJena.innerText = aiJenaState.mode === "video" ? "▶ 영상 생성" : "AI 실행";
    dom.btnAddAiJenaResult.style.display = "inline-block";
    dom.btnAddAiJenaResult.innerText = aiJenaState.mode === "video"
        ? "갤러리에 영상 저장" : "갤러리로 보내기";
    dom.btnAddAiJenaResult.disabled = aiJenaState.mode === "video"
        ? !aiJenaState.videoResultBlob : !aiJenaState.resultSrc;
    dom.btnDownloadAiJenaVideo.style.display = aiJenaState.mode === "video" && aiJenaState.videoResultBlob
        ? "inline-block" : "none";
    const showingVideo = aiJenaState.mode === "video" && Boolean(aiJenaState.videoResultUrl);
    dom.aiJenaVideoPreview.style.display = showingVideo ? "block" : "none";
    dom.aiJenaCanvasStack.style.visibility = showingVideo ? "hidden" : "visible";
    dom.aiJenaPrompt.placeholder = {
        edit: "예: 배경을 밤의 서울 거리로 바꾸되 인물은 그대로 유지해줘.",
        clothes: "붓 또는 다각형으로 영역을 선택한 뒤, 주변 배경과 자연스럽게 어울리도록 바꿀 내용을 입력하세요.",
        pose: "예: 인물이 양손을 허리에 둔 자연스러운 전신 포즈로 바꿔줘.",
        tryon: "옷 참고 이미지를 등록한 뒤 착장 방식, 핏과 유지할 요소를 설명하세요.",
        generate: "생성할 이미지의 인물, 배경, 구도, 조명과 스타일을 설명하세요.",
        video: "Veo로 만들 영상의 움직임, 카메라 워크, 장면, 조명과 분위기를 자세히 설명하세요."
    }[aiJenaState.mode];
}

function initAiJenaFontControls() {
    const saved = Number(localStorage.getItem("fmaAiJenaFontSize"));
    aiJenaState.uiFontSize = Math.max(10, Math.min(18, saved || 12));
    const apply = () => {
        document.querySelector(".ai-jena-dialog")?.style.setProperty(
            "--ai-jena-font-size", `${aiJenaState.uiFontSize}px`
        );
        dom.aiJenaFontSizeValue.innerText = `${aiJenaState.uiFontSize}px`;
        localStorage.setItem("fmaAiJenaFontSize", String(aiJenaState.uiFontSize));
    };
    dom.btnAiJenaFontSmaller.onclick = () => {
        aiJenaState.uiFontSize = Math.max(10, aiJenaState.uiFontSize - 1);
        apply();
    };
    dom.btnAiJenaFontLarger.onclick = () => {
        aiJenaState.uiFontSize = Math.min(18, aiJenaState.uiFontSize + 1);
        apply();
    };
    apply();
}

function initAiJenaPoseLibrary() {
    dom.aiJenaPoseCategory.onchange = () => refreshAiJenaPosePresets();
    dom.btnApplyAiJenaPose.onclick = applySelectedAiJenaPose;
    dom.btnAddAiJenaPose.onclick = addCustomAiJenaPose;
    dom.btnDeleteAiJenaPose.onclick = deleteSelectedCustomAiJenaPose;
    dom.btnExportAiJenaPoses.onclick = exportCustomAiJenaPoses;
    dom.btnImportAiJenaPoses.onclick = () => dom.aiJenaPoseFileInput.click();
    dom.aiJenaPoseFileInput.onchange = importCustomAiJenaPoses;
    dom.aiJenaPoseManager.open = false;
    refreshAiJenaPoseControls();
    loadCustomAiJenaPosesFromDb();
}

function refreshAiJenaPoseControls(preferredCategory = "", preferredPose = "") {
    const previousCategory = preferredCategory || dom.aiJenaPoseCategory.value;
    dom.aiJenaPoseCategory.innerHTML = "";
    Object.keys(AI_JENA_POSE_LIBRARY).forEach(category => {
        dom.aiJenaPoseCategory.add(new Option(category, category));
    });
    if (AI_JENA_POSE_LIBRARY[previousCategory]) dom.aiJenaPoseCategory.value = previousCategory;
    refreshAiJenaPosePresets(preferredPose);
    const total = Object.values(AI_JENA_POSE_LIBRARY).reduce((sum, poses) => sum + poses.length, 0);
    dom.aiJenaPoseCount.innerText = `${total}가지`;
}

function refreshAiJenaPosePresets(preferredPose = "") {
    const previousPose = preferredPose || dom.aiJenaPosePreset.value;
    const poses = AI_JENA_POSE_LIBRARY[dom.aiJenaPoseCategory.value] || [];
    dom.aiJenaPosePreset.innerHTML = "";
    poses.forEach((pose, index) => {
        const custom = (aiJenaState.customPoseLibrary[dom.aiJenaPoseCategory.value] || []).includes(pose);
        dom.aiJenaPosePreset.add(new Option(`${index + 1}. ${pose}${custom ? " · 사용자" : ""}`, pose));
    });
    if (poses.includes(previousPose)) dom.aiJenaPosePreset.value = previousPose;
    dom.aiJenaCustomPoseCategory.value = dom.aiJenaPoseCategory.value || "";
}

function normalizeCustomAiJenaPoseLibrary(value) {
    const source = value?.categories || value;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new Error("올바른 AI Jena 포즈 파일이 아닙니다.");
    }
    const normalized = {};
    Object.entries(source).forEach(([category, poses]) => {
        const cleanCategory = String(category || "").trim().slice(0, 50);
        if (!cleanCategory || !Array.isArray(poses)) return;
        const cleanPoses = [...new Set(poses.map(pose => String(pose || "").trim().slice(0, 500)).filter(Boolean))];
        if (cleanPoses.length) normalized[cleanCategory] = cleanPoses;
    });
    return normalized;
}

function rebuildAiJenaPoseLibrary() {
    Object.keys(AI_JENA_POSE_LIBRARY).forEach(category => delete AI_JENA_POSE_LIBRARY[category]);
    Object.entries(AI_JENA_BUILTIN_POSE_LIBRARY).forEach(([category, poses]) => {
        AI_JENA_POSE_LIBRARY[category] = [...poses];
    });
    Object.entries(aiJenaState.customPoseLibrary).forEach(([category, poses]) => {
        AI_JENA_POSE_LIBRARY[category] ||= [];
        poses.forEach(pose => {
            if (!AI_JENA_POSE_LIBRARY[category].includes(pose)) AI_JENA_POSE_LIBRARY[category].push(pose);
        });
    });
}

function setAiJenaPoseManagerStatus(message, error = false) {
    dom.aiJenaPoseManagerStatus.innerText = message;
    dom.aiJenaPoseManagerStatus.classList.toggle("error", error);
}

async function addCustomAiJenaPose() {
    const category = dom.aiJenaCustomPoseCategory.value.trim();
    const pose = dom.aiJenaCustomPoseText.value.trim();
    if (!category || !pose) return setAiJenaPoseManagerStatus("주제와 자세 내용을 모두 입력하세요.", true);
    const customPoses = aiJenaState.customPoseLibrary[category] ||= [];
    if (customPoses.includes(pose) || (AI_JENA_BUILTIN_POSE_LIBRARY[category] || []).includes(pose)) {
        return setAiJenaPoseManagerStatus("이미 등록된 자세입니다.", true);
    }
    customPoses.push(pose);
    rebuildAiJenaPoseLibrary();
    refreshAiJenaPoseControls(category, pose);
    dom.aiJenaCustomPoseText.value = "";
    await saveCustomAiJenaPosesToDb();
    setAiJenaPoseManagerStatus(`“${category}”에 사용자 자세를 추가하고 저장했습니다.`);
}

async function deleteSelectedCustomAiJenaPose() {
    const category = dom.aiJenaPoseCategory.value;
    const pose = dom.aiJenaPosePreset.value;
    const customPoses = aiJenaState.customPoseLibrary[category] || [];
    if (!customPoses.includes(pose)) return setAiJenaPoseManagerStatus("기본 포즈는 삭제할 수 없습니다. 사용자 추가 포즈를 선택하세요.", true);
    aiJenaState.customPoseLibrary[category] = customPoses.filter(value => value !== pose);
    if (!aiJenaState.customPoseLibrary[category].length) delete aiJenaState.customPoseLibrary[category];
    rebuildAiJenaPoseLibrary();
    refreshAiJenaPoseControls(category);
    await saveCustomAiJenaPosesToDb();
    setAiJenaPoseManagerStatus("선택한 사용자 포즈를 삭제했습니다.");
}

async function saveCustomAiJenaPosesToDb() {
    await writeAiJenaReferenceStore([{ key: AI_JENA_CUSTOM_POSE_DB_KEY, value: {
        format: "FMA-AI-JENA-POSES", version: 1, updatedAt: new Date().toISOString(),
        categories: aiJenaState.customPoseLibrary
    } }]);
}

async function loadCustomAiJenaPosesFromDb() {
    try {
        const db = await openFmaDatabase();
        let value;
        try {
            value = await new Promise((resolve, reject) => {
                const request = db.transaction("fma_store", "readonly").objectStore("fma_store").get(AI_JENA_CUSTOM_POSE_DB_KEY);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } finally { db.close(); }
        aiJenaState.customPoseLibrary = value ? normalizeCustomAiJenaPoseLibrary(value) : {};
        rebuildAiJenaPoseLibrary();
        refreshAiJenaPoseControls();
        if (value) setAiJenaPoseManagerStatus("IndexedDB에서 사용자 포즈를 불러왔습니다.");
    } catch (error) {
        setAiJenaPoseManagerStatus("사용자 포즈 DB 불러오기 실패: " + error.message, true);
    }
}

function exportCustomAiJenaPoses() {
    const payload = { format: "FMA-AI-JENA-POSES", version: 1, exportedAt: new Date().toISOString(), categories: aiJenaState.customPoseLibrary };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aiJena_poses_${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAiJenaPoseManagerStatus("사용자 포즈 JSON을 내보냈습니다.");
}

async function importCustomAiJenaPoses() {
    const file = dom.aiJenaPoseFileInput.files?.[0];
    dom.aiJenaPoseFileInput.value = "";
    if (!file) return;
    try {
        const imported = normalizeCustomAiJenaPoseLibrary(JSON.parse(await file.text()));
        Object.entries(imported).forEach(([category, poses]) => {
            const current = aiJenaState.customPoseLibrary[category] ||= [];
            poses.forEach(pose => { if (!current.includes(pose)) current.push(pose); });
        });
        rebuildAiJenaPoseLibrary();
        refreshAiJenaPoseControls();
        await saveCustomAiJenaPosesToDb();
        setAiJenaPoseManagerStatus("JSON 포즈를 합치고 IndexedDB에 저장했습니다.");
    } catch (error) {
        setAiJenaPoseManagerStatus("포즈 JSON 불러오기 실패: " + error.message, true);
    }
}

function applySelectedAiJenaPose() {
    const pose = dom.aiJenaPosePreset.value;
    if (!pose) return;
    aiJenaState.selectedPose = pose;
    const marker = `[포즈: ${pose}]`;
    const current = dom.aiJenaPrompt.value.trim();
    dom.aiJenaPrompt.value = current.replace(/^\[포즈:.*?\]\s*/s, "");
    dom.aiJenaPrompt.value = `${marker}\n${dom.aiJenaPrompt.value}`.trim();
    dom.aiJenaPrompt.focus();
}

function readAiJenaReferenceFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("참고 이미지를 읽지 못했습니다."));
        reader.readAsDataURL(file);
    });
}

async function setAiJenaReferenceFromFile(role, file, name) {
    if (!Object.prototype.hasOwnProperty.call(aiJenaState.references, role) || !file?.type?.startsWith("image/")) return false;
    try {
        aiJenaState.references[role] = {
            name: name || file.name || `clipboard_${role}.png`,
            src: await readAiJenaReferenceFile(file),
            mimeType: file.type || "image/png"
        };
        renderAiJenaReferences();
        const roleName = { face: "얼굴", clothing: "옷", background: "배경", pose: "자세" }[role] || "참고";
        showAiJenaNotice(`${roleName} 참고 이미지에 입력했습니다.`);
        return true;
    } catch (error) {
        console.error("AI Jena reference input failed:", error);
        showAiJenaNotice("참고 이미지를 읽지 못했습니다.");
        return false;
    }
}

async function handleAiJenaReferencePaste(event, role, card) {
    const imageItem = Array.from(event.clipboardData?.items || [])
        .find(item => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    const file = imageItem.getAsFile();
    if (!file) return;
    card.classList.add("paste-target");
    await setAiJenaReferenceFromFile(role, file, `clipboard_${role}_${Date.now()}.png`);
    card.classList.remove("paste-target");
}

async function pasteAiJenaReferenceFromClipboard(role, card) {
    card.focus();
    card.classList.add("paste-target");
    try {
        if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
            throw new Error("clipboard-read-unavailable");
        }
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
            const imageType = item.types.find(type => type.startsWith("image/"));
            if (!imageType) continue;
            const blob = await item.getType(imageType);
            await setAiJenaReferenceFromFile(role, blob, `clipboard_${role}_${Date.now()}.${imageType.split("/")[1].replace("jpeg", "jpg")}`);
            card.classList.remove("paste-target");
            return;
        }
        showAiJenaNotice("클립보드에 이미지가 없습니다.");
    } catch (error) {
        showAiJenaNotice("이 칸이 선택되었습니다. Ctrl+V로 이미지를 붙여넣으세요.");
    } finally {
        window.setTimeout(() => card.classList.remove("paste-target"), 1400);
    }
}

function clearAiJenaReferences() {
    aiJenaState.references = { face: null, clothing: null, background: null, pose: null };
    document.querySelectorAll("[data-jena-reference] input[type='file']").forEach(input => { input.value = ""; });
    document.querySelectorAll("[data-jena-reference]").forEach(card => card.classList.remove("paste-target"));
    renderAiJenaReferences();
    showAiJenaNotice("참고 이미지 입력을 전체 초기화했습니다.");
}

function removeAiJenaReference(role) {
    const reference = aiJenaState.references[role];
    if (!reference) return;
    aiJenaState.references[role] = null;
    const card = document.querySelector(`[data-jena-reference="${role}"]`);
    const input = card?.querySelector("input[type='file']");
    if (input) input.value = "";
    if (dom.aiJenaReferencePreview?.style.display !== "none") closeAiJenaReferencePreview();
    renderAiJenaReferences();
    const roleName = { face: "얼굴", clothing: "옷", background: "배경", pose: "자세" }[role] || "참고";
    showAiJenaNotice(`${roleName} 참고 이미지를 제거했습니다.`);
}

function openAiJenaReferencePreview(role) {
    const reference = aiJenaState.references[role];
    if (!reference || !dom.aiJenaReferencePreview) return;
    const roleName = { face: "얼굴", clothing: "옷", background: "배경", pose: "자세" }[role] || "참고";
    dom.aiJenaReferencePreviewTitle.innerText = `${roleName} 참고 이미지`;
    dom.aiJenaReferencePreviewName.innerText = reference.name || "입력된 이미지";
    dom.aiJenaReferencePreviewImage.src = reference.src;
    const dialog = dom.aiJenaReferencePreviewDialog;
    dialog.style.left = "50%";
    dialog.style.top = "50%";
    dialog.style.transform = "translate(-50%, -50%)";
    dom.aiJenaReferencePreview.style.display = "flex";
}

function closeAiJenaReferencePreview() {
    if (!dom.aiJenaReferencePreview) return;
    dom.aiJenaReferencePreview.style.display = "none";
    dom.aiJenaReferencePreviewImage.removeAttribute("src");
    aiJenaState.referencePreviewDragging = false;
}

function initAiJenaReferencePreview() {
    if (!dom.aiJenaReferencePreview) return;
    dom.btnCloseAiJenaReferencePreview.onclick = closeAiJenaReferencePreview;
    dom.aiJenaReferencePreview.addEventListener("pointerdown", event => {
        if (event.target === dom.aiJenaReferencePreview) closeAiJenaReferencePreview();
    });
    dom.aiJenaReferencePreviewHandle.addEventListener("pointerdown", event => {
        if (event.target.closest("button")) return;
        const dialog = dom.aiJenaReferencePreviewDialog;
        const rect = dialog.getBoundingClientRect();
        dialog.style.left = `${rect.left}px`;
        dialog.style.top = `${rect.top}px`;
        dialog.style.transform = "none";
        aiJenaState.referencePreviewDragging = true;
        aiJenaState.referencePreviewDragX = event.clientX - rect.left;
        aiJenaState.referencePreviewDragY = event.clientY - rect.top;
        dom.aiJenaReferencePreviewHandle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });
    dom.aiJenaReferencePreviewHandle.addEventListener("pointermove", event => {
        if (!aiJenaState.referencePreviewDragging) return;
        const dialog = dom.aiJenaReferencePreviewDialog;
        const width = dialog.offsetWidth;
        const height = dialog.offsetHeight;
        const left = Math.max(0, Math.min(window.innerWidth - width, event.clientX - aiJenaState.referencePreviewDragX));
        const top = Math.max(0, Math.min(window.innerHeight - height, event.clientY - aiJenaState.referencePreviewDragY));
        dialog.style.left = `${left}px`;
        dialog.style.top = `${top}px`;
    });
    const stopDragging = () => { aiJenaState.referencePreviewDragging = false; };
    dom.aiJenaReferencePreviewHandle.addEventListener("pointerup", stopDragging);
    dom.aiJenaReferencePreviewHandle.addEventListener("pointercancel", stopDragging);
}

function initAiJenaHistoryResizer() {
    if (!dom.aiJenaHistoryResizer || !dom.aiJenaHistoryPanel || !dom.aiJenaStage) return;
    const savedWidth = Number(localStorage.getItem("fma_ai_jena_history_width"));
    setAiJenaHistoryWidth(Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : 104, false);
    dom.aiJenaHistoryResizer.addEventListener("pointerdown", event => {
        aiJenaState.historyResizing = true;
        aiJenaState.historyResizeStartX = event.clientX;
        aiJenaState.historyResizeStartWidth = dom.aiJenaHistoryPanel.getBoundingClientRect().width;
        dom.aiJenaHistoryPanel.classList.add("resizing");
        dom.aiJenaHistoryResizer.setPointerCapture?.(event.pointerId);
        event.stopPropagation();
        event.preventDefault();
    });
    dom.aiJenaHistoryResizer.addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? 12 : -12;
        setAiJenaHistoryWidth(aiJenaState.historyWidth + delta);
    });
    window.addEventListener("pointermove", event => {
        if (!aiJenaState.historyResizing) return;
        setAiJenaHistoryWidth(aiJenaState.historyResizeStartWidth + aiJenaState.historyResizeStartX - event.clientX, false);
    });
    const finishResize = () => {
        if (!aiJenaState.historyResizing) return;
        aiJenaState.historyResizing = false;
        dom.aiJenaHistoryPanel.classList.remove("resizing");
        localStorage.setItem("fma_ai_jena_history_width", String(aiJenaState.historyWidth));
    };
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
}

function setAiJenaHistoryWidth(width, persist = true) {
    const maxWidth = Math.max(180, Math.min(360, Math.round(window.innerWidth * .28)));
    const value = Math.max(92, Math.min(maxWidth, Math.round(Number(width) || 104)));
    aiJenaState.historyWidth = value;
    dom.aiJenaStage?.style.setProperty("--ai-jena-history-width", `${value}px`);
    dom.aiJenaHistoryResizer?.setAttribute("aria-valuenow", String(value));
    dom.aiJenaHistoryResizer?.setAttribute("aria-valuemin", "92");
    dom.aiJenaHistoryResizer?.setAttribute("aria-valuemax", String(maxWidth));
    if (persist) localStorage.setItem("fma_ai_jena_history_width", String(value));
}

function renderAiJenaReferences() {
    document.querySelectorAll("[data-jena-reference]").forEach(card => {
        const reference = aiJenaState.references[card.dataset.jenaReference];
        card.classList.toggle("loaded", Boolean(reference));
        const image = card.querySelector("img");
        if (reference) image.src = reference.src;
        else image.removeAttribute("src");
        const hint = card.querySelector("em");
        hint.innerText = reference ? "✓ " + reference.name.slice(0, 14) : "PC · FMA · 붙여넣기";
        card.title = reference ? "새창 보기 또는 제거 버튼을 사용하세요." : "PC, FMA 갤러리 또는 Ctrl+V로 참고 이미지 입력";
    });
}

function openAiJenaFmaPicker(role) {
    const selectableImages = images.filter(item => !isVideoMedia(item));
    if (!selectableImages.length) {
        alert("FMA 갤러리에 이미지가 없습니다.");
        return;
    }
    aiJenaState.referencePickerRole = role;
    aiJenaState.referencePickerIndex = -1;
    renderAiJenaFmaPicker();
    const roleName = { face: "얼굴", clothing: "옷", background: "배경", pose: "자세", source: "새 원본" }[role] || "참고";
    document.getElementById("aiJenaFmaPickerTitle").innerText = `FMA 갤러리에서 ${roleName} 이미지 선택`;
    dom.aiJenaFmaPicker.style.display = "flex";
}

function closeAiJenaFmaPicker() {
    if (!dom.aiJenaFmaPicker) return;
    dom.aiJenaFmaPicker.style.display = "none";
    aiJenaState.referencePickerRole = "";
    aiJenaState.referencePickerIndex = -1;
}

function getAiJenaFmaPickerOrder() {
    const valid = Array.isArray(sortedImageOrder) && sortedImageOrder.length === images.length &&
        new Set(sortedImageOrder).size === images.length;
    return valid ? [...sortedImageOrder] : images.map((_, index) => index);
}

function renderAiJenaFmaPicker() {
    dom.aiJenaFmaPickerGrid.innerHTML = "";
    getAiJenaFmaPickerOrder().forEach(index => {
        const item = images[index];
        if (!item || isVideoMedia(item)) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "editor-fma-picker-item";
        button.classList.toggle("active", index === aiJenaState.referencePickerIndex);
        button.title = item.path || `FMA 이미지 ${index + 1}`;
        const image = document.createElement("img");
        image.src = item.thumbnailSrc || item.src;
        image.alt = item.path || `FMA 이미지 ${index + 1}`;
        const label = document.createElement("span");
        label.innerText = item.path || `이미지 ${index + 1}`;
        button.append(image, label);
        button.onclick = () => {
            aiJenaState.referencePickerIndex = index;
            renderAiJenaFmaPicker();
        };
        button.ondblclick = () => {
            aiJenaState.referencePickerIndex = index;
            applyAiJenaFmaPickerSelection();
        };
        dom.aiJenaFmaPickerGrid.appendChild(button);
    });
    const selected = aiJenaState.referencePickerIndex;
    dom.btnApplyAiJenaFmaPicker.disabled = selected < 0 || !images[selected];
    dom.aiJenaFmaPickerStatus.innerText = selected >= 0 && images[selected]
        ? `${images[selected].path || `이미지 ${selected + 1}`} 선택됨`
        : `${images.length}개 이미지 · 하나를 선택하세요.`;
}

async function applyAiJenaFmaPickerSelection() {
    const index = aiJenaState.referencePickerIndex;
    const role = aiJenaState.referencePickerRole;
    if (index < 0 || !images[index] || !role) return;
    dom.btnApplyAiJenaFmaPicker.disabled = true;
    dom.aiJenaFmaPickerStatus.innerText = "FMA 원본 이미지를 불러오는 중입니다…";
    try {
        if (typeof ensureImageOriginalLoaded === "function") await ensureImageOriginalLoaded(index);
        const item = images[index];
        if (!item?.src) throw new Error("선택한 이미지 원본을 읽을 수 없습니다.");
        if (role === "source") {
            await replaceAiJenaOriginal(index);
            closeAiJenaFmaPicker();
            return;
        }
        const response = await fetch(item.src);
        if (!response.ok) throw new Error(`이미지 읽기 실패 (${response.status})`);
        const blob = await response.blob();
        const src = await readAiJenaReferenceFile(blob);
        aiJenaState.references[role] = {
            name: item.path || `FMA 이미지 ${index + 1}`,
            src,
            mimeType: blob.type || item.mimeType || "image/png"
        };
        renderAiJenaReferences();
        closeAiJenaFmaPicker();
        showAiJenaNotice("FMA 갤러리 이미지를 참고 이미지로 가져왔습니다.");
    } catch (error) {
        console.error("AI Jena FMA reference import failed:", error);
        dom.aiJenaFmaPickerStatus.innerText = "참고 이미지를 불러오지 못했습니다: " + error.message;
        dom.btnApplyAiJenaFmaPicker.disabled = false;
    }
}

async function replaceAiJenaOriginal(index) {
    if (aiJenaState.processing || !images[index] || isVideoMedia(images[index])) return;
    if (typeof ensureImageOriginalLoaded === "function") await ensureImageOriginalLoaded(index);
    const item = images[index];
    const sourceImage = await loadUpscaleImage(item.src);
    aiJenaState.sourceIndex = index;
    aiJenaState.sourceItem = item;
    await markAiJenaRawSource(item);
    aiJenaState.sourceImage = sourceImage;
    aiJenaState.resultSrc = "";
    aiJenaState.resultMimeType = item.mimeType || "image/png";
    aiJenaState.historySessionKey = item.path || `image-${index}`;
    clearAiJenaVideoResult();
    clearAiJenaMask();
    resetAiJenaHistory();
    setAiJenaMode("edit");
    drawAiJenaSource();
    await addAiJenaOriginalHistoryEntry(item);
    dom.btnAddAiJenaResult.disabled = true;
    appendAiJenaMessage("assistant", "원본 이미지를 교체했습니다. 새 원본을 기준으로 편집을 계속할 수 있습니다.");
    showAiJenaNotice("AI Jena 원본 이미지를 교체했습니다.");
}

function initAiJenaReferenceStorage() {
    dom.aiJenaReferenceStorage.open = false;
    dom.aiJenaReferenceStorage.ontoggle = () => {
        if (dom.aiJenaReferenceStorage.open) refreshAiJenaReferencePresetList();
    };
    dom.btnExportAiJenaReferences.onclick = exportAiJenaReferencePreset;
    dom.btnImportAiJenaReferences.onclick = () => dom.aiJenaReferenceFileInput.click();
    dom.aiJenaReferenceFileInput.onchange = importAiJenaReferencePreset;
    dom.btnSaveAiJenaReferencesDb.onclick = saveAiJenaReferencePresetToDb;
    dom.btnLoadAiJenaReferencesDb.onclick = loadAiJenaReferencePresetFromDb;
    dom.btnDeleteAiJenaReferencesDb.onclick = deleteAiJenaReferencePresetFromDb;
    dom.aiJenaReferencePresetList.onchange = () => {
        const option = dom.aiJenaReferencePresetList.selectedOptions[0];
        if (option?.dataset.name) dom.aiJenaReferencePresetName.value = option.dataset.name;
    };
}

function makeAiJenaReferencePreset(name) {
    return {
        format: "FMA-AI-JENA-REFERENCES",
        version: 1,
        name: String(name || "AI Jena 참고 세팅").trim() || "AI Jena 참고 세팅",
        createdAt: new Date().toISOString(),
        references: Object.fromEntries(
            ["face", "clothing", "background", "pose"].map(role => {
                const reference = aiJenaState.references[role];
                return [role, reference ? {
                    name: String(reference.name || `${role}.png`),
                    mimeType: String(reference.mimeType || "image/png"),
                    src: String(reference.src || "")
                } : null];
            })
        ),
        poseCategory: dom.aiJenaPoseCategory.value || "",
        posePreset: dom.aiJenaPosePreset.value || "",
        selectedPose: aiJenaState.selectedPose || ""
    };
}

function normalizeAiJenaReferencePreset(value) {
    if (!value || typeof value !== "object") throw new Error("올바른 참고 세팅 파일이 아닙니다.");
    const references = {};
    for (const role of ["face", "clothing", "background", "pose"]) {
        const reference = value.references?.[role];
        references[role] = reference?.src?.startsWith("data:image/") ? {
            name: String(reference.name || `${role}.png`),
            mimeType: String(reference.mimeType || "image/png"),
            src: String(reference.src)
        } : null;
    }
    return {
        format: "FMA-AI-JENA-REFERENCES",
        version: 1,
        name: String(value.name || "가져온 참고 세팅"),
        createdAt: value.createdAt || new Date().toISOString(),
        references,
        poseCategory: String(value.poseCategory || ""),
        posePreset: String(value.posePreset || ""),
        selectedPose: String(value.selectedPose || "")
    };
}

function applyAiJenaReferencePreset(preset) {
    const normalized = normalizeAiJenaReferencePreset(preset);
    aiJenaState.references = normalized.references;
    aiJenaState.selectedPose = normalized.selectedPose;
    if (AI_JENA_POSE_LIBRARY[normalized.poseCategory]) {
        dom.aiJenaPoseCategory.value = normalized.poseCategory;
        dom.aiJenaPoseCategory.dispatchEvent(new Event("change"));
        if ([...dom.aiJenaPosePreset.options].some(option => option.value === normalized.posePreset)) {
            dom.aiJenaPosePreset.value = normalized.posePreset;
        }
    }
    dom.aiJenaReferencePresetName.value = normalized.name;
    renderAiJenaReferences();
    return normalized;
}

function setAiJenaReferenceStorageStatus(message, error = false) {
    dom.aiJenaReferenceStorageStatus.innerText = message;
    dom.aiJenaReferenceStorageStatus.classList.toggle("error", error);
}

function exportAiJenaReferencePreset() {
    try {
        const preset = makeAiJenaReferencePreset(dom.aiJenaReferencePresetName.value);
        const safeName = preset.name.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 50);
        const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `aiJena_refs_${safeName || Date.now()}.json`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setAiJenaReferenceStorageStatus("참고 세팅 JSON을 내보냈습니다.");
    } catch (error) {
        setAiJenaReferenceStorageStatus("내보내기 실패: " + error.message, true);
    }
}

async function importAiJenaReferencePreset() {
    const file = dom.aiJenaReferenceFileInput.files?.[0];
    dom.aiJenaReferenceFileInput.value = "";
    if (!file) return;
    try {
        const preset = applyAiJenaReferencePreset(JSON.parse(await file.text()));
        setAiJenaReferenceStorageStatus(`“${preset.name}” 세팅을 불러왔습니다.`);
    } catch (error) {
        setAiJenaReferenceStorageStatus("JSON 불러오기 실패: " + error.message, true);
    }
}

async function readAiJenaReferencePresetIndex(db) {
    return new Promise((resolve, reject) => {
        const request = db.transaction("fma_store", "readonly").objectStore("fma_store")
            .get(AI_JENA_REFERENCE_PRESET_INDEX_KEY);
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error);
    });
}

async function writeAiJenaReferenceStore(values) {
    const db = await openFmaDatabase();
    try {
        await new Promise((resolve, reject) => {
            const transaction = db.transaction("fma_store", "readwrite");
            const store = transaction.objectStore("fma_store");
            values.forEach(({ key, value, remove }) => {
                if (remove) store.delete(key);
                else store.put(value, key);
            });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = transaction.onerror;
        });
    } finally {
        db.close();
    }
}

async function refreshAiJenaReferencePresetList(selectedId = "") {
    try {
        const db = await openFmaDatabase();
        let index;
        try { index = await readAiJenaReferencePresetIndex(db); }
        finally { db.close(); }
        dom.aiJenaReferencePresetList.innerHTML = "";
        if (!index.length) {
            dom.aiJenaReferencePresetList.add(new Option("저장된 세팅 없음", ""));
        } else {
            index.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
            dom.aiJenaReferencePresetList.add(new Option("＋ 새 세팅으로 저장", ""));
            index.forEach(entry => {
                const option = new Option(entry.name, entry.id);
                option.dataset.name = entry.name;
                dom.aiJenaReferencePresetList.add(option);
            });
            dom.aiJenaReferencePresetList.value = selectedId || "";
        }
        dom.aiJenaReferencePresetList.onchange();
        return index;
    } catch (error) {
        setAiJenaReferenceStorageStatus("DB 목록을 읽지 못했습니다: " + error.message, true);
        return [];
    }
}

async function saveAiJenaReferencePresetToDb() {
    try {
        const preset = makeAiJenaReferencePreset(dom.aiJenaReferencePresetName.value);
        const existingId = dom.aiJenaReferencePresetList.value;
        const id = existingId || (globalThis.crypto?.randomUUID?.() || `refs-${Date.now()}`);
        const db = await openFmaDatabase();
        let index;
        try { index = await readAiJenaReferencePresetIndex(db); }
        finally { db.close(); }
        const now = new Date().toISOString();
        const summary = { id, name: preset.name, updatedAt: now };
        index = index.filter(entry => entry.id !== id);
        index.push(summary);
        await writeAiJenaReferenceStore([
            { key: AI_JENA_REFERENCE_PRESET_PREFIX + id, value: { ...preset, id, updatedAt: now } },
            { key: AI_JENA_REFERENCE_PRESET_INDEX_KEY, value: index }
        ]);
        await refreshAiJenaReferencePresetList(id);
        setAiJenaReferenceStorageStatus(`“${preset.name}” 세팅을 IndexedDB에 저장했습니다.`);
    } catch (error) {
        setAiJenaReferenceStorageStatus("DB 저장 실패: " + error.message, true);
    }
}

async function loadAiJenaReferencePresetFromDb() {
    const id = dom.aiJenaReferencePresetList.value;
    if (!id) return setAiJenaReferenceStorageStatus("불러올 DB 세팅을 선택하세요.", true);
    try {
        const db = await openFmaDatabase();
        let preset;
        try {
            preset = await new Promise((resolve, reject) => {
                const request = db.transaction("fma_store", "readonly").objectStore("fma_store")
                    .get(AI_JENA_REFERENCE_PRESET_PREFIX + id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } finally { db.close(); }
        if (!preset) throw new Error("저장된 세팅을 찾을 수 없습니다.");
        const loaded = applyAiJenaReferencePreset(preset);
        setAiJenaReferenceStorageStatus(`“${loaded.name}” 세팅을 IndexedDB에서 불러왔습니다.`);
    } catch (error) {
        setAiJenaReferenceStorageStatus("DB 불러오기 실패: " + error.message, true);
    }
}

async function deleteAiJenaReferencePresetFromDb() {
    const id = dom.aiJenaReferencePresetList.value;
    if (!id) return;
    const name = dom.aiJenaReferencePresetList.selectedOptions[0]?.dataset.name || "선택 세팅";
    if (!confirm(`“${name}” 참고 세팅을 IndexedDB에서 삭제할까요?`)) return;
    try {
        const db = await openFmaDatabase();
        let index;
        try { index = await readAiJenaReferencePresetIndex(db); }
        finally { db.close(); }
        index = index.filter(entry => entry.id !== id);
        await writeAiJenaReferenceStore([
            { key: AI_JENA_REFERENCE_PRESET_PREFIX + id, remove: true },
            { key: AI_JENA_REFERENCE_PRESET_INDEX_KEY, value: index }
        ]);
        await refreshAiJenaReferencePresetList();
        setAiJenaReferenceStorageStatus(`“${name}” 세팅을 삭제했습니다.`);
    } catch (error) {
        setAiJenaReferenceStorageStatus("DB 삭제 실패: " + error.message, true);
    }
}

function drawAiJenaSource() {
    const width = aiJenaState.sourceImage?.naturalWidth || 1024;
    const height = aiJenaState.sourceImage?.naturalHeight || 1024;
    [dom.aiJenaCanvas, dom.aiJenaMaskCanvas].forEach(canvas => {
        canvas.width = width;
        canvas.height = height;
    });
    const context = dom.aiJenaCanvas.getContext("2d");
    context.clearRect(0, 0, width, height);
    if (aiJenaState.sourceImage) context.drawImage(aiJenaState.sourceImage, 0, 0, width, height);
    else {
        context.fillStyle = "#101722";
        context.fillRect(0, 0, width, height);
        context.fillStyle = "#7fddff";
        context.font = "bold 40px sans-serif";
        context.textAlign = "center";
        context.fillText("AI Jena Generate", width / 2, height / 2);
    }
    clearAiJenaMask();
}

function applyAiJenaViewportTransform() {
    const transform = `translate(${aiJenaState.panX}px, ${aiJenaState.panY}px) scale(${aiJenaState.zoom})`;
    dom.aiJenaCanvasStack.style.transform = transform;
    dom.aiJenaResultPreview.style.transform = transform;
    dom.btnAiJenaResetZoom.innerText =
        `${Math.round(aiJenaState.zoom * 100)}% · 휠`;
}

function resetAiJenaZoom(event) {
    event?.stopPropagation();
    aiJenaState.zoom = 1;
    aiJenaState.panX = 0;
    aiJenaState.panY = 0;
    aiJenaState.panning = false;
    aiJenaState.panPointerId = null;
    dom.aiJenaStage.classList.remove("panning");
    applyAiJenaViewportTransform();
}

function zoomAiJenaStage(event) {
    if (!aiJenaState.open) return;
    if (event.target.closest?.(".ai-jena-history-panel, .ai-jena-zoom-badge")) return;
    event.preventDefault();
    const oldZoom = aiJenaState.zoom;
    const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
    const nextZoom = Math.max(.25, Math.min(8, oldZoom * factor));
    if (Math.abs(nextZoom - oldZoom) < .001) return;

    const stackRect = dom.aiJenaCanvasStack.getBoundingClientRect();
    const baseCenterX = (stackRect.left + stackRect.right) / 2 - aiJenaState.panX;
    const baseCenterY = (stackRect.top + stackRect.bottom) / 2 - aiJenaState.panY;
    const localX = (event.clientX - baseCenterX - aiJenaState.panX) / oldZoom;
    const localY = (event.clientY - baseCenterY - aiJenaState.panY) / oldZoom;
    aiJenaState.panX = event.clientX - baseCenterX - localX * nextZoom;
    aiJenaState.panY = event.clientY - baseCenterY - localY * nextZoom;
    aiJenaState.zoom = nextZoom;
    applyAiJenaViewportTransform();
}

function beginAiJenaStagePan(event) {
    if (event.button !== 0 || !aiJenaState.open) return;
    if (event.target.closest?.(".ai-jena-history-panel, .ai-jena-zoom-badge")) return;
    // 선택영역 모드의 일반 드래그는 붓/다각형 편집에 양보하고,
    // 이때만 기존 Alt+드래그로 화면을 이동한다.
    if (aiJenaState.mode === "clothes" && !event.altKey) return;
    aiJenaState.panning = true;
    aiJenaState.panPointerId = event.pointerId;
    aiJenaState.panStartX = event.clientX;
    aiJenaState.panStartY = event.clientY;
    aiJenaState.panOriginX = aiJenaState.panX;
    aiJenaState.panOriginY = aiJenaState.panY;
    dom.aiJenaStage.classList.add("panning");
    event.preventDefault();
}

function continueAiJenaStagePan(event) {
    if (!aiJenaState.panning || event.pointerId !== aiJenaState.panPointerId) return;
    aiJenaState.panX = aiJenaState.panOriginX + event.clientX - aiJenaState.panStartX;
    aiJenaState.panY = aiJenaState.panOriginY + event.clientY - aiJenaState.panStartY;
    applyAiJenaViewportTransform();
    event.preventDefault();
}

function endAiJenaStagePan(event) {
    if (!aiJenaState.panning || event.pointerId !== aiJenaState.panPointerId) return;
    aiJenaState.panning = false;
    aiJenaState.panPointerId = null;
    dom.aiJenaStage.classList.remove("panning");
}

function getAiJenaCanvasPoint(event) {
    const rect = dom.aiJenaMaskCanvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * dom.aiJenaMaskCanvas.width / Math.max(1, rect.width),
        y: (event.clientY - rect.top) * dom.aiJenaMaskCanvas.height / Math.max(1, rect.height)
    };
}

function beginAiJenaMaskStroke(event) {
    if (event.altKey || aiJenaState.panning) return;
    if (aiJenaState.mode !== "clothes") return;
    const point = getAiJenaCanvasPoint(event);
    if (aiJenaState.selectionTool === "polygon") {
        if (aiJenaState.completedPolygonPoints.length &&
            isPointInsideAiJenaPolygon(point, aiJenaState.completedPolygonPoints)) {
            aiJenaState.polygonMoving = true;
            aiJenaState.polygonMoveStart = point;
            aiJenaState.polygonMoveOrigin =
                aiJenaState.completedPolygonPoints.map(vertex => ({ ...vertex }));
            dom.aiJenaMaskCanvas.setPointerCapture?.(event.pointerId);
            dom.aiJenaMaskCanvas.style.cursor = "grabbing";
            updateAiJenaSelectionStatus("↔ 선택영역 이동 중…", "moving");
            event.preventDefault();
            return;
        }
        if (aiJenaState.completedPolygonPoints.length) {
            updateAiJenaSelectionStatus(
                "완성된 선택영역 안을 드래그해 이동하거나, 선택영역 지우기로 새 다각형을 시작하세요.",
                "complete"
            );
            event.preventDefault();
            return;
        }
        if (aiJenaState.polygonPoints.length >= 3 &&
            getAiJenaPointDistance(point, aiJenaState.polygonPoints[0]) <=
            getAiJenaPolygonCloseRadius()) {
            finishAiJenaPolygon();
            event.preventDefault();
            return;
        }
        if (!aiJenaState.polygonPoints.length) {
            const context = dom.aiJenaMaskCanvas.getContext("2d");
            aiJenaState.polygonBaseImageData = context.getImageData(
                0, 0, dom.aiJenaMaskCanvas.width, dom.aiJenaMaskCanvas.height
            );
        }
        aiJenaState.polygonPoints.push(point);
        aiJenaState.polygonHoverPoint = point;
        drawAiJenaPolygonPreview();
        updateAiJenaPolygonDrawingStatus();
        event.preventDefault();
        return;
    }
    aiJenaState.drawing = true;
    aiJenaState.lastMaskPoint = point;
    dom.aiJenaMaskCanvas.setPointerCapture?.(event.pointerId);
    paintAiJenaMask(point, point);
}

function continueAiJenaMaskStroke(event) {
    if (event.altKey || aiJenaState.panning) return;
    const point = getAiJenaCanvasPoint(event);
    if (aiJenaState.polygonMoving) {
        moveAiJenaCompletedPolygon(point);
        event.preventDefault();
        return;
    }
    if (aiJenaState.selectionTool === "polygon" && aiJenaState.polygonPoints.length) {
        aiJenaState.polygonHoverPoint = point;
        aiJenaState.polygonNearStart =
            aiJenaState.polygonPoints.length >= 3 &&
            getAiJenaPointDistance(point, aiJenaState.polygonPoints[0]) <=
            getAiJenaPolygonCloseRadius();
        drawAiJenaPolygonPreview();
        updateAiJenaPolygonDrawingStatus();
        dom.aiJenaMaskCanvas.style.cursor =
            aiJenaState.polygonNearStart ? "pointer" : "crosshair";
        return;
    }
    if (!aiJenaState.drawing) return;
    paintAiJenaMask(aiJenaState.lastMaskPoint || point, point);
    aiJenaState.lastMaskPoint = point;
}

function endAiJenaMaskStroke(event) {
    if (aiJenaState.polygonMoving) {
        aiJenaState.polygonMoving = false;
        aiJenaState.polygonMoveStart = null;
        aiJenaState.polygonMoveOrigin = [];
        dom.aiJenaMaskCanvas.style.cursor = "move";
        updateAiJenaSelectionStatus(
            "✓ 다각형 선택 완료 · 내부를 드래그하여 이동할 수 있습니다.",
            "complete"
        );
    }
    aiJenaState.drawing = false;
    aiJenaState.lastMaskPoint = null;
    try {
        dom.aiJenaMaskCanvas.releasePointerCapture?.(event.pointerId);
    } catch (error) {}
}

function paintAiJenaMask(from, point) {
    const context = dom.aiJenaMaskCanvas.getContext("2d");
    context.strokeStyle = `rgba(255, 70, 105, ${aiJenaState.brushOpacity})`;
    context.fillStyle = `rgba(255, 70, 105, ${aiJenaState.brushOpacity})`;
    context.lineWidth = aiJenaState.brushSize;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.beginPath();
    context.arc(point.x, point.y, aiJenaState.brushSize / 2, 0, Math.PI * 2);
    context.fill();
}

function clearAiJenaMask() {
    const canvas = dom.aiJenaMaskCanvas;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    aiJenaState.polygonPoints = [];
    aiJenaState.polygonBaseImageData = null;
    aiJenaState.completedPolygonPoints = [];
    aiJenaState.polygonHoverPoint = null;
    aiJenaState.polygonNearStart = false;
    aiJenaState.polygonMoving = false;
    dom.aiJenaMaskCanvas.style.cursor = "crosshair";
    updateAiJenaSelectionStatus("붓으로 칠하거나 다각형 점을 찍으세요.");
}

function setAiJenaSelectionTool(tool) {
    const nextTool = tool === "polygon" ? "polygon" : "brush";
    if (aiJenaState.selectionTool === "polygon" && nextTool === "brush") {
        if (aiJenaState.completedPolygonPoints.length >= 3) {
            commitAiJenaCompletedPolygonToMask();
        } else if (aiJenaState.polygonBaseImageData) {
            dom.aiJenaMaskCanvas.getContext("2d")
                .putImageData(aiJenaState.polygonBaseImageData, 0, 0);
            aiJenaState.polygonPoints = [];
            aiJenaState.polygonHoverPoint = null;
            aiJenaState.polygonNearStart = false;
            aiJenaState.polygonBaseImageData = null;
        }
    }
    aiJenaState.selectionTool = nextTool;
    document.querySelectorAll(".ai-jena-selection-tool").forEach(button => {
        button.classList.toggle("active", button.dataset.jenaTool === aiJenaState.selectionTool);
    });
    dom.btnAiJenaClosePolygon.style.display =
        aiJenaState.selectionTool === "polygon" ? "block" : "none";
    dom.aiJenaMaskCanvas.style.cursor =
        aiJenaState.selectionTool === "polygon" ? "crosshair" : "crosshair";
    if (aiJenaState.selectionTool === "polygon") {
        updateAiJenaSelectionStatus(
            aiJenaState.completedPolygonPoints.length
                ? "✓ 다각형 선택 완료 · 내부를 드래그하여 이동할 수 있습니다."
                : "점을 3개 이상 찍고 시작점을 다시 누르면 완료됩니다.",
            aiJenaState.completedPolygonPoints.length ? "complete" : ""
        );
    } else {
        updateAiJenaSelectionStatus("이미지 위에 변경할 영역을 붓으로 칠하세요.");
    }
}

function drawAiJenaPolygonPreview() {
    const points = aiJenaState.polygonPoints;
    if (!points.length) return;
    const context = dom.aiJenaMaskCanvas.getContext("2d");
    if (aiJenaState.polygonBaseImageData) {
        context.putImageData(aiJenaState.polygonBaseImageData, 0, 0);
    }
    context.save();
    context.strokeStyle = "#7fddff";
    context.lineWidth = Math.max(2, dom.aiJenaMaskCanvas.width / 500);
    context.setLineDash([10, 7]);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    if (aiJenaState.polygonHoverPoint) {
        context.lineTo(aiJenaState.polygonHoverPoint.x, aiJenaState.polygonHoverPoint.y);
    }
    context.stroke();
    points.forEach((point, index) => {
        const radius = getAiJenaPolygonPointRadius(index === 0 ? 1.18 : 1);
        context.setLineDash([]);
        context.fillStyle = index === 0 ? "#a5ff8a" : "#7fddff";
        context.strokeStyle = "#071018";
        context.lineWidth = Math.max(2, dom.aiJenaMaskCanvas.width / 650);
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = "#071018";
        context.font = `bold ${Math.max(11, radius * 1.35)}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(index + 1), point.x, point.y);
    });
    if (aiJenaState.polygonNearStart) {
        const start = points[0];
        context.strokeStyle = "#fff36f";
        context.lineWidth = Math.max(3, dom.aiJenaMaskCanvas.width / 400);
        context.beginPath();
        context.arc(start.x, start.y, getAiJenaPolygonCloseRadius(), 0, Math.PI * 2);
        context.stroke();
    }
    context.restore();
}

function finishAiJenaPolygon() {
    const points = aiJenaState.polygonPoints;
    if (points.length < 3) {
        alert("다각형은 최소 3개의 점을 선택하세요.");
        return;
    }
    const context = dom.aiJenaMaskCanvas.getContext("2d");
    if (aiJenaState.polygonBaseImageData) {
        context.putImageData(aiJenaState.polygonBaseImageData, 0, 0);
    }
    aiJenaState.completedPolygonPoints = points.map(point => ({ ...point }));
    aiJenaState.polygonPoints = [];
    aiJenaState.polygonHoverPoint = null;
    aiJenaState.polygonNearStart = false;
    renderAiJenaCompletedPolygon();
    dom.aiJenaMaskCanvas.style.cursor = "move";
    updateAiJenaSelectionStatus(
        "✓ 다각형 선택 완료 · 내부를 드래그하여 이동할 수 있습니다.",
        "complete"
    );
}

function renderAiJenaCompletedPolygon() {
    const context = dom.aiJenaMaskCanvas.getContext("2d");
    if (aiJenaState.polygonBaseImageData) {
        context.putImageData(aiJenaState.polygonBaseImageData, 0, 0);
    }
    const points = aiJenaState.completedPolygonPoints;
    if (points.length < 3) return;
    context.save();
    context.fillStyle = `rgba(255, 70, 105, ${aiJenaState.brushOpacity})`;
    context.strokeStyle = "#7fddff";
    context.lineWidth = Math.max(3, dom.aiJenaMaskCanvas.width / 450);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(point => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();
    context.stroke();
    points.forEach((point, index) => {
        const radius = getAiJenaPolygonPointRadius(index === 0 ? 1.18 : 1);
        context.fillStyle = index === 0 ? "#a5ff8a" : "#7fddff";
        context.strokeStyle = "#071018";
        context.lineWidth = Math.max(2, dom.aiJenaMaskCanvas.width / 650);
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    });
    const first = points[0];
    context.fillStyle = "#a5ff8a";
    context.font = `bold ${Math.max(15, getAiJenaPolygonPointRadius() * 1.6)}px sans-serif`;
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText("✓ 닫힘", first.x + getAiJenaPolygonPointRadius(1.4), first.y);
    context.restore();
}

function commitAiJenaCompletedPolygonToMask() {
    const context = dom.aiJenaMaskCanvas.getContext("2d");
    if (aiJenaState.polygonBaseImageData) {
        context.putImageData(aiJenaState.polygonBaseImageData, 0, 0);
    } else {
        context.clearRect(0, 0, dom.aiJenaMaskCanvas.width, dom.aiJenaMaskCanvas.height);
    }
    const points = aiJenaState.completedPolygonPoints;
    if (points.length >= 3) {
        context.save();
        context.fillStyle = `rgba(255, 70, 105, ${aiJenaState.brushOpacity})`;
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(point => context.lineTo(point.x, point.y));
        context.closePath();
        context.fill();
        context.restore();
    }
    aiJenaState.completedPolygonPoints = [];
    aiJenaState.polygonPoints = [];
    aiJenaState.polygonHoverPoint = null;
    aiJenaState.polygonNearStart = false;
    aiJenaState.polygonBaseImageData = null;
}

function moveAiJenaCompletedPolygon(point) {
    const start = aiJenaState.polygonMoveStart;
    const origin = aiJenaState.polygonMoveOrigin;
    if (!start || !origin.length) return;
    let dx = point.x - start.x;
    let dy = point.y - start.y;
    const minX = Math.min(...origin.map(vertex => vertex.x));
    const maxX = Math.max(...origin.map(vertex => vertex.x));
    const minY = Math.min(...origin.map(vertex => vertex.y));
    const maxY = Math.max(...origin.map(vertex => vertex.y));
    dx = Math.max(-minX, Math.min(dom.aiJenaMaskCanvas.width - maxX, dx));
    dy = Math.max(-minY, Math.min(dom.aiJenaMaskCanvas.height - maxY, dy));
    aiJenaState.completedPolygonPoints =
        origin.map(vertex => ({ x: vertex.x + dx, y: vertex.y + dy }));
    renderAiJenaCompletedPolygon();
}

function isPointInsideAiJenaPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i];
        const b = polygon[j];
        const deltaY = b.y - a.y;
        const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
            point.x < (b.x - a.x) * (point.y - a.y) /
            (Math.abs(deltaY) < .000001 ? .000001 : deltaY) + a.x;
        if (intersects) inside = !inside;
    }
    return inside;
}

function getAiJenaPointDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function getAiJenaPolygonPointRadius(multiplier = 1) {
    const rect = dom.aiJenaMaskCanvas.getBoundingClientRect();
    return Math.max(7, 10 * dom.aiJenaMaskCanvas.width / Math.max(1, rect.width)) * multiplier;
}

function getAiJenaPolygonCloseRadius() {
    return getAiJenaPolygonPointRadius(2.2);
}

function updateAiJenaPolygonDrawingStatus() {
    const count = aiJenaState.polygonPoints.length;
    if (aiJenaState.polygonNearStart) {
        updateAiJenaSelectionStatus(
            "● 시작점과 연결됩니다 · 클릭하면 다각형 선택이 완료됩니다.",
            "closing"
        );
    } else {
        updateAiJenaSelectionStatus(
            `${count}개 점 선택 · ${count < 3 ? "최소 3개 점이 필요합니다." : "시작점(1번)을 클릭해 닫으세요."}`
        );
    }
}

function updateAiJenaSelectionStatus(message, state = "") {
    if (!dom.aiJenaSelectionStatus) return;
    dom.aiJenaSelectionStatus.innerText = message;
    dom.aiJenaSelectionStatus.classList.toggle("complete", state === "complete");
    dom.aiJenaSelectionStatus.classList.toggle("closing", state === "closing");
    dom.aiJenaSelectionStatus.classList.toggle("moving", state === "moving");
}

function hasAiJenaSelection() {
    if (!dom.aiJenaUseSelection.checked) return false;
    const cleanSelection = createAiJenaCleanSelectionCanvas();
    const context = cleanSelection.getContext("2d");
    const pixels = context.getImageData(
        0, 0, cleanSelection.width, cleanSelection.height
    ).data;
    for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) return true;
    }
    return false;
}

function buildAiJenaPrompt(userPrompt) {
    const safeguards =
        " Preserve the person's identity, facial features, body proportions, image framing, and all " +
        "details that the request does not explicitly ask to change. Return only the edited/generated image.";
    const selectionActive = aiJenaState.mode === "clothes" && hasAiJenaSelection();
    if (selectionActive) {
        return "The first image is the original and the second image is a selection mask. " +
            "Modify ONLY pixels inside the white/selected mask according to this request: " +
            userPrompt +
            ". Use the surrounding background, perspective, lighting, shadows, texture and nearby objects as context " +
            "so the generated content fits naturally. Preserve every unselected pixel, identity, face, pose and framing exactly. " +
            "Blend the mask boundary seamlessly without changing outside pixels. Return only the edited image.";
    }
    const prefix = {
        edit: "Edit the provided image according to this request: ",
        clothes:
            "A selection mask is required. Modify only that selected region using its surrounding visual context. Request: ",
        pose:
            "Change the full-body pose according to the request while preserving identity, clothing design, " +
            "background, lighting and overall visual style. Request: ",
        tryon:
            "Perform a realistic virtual try-on. Use the clothing reference image as the garment design and fit reference, " +
            "while preserving the main person's identity, anatomy, pose unless a pose reference is supplied, and scene lighting. Request: ",
        generate:
            "Generate a new high-quality image according to this request. If a reference image is provided, " +
            "use it only as the requested identity/style reference: "
    }[aiJenaState.mode];
    return prefix + userPrompt + safeguards;
}

function createAiJenaSelectionMaskPayload() {
    const overlay = dom.aiJenaMaskCanvas;
    const mask = document.createElement("canvas");
    mask.width = overlay.width;
    mask.height = overlay.height;
    const context = mask.getContext("2d");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, mask.width, mask.height);
    const cleanSelection = createAiJenaCleanSelectionCanvas();
    const cleanContext = cleanSelection.getContext("2d");
    const data = cleanContext.getImageData(0, 0, overlay.width, overlay.height);
    const pixels = data.data;
    const maskData = context.getImageData(0, 0, mask.width, mask.height);
    for (let index = 0; index < pixels.length; index += 4) {
        const selected = pixels[index + 3];
        maskData.data[index] = selected;
        maskData.data[index + 1] = selected;
        maskData.data[index + 2] = selected;
        maskData.data[index + 3] = 255;
    }
    context.putImageData(maskData, 0, 0);
    return {
        mimeType: "image/png",
        data: mask.toDataURL("image/png").split(",")[1]
    };
}

function createAiJenaCleanSelectionCanvas() {
    const overlay = dom.aiJenaMaskCanvas;
    const cleanSelection = document.createElement("canvas");
    cleanSelection.width = overlay.width;
    cleanSelection.height = overlay.height;
    const cleanContext = cleanSelection.getContext("2d");
    if (aiJenaState.polygonBaseImageData) {
        cleanContext.putImageData(aiJenaState.polygonBaseImageData, 0, 0);
    } else {
        cleanContext.drawImage(overlay, 0, 0);
    }
    if (aiJenaState.completedPolygonPoints.length >= 3) {
        const points = aiJenaState.completedPolygonPoints;
        cleanContext.fillStyle = `rgba(255, 70, 105, ${aiJenaState.brushOpacity})`;
        cleanContext.beginPath();
        cleanContext.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(point => cleanContext.lineTo(point.x, point.y));
        cleanContext.closePath();
        cleanContext.fill();
    }
    return cleanSelection;
}

async function runAiJena() {
    const prompt = dom.aiJenaPrompt.value.trim();
    if (!prompt || aiJenaState.processing) {
        if (!prompt) alert("이미지 수정 또는 생성 프롬프트를 입력하세요.");
        return;
    }
    if (!["generate", "video"].includes(aiJenaState.mode) && !aiJenaState.sourceItem) {
        alert("먼저 FMA Viewer에서 수정할 이미지를 선택하세요.");
        return;
    }
    if (aiJenaState.mode === "clothes" && !hasAiJenaSelection()) {
        alert("선택영역 수정은 붓 또는 다각형으로 바꿀 영역을 먼저 선택하세요.");
        return;
    }
    if (aiJenaState.mode === "tryon" && !aiJenaState.references.clothing) {
        alert("Try-on을 실행하려면 왼쪽 참고 이미지에서 옷 이미지를 먼저 올리세요.");
        return;
    }
    aiJenaState.processing = true;
    aiJenaState.abortController = new AbortController();
    dom.btnRunAiJena.disabled = true;
    dom.btnStopAiJena.style.display = "inline-block";
    startAiJenaProgress(aiJenaState.mode === "video");
    appendAiJenaMessage("user", prompt);
    try {
        if (aiJenaState.mode === "video") {
            const result = await requestAiJenaVideo(prompt, aiJenaState.abortController.signal);
            showAiJenaVideoResult(result);
            await addAiJenaVideoHistoryResult(result, prompt);
            finishAiJenaProgress(100, "요청하신대로 영상 생성을 완료했습니다.");
            appendAiJenaMessage("assistant", "Veo 영상 생성이 완료되어 히스토리에 기록했습니다. 중앙에서 재생하거나 갤러리에 저장할 수 있습니다.");
            return;
        }
        const result = await requestAiJenaImage(
            buildAiJenaPrompt(prompt),
            aiJenaState.abortController.signal
        );
        aiJenaState.resultSrc = result.src;
        aiJenaState.resultMimeType = result.mimeType;
        // IndexedDB 히스토리 저장이 오래 걸리더라도 생성 결과는 즉시 보여준다.
        dom.aiJenaResultPreview.src = result.src;
        dom.aiJenaResultPreview.style.display = "block";
        dom.aiJenaResultPreview.alt = "AI Jena 생성 결과";
        await addAiJenaHistoryResult(result, prompt);
        finishAiJenaProgress(100, "요청하신대로 이미지 생성을 완료했습니다.");
        appendAiJenaMessage(
            "assistant",
            "이미지 결과를 히스토리에 저장했습니다. 선택한 결과에서 계속 수정하거나 갤러리로 보낼 수 있습니다."
        );
    } catch (error) {
        if (error.name === "AbortError") {
            const videoStopped = aiJenaState.mode === "video";
            finishAiJenaProgress(0, videoStopped
                ? "Veo 영상 상태 확인을 정지했습니다."
                : "사용자가 AI 작업을 정지했습니다.");
            appendAiJenaMessage("assistant", videoStopped
                ? "브라우저의 Veo 요청 조회를 정지했습니다. 이미 제출된 영상 작업은 Google 서버에서 계속 처리될 수 있습니다."
                : "작업이 정지되었습니다.");
        } else {
            console.error("AI Jena error:", error);
            finishAiJenaProgress(0, "AI 처리 실패");
            appendAiJenaMessage("assistant", "오류: " + error.message);
        }
    } finally {
        aiJenaState.processing = false;
        aiJenaState.abortController = null;
        dom.btnRunAiJena.disabled = false;
        dom.btnStopAiJena.style.display = "none";
    }
}

function setAiJenaProgress(percent, message) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    aiJenaState.progress = value;
    dom.aiJenaProgressText.innerText = message || "요청하신대로 생성하는 중입니다.";
    dom.aiJenaProgressBar.style.width = `${value}%`;
    dom.aiJenaProgressPercent.innerText = `${Math.round(value)}%`;
    dom.aiJenaProgressBar.parentElement?.setAttribute("aria-valuenow", String(Math.round(value)));
}

function startAiJenaProgress(isVideo = false) {
    clearInterval(aiJenaState.progressTimer);
    setAiJenaProgress(isVideo ? 3 : 6, isVideo
        ? "Veo가 요청하신 영상을 생성하는 중입니다. 잠시 기다려 주세요."
        : "요청하신대로 생성하는 중입니다.");
    aiJenaState.progressTimer = window.setInterval(() => {
        const current = aiJenaState.progress;
        const increment = isVideo ? (current < 35 ? 2 : current < 70 ? 1 : .25) : (current < 35 ? 7 : current < 70 ? 3 : 1);
        setAiJenaProgress(Math.min(92, current + increment), isVideo
            ? "Veo가 요청하신 영상을 생성하는 중입니다. 잠시 기다려 주세요."
            : "요청하신대로 생성하는 중입니다.");
    }, isVideo ? 2500 : 850);
}

function finishAiJenaProgress(percent, message) {
    clearInterval(aiJenaState.progressTimer);
    aiJenaState.progressTimer = null;
    setAiJenaProgress(percent, message);
}

async function requestAiJenaImage(prompt, signal) {
    const apiKey = getUsableAiStudioApiKey();
    if (!apiKey) throw new Error("AI Studio API 키가 없거나 사용이 중지되어 있습니다.");
    const input = [];
    if (aiJenaState.sourceItem) {
        const payload = await getAiImagePayload(aiJenaState.sourceItem);
        input.push({ type: "image", mime_type: payload.mimeType, data: payload.data });
    }
    if (aiJenaState.mode === "clothes" && hasAiJenaSelection()) {
        const mask = createAiJenaSelectionMaskPayload();
        input.push({ type: "image", mime_type: mask.mimeType, data: mask.data });
    }
    const referenceLabels = {
        face: "FACE REFERENCE: preserve or adapt the person's facial identity from this image as requested.",
        clothing: "CLOTHING REFERENCE: use this exact garment design, material, colors and details for virtual try-on.",
        background: "BACKGROUND REFERENCE: use this scene, lighting and atmosphere as the requested background reference.",
        pose: "POSE REFERENCE: match this body pose and camera geometry while preserving the main person's identity."
    };
    for (const role of ["face", "clothing", "background", "pose"]) {
        const reference = aiJenaState.references[role];
        if (!reference?.src) continue;
        const data = reference.src.split(",")[1] || "";
        input.push({ type: "text", text: referenceLabels[role] });
        input.push({ type: "image", mime_type: reference.mimeType, data });
    }
    input.push({ type: "text", text: prompt });
    const response = await fetch(AI_UPSCALE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal,
        body: JSON.stringify({
            model: AI_UPSCALE_MODEL,
            input,
            response_format: {
                type: "image",
                mime_type: "image/jpeg",
                image_size: getAiUpscaleResolution()
            }
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error?.message || `Google API 요청 실패 (${response.status})`);
    }
    const image = findGeneratedImageBlock(data);
    if (!image) throw new Error("Google API 응답에 이미지가 없습니다.");
    return {
        src: `data:${image.mimeType || "image/jpeg"};base64,${image.data}`,
        mimeType: image.mimeType || "image/jpeg"
    };
}

async function requestAiJenaVideo(prompt, signal) {
    const apiKey = getUsableAiStudioApiKey();
    if (!apiKey) throw new Error("AI Studio API 키가 없거나 사용이 중지되어 있습니다.");
    const model = dom.aiJenaVideoModel.value || "veo-3.1-generate-preview";
    const instance = { prompt };
    if (dom.aiJenaVideoUseSource.checked && aiJenaState.sourceItem) {
        const payload = await getAiImagePayload(aiJenaState.sourceItem);
        if (!payload?.data) throw new Error("Veo 첫 프레임 이미지를 읽지 못했습니다.");
        // Veo predictLongRunning uses the Image wire format produced by the
        // official Google Gen AI SDK: bytesBase64Encoded + mimeType.
        // This endpoint does not accept Gemini Content.Part's inlineData wrapper.
        instance.image = {
            bytesBase64Encoded: payload.data,
            mimeType: payload.mimeType || "image/jpeg"
        };
    }
    const parameters = buildAiJenaVideoParameters(model, Boolean(instance.image));
    const startResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            signal,
            body: JSON.stringify({
                instances: [instance],
                parameters
            })
        }
    );
    const operation = await startResponse.json().catch(() => ({}));
    if (!startResponse.ok) {
        throw normalizeAiJenaVideoError(operation?.error?.message || `Veo 요청 실패 (${startResponse.status})`);
    }
    if (!operation.name) throw new Error("Veo 작업 번호를 받지 못했습니다.");
    aiJenaState.videoOperationName = operation.name;
    appendAiJenaMessage("assistant", "Veo 영상 작업을 시작했습니다. 생성이 끝날 때까지 진행 상태를 확인합니다.");
    let current = operation;
    while (!current.done) {
        await waitForAiJenaVideoPoll(10000, signal);
        const statusResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${current.name}`,
            { headers: { "x-goog-api-key": apiKey }, signal }
        );
        current = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) {
            throw normalizeAiJenaVideoError(current?.error?.message || `Veo 상태 조회 실패 (${statusResponse.status})`);
        }
        if (current.error) throw normalizeAiJenaVideoError(current.error.message || "Veo 영상 생성에 실패했습니다.");
    }
    const videoUri = current?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
        || current?.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("Veo 응답에 생성된 영상 주소가 없습니다.");
    setAiJenaProgress(96, "생성된 영상 파일을 불러오는 중입니다.");
    const videoResponse = await fetch(videoUri, {
        headers: { "x-goog-api-key": apiKey },
        signal
    });
    if (!videoResponse.ok) throw new Error(`생성 영상 다운로드 실패 (${videoResponse.status})`);
    const blob = await videoResponse.blob();
    return { blob, url: URL.createObjectURL(blob), model };
}

function buildAiJenaVideoParameters(model, usesSourceImage) {
    const durationSeconds = getAiJenaVideoDuration();
    const parameters = {
        aspectRatio: dom.aiJenaVideoAspect.value || "16:9",
        durationSeconds,
        resolution: "720p",
        personGeneration: usesSourceImage ? "allow_adult" : "allow_all"
    };
    // Veo 3/3.1은 요청당 결과가 한 개로 고정되어 있으며, 일부 백엔드는
    // numberOfVideos를 명시하면 지원하지 않는 필드로 거부한다. 따라서 전송하지 않는다.
    if (String(model).includes("lite") && parameters.resolution === "4k") {
        parameters.resolution = "1080p";
    }
    Object.keys(parameters).forEach(key => {
        if (parameters[key] === undefined || parameters[key] === null || parameters[key] === "") {
            delete parameters[key];
        }
    });
    return parameters;
}

function getAiJenaVideoDuration() {
    const duration = Number(dom.aiJenaVideoDuration?.value ?? 8);
    if (!Number.isFinite(duration) || ![4, 6, 8].includes(duration)) {
        throw new Error("Veo 영상 시간은 4초, 6초 또는 8초로 입력해 주세요.");
    }
    localStorage.setItem("fmaAiJenaVideoDuration", String(duration));
    return duration;
}

function normalizeAiJenaVideoDuration(value, fallback = 8) {
    const duration = Number(value);
    return Number.isFinite(duration) && [4, 6, 8].includes(duration)
        ? duration
        : fallback;
}

function normalizeAiJenaVideoError(error) {
    const message = String(error?.message || error || "알 수 없는 오류");
    if (/numberOfVideos/i.test(message)) {
        return new Error("선택한 Veo 모델이 동영상 개수 설정을 거부했습니다. 호환 설정으로 다시 시도해 주세요.");
    }
    if (/inlineData/i.test(message)) {
        return new Error("선택한 Veo 모델이 현재 미디어 전달 형식을 지원하지 않습니다. 첫 프레임 사용을 해제하거나 다른 Veo 모델로 시도해 주세요.");
    }
    if (/durationSeconds/i.test(message) && /number/i.test(message)) {
        return new Error("Veo 영상 길이 값이 올바른 숫자가 아닙니다. 4초, 6초 또는 8초로 다시 시도해 주세요.");
    }
    if (/API.?key|API_KEY_INVALID|invalid.*key/i.test(message)) {
        return new Error("AI Studio API 키가 올바르지 않거나 사용할 수 없습니다.");
    }
    if (/permission|PERMISSION_DENIED|\b403\b/i.test(message)) {
        return new Error("이 API 키 또는 Google Cloud 프로젝트에 Veo 사용 권한이 없습니다.");
    }
    if (/quota|RESOURCE_EXHAUSTED|\b429\b/i.test(message)) {
        return new Error("Veo API 할당량 또는 결제 한도를 초과했습니다.");
    }
    if (/safety|blocked|policy/i.test(message)) {
        return new Error("안전 필터 또는 콘텐츠 정책으로 영상 생성이 차단되었습니다.");
    }
    return new Error(`Veo 생성 오류: ${message}`);
}

function waitForAiJenaVideoPoll(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = window.setTimeout(done, milliseconds);
        signal?.addEventListener("abort", abort, { once: true });
        function done() {
            signal?.removeEventListener("abort", abort);
            resolve();
        }
        function abort() {
            window.clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        }
    });
}

function showAiJenaVideoResult(result) {
    clearAiJenaVideoResult();
    aiJenaState.videoResultBlob = result.blob;
    aiJenaState.videoResultUrl = result.url;
    dom.aiJenaResultPreview.style.display = "none";
    dom.aiJenaCanvasStack.style.visibility = "hidden";
    dom.aiJenaVideoPreview.src = result.url;
    dom.aiJenaVideoPreview.style.display = "block";
    dom.btnDownloadAiJenaVideo.style.display = "inline-block";
    dom.btnAddAiJenaResult.style.display = "inline-block";
    dom.btnAddAiJenaResult.disabled = false;
    dom.btnAddAiJenaResult.innerText = "갤러리에 영상 저장";
    dom.aiJenaVideoPreview.play().catch(() => {});
}

function clearAiJenaVideoResult() {
    dom.aiJenaVideoPreview?.pause();
    if (dom.aiJenaVideoPreview) {
        dom.aiJenaVideoPreview.removeAttribute("src");
        dom.aiJenaVideoPreview.load();
        dom.aiJenaVideoPreview.style.display = "none";
    }
    if (aiJenaState.videoResultUrl) URL.revokeObjectURL(aiJenaState.videoResultUrl);
    aiJenaState.videoResultUrl = "";
    aiJenaState.videoResultBlob = null;
    aiJenaState.videoOperationName = "";
    if (dom.aiJenaCanvasStack) dom.aiJenaCanvasStack.style.visibility = "visible";
    if (dom.btnDownloadAiJenaVideo) dom.btnDownloadAiJenaVideo.style.display = "none";
    if (dom.btnAddAiJenaResult && aiJenaState.mode === "video") {
        dom.btnAddAiJenaResult.disabled = true;
    }
}

function downloadAiJenaVideo() {
    if (!aiJenaState.videoResultUrl) return;
    const link = document.createElement("a");
    link.href = aiJenaState.videoResultUrl;
    link.download = `ai-jena-veo-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showAiJenaNotice("Veo 영상 다운로드를 시작했습니다.");
}

function stopAiJena() {
    aiJenaState.abortController?.abort();
}

function appendAiJenaMessage(role, text) {
    const message = document.createElement("div");
    message.className = `ai-jena-message ${role}`;
    message.innerText = text;
    dom.aiJenaChatHistory.appendChild(message);
    dom.aiJenaChatHistory.scrollTop = dom.aiJenaChatHistory.scrollHeight;
}

function showAiJenaNotice(message) {
    if (!dom.aiJenaNotice) return;
    clearTimeout(aiJenaNoticeTimer);
    dom.aiJenaNotice.innerText = message;
    dom.aiJenaNotice.classList.add("show");
    aiJenaNoticeTimer = window.setTimeout(() => {
        dom.aiJenaNotice.classList.remove("show");
    }, 2800);
}

function resetAiJenaHistory() {
    aiJenaState.history = [];
    aiJenaState.activeHistoryIndex = -1;
    dom.aiJenaHistoryList.innerHTML = "";
    dom.aiJenaHistoryCount.innerText = "0";
}

async function addAiJenaOriginalHistoryEntry(item) {
    if (!item?.src) return;
    aiJenaState.history.push({
        id: `original-${Date.now()}`,
        src: item.src,
        mimeType: item.mimeType || "image/png",
        path: item.path || "original",
        label: "원본",
        prompt: "",
        mode: "original",
        original: true,
        createdAt: Date.now()
    });
    aiJenaState.activeHistoryIndex = 0;
    await persistAiJenaHistorySession();
    renderAiJenaHistory();
}

async function addAiJenaHistoryResult(result, prompt) {
    const generatedCount = aiJenaState.history.filter(entry => !entry.original).length + 1;
    aiJenaState.history.push({
        id: `result-${Date.now()}-${generatedCount}`,
        src: result.src,
        mimeType: result.mimeType || "image/jpeg",
        path: `ai-jena-history-${generatedCount}`,
        label: `생성 ${generatedCount}`,
        prompt,
        mode: aiJenaState.mode,
        original: false,
        createdAt: Date.now()
    });
    await persistAiJenaHistorySession();
    renderAiJenaHistory();
    await selectAiJenaHistoryEntry(aiJenaState.history.length - 1, false);
}

async function addAiJenaVideoHistoryResult(result, prompt) {
    const generatedCount = aiJenaState.history.filter(entry => entry.mediaType === "video").length + 1;
    const historyUrl = URL.createObjectURL(result.blob);
    aiJenaState.history.push({
        id: `video-${Date.now()}-${generatedCount}`,
        src: historyUrl,
        videoBlob: result.blob,
        mimeType: result.blob.type || "video/mp4",
        mediaType: "video",
        path: `ai-jena-video-${generatedCount}.mp4`,
        label: `영상 ${generatedCount}`,
        prompt,
        mode: "video",
        original: false,
        createdAt: Date.now()
    });
    aiJenaState.activeHistoryIndex = aiJenaState.history.length - 1;
    await persistAiJenaHistorySession();
    renderAiJenaHistory();
}

async function persistAiJenaHistorySession() {
    if (!aiJenaState.historySessionKey) return;
    const history = aiJenaState.history.map(entry => ({ ...entry }));
    aiJenaHistorySessions.set(aiJenaState.historySessionKey, history);
    try {
        const db = await openFmaDatabase();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction("fma_store", "readwrite");
            transaction.objectStore("fma_store").put(
                {
                    sessionKey: aiJenaState.historySessionKey,
                    updatedAt: Date.now(),
                    history
                },
                AI_JENA_HISTORY_DB_PREFIX + aiJenaState.historySessionKey
            );
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        db.close();
    } catch (error) {
        console.warn("AI Jena history persistence failed:", error);
    }
}

async function loadAiJenaHistorySession(sessionKey) {
    if (!sessionKey) return null;
    if (aiJenaHistorySessions.has(sessionKey)) {
        return aiJenaHistorySessions.get(sessionKey).map(entry => ({ ...entry }));
    }
    try {
        const db = await openFmaDatabase();
        const stored = await new Promise((resolve, reject) => {
            const transaction = db.transaction("fma_store", "readonly");
            const request = transaction.objectStore("fma_store")
                .get(AI_JENA_HISTORY_DB_PREFIX + sessionKey);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        if (!stored || !Array.isArray(stored.history)) return null;
        const history = stored.history.map(entry => ({
            ...entry,
            src: entry.mediaType === "video" && entry.videoBlob
                ? URL.createObjectURL(entry.videoBlob) : entry.src
        }));
        aiJenaHistorySessions.set(sessionKey, history);
        return history;
    } catch (error) {
        console.warn("AI Jena history restore failed:", error);
        return null;
    }
}

function renderAiJenaHistory() {
    dom.aiJenaHistoryList.innerHTML = "";
    dom.aiJenaHistoryCount.innerText = String(aiJenaState.history.length);
    dom.btnClearAiJenaHistory.disabled = aiJenaState.history.length === 0;
    dom.btnSendAllAiJenaHistory.disabled = aiJenaState.history.length === 0 || aiJenaState.saving;
    if (!aiJenaState.history.length) {
        const empty = document.createElement("div");
        empty.className = "ai-jena-history-empty";
        empty.innerText = "저장된 작업이 없습니다.";
        dom.aiJenaHistoryList.appendChild(empty);
    }
    aiJenaState.history.forEach((entry, index) => {
        const wrapper = document.createElement("div");
        wrapper.className = "ai-jena-history-entry";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ai-jena-history-item";
        button.classList.toggle("active", index === aiJenaState.activeHistoryIndex);
        button.title = entry.original
            ? "원본 이미지에서 다시 편집"
            : `${entry.label} 결과에서 편집 계속하기`;
        const image = document.createElement(entry.mediaType === "video" ? "video" : "img");
        image.src = entry.src;
        if (image.tagName === "VIDEO") {
            image.muted = true;
            image.playsInline = true;
            image.preload = "metadata";
        } else image.alt = entry.label;
        const label = document.createElement("span");
        label.innerText = entry.label;
        button.append(image, label);
        button.onclick = () => selectAiJenaHistoryEntry(index, true);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ai-jena-history-delete";
        remove.innerText = "×";
        remove.title = `${entry.label} 히스토리 삭제`;
        remove.setAttribute("aria-label", `${entry.label} 히스토리 삭제`);
        remove.onclick = event => {
            event.stopPropagation();
            deleteAiJenaHistoryEntry(index);
        };
        wrapper.append(button, remove);
        const actions = document.createElement("div");
        actions.className = "ai-jena-history-actions";
        const galleryButton = document.createElement("button");
        galleryButton.type = "button";
        galleryButton.className = "ai-jena-history-send";
        galleryButton.innerText = "To 갤러리";
        galleryButton.title = `${entry.label}을 새 ${entry.mediaType === "video" ? "영상" : "이미지"}으로 갤러리에 넣기`;
        galleryButton.onclick = event => {
            event.stopPropagation();
            sendAiJenaHistoryToGallery(index);
        };
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "ai-jena-history-edit";
        editButton.innerText = "Edit";
        editButton.title = `${entry.label}을 이미지 편집기로 가져가기`;
        editButton.onclick = event => {
            event.stopPropagation();
            openAiJenaHistoryInEditor(index);
        };
        const cropButton = document.createElement("button");
        cropButton.type = "button";
        cropButton.className = "ai-jena-history-crop";
        cropButton.innerText = "Crop";
        cropButton.title = `${entry.label}을 Crop으로 가져가기`;
        cropButton.onclick = event => {
            event.stopPropagation();
            openAiJenaHistoryInCrop(index);
        };
        const bgrButton = document.createElement("button");
        bgrButton.type = "button";
        bgrButton.className = "ai-jena-history-bgr";
        bgrButton.innerText = "BGR";
        bgrButton.title = `${entry.label}을 배경 제거로 가져가기`;
        bgrButton.onclick = event => {
            event.stopPropagation();
            openAiJenaHistoryInBackgroundRemove(index);
        };
        actions.appendChild(galleryButton);
        if (entry.mediaType !== "video") actions.append(editButton, cropButton, bgrButton);
        if (entry.original && entry.mediaType !== "video") {
            const replaceButton = document.createElement("button");
            replaceButton.type = "button";
            replaceButton.className = "ai-jena-history-replace";
            replaceButton.innerText = "원본 교체";
            replaceButton.title = "FMA 갤러리에서 다른 원본 이미지를 선택합니다.";
            replaceButton.onclick = event => {
                event.stopPropagation();
                openAiJenaFmaPicker("source");
            };
            actions.appendChild(replaceButton);
        }
        wrapper.appendChild(actions);
        dom.aiJenaHistoryList.appendChild(wrapper);
    });
    const active = dom.aiJenaHistoryList.querySelector(".active");
    active?.scrollIntoView({ block: "nearest" });
}

async function createGalleryImageFromAiJenaHistory(entry, ordinal) {
    if (entry.mediaType === "video") {
        const blob = entry.videoBlob || await fetch(entry.src).then(response => response.blob());
        const sequence = Math.max(1, Number(ordinal) || 1);
        let path = `ai-jena-video-history-${sequence}.mp4`;
        let suffix = sequence;
        while (images.some(item => item.path === path)) path = `ai-jena-video-history-${++suffix}.mp4`;
        const item = {
            src: URL.createObjectURL(blob),
            path,
            group: "ai-jena-video",
            date: Date.now(),
            size: blob.size,
            mimeType: blob.type || entry.mimeType || "video/mp4",
            mediaType: "video",
            isFav: false,
            metadata: { title: entry.label, description: entry.prompt || "" },
            aiJenaInfo: { mode: "video", prompt: entry.prompt || "", historyId: entry.id }
        };
        images.push(item);
        return images.length - 1;
    }
    const resultImage = await loadUpscaleImage(entry.src);
    const source = images[aiJenaState.sourceIndex] || images[currentIndex] || null;
    const baseName = String(entry.path || source?.path || "ai-jena-history")
        .replace(/\.ai_jena_\d+$/i, "");
    let sequence = Math.max(1, Number(ordinal) || 1);
    let resultPath = `${baseName}.ai_jena_history_${sequence}`;
    while (images.some(item => item.path === resultPath)) {
        sequence += 1;
        resultPath = `${baseName}.ai_jena_history_${sequence}`;
    }
    const item = {
        src: entry.src,
        path: resultPath,
        group: "ai-jena",
        date: Date.now(),
        size: estimateDataUrlBytes(entry.src),
        mimeType: entry.mimeType || "image/jpeg",
        isFav: false,
        aiJenaInfo: {
            mode: entry.mode || "history",
            prompt: entry.prompt || "",
            historyId: entry.id,
            savedAsNewImage: true
        }
    };
    applyDerivedImageMetadata(
        item,
        source || item,
        resultImage.naturalWidth,
        resultImage.naturalHeight,
        "AI Jena History"
    );
    images.push(item);
    return images.length - 1;
}

async function sendAiJenaHistoryToGallery(index) {
    const entry = aiJenaState.history[index];
    if (!entry || aiJenaState.saving) return;
    aiJenaState.saving = true;
    renderAiJenaHistory();
    try {
        const resultIndex = await createGalleryImageFromAiJenaHistory(entry, index + 1);
        renderGallery();
        renderFavorites();
        dom.imageCount.innerText = "Images: " + images.length;
        await saveCurrentImagesToDB();
        const message = `${entry.label}을 새 ${entry.mediaType === "video" ? "영상" : "이미지"}으로 갤러리에 추가했습니다.`;
        appendAiJenaMessage("assistant", message);
        showAiJenaNotice(message);
        showImage(resultIndex);
    } catch (error) {
        console.error("AI Jena history gallery save failed:", error);
        alert("히스토리를 갤러리에 넣지 못했습니다: " + error.message);
    } finally {
        aiJenaState.saving = false;
        renderAiJenaHistory();
    }
}

async function sendAllAiJenaHistoryToGallery() {
    if (!aiJenaState.history.length || aiJenaState.saving) return;
    if (!confirm(`히스토리 ${aiJenaState.history.length}개를 모두 새 미디어로 갤러리에 넣을까요?`)) return;
    aiJenaState.saving = true;
    renderAiJenaHistory();
    try {
        let lastIndex = -1;
        for (let index = 0; index < aiJenaState.history.length; index += 1) {
            lastIndex = await createGalleryImageFromAiJenaHistory(aiJenaState.history[index], index + 1);
        }
        renderGallery();
        renderFavorites();
        dom.imageCount.innerText = "Images: " + images.length;
        await saveCurrentImagesToDB();
        appendAiJenaMessage(
            "assistant",
            `히스토리 ${aiJenaState.history.length}개를 각각 새 미디어로 갤러리에 넣었습니다.`
        );
        showAiJenaNotice(`히스토리 ${aiJenaState.history.length}개를 갤러리에 추가했습니다.`);
        if (lastIndex >= 0) showImage(lastIndex);
    } catch (error) {
        console.error("AI Jena all history gallery save failed:", error);
        alert("히스토리 전체를 갤러리에 넣지 못했습니다: " + error.message);
    } finally {
        aiJenaState.saving = false;
        renderAiJenaHistory();
    }
}

async function openAiJenaHistoryInEditor(index) {
    return openAiJenaHistoryInTool(index, "edit");
}

async function openAiJenaHistoryInCrop(index) {
    return openAiJenaHistoryInTool(index, "crop");
}

async function openAiJenaHistoryInBackgroundRemove(index) {
    return openAiJenaHistoryInTool(index, "bgr");
}

async function openAiJenaHistoryInTool(index, tool) {
    const entry = aiJenaState.history[index];
    if (!entry || entry.mediaType === "video" || aiJenaState.saving) return;
    const openTool = tool === "crop"
        ? (typeof openCropEditor === "function" ? openCropEditor : null)
        : tool === "bgr"
            ? (typeof openBackgroundRemoveEditor === "function"
                ? targetIndex => openBackgroundRemoveEditor(targetIndex, "local") : null)
            : (typeof openImageEditor === "function" ? openImageEditor : null);
    if (!openTool) return;
    aiJenaState.saving = true;
    renderAiJenaHistory();
    try {
        const resultIndex = await createGalleryImageFromAiJenaHistory(entry, index + 1);
        renderGallery();
        renderFavorites();
        dom.imageCount.innerText = "Images: " + images.length;
        await saveCurrentImagesToDB();
        const keepAiJenaOpen = tool === "crop" || tool === "bgr";
        if (keepAiJenaOpen) {
            const childModal = tool === "crop" ? dom.cropModal : dom.bgRemoveModal;
            childModal?.classList.add("ai-jena-child-workspace");
        } else {
            closeAiJena();
        }
        await openTool(resultIndex);
    } catch (error) {
        console.error(`AI Jena history ${tool} transfer failed:`, error);
        alert(`히스토리 이미지를 ${tool === "bgr" ? "BGR" : tool === "crop" ? "Crop" : "Edit"}로 가져오지 못했습니다: ${error.message}`);
    } finally {
        aiJenaState.saving = false;
        if (aiJenaState.open) renderAiJenaHistory();
    }
}

async function deleteAiJenaHistoryEntry(index) {
    if (aiJenaState.processing) return;
    const entry = aiJenaState.history[index];
    if (!entry || !confirm(`"${entry.label}" 히스토리를 지울까요?`)) return;
    const wasActive = index === aiJenaState.activeHistoryIndex;
    aiJenaState.history.splice(index, 1);
    if (index < aiJenaState.activeHistoryIndex) aiJenaState.activeHistoryIndex -= 1;
    else if (wasActive) aiJenaState.activeHistoryIndex = -1;
    await persistAiJenaHistorySession();
    renderAiJenaHistory();
    if (wasActive && aiJenaState.history.length) {
        await selectAiJenaHistoryEntry(
            Math.min(index, aiJenaState.history.length - 1),
            false
        );
    }
}

async function clearAllAiJenaHistory() {
    if (aiJenaState.processing || !aiJenaState.history.length) return;
    if (!confirm("AI Jena 히스토리를 모두 지울까요? 이 작업은 되돌릴 수 없습니다.")) return;
    aiJenaState.history = [];
    aiJenaState.activeHistoryIndex = -1;
    await persistAiJenaHistorySession();
    renderAiJenaHistory();
}

async function selectAiJenaHistoryEntry(index, announce = true) {
    const entry = aiJenaState.history[index];
    if (!entry || aiJenaState.processing) return;
    try {
        if (entry.mediaType === "video") {
            const blob = entry.videoBlob || await fetch(entry.src).then(response => response.blob());
            aiJenaState.activeHistoryIndex = index;
            setAiJenaMode("video");
            showAiJenaVideoResult({ blob, url: URL.createObjectURL(blob), model: "history" });
            renderAiJenaHistory();
            if (entry.prompt) dom.aiJenaPrompt.value = entry.prompt;
            if (announce) appendAiJenaMessage("assistant", `${entry.label}을 다시 재생합니다.`);
            return;
        }
        const image = await loadUpscaleImage(entry.src);
        aiJenaState.activeHistoryIndex = index;
        aiJenaState.sourceImage = image;
        aiJenaState.sourceItem = {
            src: entry.src,
            path: entry.path,
            mimeType: entry.mimeType
        };
        aiJenaState.resultSrc = entry.original ? "" : entry.src;
        aiJenaState.resultMimeType = entry.mimeType;
        dom.btnAddAiJenaResult.disabled = entry.original;
        dom.aiJenaResultPreview.style.display = "none";
        drawAiJenaSource();
        renderAiJenaHistory();
        if (entry.prompt) dom.aiJenaPrompt.value = entry.prompt;
        if (announce) {
            appendAiJenaMessage(
                "assistant",
                `${entry.label} 시점으로 이동했습니다. 이 이미지를 기준으로 편집을 계속할 수 있습니다.`
            );
        }
    } catch (error) {
        console.error("AI Jena history selection failed:", error);
        alert("선택한 AI 히스토리 이미지를 불러오지 못했습니다.");
    }
}

async function addAiJenaResult() {
    if (aiJenaState.mode === "video") {
        await saveAiJenaVideoToGallery();
        return;
    }
    if (!aiJenaState.resultSrc || aiJenaState.saving) return;
    const canReplace = aiJenaState.sourceIndex >= 0 && Boolean(images[aiJenaState.sourceIndex]);
    dom.btnAiJenaReplace.disabled = !canReplace;
    dom.btnAiJenaReplace.title = canReplace
        ? "현재 원본 이미지를 AI 결과로 대체합니다."
        : "대체할 원본 이미지가 없어 새 이미지 생성만 사용할 수 있습니다.";
    dom.aiJenaSaveChoice.style.display = "flex";
    dom.btnAiJenaNew.focus();
}

async function saveAiJenaVideoToGallery() {
    if (!aiJenaState.videoResultBlob || aiJenaState.saving) return;
    aiJenaState.saving = true;
    dom.btnAddAiJenaResult.disabled = true;
    try {
        const count = images.filter(item => isVideoMedia(item) && item.group === "ai-jena-video").length + 1;
        const blob = aiJenaState.videoResultBlob;
        const item = {
            src: URL.createObjectURL(blob),
            path: `ai-jena-video-${Date.now()}-${count}.mp4`,
            group: "ai-jena-video",
            date: Date.now(),
            size: blob.size,
            mimeType: blob.type || "video/mp4",
            mediaType: "video",
            isFav: false,
            metadata: { title: `AI Jena 영상 ${count}`, description: dom.aiJenaPrompt.value.trim() },
            aiJenaInfo: { mode: "video", prompt: dom.aiJenaPrompt.value.trim() }
        };
        images.push(item);
        renderGallery();
        renderFavorites();
        dom.imageCount.innerText = `Media: ${images.length}`;
        await saveCurrentImagesToDB(true);
        showAiJenaNotice("생성된 영상을 갤러리에 저장했습니다.");
        appendAiJenaMessage("assistant", "생성된 영상을 영상 그룹에 저장했습니다.");
        await showImage(images.length - 1);
    } catch (error) {
        console.error("AI Jena video gallery save failed:", error);
        alert("영상을 갤러리에 저장하지 못했습니다: " + error.message);
    } finally {
        aiJenaState.saving = false;
        dom.btnAddAiJenaResult.disabled = false;
    }
}

function closeAiJenaSaveChoice() {
    if (dom.aiJenaSaveChoice) dom.aiJenaSaveChoice.style.display = "none";
}

async function saveAiJenaResult(saveMode) {
    if (!aiJenaState.resultSrc || aiJenaState.saving) return;
    aiJenaState.saving = true;
    dom.btnAiJenaReplace.disabled = true;
    dom.btnAiJenaNew.disabled = true;
    try {
        const source = images[aiJenaState.sourceIndex] || images[currentIndex] || null;
        const resultImage = await loadUpscaleImage(aiJenaState.resultSrc);
        const count = images.filter(item => item.group === "ai-jena").length + 1;
        const aiJenaInfo = {
            mode: aiJenaState.mode,
            prompt: dom.aiJenaPrompt.value.trim()
        };
        let resultIndex;
        if (saveMode === "replace" && source) {
            source.src = aiJenaState.resultSrc;
            source.createdAt = source.createdAt || source.date || Date.now();
            source.modifiedAt = Date.now();
            source.size = estimateDataUrlBytes(aiJenaState.resultSrc);
            source.mimeType = aiJenaState.resultMimeType;
            source.aiJenaInfo = aiJenaInfo;
            applyDerivedImageMetadata(
                source,
                source,
                resultImage.naturalWidth,
                resultImage.naturalHeight,
                "AI Jena"
            );
            resultIndex = images.indexOf(source);
        } else {
            const basePath = source?.path || "generated";
            let resultPath = `${basePath}.ai_jena_${count}`;
            let uniqueNumber = count;
            while (images.some(item => item.path === resultPath)) {
                uniqueNumber += 1;
                resultPath = `${basePath}.ai_jena_${uniqueNumber}`;
            }
            const item = {
                src: aiJenaState.resultSrc,
                path: resultPath,
                group: "ai-jena",
                date: Date.now(),
                size: estimateDataUrlBytes(aiJenaState.resultSrc),
                mimeType: aiJenaState.resultMimeType,
                isFav: false,
                aiJenaInfo
            };
            applyDerivedImageMetadata(
                item,
                source || item,
                resultImage.naturalWidth,
                resultImage.naturalHeight,
                "AI Jena"
            );
            resultIndex = source ? Math.max(0, images.indexOf(source)) + 1 : images.length;
            images.splice(resultIndex, 0, item);
        }
        renderGallery();
        renderFavorites();
        dom.imageCount.innerText = "Images: " + images.length;
        await saveCurrentImagesToDB();
        closeAiJena();
        showImage(Math.max(0, resultIndex));
    } catch (error) {
        console.error("AI Jena gallery save failed:", error);
        alert("AI Jena 결과를 갤러리에 저장하지 못했습니다: " + error.message);
    } finally {
        aiJenaState.saving = false;
        dom.btnAiJenaNew.disabled = false;
        dom.btnAiJenaReplace.disabled =
            !(aiJenaState.sourceIndex >= 0 && Boolean(images[aiJenaState.sourceIndex]));
    }
}

document.addEventListener("DOMContentLoaded", initAiJenaFeature);
