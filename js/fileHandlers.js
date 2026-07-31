/* =======================================================
   File Handling & Data Logic
   ======================================================= */

function loadFMA(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            saveToDB(data);
            processFMAData(data);
        } catch (err) {
            alert("파일 형식이 잘못되었습니다.");
        }
    };
    reader.readAsText(file);
}

async function processFMAData(data) {
    images = [];
    showLoading("Extracting Data...");
    try {
        const exportedImages = Array.isArray(data?.images)
            ? data.images.filter(item => item && typeof item.src === "string" && item.src.startsWith("data:image"))
            : [];

        if (exportedImages.length > 0) {
            const fallbackDate = Date.parse(data.timestamp) || Date.now();
            images = exportedImages.map((item, index) => ({
                src: item.src,
                path: item.path || `$.images[${index}].src`,
                group: item.group || groupFromPath(item.path),
                date: item.date || fallbackDate,
                size: item.size || item.src.length,
                mimeType: item.mimeType || String(item.src).match(/^data:([^;,]+)/)?.[1] || "",
                isFav: Boolean(item.isFav),
                width: item.width,
                height: item.height,
                modifiedAt: item.modifiedAt,
                metadata: item.metadata || {},
                embeddedMetadata: item.embeddedMetadata || {},
                embeddedMetadataScanned: Boolean(item.embeddedMetadataScanned),
                cropSourcePath: item.cropSourcePath,
                cropRect: item.cropRect,
                upscaleSourcePath: item.upscaleSourcePath,
                upscaleMethod: item.upscaleMethod,
                upscaleInfo: item.upscaleInfo,
                backgroundRemoveSourcePath: item.backgroundRemoveSourcePath,
                backgroundRemoveMethod: item.backgroundRemoveMethod,
                backgroundRemoveInfo: item.backgroundRemoveInfo,
                imageEditParentPath: item.imageEditParentPath,
                imageEditSourceSrc: item.imageEditSourceSrc,
                imageEditConfig: item.imageEditConfig,
                imageEditInfo: item.imageEditInfo
            }));
        } else {
            await walkAsync(data, "$");
        }
    } catch (err) {
        console.warn("Minor extraction error (continuing):", err);
    } finally {
        try {
            if (images.length > 0) {
                renderGallery();
                if (dom.imageCount) dom.imageCount.innerText = "Images: " + images.length;
                if (dom.btnRestore) dom.btnRestore.style.display = "inline-block";
                if (typeof showImage === 'function') showImage(0);
            } else {
                alert("이미지 데이터를 찾을 수 없습니다.");
            }
        } catch (uiErr) {
            console.error("UI Update error:", uiErr);
        }
        updateLoading(100);
        setTimeout(hideLoading, 500);
    }
}

async function walkAsync(obj, path) {
    const stack = [{ o: obj, p: path }];
    let processed = 0;

    while (stack.length > 0) {
        try {
            const item = stack.pop();
            const o = item.o;
            const p = item.p;
            if (o == null) continue;

            if (typeof o === "string") {
                if (o.startsWith("data:image")) {
                    images.push({
                        src: o,
                        path: p,
                        group: groupFromPath(p),
                        date: Date.now(),
                        size: o.length,
                        mimeType: String(o).match(/^data:([^;,]+)/)?.[1] || "",
                        isFav: false
                    });
                }
            } else if (Array.isArray(o)) {
                for (let i = o.length - 1; i >= 0; i--) {
                    stack.push({ o: o[i], p: p + "[" + i + "]" });
                }
            } else if (typeof o === "object") {
                // 일반 객체인지 확인 (keys 호출 시 에러 방지)
                const keys = Object.keys(o);
                for (let i = keys.length - 1; i >= 0; i--) {
                    const key = keys[i];
                    stack.push({ o: o[key], p: p + "." + key });
                }
            }
        } catch (innerErr) {
            // 개별 아이템 처리 중 에러가 나더라도 전체 작업은 계속합니다.
            console.warn("Item skip due to error:", innerErr);
        }

        processed++;
        if (processed % 100 === 0) {
            const progress = Math.min(99, (processed / (processed + stack.length)) * 100);
            updateLoading(progress);
            await new Promise(r => setTimeout(r, 0));
        }
    }
}

function groupFromPath(p) {
    const s = String(p).toLowerCase();
    if (s.includes("face")) return "face";
    if (s.includes("tryon")) return "try-on";
    if (s.includes("ghost")) return "ghost";
    if (s.includes("history")) return "history";
    return "other";
}

