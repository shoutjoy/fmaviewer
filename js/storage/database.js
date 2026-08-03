/* =======================================================
   IndexedDB v4: Blob / Metadata / Snapshot separation
   ======================================================= */

const DB_NAME = "FMADatabase";
const DB_VERSION = 4;
const STORE_NAME = "fma_store";                 // legacy compatibility
const HISTORY_STORE_NAME = "fma_history";       // legacy compatibility
const IMAGE_BLOB_STORE = "image_blobs";
const IMAGE_METADATA_STORE = "image_metadata";
const SNAPSHOT_STORE = "snapshots";
const KEY_NAME = "last_fma";
const DB_RESTORE_FOREGROUND_COUNT = 12;

let dbRestoreGeneration = 0;
let dbRestoreHydrationTimer = 0;
let dbRestoreObjectUrls = new Set();
let dbRestoreItemsById = new Map();

function initDB() {
    openFmaDatabase().then(db => {
        db.close();
        checkLastData();
    }).catch(error => console.warn("IndexedDB init failed:", error));
    window.addEventListener("message", handleDbHistoryMessage);
}

function upgradeFmaDatabase(db) {
    if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        const legacyHistory = db.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
        legacyHistory.createIndex("savedAt", "savedAt");
    }
    if (!db.objectStoreNames.contains(IMAGE_BLOB_STORE)) {
        db.createObjectStore(IMAGE_BLOB_STORE, { keyPath: "imageId" });
    }
    if (!db.objectStoreNames.contains(IMAGE_METADATA_STORE)) {
        const metadata = db.createObjectStore(IMAGE_METADATA_STORE, { keyPath: "imageId" });
        metadata.createIndex("modifiedAt", "modifiedAt");
    }
    if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        const snapshots = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
        snapshots.createIndex("savedAt", "savedAt");
    }
}

function openFmaDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = event => upgradeFmaDatabase(event.target.result);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB를 열지 못했습니다."));
        request.onblocked = () => reject(new Error("다른 FMA Viewer 창이 DB 업데이트를 막고 있습니다."));
    });
}

async function checkLastData() {
    const db = await openFmaDatabase();
    try {
        const current = await readStoreValue(db, SNAPSHOT_STORE, KEY_NAME);
        const legacy = current ? null : await readStoreValue(db, STORE_NAME, KEY_NAME);
        if (current || legacy) dom.btnRestore.style.display = "inline-block";
    } finally {
        db.close();
    }
}

function readStoreValue(db, storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function saveToDB(data) {
    const db = await openFmaDatabase();
    try {
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).put(data, KEY_NAME);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = transaction.onerror;
        });
    } finally {
        db.close();
    }
}

function getCurrentViewerState() {
    const gridColumns = Number(
        getComputedStyle(document.documentElement).getPropertyValue("--grid-cols")
    ) || 2;
    return {
        currentIndex,
        sortMode,
        mediaFilter,
        orientation,
        viewMode,
        navStep,
        gridColumns,
        zoom
    };
}

async function saveCurrentImagesToDB(throwOnError = false) {
    const operation = persistViewerSnapshot({
        id: KEY_NAME,
        name: "최근 FMA 상태",
        savedAt: new Date().toISOString(),
        state: getCurrentViewerState(),
        isCurrent: true
    });
    return throwOnError ? operation : operation.catch(error => {
        console.warn("Current image DB save failed:", error);
        return false;
    });
}

async function persistViewerSnapshot(snapshotBase) {
    const prepared = await prepareImageEntities(images);
    const snapshot = {
        ...snapshotBase,
        schemaVersion: 4,
        imageIds: prepared.imageIds,
        imageSummaries: prepared.metadata.map(createDbImageSummary),
        imageCount: prepared.imageIds.length,
        approximateBytes: images.reduce((total, item) => total + (Number(item.size) || 0), 0),
        previewImageId: prepared.imageIds[0] || ""
    };
    const db = await openFmaDatabase();
    try {
        const missingBlobIds = await findMissingBlobIds(db, prepared.blobs.map(item => item.imageId));
        const missing = new Set(missingBlobIds);
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(
                [IMAGE_BLOB_STORE, IMAGE_METADATA_STORE, SNAPSHOT_STORE],
                "readwrite"
            );
            const blobStore = transaction.objectStore(IMAGE_BLOB_STORE);
            prepared.blobs.forEach(entry => {
                if (missing.has(entry.imageId)) blobStore.put(entry);
            });
            const metadataStore = transaction.objectStore(IMAGE_METADATA_STORE);
            prepared.metadata.forEach(entry => metadataStore.put(entry));
            transaction.objectStore(SNAPSHOT_STORE).put(snapshot);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(
                transaction.error || new Error("SaveDB 증분 저장에 실패했습니다.")
            );
            transaction.onabort = transaction.onerror;
        });
        return snapshot;
    } finally {
        db.close();
    }
}

