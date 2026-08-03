/* =======================================================
   File Handling & Data Logic
   ======================================================= */

const FMA_ARCHIVE_FORMAT = "fma-archive";
const FMA_ARCHIVE_VERSION = 3;
const FMA_MANIFEST_PATH = "manifest.json";
const FMA_MEDIA_REF_KEY = "$fmaMedia";
let fmaArchiveObjectUrls = new Set();

async function loadFMA(file) {
    if (!file) return;
    showLoading(`FMA 파일 확인 중: ${file.name}`);
    try {
        if (await isZipBasedFma(file)) {
            await loadFmaArchive(file);
            await saveCurrentImagesToDB();
            updateImportStatus(`${file.name}: 압축 FMA를 불러왔습니다.`);
        } else {
            const data = JSON.parse(await file.text());
            releaseFmaArchiveObjectUrls();
            saveToDB(data).catch(error => console.warn("Legacy FMA DB backup failed:", error));
            await processFMAData(data);
            updateImportStatus(`${file.name}: 기존 FMA를 불러왔습니다. 다시 저장하면 압축 형식으로 변환됩니다.`);
        }
    } catch (err) {
        console.error("FMA load error:", err);
        hideLoading();
        alert("FMA 파일을 열 수 없습니다: " + (err?.message || "파일 형식이 잘못되었습니다."));
    }
}

async function isZipBasedFma(file) {
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return signature.length >= 4 &&
        signature[0] === 0x50 && signature[1] === 0x4b &&
        ((signature[2] === 0x03 && signature[3] === 0x04) ||
            (signature[2] === 0x05 && signature[3] === 0x06) ||
            (signature[2] === 0x07 && signature[3] === 0x08));
}

async function loadFmaArchive(file) {
    if (typeof JSZip === "undefined") {
        throw new Error("압축 FMA 처리 모듈을 불러오지 못했습니다.");
    }
    const zip = await JSZip.loadAsync(file);
    const manifestEntry = zip.file(FMA_MANIFEST_PATH);
    if (!manifestEntry) throw new Error("FMA manifest.json이 없습니다.");

    const manifest = JSON.parse(await manifestEntry.async("string"));
    if (manifest?.format !== FMA_ARCHIVE_FORMAT || Number(manifest?.version) < FMA_ARCHIVE_VERSION) {
        throw new Error("지원하지 않는 압축 FMA 형식입니다.");
    }
    if (!Array.isArray(manifest.images) || manifest.images.length === 0 ||
        !manifest.media || typeof manifest.media !== "object" || Array.isArray(manifest.media)) {
        throw new Error("FMA manifest의 이미지 또는 미디어 정보가 올바르지 않습니다.");
    }

    const referencedIds = collectFmaMediaReferences(manifest.images);
    const mediaUrls = new Map();
    const createdUrls = [];
    try {
        let completed = 0;
        for (const mediaId of referencedIds) {
            const record = manifest.media[mediaId];
            const entryPath = validateFmaMediaRecord(mediaId, record);
            const entry = zip.file(entryPath);
            if (!entry || entry.dir) throw new Error(`FMA 미디어를 찾을 수 없습니다: ${entryPath}`);
            const extracted = await entry.async("blob");
            const blob = new Blob([extracted], {
                type: String(record.mimeType || extracted.type || "application/octet-stream")
            });
            const url = URL.createObjectURL(blob);
            createdUrls.push(url);
            mediaUrls.set(mediaId, url);
            completed++;
            updateLoading(10 + (completed / Math.max(1, referencedIds.size)) * 70);
            if (completed % 3 === 0) await new Promise(resolve => requestAnimationFrame(resolve));
        }

        const restoredData = {
            ...manifest,
            images: restoreFmaMediaReferences(manifest.images, mediaUrls)
        };
        const invalidIndex = restoredData.images.findIndex(item =>
            !item || typeof item.src !== "string" || !item.src.startsWith("blob:")
        );
        if (invalidIndex >= 0) {
            throw new Error(`FMA 이미지 참조가 올바르지 않습니다: images[${invalidIndex}]`);
        }
        releaseFmaArchiveObjectUrls();
        fmaArchiveObjectUrls = new Set(createdUrls);
        await processFMAData(restoredData, { keepArchiveUrls: true });
    } catch (error) {
        createdUrls.forEach(url => URL.revokeObjectURL(url));
        throw error;
    }
}

