/* =======================================================
   Browser Video Trim & Tone Editor
   ======================================================= */

var videoEditorState = {
    index: -1,
    duration: 0,
    resultBlob: null,
    resultUrl: "",
    resultCommitted: false,
    rendering: false,
    renderToken: 0,
    rangeSeeking: false
};

var videoEditorPresets = {
    original: { brightness: 100, contrast: 100, saturation: 100, hue: 0, sepia: 0 },
    warm: { brightness: 108, contrast: 103, saturation: 116, hue: -5, sepia: 14 },
    moody: { brightness: 84, contrast: 122, saturation: 78, hue: -9, sepia: 7 },
    pastel: { brightness: 112, contrast: 88, saturation: 86, hue: 3, sepia: 5 },
    bw: { brightness: 104, contrast: 116, saturation: 0, hue: 0, sepia: 0 }
};

function getVideoEditorElements() {
    return {
        modal: document.getElementById("videoEditorModal"),
        preview: document.getElementById("videoEditorPreview"),
        start: document.getElementById("videoTrimStart"),
        end: document.getElementById("videoTrimEnd"),
        startValue: document.getElementById("videoTrimStartValue"),
        endValue: document.getElementById("videoTrimEndValue"),
        selectionText: document.getElementById("videoEditorSelectionText"),
        durationText: document.getElementById("videoEditorDurationText"),
        timeline: document.getElementById("videoEditorTimeline"),
        timelineSelection: document.getElementById("videoEditorTimelineSelection"),
        timelinePlayhead: document.getElementById("videoEditorTimelinePlayhead"),
        progress: document.getElementById("videoEditorProgress"),
        progressBar: document.getElementById("videoEditorProgressBar"),
        progressPercent: document.getElementById("videoEditorProgressPercent"),
        run: document.getElementById("btnRenderVideoEdit"),
        stop: document.getElementById("btnStopVideoRender"),
        saveChoice: document.getElementById("videoEditorSaveChoice"),
        resultPreview: document.getElementById("videoEditorResultPreview")
    };
}

function getVideoTrimRange() {
    const el = getVideoEditorElements();
    const duration = Math.max(0, Number(videoEditorState.duration) || 0);
    const start = Math.max(0, Math.min(duration, Number(el.start?.value) || 0));
    const endValue = Number(el.end?.value);
    const end = Math.max(start, Math.min(duration, Number.isFinite(endValue) ? endValue : duration));
    return { start, end, duration };
}

function updateVideoTimeline() {
    const el = getVideoEditorElements();
    if (!el.timeline || !el.timelineSelection || !el.timelinePlayhead) return;
    const { start, end, duration } = getVideoTrimRange();
    const startPercent = duration ? (start / duration) * 100 : 0;
    const endPercent = duration ? (end / duration) * 100 : 100;
    const current = Math.max(start, Math.min(end, Number(el.preview?.currentTime) || start));
    const currentPercent = duration ? (current / duration) * 100 : 0;
    el.timelineSelection.style.left = `${startPercent}%`;
    el.timelineSelection.style.width = `${Math.max(0, endPercent - startPercent)}%`;
    el.timelinePlayhead.style.left = `${currentPercent}%`;
    el.timeline.setAttribute("aria-valuemax", String(duration));
    el.timeline.setAttribute("aria-valuenow", String(current));
    el.timeline.setAttribute("aria-valuetext", `${formatVideoEditorTime(current)}, 선택 구간 ${formatVideoEditorTime(start)}부터 ${formatVideoEditorTime(end)}까지`);
}

function seekVideoInsideTrim(time) {
    const el = getVideoEditorElements();
    const { start, end } = getVideoTrimRange();
    const target = Math.max(start, Math.min(end, Number(time) || start));
    videoEditorState.rangeSeeking = true;
    el.preview.currentTime = target;
    window.setTimeout(() => { videoEditorState.rangeSeeking = false; }, 0);
    updateVideoTimeline();
}

function formatVideoEditorTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const remainder = value - minutes * 60;
    return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function getVideoFilterValues() {
    const values = {};
    document.querySelectorAll("[data-video-filter]").forEach(input => {
        values[input.dataset.videoFilter] = Number(input.value);
    });
    return values;
}

function getVideoFilterCss() {
    const v = getVideoFilterValues();
    return `brightness(${v.brightness}%) contrast(${v.contrast}%) saturate(${v.saturation}%) hue-rotate(${v.hue}deg) sepia(${v.sepia}%)`;
}