async function prepareImageEntities(sourceImages) {
    const imageIds = [];
    const blobs = new Map();
    const metadata = [];
    for (let index = 0; index < sourceImages.length; index++) {
        const item = await ensureDbImageMetadataLoaded(sourceImages[index]);
        const original = await resolveImageOriginalForSave(item);
        const blobId = original.imageId;
        const recordId = item.dbRecordId || createDbImageRecordId();
        item.dbRecordId = recordId;
        imageIds.push(recordId);
        if (original.blob) blobs.set(blobId, {
            imageId: blobId,
            blob: original.blob,
            mimeType: original.blob.type,
            size: original.blob.size,
            createdAt: Date.now()
        });

        const nested = await externalizeMetadataImagePayloads(item, blobs);
        let thumbnailBlob = item.dbThumbnailBlob;
        if (!thumbnailBlob || item.dbThumbnailImageId !== blobId) {
            const sourceBlob = original.blob || await loadImageBlobById(blobId);
            thumbnailBlob = await createImageThumbnailBlob(sourceBlob);
            item.dbThumbnailBlob = thumbnailBlob;
            item.dbThumbnailImageId = blobId;
        }
        const metaToken = createMetadataToken(nested.payload);
        item.dbImageId = blobId;
        item.dbMetaToken = metaToken;
        metadata.push({
            imageId: recordId,
            blobId,
            payload: nested.payload,
            payloadRefs: nested.references,
            thumbnailBlob,
            metaToken,
            modifiedAt: Date.now()
        });
        if (index % 4 === 3) await waitForDbRestorePaint();
    }
    return { imageIds, blobs: [...blobs.values()], metadata };
}

function createDbImageSummary(entry) {
    const payload = entry?.payload || {};
    const summary = {};
    Object.entries(payload).forEach(([key, value]) => {
        if (value == null || ["string", "number", "boolean"].includes(typeof value)) {
            summary[key] = value;
        }
    });
    if (payload.metadata && typeof payload.metadata === "object") {
        const metadata = {};
        Object.entries(payload.metadata).forEach(([key, value]) => {
            if (value == null || ["string", "number", "boolean"].includes(typeof value)) {
                metadata[key] = value;
            }
        });
        summary.metadata = metadata;
    }
    return {
        recordId: entry?.imageId || "",
        blobId: entry?.blobId || "",
        payload: summary
    };
}