function validateFmaMediaRecord(mediaId, record) {
    if (!record || typeof record.path !== "string" || !record.path.startsWith("media/")) {
        throw new Error(`FMA 미디어 참조가 올바르지 않습니다: ${mediaId}`);
    }
    const normalized = record.path.replace(/\\/g, "/");
    if (normalized.includes("../") || normalized.startsWith("/") || normalized.includes("\0")) {
        throw new Error(`허용되지 않은 FMA 미디어 경로입니다: ${record.path}`);
    }
    return normalized;
}

function collectFmaMediaReferences(value, result = new Set()) {
    if (!value || typeof value !== "object") return result;
    if (!Array.isArray(value) && typeof value[FMA_MEDIA_REF_KEY] === "string" &&
        Object.keys(value).length === 1) {
        result.add(value[FMA_MEDIA_REF_KEY]);
        return result;
    }
    if (Array.isArray(value)) value.forEach(child => collectFmaMediaReferences(child, result));
    else Object.values(value).forEach(child => collectFmaMediaReferences(child, result));
    return result;
}

function restoreFmaMediaReferences(value, mediaUrls) {
    if (!Array.isArray(value) && value && typeof value === "object" &&
        typeof value[FMA_MEDIA_REF_KEY] === "string" && Object.keys(value).length === 1) {
        const mediaId = value[FMA_MEDIA_REF_KEY];
        const url = mediaUrls.get(mediaId);
        if (!url) throw new Error(`FMA 미디어 참조를 복원할 수 없습니다: ${mediaId}`);
        return url;
    }
    if (Array.isArray(value)) return value.map(child => restoreFmaMediaReferences(child, mediaUrls));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
        key, restoreFmaMediaReferences(child, mediaUrls)
    ]));
}

function releaseFmaArchiveObjectUrls() {
    fmaArchiveObjectUrls.forEach(url => URL.revokeObjectURL(url));
    fmaArchiveObjectUrls.clear();
}

window.addEventListener("beforeunload", releaseFmaArchiveObjectUrls);