function applyVideoPreviewFilter() {
    const el = getVideoEditorElements();
    el.preview.style.filter = getVideoFilterCss();
    document.querySelectorAll("[data-video-filter]").forEach(input => {
        const output = document.querySelector(`[data-video-output="${input.dataset.videoFilter}"]`);
        if (output) output.value = input.dataset.videoFilter === "hue" ? `${input.value}°` : input.value;
    });
}

function applyVideoTonePreset(name) {
    const preset = videoEditorPresets[name] || videoEditorPresets.original;
    Object.entries(preset).forEach(([key, value]) => {
        const input = document.querySelector(`[data-video-filter="${key}"]`);
        if (input) input.value = String(value);
    });
    document.querySelectorAll("[data-video-preset]").forEach(button => {
        button.classList.toggle("active", button.dataset.videoPreset === name);
    });
    applyVideoPreviewFilter();
}

function updateVideoTrimUi(changedControl) {
    const el = getVideoEditorElements();
    const gap = Math.min(0.1, Math.max(0.01, videoEditorState.duration / 100));
    let start = Number(el.start.value) || 0;
    let end = Number(el.end.value) || videoEditorState.duration;
    if (end - start < gap) {
        if (changedControl === "start") start = Math.max(0, end - gap);
        else end = Math.min(videoEditorState.duration, start + gap);
    }
    el.start.value = String(start);
    el.end.value = String(end);
    el.startValue.value = `${start.toFixed(2)}초`;
    el.endValue.value = `${end.toFixed(2)}초`;
    el.selectionText.textContent = `${formatVideoEditorTime(start)} — ${formatVideoEditorTime(end)}`;
    el.durationText.textContent = `선택 길이 ${(end - start).toFixed(2)}초`;
    if (!videoEditorState.rendering) {
        const current = Number(el.preview.currentTime) || 0;
        if (current < start || current > end) seekVideoInsideTrim(start);
    }
    updateVideoTimeline();
}

function resetVideoTrim() {
    const el = getVideoEditorElements();
    el.start.value = "0";
    el.end.value = String(videoEditorState.duration);
    updateVideoTrimUi();
    el.preview.currentTime = 0;
    updateVideoTimeline();
}

async function openVideoEditor(index) {
    const item = images[index];
    if (!item || !isVideoMedia(item)) return;
    if (typeof ensureImageOriginalLoaded === "function") await ensureImageOriginalLoaded(index);
    closeVideoEditor(true);
    const el = getVideoEditorElements();
    videoEditorState.index = index;
    videoEditorState.resultCommitted = false;
    el.modal.style.display = "flex";
    el.saveChoice.hidden = true;
    el.preview.src = item.src;
    el.preview.style.filter = "none";
    el.preview.load();
    el.preview.onloadedmetadata = () => {
        const duration = Number(el.preview.duration);
        if (!Number.isFinite(duration) || duration <= 0) {
            alert("동영상 길이를 읽지 못했습니다. MP4/WebM/MOV 파일을 다시 확인해 주세요.");
            return;
        }
        videoEditorState.duration = duration;
        el.start.max = String(duration);
        el.end.max = String(duration);
        resetVideoTrim();
        applyVideoTonePreset("original");
        updateVideoTimeline();
    };
}

function closeVideoEditor(force) {
    if (videoEditorState.rendering && !force) {
        stopVideoEditorRender();
        return;
    }
    const el = getVideoEditorElements();
    if (el.preview) {
        el.preview.pause();
        el.preview.removeAttribute("src");
        el.preview.load();
    }
    if (videoEditorState.resultUrl && !videoEditorState.resultCommitted) {
        URL.revokeObjectURL(videoEditorState.resultUrl);
    }
    videoEditorState.index = -1;
    videoEditorState.duration = 0;
    videoEditorState.resultBlob = null;
    videoEditorState.resultUrl = "";
    videoEditorState.resultCommitted = false;
    videoEditorState.rendering = false;
    if (el.modal) el.modal.style.display = "none";
}

function setVideoRenderProgress(percent, message) {
    const el = getVideoEditorElements();
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    el.progress.hidden = false;
    el.progressBar.style.width = `${value}%`;
    el.progressPercent.textContent = `${value}%`;
    const text = el.progress.querySelector(".video-editor-progress-message");
    if (message && text) text.textContent = message;
}

function stopVideoEditorRender() {
    if (!videoEditorState.rendering) return;
    videoEditorState.renderToken += 1;
    videoEditorState.rendering = false;
    const el = getVideoEditorElements();
    el.preview.pause();
    el.run.disabled = false;
    el.stop.hidden = true;
    setVideoRenderProgress(0, "영상 편집을 중지했습니다.");
}