function createDbImageRecordId() {
    if (globalThis.crypto?.randomUUID) return `image-${globalThis.crypto.randomUUID()}`;
    return `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

async function resolveImageOriginalForSave(item) {
    const canReuse = item.dbImageId && (
        item.dbOriginalLoaded === false ||
        item.src === item.dbOriginalObjectUrl ||
        item.src === item._dbSavedSrc
    );
    if (canReuse) return { imageId: item.dbImageId, blob: null };
    if (!item.src) throw new Error(`저장할 이미지 원본이 없습니다: ${item.path || "image"}`);
    const blob = await fetch(item.src).then(response => response.blob());
    const imageId = await hashImageBlob(blob);
    item.dbImageId = imageId;
    item.dbOriginalLoaded = true;
    item._dbSavedSrc = item.src;
    return { imageId, blob };
}

async function externalizeMetadataImagePayloads(item, blobMap) {
    const payload = typeof structuredClone === "function"
        ? structuredClone(item)
        : JSON.parse(JSON.stringify(item));
    [
        "src", "thumbnailSrc", "dbThumbnailBlob", "dbOriginalObjectUrl",
        "_dbSavedSrc", "_dbLoadPromise", "_dbPayloadRefs",
        "_dbMetadataLoaded", "_dbMetadataPromise"
    ].forEach(key => delete payload[key]);
    const references = Array.isArray(item._dbPayloadRefs)
        ? structuredClone(item._dbPayloadRefs)
        : [];
    if (item.dbOriginalLoaded === false && references.length) {
        return { payload, references };
    }
    references.length = 0;
    const visit = async (value, path) => {
        if (typeof value === "string" &&
            (value.startsWith("data:image/") || value.startsWith("blob:"))) {
            const blob = await fetch(value).then(response => response.blob());
            const imageId = await hashImageBlob(blob);
            if (!blobMap.has(imageId)) blobMap.set(imageId, {
                imageId,
                blob,
                mimeType: blob.type,
                size: blob.size,
                createdAt: Date.now()
            });
            setDbRecordPath(payload, path, "");
            references.push({ path, imageId });
            return;
        }
        if (!value || typeof value !== "object") return;
        const entries = Array.isArray(value)
            ? value.map((child, childIndex) => [childIndex, child])
            : Object.entries(value);
        for (const [key, child] of entries) await visit(child, [...path, key]);
    };
    await visit(payload, []);
    return { payload, references };
}

async function hashImageBlob(blob) {
    const bytes = await blob.arrayBuffer();
    if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
        const hash = [...new Uint8Array(digest)]
            .map(value => value.toString(16).padStart(2, "0")).join("");
        return `sha256-${hash}`;
    }
    const view = new Uint8Array(bytes);
    let hash = 2166136261;
    const stride = Math.max(1, Math.floor(view.length / 8192));
    for (let index = 0; index < view.length; index += stride) {
        hash ^= view[index];
        hash = Math.imul(hash, 16777619);
    }
    return `fnv-${view.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

function findMissingBlobIds(db, ids) {
    const unique = [...new Set(ids)];
    if (!unique.length) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(IMAGE_BLOB_STORE, "readonly");
        const store = transaction.objectStore(IMAGE_BLOB_STORE);
        const missing = [];
        let pending = unique.length;
        unique.forEach(imageId => {
            const request = store.getKey(imageId);
            request.onsuccess = () => {
                if (request.result === undefined) missing.push(imageId);
                if (--pending === 0) resolve(missing);
            };
            request.onerror = () => reject(request.error);
        });
    });
}