async function handleAddImages(files) {
    files = files.filter(isImageFile);
    if (files.length === 0) return;

    const total = files.length;
    let current = 0;
    showLoading(`Importing ${total} Images...`);

    const readers = files.map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                images.push({
                    src: e.target.result,
                    path: "$.added." + file.name,
                    group: "added",
                    date: file.lastModified || Date.now(),
                    size: file.size,
                    mimeType: file.type,
                    isFav: false
                });
                current++;
                updateLoading((current / total) * 100);
                resolve();
            };
            reader.readAsDataURL(file);
        });
    });
    await Promise.all(readers);
    renderGallery();
    dom.imageCount.innerText = "Images: " + images.length;
    saveCurrentImagesToDB();
    updateImportStatus(`${total}개 이미지를 추가했습니다.`);
    hideLoading();
}

async function handleImportFiles(files) {
    const imageFiles = files.filter(isImageFile);
    const zipFiles = files.filter(file =>
        file.name.toLowerCase().endsWith(".zip") ||
        file.type === "application/zip" ||
        file.type === "application/x-zip-compressed"
    );

    if (imageFiles.length > 0) await handleAddImages(imageFiles);
    for (const zipFile of zipFiles) await handleAddZip(zipFile);

    if (imageFiles.length === 0 && zipFiles.length === 0) {
        updateImportStatus("지원되는 이미지 또는 ZIP 파일이 아닙니다.", true);
    }
}

function isImageFile(file) {
    return Boolean(file) && (
        String(file.type || "").startsWith("image/") ||
        /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(file.name || "")
    );
}

async function handleAddZip(file) {
    if (typeof JSZip === "undefined") {
        alert("ZIP 처리 모듈을 불러오지 못했습니다.");
        return;
    }

    showLoading(`ZIP 열기: ${file.name}`);
    try {
        const zip = await JSZip.loadAsync(file);
        const imageEntries = Object.values(zip.files).filter(entry =>
            !entry.dir && /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(entry.name)
        );

        if (imageEntries.length === 0) {
            updateImportStatus(`${file.name}에 이미지가 없습니다.`, true);
            return;
        }

        const extractedFiles = [];
        for (let index = 0; index < imageEntries.length; index++) {
            const entry = imageEntries[index];
            const blob = await entry.async("blob");
            const type = getMimeTypeFromName(entry.name);
            extractedFiles.push(new File([blob], entry.name, {
                type: type,
                lastModified: file.lastModified || Date.now()
            }));
            updateLoading(((index + 1) / imageEntries.length) * 100);
        }

        await handleAddImages(extractedFiles);
        updateImportStatus(`${file.name}에서 ${extractedFiles.length}개 이미지를 추가했습니다.`);
    } catch (error) {
        console.error("ZIP import error:", error);
        updateImportStatus("ZIP 파일을 열 수 없습니다.", true);
        alert("ZIP 이미지 추가 중 오류가 발생했습니다: " + error.message);
    } finally {
        hideLoading();
    }
}

function getMimeTypeFromName(name) {
    const extension = String(name).split(".").pop().toLowerCase();
    const mimeTypes = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        gif: "image/gif",
        bmp: "image/bmp",
        svg: "image/svg+xml",
        avif: "image/avif"
    };
    return mimeTypes[extension] || "application/octet-stream";
}

async function importClipboardImages() {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") {
        updateImportStatus("이 영역에서 Ctrl+V를 눌러 이미지를 붙여넣으세요.");
        return;
    }

    try {
        const clipboardItems = await navigator.clipboard.read();
        const files = [];
        for (const item of clipboardItems) {
            const imageType = item.types.find(type => type.startsWith("image/"));
            if (!imageType) continue;
            const blob = await item.getType(imageType);
            const extension = imageType.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
            files.push(new File(
                [blob],
                `clipboard_${Date.now()}_${files.length + 1}.${extension}`,
                { type: imageType, lastModified: Date.now() }
            ));
        }

        if (files.length === 0) {
            updateImportStatus("클립보드에서 이미지를 찾지 못했습니다.", true);
            return;
        }
        await handleAddImages(files);
    } catch (error) {
        console.warn("Clipboard read failed:", error);
        updateImportStatus("Ctrl+V를 눌러 클립보드 이미지를 붙여넣으세요.", true);
    }
}

function handlePasteEvent(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const files = items
        .filter(item => item.kind === "file" && item.type.startsWith("image/"))
        .map(item => item.getAsFile())
        .filter(Boolean);

    if (files.length === 0) return;
    event.preventDefault();
    handleAddImages(files);
}