function getSupportedVideoRecorderMimeType() {
    const candidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm"
    ];
    return candidates.find(type => window.MediaRecorder?.isTypeSupported(type)) || "";
}

function waitForVideoSeek(video, time) {
    return new Promise((resolve, reject) => {
        if (video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.02) {
            resolve();
            return;
        }
        const timer = setTimeout(() => reject(new Error("선택한 시작 위치로 이동하지 못했습니다.")), 8000);
        video.addEventListener("seeked", () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
        video.currentTime = time;
    });
}

async function renderVideoEdit() {
    if (videoEditorState.rendering) return;
    const el = getVideoEditorElements();
    const video = el.preview;
    const start = Number(el.start.value);
    const end = Number(el.end.value);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        alert("영상 시작과 끝 구간을 올바르게 지정해 주세요.");
        return;
    }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
        alert("이 브라우저는 영상 편집 저장 기능을 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용해 주세요.");
        return;
    }

    if (videoEditorState.resultUrl && !videoEditorState.resultCommitted) URL.revokeObjectURL(videoEditorState.resultUrl);
    videoEditorState.resultUrl = "";
    videoEditorState.resultBlob = null;
    videoEditorState.resultCommitted = false;
    videoEditorState.rendering = true;
    const token = ++videoEditorState.renderToken;
    el.run.disabled = true;
    el.stop.hidden = false;
    setVideoRenderProgress(0, "요청하신 영상으로 편집하는 중입니다.");

    try {
        await waitForVideoSeek(video, start);
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { alpha: false });
        const outputStream = canvas.captureStream(30);
        const sourceCapture = typeof video.captureStream === "function" ? video.captureStream() :
            (typeof video.mozCaptureStream === "function" ? video.mozCaptureStream() : null);
        sourceCapture?.getAudioTracks().forEach(track => outputStream.addTrack(track));
        const mimeType = getSupportedVideoRecorderMimeType();
        const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
        const chunks = [];
        recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
        const stopped = new Promise((resolve, reject) => {
            recorder.onstop = resolve;
            recorder.onerror = event => reject(event.error || new Error("영상 인코딩에 실패했습니다."));
        });
        recorder.start(250);
        video.muted = true;
        await video.play();

        await new Promise(resolve => {
            const drawFrame = () => {
                if (token !== videoEditorState.renderToken || !videoEditorState.rendering || video.currentTime >= end || video.ended) {
                    video.pause();
                    if (recorder.state !== "inactive") recorder.stop();
                    resolve();
                    return;
                }
                context.save();
                context.filter = getVideoFilterCss();
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                context.restore();
                setVideoRenderProgress(((video.currentTime - start) / (end - start)) * 96);
                requestAnimationFrame(drawFrame);
            };
            drawFrame();
        });
        await stopped;
        video.muted = false;
        if (token !== videoEditorState.renderToken || !videoEditorState.rendering) return;
        if (!chunks.length) throw new Error("편집된 영상 데이터가 생성되지 않았습니다.");
        const blob = new Blob(chunks, { type: mimeType || "video/webm" });
        videoEditorState.resultBlob = blob;
        videoEditorState.resultUrl = URL.createObjectURL(blob);
        el.resultPreview.src = videoEditorState.resultUrl;
        el.resultPreview.load();
        el.saveChoice.hidden = false;
        setVideoRenderProgress(100, "편집 영상을 만들었습니다. 저장 방법을 선택해 주세요.");
    } catch (error) {
        console.error("Video edit failed:", error);
        alert("동영상 편집 중 오류가 발생했습니다: " + error.message);
        setVideoRenderProgress(0, "영상 편집에 실패했습니다.");
    } finally {
        if (token === videoEditorState.renderToken) {
            videoEditorState.rendering = false;
            el.run.disabled = false;
            el.stop.hidden = true;
        }
    }
}

function createEditedVideoItem(original, blob, src) {
    const originalTitle = original.metadata?.title || original.path?.split(/[\\/]/).pop() || "video";
    const history = Array.isArray(original.metadata?.processingHistory) ? original.metadata.processingHistory.slice() : [];
    history.push({ type: "video-edit", date: new Date().toISOString(), filters: getVideoFilterValues() });
    return {
        ...original,
        dbRecordId: undefined,
        dbBlobId: undefined,
        src,
        path: `$.added.${originalTitle.replace(/\.[^.]+$/, "")}_edited_${Date.now()}.webm`,
        group: "video-edited",
        date: Date.now(),
        size: blob.size,
        mimeType: blob.type || "video/webm",
        mediaType: "video",
        isFav: false,
        metadata: {
            ...(original.metadata || {}),
            title: `${originalTitle.replace(/\.[^.]+$/, "")} 편집 영상`,
            processingHistory: history
        }
    };
}