async function createImageThumbnailBlob(blob) {
    if (String(blob?.type || "").startsWith("video/")) {
        const canvas = document.createElement("canvas");
        canvas.width = 240;
        canvas.height = 135;
        const context = canvas.getContext("2d");
        context.fillStyle = "#090d14";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#77f5d1";
        context.beginPath();
        context.moveTo(102, 42);
        context.lineTo(102, 93);
        context.lineTo(148, 67.5);
        context.closePath();
        context.fill();
        context.fillStyle = "#bcefff";
        context.font = "700 14px sans-serif";
        context.textAlign = "center";
        context.fillText("VIDEO", 120, 119);
        return await new Promise(resolve => canvas.toBlob(
            result => resolve(result || blob), "image/webp", .82
        ));
    }
    let bitmap;
    let objectUrl = "";
    try {
        if (typeof createImageBitmap === "function") {
            bitmap = await createImageBitmap(blob);
        } else {
            objectUrl = URL.createObjectURL(blob);
            bitmap = await loadUpscaleImage(objectUrl);
        }
        const width = bitmap.width || bitmap.naturalWidth;
        const height = bitmap.height || bitmap.naturalHeight;
        const scale = Math.min(1, 240 / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return await new Promise(resolve => canvas.toBlob(
            result => resolve(result || blob), "image/webp", .76
        ));
    } finally {
        bitmap?.close?.();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
}

function createMetadataToken(payload) {
    const text = JSON.stringify(payload);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += Math.max(1, Math.floor(text.length / 2048))) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

async function loadImageBlobById(imageId, db) {
    const connection = db || await openFmaDatabase();
    try {
        const entry = await readStoreValue(connection, IMAGE_BLOB_STORE, imageId);
        if (!entry?.blob) throw new Error(`원본 이미지 Blob을 찾을 수 없습니다: ${imageId}`);
        return entry.blob;
    } finally {
        if (!db) connection.close();
    }
}

function setDbRecordPath(target, path, value) {
    if (!Array.isArray(path) || !path.length) return;
    let current = target;
    for (let index = 0; index < path.length - 1; index++) {
        current = current?.[path[index]];
        if (!current) return;
    }
    current[path[path.length - 1]] = value;
}

function createDbObjectUrl(blob) {
    const url = URL.createObjectURL(blob);
    dbRestoreObjectUrls.add(url);
    return url;
}

function releaseDbRestoreObjectUrls() {
    dbRestoreObjectUrls.forEach(url => URL.revokeObjectURL(url));
    dbRestoreObjectUrls.clear();
}

function cancelDbMetadataHydration() {
    if (dbRestoreHydrationTimer) window.clearTimeout(dbRestoreHydrationTimer);
    dbRestoreHydrationTimer = 0;
}

function releaseDbRestoreSession() {
    dbRestoreGeneration++;
    cancelDbMetadataHydration();
    releaseDbRestoreObjectUrls();
    dbRestoreItemsById.clear();
}

function createDbImageFromSummary(summary, recordId, index, savedAt) {
    const payload = summary?.payload && typeof summary.payload === "object"
        ? summary.payload : {};
    const thumbnailSrc = createDbPlaceholderThumbnail(index + 1);
    return {
        ...payload,
        src: thumbnailSrc,
        thumbnailSrc,
        dbRecordId: summary?.recordId || recordId,
        dbImageId: summary?.blobId || "",
        dbOriginalLoaded: false,
        _dbMetadataLoaded: false,
        _dbPayloadRefs: [],
        date: payload.date || savedAt || Date.now()
    };
}

function applyDbMetadataEntry(recordId, entry) {
    if (!entry) return null;
    const item = dbRestoreItemsById.get(recordId) ||
        images.find(candidate => candidate?.dbRecordId === recordId);
    if (!item || item._dbMetadataLoaded === true) return item || null;
    const payload = entry.payload || {};
    const thumbnailSrc = entry.thumbnailBlob
        ? createDbObjectUrl(entry.thumbnailBlob)
        : item.thumbnailSrc || createDbPlaceholderThumbnail(images.indexOf(item) + 1);
    Object.assign(item, payload, {
        src: item.dbOriginalLoaded === true ? item.src : thumbnailSrc,
        thumbnailSrc,
        dbThumbnailBlob: entry.thumbnailBlob || null,
        dbThumbnailImageId: entry.blobId || entry.imageId || recordId,
        dbRecordId: entry.imageId || recordId,
        dbImageId: entry.blobId || entry.imageId || recordId,
        dbMetaToken: entry.metaToken || "",
        dbOriginalLoaded: item.dbOriginalLoaded === true,
        _dbMetadataLoaded: true,
        _dbPayloadRefs: entry.payloadRefs || []
    });
    updateDbThumbnailElements(item.dbRecordId, thumbnailSrc);
    return item;
}

function updateDbThumbnailElements(recordId, thumbnailSrc) {
    if (!recordId || !thumbnailSrc) return;
    const escaped = globalThis.CSS?.escape ? CSS.escape(recordId) : recordId.replace(/["\\]/g, "\\$&");
    document.querySelectorAll(`[data-image-record-id="${escaped}"] img`).forEach(image => {
        image.src = thumbnailSrc;
    });
}

async function ensureDbImageMetadataLoaded(imageOrIndex) {
    const item = typeof imageOrIndex === "number" ? images[imageOrIndex] : imageOrIndex;
    if (!item || item._dbMetadataLoaded !== false || !item.dbRecordId) return item;
    if (item._dbMetadataPromise) return item._dbMetadataPromise;
    item._dbMetadataPromise = (async () => {
        const db = await openFmaDatabase();
        try {
            const entry = await readStoreValue(db, IMAGE_METADATA_STORE, item.dbRecordId);
            if (!entry) throw new Error(`이미지 메타정보를 찾을 수 없습니다: ${item.dbRecordId}`);
            return applyDbMetadataEntry(item.dbRecordId, entry) || item;
        } finally {
            db.close();
            item._dbMetadataPromise = null;
        }
    })();
    return item._dbMetadataPromise;
}

async function ensureImageOriginalLoaded(imageOrIndex) {
    let item = typeof imageOrIndex === "number" ? images[imageOrIndex] : imageOrIndex;
    if (item?._dbMetadataLoaded === false) item = await ensureDbImageMetadataLoaded(item);
    if (!item || item.dbOriginalLoaded !== false || !item.dbImageId) return item;
    if (item._dbLoadPromise) return item._dbLoadPromise;
    item._dbLoadPromise = (async () => {
        const db = await openFmaDatabase();
        try {
            const ids = [item.dbImageId, ...(item._dbPayloadRefs || []).map(ref => ref.imageId)];
            const entries = await readBlobEntries(db, ids);
            const original = entries.get(item.dbImageId);
            if (!original?.blob) throw new Error("선택한 이미지의 원본 Blob을 찾지 못했습니다.");
            const originalUrl = createDbObjectUrl(original.blob);
            item.src = originalUrl;
            item.dbOriginalObjectUrl = originalUrl;
            for (const reference of item._dbPayloadRefs || []) {
                const entry = entries.get(reference.imageId);
                if (!entry?.blob) continue;
                setDbRecordPath(item, reference.path, createDbObjectUrl(entry.blob));
            }
            item.dbOriginalLoaded = true;
            return item;
        } finally {
            db.close();
            item._dbLoadPromise = null;
        }
    })();
    return item._dbLoadPromise;
}

function readBlobEntries(db, ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(IMAGE_BLOB_STORE, "readonly");
        const store = transaction.objectStore(IMAGE_BLOB_STORE);
        const result = new Map();
        if (!unique.length) {
            resolve(result);
            return;
        }
        let pending = unique.length;
        unique.forEach(id => {
            const request = store.get(id);
            request.onsuccess = () => {
                result.set(id, request.result || null);
                if (--pending === 0) resolve(result);
            };
            request.onerror = () => reject(request.error);
        });
    });
}

async function restoreLastSession() {
    const db = await openFmaDatabase();
    try {
        const snapshot = await readStoreValue(db, SNAPSHOT_STORE, KEY_NAME);
        if (snapshot) {
            await applyDbSnapshot(snapshot);
            return;
        }
        const legacy = await readStoreValue(db, STORE_NAME, KEY_NAME);
        if (!legacy) return;
        if (legacy._isMerged) {
            releaseDbRestoreSession();
            if (typeof releaseFmaArchiveObjectUrls === "function") releaseFmaArchiveObjectUrls();
            images = legacy._data || [];
            normalizeRestoredImages(images);
            renderRestoredViewer({});
            await saveCurrentImagesToDB(true);
        } else {
            processFMAData(legacy);
        }
    } finally {
        db.close();
    }
}

async function applyDbSnapshot(snapshot, progressTarget) {
    const imageIds = Array.isArray(snapshot.imageIds) ? snapshot.imageIds : [];
    const total = imageIds.length;
    const restoreGeneration = ++dbRestoreGeneration;
    cancelDbMetadataHydration();
    const report = async (percent, message, detail = "") => {
        if (dom.loadingOverlay.style.display === "none") showLoading(message);
        else dom.loadingTitle.innerText = message;
        updateLoading(percent);
        postDbHistoryRestoreProgress(progressTarget, {
            snapshotId: snapshot.id,
            percent,
            message,
            detail,
            status: percent >= 100 ? "complete" : "progress"
        });
        await waitForDbRestorePaint();
    };
    await report(12, "저장본 설정을 읽는 중입니다.", `${total}개 이미지`);
    if (typeof releaseFmaArchiveObjectUrls === "function") releaseFmaArchiveObjectUrls();
    releaseDbRestoreObjectUrls();
    const summaryById = new Map(
        (Array.isArray(snapshot.imageSummaries) ? snapshot.imageSummaries : [])
            .filter(summary => summary?.recordId)
            .map(summary => [summary.recordId, summary])
    );
    images = imageIds.map((recordId, index) => createDbImageFromSummary(
        summaryById.get(recordId), recordId, index, snapshot.savedAt
    ));
    dbRestoreItemsById = new Map(images.map(item => [item.dbRecordId, item]));
    normalizeRestoredImages(images);
    await report(30, "저장본 목록을 바로 표시하는 중입니다.", "원본과 나머지 썸네일은 지연 로딩합니다.");
    restoreViewerState(snapshot.state || {});
    renderGallery();
    renderFavorites();
    dom.imageCount.innerText = "Images: " + images.length;
    const latestIndex = summaryById.size > 0 && typeof getLatestVisibleMediaIndex === "function"
        ? getLatestVisibleMediaIndex() : currentIndex;
    const foregroundRecords = collectDbForegroundRecords(latestIndex);
    await report(48, "먼저 보이는 썸네일만 불러오는 중입니다.",
        `${Math.min(foregroundRecords.length, total)}개 우선 복원`);
    if (foregroundRecords.length) {
        const db = await openFmaDatabase();
        try {
            const entries = await readMetadataEntries(
                db, foregroundRecords.map(record => record.recordId)
            );
            foregroundRecords.forEach((record, index) => {
                applyDbMetadataEntry(record.recordId, entries[index]);
            });
        } finally {
            db.close();
        }
        renderGallery();
        renderFavorites();
    }
    await report(76, "현재 선택 이미지만 원본 Blob을 불러오는 중입니다.");
    if (latestIndex >= 0) {
        currentIndex = latestIndex;
        await showImage(currentIndex);
    }
    await report(100, "SaveDB 저장본을 빠르게 열었습니다.",
        `${total}개 이미지 · 나머지 썸네일은 백그라운드 복원`);
    window.setTimeout(hideLoading, 120);
    scheduleDbMetadataHydration(imageIds, restoreGeneration);
}

function collectDbForegroundRecords(selectedIndex) {
    const indices = [selectedIndex, ...sortedImageOrder, ...images.map((_, index) => index)];
    const seen = new Set();
    const records = [];
    for (const index of indices) {
        const item = images[index];
        if (!item?.dbRecordId || seen.has(item.dbRecordId)) continue;
        seen.add(item.dbRecordId);
        records.push({ index, recordId: item.dbRecordId });
        if (records.length >= DB_RESTORE_FOREGROUND_COUNT) break;
    }
    return records;
}

function scheduleDbMetadataHydration(imageIds, restoreGeneration) {
    const pendingIds = imageIds.filter(recordId => {
        const item = dbRestoreItemsById.get(recordId);
        return item && item._dbMetadataLoaded === false;
    });
    if (!pendingIds.length) return;
    dbRestoreHydrationTimer = window.setTimeout(() => {
        dbRestoreHydrationTimer = 0;
        void hydrateDbMetadataInBackground(pendingIds, restoreGeneration);
    }, 0);
}

async function hydrateDbMetadataInBackground(recordIds, restoreGeneration) {
    const db = await openFmaDatabase();
    try {
        for (let offset = 0; offset < recordIds.length; offset += 24) {
            if (restoreGeneration !== dbRestoreGeneration) return;
            const batchIds = recordIds.slice(offset, offset + 24).filter(recordId => {
                const item = dbRestoreItemsById.get(recordId);
                return item && item._dbMetadataLoaded === false;
            });
            if (!batchIds.length) continue;
            const entries = await readMetadataEntries(db, batchIds);
            if (restoreGeneration !== dbRestoreGeneration) return;
            batchIds.forEach((recordId, index) => applyDbMetadataEntry(recordId, entries[index]));
            await waitForDbRestoreIdle();
        }
    } catch (error) {
        console.warn("SaveDB background metadata hydration failed:", error);
    } finally {
        db.close();
    }
    if (restoreGeneration === dbRestoreGeneration) {
        renderGallery();
        renderFavorites();
    }
}

function waitForDbRestoreIdle() {
    return new Promise(resolve => {
        if (typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(() => resolve(), { timeout: 120 });
        } else {
            window.setTimeout(resolve, 0);
        }
    });
}

function readMetadataEntries(db, imageIds) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(IMAGE_METADATA_STORE, "readonly");
        const store = transaction.objectStore(IMAGE_METADATA_STORE);
        const result = new Array(imageIds.length);
        if (!imageIds.length) {
            resolve(result);
            return;
        }
        let pending = imageIds.length;
        imageIds.forEach((id, index) => {
            const request = store.get(id);
            request.onsuccess = () => {
                result[index] = request.result || null;
                if (--pending === 0) resolve(result);
            };
            request.onerror = () => reject(request.error);
        });
    });
}

