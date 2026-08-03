/* FMA Viewer internal SaveDB history manager (schema v4) */

const FMA_DB_NAME = "FMADatabase";
const FMA_DB_VERSION = 4;
const SNAPSHOT_STORE = "snapshots";
const METADATA_STORE = "image_metadata";
const BLOB_STORE = "image_blobs";
const LEGACY_HISTORY_STORE = "fma_history";

const historyDom = {
    list: document.getElementById("historyList"),
    status: document.getElementById("historyStatus"),
    count: document.getElementById("historyCount"),
    size: document.getElementById("historySize"),
    template: document.getElementById("historyItemTemplate"),
    refresh: document.getElementById("btnRefreshHistory"),
    deleteAll: document.getElementById("btnDeleteAllHistory"),
    restoreOverlay: document.getElementById("historyRestoreOverlay"),
    restoreMessage: document.getElementById("historyRestoreMessage"),
    restoreBar: document.getElementById("historyRestoreBar"),
    restorePercent: document.getElementById("historyRestorePercent"),
    restoreDetail: document.getElementById("historyRestoreDetail")
};

let activeRestoreId = "";
let historyPreviewUrls = new Set();

function openHistoryDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(FMA_DB_NAME, FMA_DB_VERSION);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("fma_store")) db.createObjectStore("fma_store");
            if (!db.objectStoreNames.contains(LEGACY_HISTORY_STORE)) {
                const legacy = db.createObjectStore(LEGACY_HISTORY_STORE, { keyPath: "id" });
                legacy.createIndex("savedAt", "savedAt");
            }
            if (!db.objectStoreNames.contains(BLOB_STORE)) {
                db.createObjectStore(BLOB_STORE, { keyPath: "imageId" });
            }
            if (!db.objectStoreNames.contains(METADATA_STORE)) {
                const metadata = db.createObjectStore(METADATA_STORE, { keyPath: "imageId" });
                metadata.createIndex("modifiedAt", "modifiedAt");
            }
            if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
                const snapshots = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
                snapshots.createIndex("savedAt", "savedAt");
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB를 열지 못했습니다."));
    });
}

async function getHistorySnapshots() {
    const db = await openHistoryDatabase();
    try {
        const snapshots = await readAllSnapshotSummaries(db);
        const legacyKeys = await readLegacySnapshotKeys(db);
        legacyKeys.forEach(id => {
            if (!snapshots.some(record => record.id === id)) {
                snapshots.push({
                    id,
                    name: "기존 SaveDB 저장본",
                    savedAt: "",
                    imageCount: 0,
                    approximateBytes: 0,
                    state: {},
                    legacy: true
                });
            }
        });
        return snapshots.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    } finally {
        db.close();
    }
}

function readAllSnapshotSummaries(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SNAPSHOT_STORE, "readonly");
        const request = transaction.objectStore(SNAPSHOT_STORE).openCursor();
        const output = [];
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return resolve(output);
            const record = cursor.value || {};
            if (record.id !== "last_fma") output.push({
                id: record.id,
                name: record.name,
                savedAt: record.savedAt,
                imageCount: record.imageCount || record.imageIds?.length || 0,
                approximateBytes: record.approximateBytes || 0,
                state: record.state || {},
                previewImageId: record.previewImageId || record.imageIds?.[0] || ""
            });
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

function readLegacySnapshotKeys(db) {
    if (!db.objectStoreNames.contains(LEGACY_HISTORY_STORE)) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(LEGACY_HISTORY_STORE, "readonly");
        const request = transaction.objectStore(LEGACY_HISTORY_STORE).openKeyCursor();
        const keys = [];
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return resolve(keys);
            keys.push(cursor.primaryKey);
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
}