function updateImportStatus(message, isError) {
    if (!dom.importStatus) return;
    dom.importStatus.innerText = message;
    dom.importStatus.classList.toggle("error", Boolean(isError));
}

function openExternal(src) {
    const win = window.open();
    win.document.write(`<img src="${src}" style="max-width:100%">`);
}

function downloadCurrentImage() {
    if (!images[currentIndex]) return;
    const a = document.createElement("a");
    a.href = images[currentIndex].src;
    a.download = `image_${currentIndex}.png`;
    a.click();
}

async function downloadAllAsZIP() {
    if (images.length === 0) return;

    const total = images.length;
    showLoading(`준비 중... (총 ${total}장)`);

    try {
        const zip = new JSZip();
        for (let i = 0; i < total; i++) {
            const img = images[i];
            const parts = img.src.split(",");
            if (parts.length > 1) {
                const base64 = parts[1];
                zip.file(`image_${i}.png`, base64, { base64: true });
            }

            if (i % 20 === 0) {
                updateLoading((i / total) * 40);
                await new Promise(r => setTimeout(r, 0));
            }
        }

        showLoading("압축 파일 생성 중...");
        const blob = await zip.generateAsync({ type: "blob" }, (metadata) => {
            updateLoading(40 + (metadata.percent * 0.6));
        });

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `images_export_${Date.now()}.zip`;
        a.click();
        updateLoading(100);
    } catch (err) {
        console.error("ZIP error:", err);
        alert("ZIP 생성 중 오류가 발생했습니다.");
    } finally {
        setTimeout(hideLoading, 500);
    }
}

function saveFMA() {
    if (images.length === 0) {
        alert("저장할 데이터가 없습니다.");
        return;
    }

    showLoading("FMA 파일 생성 중...");

    // 대용량 처리를 위해 타임아웃을 주어 UI 업데이트 허용
    setTimeout(() => {
        try {
            const output = {
                version: "2.0_Exported",
                timestamp: new Date().toISOString(),
                images: images.map(img => ({
                    path: img.path,
                    src: img.src,
                    group: img.group,
                    date: img.date,
                    size: img.size,
                    mimeType: img.mimeType,
                    isFav: img.isFav,
                    width: img.width,
                    height: img.height,
                    modifiedAt: img.modifiedAt,
                    metadata: img.metadata || {},
                    embeddedMetadata: img.embeddedMetadata || {},
                    embeddedMetadataScanned: Boolean(img.embeddedMetadataScanned),
                    cropSourcePath: img.cropSourcePath,
                    cropRect: img.cropRect,
                    upscaleSourcePath: img.upscaleSourcePath,
                    upscaleMethod: img.upscaleMethod,
                    upscaleInfo: img.upscaleInfo,
                    backgroundRemoveSourcePath: img.backgroundRemoveSourcePath,
                    backgroundRemoveMethod: img.backgroundRemoveMethod,
                    backgroundRemoveInfo: img.backgroundRemoveInfo,
                    imageEditParentPath: img.imageEditParentPath,
                    imageEditSourceSrc: img.imageEditSourceSrc,
                    imageEditConfig: img.imageEditConfig,
                    imageEditInfo: img.imageEditInfo
                }))
            };

            updateLoading(50);

            const json = JSON.stringify(output);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            updateLoading(90);

            const a = document.createElement("a");
            a.href = url;
            a.download = `project_export_${Date.now()}.fma`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            URL.revokeObjectURL(url);
            updateLoading(100);
        } catch (err) {
            console.error("Save error:", err);
            alert("저장 중 오류가 발생했습니다: " + err.message);
        } finally {
            setTimeout(hideLoading, 500);
        }
    }, 100);
}
function resetProject() {
    if (!confirm("모든 데이터를 지우고 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) return;

    images = [];
    currentIndex = 0;
    deletedImages = [];

    renderGallery();
    renderFavorites();

    if (dom.imageCount) dom.imageCount.innerText = "Images: 0";
    if (dom.placeholder) dom.placeholder.style.display = "block";
    if (dom.previewContainer) dom.previewContainer.innerHTML = "";
    if (dom.previewMeta) dom.previewMeta.style.display = "none";
    if (dom.zoomInfo) dom.zoomInfo.style.display = "none";
    if (dom.pageText) dom.pageText.innerText = "0 / 0";

    saveCurrentImagesToDB();
    alert("초기화되었습니다.");
}