function normalizeRestoredImages(list) {
    list.forEach(item => {
        if (!item.date) item.date = Date.now();
        if (!item.createdAt) item.createdAt = item.date;
        if (!item.modifiedAt) item.modifiedAt = item.createdAt;
        if (!item.size) item.size = 0;
        if (!item.metadata) item.metadata = {};
        if (!item.mediaType) item.mediaType = String(item.mimeType || "").startsWith("video/")
            ? "video" : "image";
    });
}

function restoreViewerState(state) {
    sortMode = ["latest", "modified", "oldest", "size", "type", "group"].includes(state.sortMode)
        ? state.sortMode : "latest";
    dom.sortSelect.value = sortMode;
    mediaFilter = ["all", "image", "video"].includes(state.mediaFilter)
        ? state.mediaFilter : "all";
    if (dom.mediaFilterSelect) dom.mediaFilterSelect.value = mediaFilter;
    orientation = state.orientation === "vert" ? "vert" : "horz";
    viewMode = state.viewMode === 2 ? 2 : 1;
    navStep = viewMode === 2 ? 2 : 1;
    zoom = Number.isFinite(Number(state.zoom)) ? Number(state.zoom) : 1;
    changeGrid([1, 2, 3, 4].includes(Number(state.gridColumns)) ? Number(state.gridColumns) : 2);
    currentIndex = images.length
        ? Math.max(0, Math.min(images.length - 1, Number(state.currentIndex) || 0)) : 0;
    updateModeButtons();
    updateStepButtons();
}