async function loadSnapshotPreviews(records) {
    historyPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    historyPreviewUrls.clear();
    const requested = records.filter(record => record.previewImageId);
    if (!requested.length) return new Map();
    const db = await openHistoryDatabase();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(METADATA_STORE, "readonly");
            const store = tx.objectStore(METADATA_STORE);
            const previews = new Map();
            let pending = requested.length;
            requested.forEach(record => {
                const request = store.get(record.previewImageId);
                request.onsuccess = () => {
                    const blob = request.result?.thumbnailBlob;
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        historyPreviewUrls.add(url);
                        previews.set(record.id, url);
                    }
                    if (--pending === 0) resolve(previews);
                };
                request.onerror = () => reject(request.error);
            });
        });
    } finally {
        db.close();
    }
}

async function renderHistorySnapshots() {
    historyDom.status.style.display = "block";
    historyDom.status.innerText = "스냅샷 목록과 메타정보를 불러오는 중…";
    historyDom.list.innerHTML = "";
    try {
        const records = await getHistorySnapshots();
        historyDom.count.innerText = `${records.length}개 저장`;
        historyDom.size.innerText = formatHistoryBytes(
            records.reduce((total, record) => total + (Number(record.approximateBytes) || 0), 0)
        );
        historyDom.deleteAll.disabled = records.length === 0;
        if (!records.length) {
            historyDom.status.innerText = "저장된 SaveDB 히스토리가 없습니다.";
            return;
        }
        historyDom.status.style.display = "none";
        records.forEach(record => historyDom.list.appendChild(createHistoryItem(record)));
        const previews = await loadSnapshotPreviews(records.filter(item => !item.legacy));
        for (const record of records.filter(item => !item.legacy)) {
            const article = historyDom.list.querySelector(`[data-history-id="${CSS.escape(record.id)}"]`);
            const preview = previews.get(record.id);
            if (article && preview) {
                const image = document.createElement("img");
                image.src = preview;
                image.alt = "저장 상태 썸네일";
                article.querySelector(".db-history-thumb").replaceChildren(image);
            }
        }
    } catch (error) {
        console.error("DB history load failed:", error);
        historyDom.status.innerText = "DB 히스토리를 불러오지 못했습니다: " + error.message;
    }
}

function createHistoryItem(record) {
    const fragment = historyDom.template.content.cloneNode(true);
    const article = fragment.querySelector(".db-history-item");
    article.dataset.historyId = record.id;
    fragment.querySelector("h2").innerText = record.name || "FMA SaveDB";
    fragment.querySelector(".saved-at").innerText = record.legacy
        ? "기존 저장 형식 · 복원 후 v4로 변환됩니다."
        : new Date(record.savedAt).toLocaleString("ko-KR");
    const state = record.state || {};
    const badges = record.legacy ? ["Legacy", "1회 변환 필요"] : [
        `${record.imageCount || 0} images`,
        formatHistoryBytes(record.approximateBytes || 0),
        `Grid ${state.gridColumns || 2}`,
        state.viewMode === 2 ? "Two" : "Single",
        historySortLabel(state.sortMode)
    ];
    const badgeWrap = fragment.querySelector(".db-history-badges");
    badges.forEach(text => {
        const badge = document.createElement("span");
        badge.innerText = text;
        badgeWrap.appendChild(badge);
    });
    fragment.querySelector(".restore-history").onclick = () => restoreHistorySnapshot(record);
    fragment.querySelector(".delete-history").onclick = () => deleteHistorySnapshot(record);
    return fragment;
}

async function restoreHistorySnapshot(record) {
    const hostWindow = getHistoryHostWindow();
    if (!hostWindow) return alert("FMA Viewer 내부 창에 연결하지 못했습니다.");
    activeRestoreId = record.id;
    setHistoryRestoreButtonsDisabled(true);
    showHistoryRestoreProgress(5, record.legacy
        ? "기존 저장본을 한 번 변환하여 불러옵니다."
        : "스냅샷 ID와 화면 설정을 읽는 중입니다.");
    hostWindow.postMessage({
        type: "fma-db-history-restore",
        snapshotId: record.id,
        legacy: record.legacy === true
    }, getHistoryMessageOrigin());
    setHistoryRestoreProgress(8, "FMA Viewer가 저장본을 열 준비를 하고 있습니다.");
}