async function processFMAData(data, options = {}) {
    if (!options.keepArchiveUrls) releaseFmaArchiveObjectUrls();
    images = [];
    showLoading("Extracting Data...");
    try {
        const exportedImages = Array.isArray(data?.images)
            ? data.images.filter(item => item && typeof item.src === "string" &&
                /^(?:data:(?:image|video)\/|blob:)/.test(item.src))
            : [];

        if (exportedImages.length > 0) {
            const fallbackDate = Date.parse(data.timestamp) || Date.now();
            images = exportedImages.map((item, index) => ({
                src: item.src,
                path: item.path || `$.images[${index}].src`,
                group: item.group || groupFromPath(item.path),
                date: item.date || fallbackDate,
                createdAt: item.createdAt || item.date || fallbackDate,
                size: item.size || item.src.length,
                mimeType: item.mimeType || String(item.src).match(/^data:([^;,]+)/)?.[1] || "",
                mediaType: item.mediaType || (String(item.mimeType || item.src).includes("video/") ? "video" : "image"),
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
                backgroundRemoveSourceSrc: item.backgroundRemoveSourceSrc,
                backgroundRemoveMethod: item.backgroundRemoveMethod,
                backgroundRemoveInfo: item.backgroundRemoveInfo,
                imageEditParentPath: item.imageEditParentPath,
                imageEditSourceSrc: item.imageEditSourceSrc,
                imageEditConfig: item.imageEditConfig,
                imageEditInfo: item.imageEditInfo,
                fmeProject: item.fmeProject
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
                const latestIndex = typeof getLatestVisibleMediaIndex === "function"
                    ? getLatestVisibleMediaIndex() : 0;
                if (typeof showImage === 'function' && latestIndex >= 0) showImage(latestIndex);
            } else {
                alert("이미지 또는 영상 데이터를 찾을 수 없습니다.");
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
                if (/^data:(image|video)\//.test(o)) {
                    const mimeType = String(o).match(/^data:([^;,]+)/)?.[1] || "";
                    images.push({
                        src: o,
                        path: p,
                        group: groupFromPath(p),
                        date: Date.now(),
                        createdAt: Date.now(),
                        modifiedAt: Date.now(),
                        size: o.length,
                        mimeType,
                        mediaType: mimeType.startsWith("video/") ? "video" : "image",
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

async function handleAddImages(files, options = {}) {
    files = files.filter(isMediaFile);
    if (files.length === 0) return;

    const total = files.length;
    let current = 0;
    const background = Boolean(options.background);
    const loadingTitle = options.loadingTitle || `Importing ${total} Media...`;
    const reportProgress = (percent) => {
        if (background) updateBackgroundImportProgress(percent);
        else updateLoading(percent);
    };
    if (background) showBackgroundImportProgress(loadingTitle);
    else showLoading(loadingTitle);

    try {
        const readers = files.map(file => {
            return new Promise((resolve, reject) => {
            if (isVideoFile(file)) {
                const relativePath = getImportRelativePath(file);
                images.push({
                    src: URL.createObjectURL(file),
                    path: "$.added." + relativePath,
                    group: getImportGroup(file, "added-video"),
                    date: file.lastModified || Date.now(),
                    createdAt: file.lastModified || Date.now(),
                    modifiedAt: file.lastModified || Date.now(),
                    size: file.size,
                    mimeType: file.type || getMimeTypeFromName(file.name),
                    mediaType: "video",
                    isFav: false
                });
                current++;
                reportProgress((current / total) * 85);
                resolve();
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const relativePath = getImportRelativePath(file);
                images.push({
                    src: e.target.result,
                    path: "$.added." + relativePath,
                    group: getImportGroup(file, "added"),
                    date: file.lastModified || Date.now(),
                    createdAt: file.lastModified || Date.now(),
                    modifiedAt: file.lastModified || Date.now(),
                    size: file.size,
                    mimeType: file.type,
                    mediaType: isVideoFile(file) ? "video" : "image",
                    isFav: false
                });
                current++;
                reportProgress((current / total) * 85);
                resolve();
            };
            reader.onerror = () => reject(reader.error || new Error(`${file.name} 파일을 읽지 못했습니다.`));
            reader.readAsDataURL(file);
        });
        });
        await Promise.all(readers);
        renderGallery();
        if (dom.imageCount) dom.imageCount.innerText = "Media: " + images.length;
        reportProgress(90);
        await saveCurrentImagesToDB(true);
        const videoCount = files.filter(isVideoFile).length;
        const statusMessage = options.statusMessage || `${total - videoCount}개 이미지 · ${videoCount}개 영상을 추가했습니다.`;
        updateImportStatus(statusMessage);
        if (background) finishBackgroundImportProgress(statusMessage);
        return true;
    } catch (error) {
        console.error("Media import failed:", error);
        const message = `갤러리 추가 실패: ${error?.message || error}`;
        updateImportStatus(message, true);
        if (background) finishBackgroundImportProgress(message, { error: true });
        throw error;
    } finally {
        if (!background) hideLoading();
    }
}

function getImportRelativePath(file) {
    return String(file?.webkitRelativePath || file?.name || "media")
        .replace(/\\/g, "/");
}

function getImportGroup(file, fallback) {
    const relativePath = getImportRelativePath(file);
    const parts = relativePath.split("/").filter(Boolean);
    return parts.length > 1 ? parts[0] : fallback;
}

async function handleImportFolder(files) {
    const mediaFiles = files.filter(isMediaFile);
    if (!mediaFiles.length) {
        updateImportStatus("선택한 폴더와 하위 폴더에 지원되는 이미지나 영상이 없습니다.", true);
        return;
    }
    const firstPath = getImportRelativePath(mediaFiles[0]);
    const rootName = firstPath.split("/").filter(Boolean)[0] || "선택 폴더";
    const folders = new Set();
    mediaFiles.forEach(file => {
        const parts = getImportRelativePath(file).split("/").filter(Boolean);
        for (let depth = 1; depth < parts.length; depth++) {
            folders.add(parts.slice(0, depth).join("/"));
        }
    });
    const imageCount = mediaFiles.filter(isImageFile).length;
    const videoCount = mediaFiles.filter(isVideoFile).length;
    await handleAddImages(mediaFiles, {
        loadingTitle: `${rootName} 폴더와 하위 폴더 읽는 중…`,
        statusMessage: `${rootName}: 하위 폴더 ${Math.max(0, folders.size - 1)}개에서 이미지 ${imageCount}개 · 영상 ${videoCount}개를 추가했습니다.`
    });
}

async function handleImportFiles(files) {
    const imageFiles = files.filter(isMediaFile);
    const zipFiles = files.filter(file =>
        file.name.toLowerCase().endsWith(".zip") ||
        file.type === "application/zip" ||
        file.type === "application/x-zip-compressed"
    );

    if (imageFiles.length > 0) await handleAddImages(imageFiles);
    for (const zipFile of zipFiles) await handleAddZip(zipFile);

    if (imageFiles.length === 0 && zipFiles.length === 0) {
        updateImportStatus("지원되는 이미지, 영상 또는 ZIP 파일이 아닙니다.", true);
    }
}

function isImageFile(file) {
    return Boolean(file) && (
        String(file.type || "").startsWith("image/") ||
        /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(file.name || "")
    );
}

function isVideoFile(file) {
    return Boolean(file) && (
        String(file.type || "").startsWith("video/") ||
        /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name || "")
    );
}

function isMediaFile(file) {
    return isImageFile(file) || isVideoFile(file);
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
            !entry.dir && /\.(png|jpe?g|webp|gif|bmp|svg|avif|mp4|webm|mov|m4v|ogv)$/i.test(entry.name)
        );

        if (imageEntries.length === 0) {
            updateImportStatus(`${file.name}에 지원되는 이미지나 영상이 없습니다.`, true);
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
        const videoCount = extractedFiles.filter(isVideoFile).length;
        updateImportStatus(`${file.name}에서 ${extractedFiles.length - videoCount}개 이미지 · ${videoCount}개 영상을 추가했습니다.`);
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
        avif: "image/avif",
        mp4: "video/mp4",
        webm: "video/webm",
        mov: "video/quicktime",
        m4v: "video/x-m4v",
        ogv: "video/ogg"
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

function openExternal(src, item) {
    const win = window.open();
    if (!win) return;
    const video = item ? isVideoMedia(item) : /^(?:data|blob):video\//i.test(String(src));
    win.document.write(video
        ? `<video src="${src}" controls autoplay style="max-width:100%;max-height:100vh"></video>`
        : `<img src="${src}" style="max-width:100%;max-height:100vh">`);
}

function downloadCurrentImage() {
    if (!images[currentIndex]) return;
    const item = images[currentIndex];
    const a = document.createElement("a");
    a.href = item.src;
    const extension = typeof getMediaFileExtension === "function"
        ? getMediaFileExtension(item) : (isVideoMedia(item) ? "mp4" : "png");
    a.download = `${isVideoMedia(item) ? "video" : "image"}_${currentIndex}.${extension}`;
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
            if (typeof ensureImageOriginalLoaded === "function") await ensureImageOriginalLoaded(img);
            const portable = await imageSourceToPortableDataUrl(img.src);
            const parts = portable.split(",");
            if (parts.length > 1) {
                const base64 = parts[1];
                const extension = typeof getMediaFileExtension === "function"
                    ? getMediaFileExtension(img) : (isVideoMedia(img) ? "mp4" : "png");
                zip.file(`${isVideoMedia(img) ? "video" : "image"}_${i}.${extension}`, base64, { base64: true });
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

async function saveFMA(options = {}) {
    if (images.length === 0) {
        alert("저장할 데이터가 없습니다.");
        return;
    }
    if (typeof JSZip === "undefined") {
        alert("압축 FMA 처리 모듈을 불러오지 못했습니다.");
        return;
    }

    const compressImages = Boolean(options.compressImages);
    showLoading(compressImages
        ? "WebP 고압축 FMA 파일 생성 중..."
        : "압축 FMA 파일 생성 중...");

    await new Promise(resolve => requestAnimationFrame(resolve));
    try {
        const archive = await buildFmaArchive({ compressImages });
        updateLoading(58);
        const blob = await archive.zip.generateAsync({
            type: "blob",
            mimeType: "application/vnd.fma+zip",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
            streamFiles: true
        }, metadata => updateLoading(58 + (metadata.percent * .38)));
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `project_export_${Date.now()}.fma`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        updateLoading(100);
        updateImportStatus(
            `${compressImages ? "WebP 고압축" : "원본 보존"} FMA 저장 완료: ` +
            `미디어 ${archive.mediaCount}개` +
            (compressImages ? ` · WebP 변환 ${archive.convertedCount}개` : "") +
            ` · ${formatFmaBytes(blob.size)}`
        );
    } catch (err) {
        console.error("Save error:", err);
        alert("저장 중 오류가 발생했습니다: " + err.message);
    } finally {
        setTimeout(hideLoading, 500);
    }
}

async function buildFmaArchive(options = {}) {
    const zip = new JSZip();
    const mediaFiles = new Map();
    const mediaManifest = {};
    const mediaSourceCache = new Map();
    const conversionStats = { converted: 0 };
    const archiveOptions = {
        compressImages: Boolean(options.compressImages),
        conversionStats
    };
    const exportedImages = [];

    for (let index = 0; index < images.length; index++) {
        const img = images[index];
        if (typeof ensureImageOriginalLoaded === "function") await ensureImageOriginalLoaded(img);
        const exportedItem = createFmaExportItem(img);
        const primaryReference = await registerFmaMediaSource(
            img.src, mediaFiles, mediaManifest, mediaSourceCache,
            { mimeType: img.mimeType, sourcePath: img.path, ...archiveOptions }
        );
        exportedItem.src = primaryReference;
        const primaryRecord = mediaManifest[primaryReference[FMA_MEDIA_REF_KEY]];
        exportedItem.mimeType = primaryRecord.mimeType;
        exportedItem.size = primaryRecord.size;
        exportedItem.mediaType = primaryRecord.mimeType.startsWith("video/") ? "video" : "image";
        await externalizeFmaNestedMedia(
            exportedItem, mediaFiles, mediaManifest, mediaSourceCache, archiveOptions
        );
        exportedImages.push(exportedItem);
        updateLoading(5 + ((index + 1) / images.length) * 45);
        if (index % 3 === 2) await new Promise(resolve => requestAnimationFrame(resolve));
    }

    for (const { path, blob } of mediaFiles.values()) {
        zip.file(path, blob, { binary: true, compression: "STORE", createFolders: true });
    }
    const timestamp = new Date().toISOString();
    const manifest = {
        format: FMA_ARCHIVE_FORMAT,
        version: FMA_ARCHIVE_VERSION,
        timestamp,
        generator: "FMA Viewer Ultra",
        images: exportedImages,
        media: mediaManifest
    };
    zip.file(FMA_MANIFEST_PATH, JSON.stringify(manifest), {
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
    });
    return {
        zip,
        mediaCount: mediaFiles.size,
        convertedCount: conversionStats.converted
    };
}

function createFmaExportItem(img) {
    return {
        path: img.path,
        src: img.src,
        group: img.group,
        date: img.date,
        createdAt: img.createdAt || img.date,
        size: img.size,
        mimeType: img.mimeType,
        mediaType: isVideoMedia(img) ? "video" : "image",
        isFav: img.isFav,
        width: img.width,
        height: img.height,
        modifiedAt: img.modifiedAt,
        metadata: cloneFmaValue(img.metadata || {}),
        embeddedMetadata: cloneFmaValue(img.embeddedMetadata || {}),
        embeddedMetadataScanned: Boolean(img.embeddedMetadataScanned),
        cropSourcePath: img.cropSourcePath,
        cropRect: cloneFmaValue(img.cropRect),
        upscaleSourcePath: img.upscaleSourcePath,
        upscaleMethod: img.upscaleMethod,
        upscaleInfo: cloneFmaValue(img.upscaleInfo),
        backgroundRemoveSourcePath: img.backgroundRemoveSourcePath,
        backgroundRemoveSourceSrc: img.backgroundRemoveSourceSrc,
        backgroundRemoveMethod: img.backgroundRemoveMethod,
        backgroundRemoveInfo: cloneFmaValue(img.backgroundRemoveInfo),
        imageEditParentPath: img.imageEditParentPath,
        imageEditSourceSrc: img.imageEditSourceSrc,
        imageEditConfig: cloneFmaValue(img.imageEditConfig),
        imageEditInfo: cloneFmaValue(img.imageEditInfo),
        fmeProject: cloneFmaValue(img.fmeProject)
    };
}

function cloneFmaValue(value) {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

async function fetchFmaMediaBlob(src, fallbackMimeType = "") {
    if (!src) throw new Error("FMA에 저장할 미디어 원본이 없습니다.");
    const response = await fetch(src);
    if (!response.ok) throw new Error("FMA에 저장할 미디어 원본을 읽지 못했습니다.");
    const blob = await response.blob();
    if (!blob.size) throw new Error("FMA에 저장할 미디어가 비어 있습니다.");
    if (!blob.type && fallbackMimeType) return new Blob([blob], { type: fallbackMimeType });
    return blob;
}

async function registerFmaMedia(blob, mediaFiles, mediaManifest, hints = {}) {
    const mimeType = String(blob.type || hints.mimeType || "application/octet-stream");
    const normalizedBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
    const mediaId = await hashImageBlob(normalizedBlob);
    if (!mediaFiles.has(mediaId)) {
        const extension = getFmaMediaExtension(mimeType, hints.sourcePath);
        const safeId = mediaId.replace(/[^a-z0-9_-]/gi, "-");
        const path = `media/${safeId}.${extension}`;
        mediaFiles.set(mediaId, { path, blob: normalizedBlob });
        mediaManifest[mediaId] = {
            path,
            mimeType,
            size: normalizedBlob.size
        };
    }
    return { [FMA_MEDIA_REF_KEY]: mediaId };
}

async function registerFmaMediaSource(src, mediaFiles, mediaManifest, sourceCache, hints = {}) {
    if (sourceCache.has(src)) return { [FMA_MEDIA_REF_KEY]: sourceCache.get(src) };
    let blob = await fetchFmaMediaBlob(src, hints.mimeType);
    if (hints.compressImages) {
        const optimized = await optimizeFmaImageBlob(blob);
        if (optimized !== blob) {
            blob = optimized;
            if (hints.conversionStats) hints.conversionStats.converted++;
        }
    }
    const reference = await registerFmaMedia(blob, mediaFiles, mediaManifest, hints);
    sourceCache.set(src, reference[FMA_MEDIA_REF_KEY]);
    return reference;
}

async function externalizeFmaNestedMedia(
    value, mediaFiles, mediaManifest, sourceCache, archiveOptions = {}, visited = new WeakSet()
) {
    if (!value || typeof value !== "object") return;
    if (visited.has(value)) throw new Error("FMA 메타정보에 순환 참조가 있어 저장할 수 없습니다.");
    visited.add(value);
    const entries = Array.isArray(value)
        ? value.map((child, index) => [index, child])
        : Object.entries(value);
    for (const [key, child] of entries) {
        if (typeof child === "string" && /^(?:data:(?:image|video)\/|blob:)/.test(child)) {
            value[key] = await registerFmaMediaSource(
                child, mediaFiles, mediaManifest, sourceCache, archiveOptions
            );
        } else if (typeof Blob !== "undefined" && child instanceof Blob) {
            const optimized = archiveOptions.compressImages
                ? await optimizeFmaImageBlob(child) : child;
            if (optimized !== child && archiveOptions.conversionStats) {
                archiveOptions.conversionStats.converted++;
            }
            value[key] = await registerFmaMedia(optimized, mediaFiles, mediaManifest);
        } else if (child && typeof child === "object") {
            await externalizeFmaNestedMedia(
                child, mediaFiles, mediaManifest, sourceCache, archiveOptions, visited
            );
        }
    }
    visited.delete(value);
}

async function optimizeFmaImageBlob(blob) {
    const mimeType = String(blob?.type || "").toLowerCase();
    if (!/^image\/(?:png|jpeg|bmp)$/.test(mimeType)) return blob;
    let bitmap;
    let objectUrl = "";
    try {
        if (typeof createImageBitmap === "function") {
            bitmap = await createImageBitmap(blob);
        } else {
            objectUrl = URL.createObjectURL(blob);
            bitmap = await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error("WebP 변환용 이미지를 읽지 못했습니다."));
                image.src = objectUrl;
            });
        }
        const width = bitmap.width || bitmap.naturalWidth;
        const height = bitmap.height || bitmap.naturalHeight;
        if (!width || !height) return blob;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
        const webpBlob = await new Promise(resolve =>
            canvas.toBlob(resolve, "image/webp", .82)
        );
        return webpBlob?.type === "image/webp" && webpBlob.size < blob.size
            ? webpBlob : blob;
    } catch (error) {
        console.warn("FMA WebP optimization skipped:", error);
        return blob;
    } finally {
        bitmap?.close?.();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
}

function getFmaMediaExtension(mimeType, sourcePath = "") {
    const extensions = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/bmp": "bmp",
        "image/svg+xml": "svg",
        "image/avif": "avif",
        "video/mp4": "mp4",
        "video/webm": "webm",
        "video/quicktime": "mov",
        "video/x-m4v": "m4v",
        "video/ogg": "ogv"
    };
    if (extensions[mimeType]) return extensions[mimeType];
    const match = String(sourcePath).match(/\.([a-z0-9]{1,8})(?:$|[?#])/i);
    return match ? match[1].toLowerCase() : "bin";
}

function formatFmaBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 ** 3) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
    return `${(value / (1024 ** 3)).toFixed(2)} GB`;
}

async function imageSourceToPortableDataUrl(src) {
    if (/^data:(image|video)\//.test(String(src || ""))) return src;
    const response = await fetch(src);
    if (!response.ok) throw new Error("FMA 내보내기용 이미지 원본을 읽지 못했습니다.");
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("이미지를 Data URL로 변환하지 못했습니다."));
        reader.readAsDataURL(blob);
    });
}
function resetProject() {
    if (!confirm("모든 데이터를 지우고 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) return;

    releaseFmaArchiveObjectUrls();
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