function renderRestoredViewer(state) {
    restoreViewerState(state);
    renderGallery();
    renderFavorites();
    dom.imageCount.innerText = "Images: " + images.length;
    const latestIndex = typeof getLatestVisibleMediaIndex === "function"
        ? getLatestVisibleMediaIndex() : currentIndex;
    if (latestIndex >= 0) {
        currentIndex = latestIndex;
        showImage(currentIndex);
    }
}

function createDbPlaceholderThumbnail(number) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="100%" height="100%" fill="#111823"/><text x="50%" y="50%" fill="#78ead8" font-size="22" text-anchor="middle" dominant-baseline="middle">IMAGE ${number}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createCurrentDbSnapshot() {
    const savedAt = new Date().toISOString();
    return {
        id: `fma-db-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: `FMA ${new Date(savedAt).toLocaleString("ko-KR")}`,
        savedAt,
        state: getCurrentViewerState()
    };
}

async function saveCurrentStateToDbHistory() {
    if (!images.length) {
        alert("SaveDB에 저장할 이미지가 없습니다.");
        return;
    }
    const previousText = dom.btnSaveDbSnapshot.innerHTML;
    dom.btnSaveDbSnapshot.disabled = true;
    dom.btnSaveDbSnapshot.innerHTML = "<span>…</span> 증분 저장 중";
    try {
        showLoading("변경된 이미지와 메타정보를 저장하는 중입니다...");
        updateLoading(8);
        await persistViewerSnapshot(createCurrentDbSnapshot());
        updateLoading(100);
        dom.btnSaveDbMenu.innerText = "SaveDB ✓ ▾";
        window.setTimeout(() => dom.btnSaveDbMenu.innerText = "SaveDB ▾", 1800);
        if (dom.dbHistoryModal?.style.display === "flex") {
            dom.dbHistoryFrame.src = `db_history.html?v=20260804-1&t=${Date.now()}`;
        }
    } catch (error) {
        console.error("SaveDB failed:", error);
        alert("현재 상태를 SaveDB에 저장하지 못했습니다: " + error.message);
    } finally {
        hideLoading();
        dom.btnSaveDbSnapshot.disabled = false;
        dom.btnSaveDbSnapshot.innerHTML = previousText;
    }
}

function openDbHistoryWindow() {
    if (!dom.dbHistoryModal || !dom.dbHistoryFrame) return;
    dom.dbHistoryFrame.src = `db_history.html?v=20260804-1`;
    dom.dbHistoryModal.style.display = "flex";
    document.body.classList.add("db-history-open");
    dom.btnCloseDbHistoryModal.onclick = closeDbHistoryWindow;
    dom.dbHistoryModal.onclick = event => {
        if (event.target === dom.dbHistoryModal) closeDbHistoryWindow();
    };
    dom.btnCloseDbHistoryModal.focus();
}

function closeDbHistoryWindow() {
    if (!dom.dbHistoryModal) return;
    dom.dbHistoryModal.style.display = "none";
    document.body.classList.remove("db-history-open");
    if (dom.dbHistoryFrame) dom.dbHistoryFrame.src = "about:blank";
}

let dbHistoryRestoreInProgress = false;

async function handleDbHistoryMessage(event) {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.type === "fma-db-history-close") {
        closeDbHistoryWindow();
        return;
    }
    if (data.type !== "fma-db-history-restore" || !data.snapshotId) return;
    if (dbHistoryRestoreInProgress) return;
    dbHistoryRestoreInProgress = true;
    try {
        const snapshot = data.legacy
            ? await readLegacyDbHistorySnapshotById(data.snapshotId)
            : await readDbHistorySnapshotById(data.snapshotId);
        if (!snapshot) throw new Error("선택한 SaveDB 저장본을 찾을 수 없습니다.");
        if (data.legacy) await applyLegacyDbSnapshot(snapshot, event.source);
        else await applyDbSnapshot(snapshot, event.source);
    } catch (error) {
        console.error("SaveDB restore failed:", error);
        hideLoading();
        postDbHistoryRestoreProgress(event.source, {
            snapshotId: data.snapshotId,
            percent: 0,
            message: "SaveDB 저장본을 읽지 못했습니다: " + error.message,
            status: "error"
        });
        alert("SaveDB 저장본을 불러오지 못했습니다: " + error.message);
    } finally {
        dbHistoryRestoreInProgress = false;
    }
}

async function readLegacyDbHistorySnapshotById(snapshotId) {
    const db = await openFmaDatabase();
    try {
        return await readStoreValue(db, HISTORY_STORE_NAME, snapshotId);
    } finally {
        db.close();
    }
}

async function applyLegacyDbSnapshot(snapshot, progressTarget) {
    dbRestoreGeneration++;
    cancelDbMetadataHydration();
    postDbHistoryRestoreProgress(progressTarget, {
        snapshotId: snapshot.id,
        percent: 15,
        message: "이전 형식 저장본을 새 Blob 구조로 변환하는 중입니다.",
        status: "progress"
    });
    const restored = Array.isArray(snapshot.images)
        ? snapshot.images
        : Array.isArray(snapshot._data) ? snapshot._data : [];
    if (!restored.length) {
        throw new Error("이전 저장본에서 이미지 목록을 찾지 못했습니다.");
    }
    if (typeof releaseFmaArchiveObjectUrls === "function") releaseFmaArchiveObjectUrls();
    releaseDbRestoreObjectUrls();
    dbRestoreItemsById.clear();
    images = restored;
    normalizeRestoredImages(images);
    restoreViewerState(snapshot.state || {});
    renderGallery();
    renderFavorites();
    dom.imageCount.innerText = "Images: " + images.length;
    const latestIndex = typeof getLatestVisibleMediaIndex === "function"
        ? getLatestVisibleMediaIndex() : currentIndex;
    if (latestIndex >= 0) {
        currentIndex = latestIndex;
        await showImage(currentIndex);
    }
    postDbHistoryRestoreProgress(progressTarget, {
        snapshotId: snapshot.id,
        percent: 72,
        message: "이전 저장본을 표시했습니다. 새 저장 구조로 한 번만 변환합니다.",
        status: "progress"
    });
    await persistViewerSnapshot({
        id: snapshot.id,
        name: snapshot.name || "이전 SaveDB 저장본",
        savedAt: snapshot.savedAt || new Date().toISOString(),
        state: snapshot.state || getCurrentViewerState()
    });
    postDbHistoryRestoreProgress(progressTarget, {
        snapshotId: snapshot.id,
        percent: 100,
        message: "이전 저장본을 Blob·참조 방식으로 변환했습니다.",
        status: "complete"
    });
}

async function readDbHistorySnapshotById(snapshotId) {
    const db = await openFmaDatabase();
    try {
        return await readStoreValue(db, SNAPSHOT_STORE, snapshotId);
    } finally {
        db.close();
    }
}

function waitForDbRestorePaint() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

function postDbHistoryRestoreProgress(target, payload) {
    if (!target) return;
    try {
        target.postMessage(
            { type: "fma-db-history-restore-progress", ...payload },
            window.location.origin === "null" ? "*" : window.location.origin
        );
    } catch (error) {
        console.warn("DB history progress message failed:", error);
    }
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && dom.dbHistoryModal?.style.display === "flex") {
        closeDbHistoryWindow();
    }
});