function getHistoryHostWindow() {
    if (window.parent && window.parent !== window) return window.parent;
    if (window.opener && !window.opener.closed) return window.opener;
    return null;
}

function getHistoryMessageOrigin() {
    return window.location.origin === "null" ? "*" : window.location.origin;
}

function showHistoryRestoreProgress(percent, message, detail = "") {
    historyDom.restoreOverlay.classList.remove("error");
    historyDom.restoreOverlay.style.display = "flex";
    setHistoryRestoreProgress(percent, message, detail);
}

function setHistoryRestoreProgress(percent, message, detail) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    historyDom.restoreBar.style.width = `${value}%`;
    historyDom.restoreBar.parentElement.setAttribute("aria-valuenow", String(value));
    historyDom.restorePercent.innerText = `${value}%`;
    if (message) historyDom.restoreMessage.innerText = message;
    if (detail !== undefined) historyDom.restoreDetail.innerText = detail;
}

function finishHistoryRestoreProgress(success, message) {
    if (success) {
        setHistoryRestoreProgress(100, message || "FMA Viewer 복원이 완료되었습니다.");
        window.setTimeout(() => {
            historyDom.restoreOverlay.style.display = "none";
            setHistoryRestoreButtonsDisabled(false);
            activeRestoreId = "";
        }, 900);
    } else {
        historyDom.restoreOverlay.classList.add("error");
        setHistoryRestoreProgress(0, message || "저장본 복원 중 오류가 발생했습니다.");
        window.setTimeout(() => {
            historyDom.restoreOverlay.style.display = "none";
            historyDom.restoreOverlay.classList.remove("error");
            setHistoryRestoreButtonsDisabled(false);
            activeRestoreId = "";
        }, 2400);
    }
}

function setHistoryRestoreButtonsDisabled(disabled) {
    document.querySelectorAll(".restore-history, .delete-history").forEach(button => {
        button.disabled = disabled;
    });
    historyDom.refresh.disabled = disabled;
    historyDom.deleteAll.disabled = disabled;
}

function handleHistoryRestoreMessage(event) {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.type !== "fma-db-history-restore-progress") return;
    if (activeRestoreId && data.snapshotId && data.snapshotId !== activeRestoreId) return;
    if (data.status === "complete") finishHistoryRestoreProgress(true, data.message);
    else if (data.status === "error") finishHistoryRestoreProgress(false, data.message);
    else setHistoryRestoreProgress(data.percent, data.message, data.detail);
}

async function deleteHistorySnapshot(record) {
    if (!confirm(`“${record.name || "FMA SaveDB"}” 저장본을 삭제할까요?`)) return;
    const db = await openHistoryDatabase();
    const storeName = record.legacy ? LEGACY_HISTORY_STORE : SNAPSHOT_STORE;
    await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).delete(record.id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    await renderHistorySnapshots();
}

async function deleteAllHistorySnapshots() {
    if (!confirm("SaveDB 히스토리를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    const db = await openHistoryDatabase();
    const stores = [SNAPSHOT_STORE, LEGACY_HISTORY_STORE].filter(name => db.objectStoreNames.contains(name));
    await new Promise((resolve, reject) => {
        const transaction = db.transaction(stores, "readwrite");
        stores.forEach(name => transaction.objectStore(name).clear());
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    await renderHistorySnapshots();
}

function historySortLabel(value) {
    return ({ latest: "최신순(생성)", modified: "최신순(수정)", oldest: "오래된순", size: "크기순", type: "종류별", group: "그룹별" })[value] || "최신순(생성)";
}

function formatHistoryBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
    return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

historyDom.refresh.onclick = renderHistorySnapshots;
historyDom.deleteAll.onclick = deleteAllHistorySnapshots;
window.addEventListener("message", handleHistoryRestoreMessage);
window.addEventListener("beforeunload", () => {
    historyPreviewUrls.forEach(url => URL.revokeObjectURL(url));
});
window.addEventListener("DOMContentLoaded", renderHistorySnapshots);