async function saveVideoEditorResult(mode) {
    const stateIndex = videoEditorState.index;
    const original = images[stateIndex];
    if (!original || !videoEditorState.resultBlob || !videoEditorState.resultUrl) return;
    const item = createEditedVideoItem(original, videoEditorState.resultBlob, videoEditorState.resultUrl);
    let targetIndex = stateIndex;
    if (mode === "replace") {
        item.isFav = original.isFav;
        images[stateIndex] = item;
    } else {
        images.push(item);
        targetIndex = images.length - 1;
    }
    videoEditorState.resultCommitted = true;
    renderGallery();
    if (dom.imageCount) dom.imageCount.innerText = "Media: " + images.length;
    currentIndex = targetIndex;
    await saveCurrentImagesToDB(true);
    await showImage(targetIndex);
    if (typeof updateImportStatus === "function") {
        updateImportStatus(mode === "replace" ? "원본 영상을 편집 영상으로 대체했습니다." : "편집 영상을 갤러리에 새로 추가했습니다.");
    }
    closeVideoEditor(true);
}

(function bindVideoEditorEvents() {
    const el = getVideoEditorElements();
    if (!el.modal) return;
    document.getElementById("btnVideoEditorClose").onclick = () => closeVideoEditor();
    document.getElementById("btnVideoEditorCancel").onclick = () => closeVideoEditor();
    document.getElementById("btnVideoTrimReset").onclick = resetVideoTrim;
    document.getElementById("btnVideoToneReset").onclick = () => applyVideoTonePreset("original");
    document.getElementById("btnPreviewVideoSelection").onclick = async () => {
        await waitForVideoSeek(el.preview, Number(el.start.value));
        await el.preview.play();
    };
    el.preview.addEventListener("play", () => {
        if (videoEditorState.rendering) return;
        const { start, end } = getVideoTrimRange();
        if (el.preview.currentTime < start || el.preview.currentTime >= end - 0.02) {
            seekVideoInsideTrim(start);
        }
    });
    el.preview.addEventListener("timeupdate", () => {
        if (!videoEditorState.rendering) {
            const { start, end } = getVideoTrimRange();
            if (el.preview.currentTime < start - 0.02) seekVideoInsideTrim(start);
            if (el.preview.currentTime >= end - 0.015) {
                el.preview.pause();
                seekVideoInsideTrim(start);
            }
        }
        updateVideoTimeline();
    });
    el.preview.addEventListener("seeking", () => {
        if (videoEditorState.rendering || videoEditorState.rangeSeeking) return;
        const { start, end } = getVideoTrimRange();
        if (el.preview.currentTime < start) seekVideoInsideTrim(start);
        else if (el.preview.currentTime > end) seekVideoInsideTrim(end);
    });
    el.preview.addEventListener("ended", () => {
        if (!videoEditorState.rendering) seekVideoInsideTrim(getVideoTrimRange().start);
    });
    el.timeline?.addEventListener("pointerdown", event => {
        if (!videoEditorState.duration) return;
        const rect = el.timeline.querySelector(".video-editor-timeline-track").getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        seekVideoInsideTrim(ratio * videoEditorState.duration);
    });
    el.timeline?.addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        seekVideoInsideTrim((Number(el.preview.currentTime) || 0) + direction * 0.1);
    });
    el.start.addEventListener("input", () => updateVideoTrimUi("start"));
    el.end.addEventListener("input", () => updateVideoTrimUi("end"));
    document.querySelectorAll("[data-video-filter]").forEach(input => input.addEventListener("input", () => {
        document.querySelectorAll("[data-video-preset]").forEach(button => button.classList.remove("active"));
        applyVideoPreviewFilter();
    }));
    document.querySelectorAll("[data-video-preset]").forEach(button => {
        button.onclick = () => applyVideoTonePreset(button.dataset.videoPreset);
    });
    el.run.onclick = renderVideoEdit;
    el.stop.onclick = stopVideoEditorRender;
    document.getElementById("btnVideoChoiceBack").onclick = () => { el.saveChoice.hidden = true; };
    document.getElementById("btnVideoReplace").onclick = () => saveVideoEditorResult("replace");
    document.getElementById("btnVideoNew").onclick = () => saveVideoEditorResult("new");
})();
