/* =======================================================
   Database Logic (IndexedDB)
   ======================================================= */

const DB_NAME = "FMADatabase";
const DB_VERSION = 2;
const STORE_NAME = "fma_store";
const HISTORY_STORE_NAME = "fma_history";
const KEY_NAME = "last_fma";

function initDB() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
            const historyStore = db.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
            historyStore.createIndex("savedAt", "savedAt");
        }
    };
    request.onsuccess = checkLastData;
    window.addEventListener("message", handleDbHistoryMessage);
}

function checkLastData() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(STORE_NAME, "readonly");
        const getRequest = tx.objectStore(STORE_NAME).get(KEY_NAME);
        getRequest.onsuccess = () => {
            if (getRequest.result) dom.btnRestore.style.display = "inline-block";
        };
    };
}

function saveToDB(data) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error || new Error("IndexedDB를 열지 못했습니다."));
        request.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(data, KEY_NAME);
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error || new Error("IndexedDB 저장에 실패했습니다."));
            };
            tx.onabort = tx.onerror;
        };
    });
}

function restoreLastSession() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(STORE_NAME, "readonly");
        const getRequest = tx.objectStore(STORE_NAME).get(KEY_NAME);
        getRequest.onsuccess = () => {
            if (getRequest.result) {
                const savedData = getRequest.result;
                if (savedData._isMerged) {
                    images = savedData._data;
                    images.forEach(img => {
                        if (!img.date) img.date = Date.now();
                        if (!img.size) img.size = 0;
                    });
                    renderGallery();
                    renderFavorites();
                    dom.imageCount.innerText = "Images: " + images.length;
                    if (images.length > 0 && typeof showImage === 'function') showImage(0);
                } else {
                    processFMAData(savedData);
                }
            }
        };
    };
}

function saveCurrentImagesToDB(throwOnError = false) {
    const operation = saveToDB({ _isMerged: true, _data: images });
    return throwOnError
        ? operation
        : operation.catch(error => {
            console.warn("Current image DB save failed:", error);
            return false;
        });
}

function openFmaDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
                const historyStore = db.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
                historyStore.createIndex("savedAt", "savedAt");
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB를 열지 못했습니다."));
    });
}

function createCurrentDbSnapshot() {
    const savedAt = new Date().toISOString();
    const gridColumns = Number(
        getComputedStyle(document.documentElement).getPropertyValue("--grid-cols")
    ) || 2;
    return {
        id: `fma-db-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: `FMA ${new Date(savedAt).toLocaleString("ko-KR")}`,
        savedAt,
        imageCount: images.length,
        approximateBytes: images.reduce((total, item) => total + (Number(item.size) || 0), 0),
        images,
        state: {
            currentIndex,
            sortMode,
            orientation,
            viewMode,
            navStep,
            gridColumns,
            zoom
        }
    };
}

async function saveCurrentStateToDbHistory() {
    if (!images.length) {
        alert("SaveDB에 저장할 이미지가 없습니다.");
        return;
    }
    const previousText = dom.btnSaveDbSnapshot.innerHTML;
    dom.btnSaveDbSnapshot.disabled = true;
    dom.btnSaveDbSnapshot.innerHTML = "<span>…</span> DB 저장 중";
    try {
        const db = await openFmaDatabase();
        const snapshot = createCurrentDbSnapshot();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction(HISTORY_STORE_NAME, "readwrite");
            transaction.objectStore(HISTORY_STORE_NAME).put(snapshot);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        db.close();
        dom.btnSaveDbMenu.innerText = "SaveDB ✓ ▾";
        window.setTimeout(() => {
            dom.btnSaveDbMenu.innerText = "SaveDB ▾";
        }, 1800);
    } catch (error) {
        console.error("SaveDB failed:", error);
        alert("현재 상태를 SaveDB에 저장하지 못했습니다: " + error.message);
    } finally {
        dom.btnSaveDbSnapshot.disabled = false;
        dom.btnSaveDbSnapshot.innerHTML = previousText;
    }
}

function openDbHistoryWindow() {
    const width = Math.min(980, Math.max(720, window.screen.availWidth * .72));
    const height = Math.min(820, Math.max(560, window.screen.availHeight * .78));
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
    const historyWindow = window.open(
        `db_history.html?v=20260731-4`,
        "fmaDbHistory",
        `popup=yes,width=${Math.round(width)},height=${Math.round(height)},left=${Math.round(left)},top=${Math.round(top)}`
    );
    if (!historyWindow) {
        alert("DB 히스토리 창을 열지 못했습니다. 브라우저의 팝업 허용 설정을 확인하세요.");
    }
}

let dbHistoryRestoreInProgress = false;

async function handleDbHistoryMessage(event) {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.type !== "fma-db-history-restore" || !data.snapshotId) return;
    if (dbHistoryRestoreInProgress) {
        postDbHistoryRestoreProgress(event.source, {
            snapshotId: data.snapshotId,
            percent: 0,
            message: "다른 SaveDB 저장본을 불러오는 중입니다.",
            status: "error"
        });
        return;
    }
    dbHistoryRestoreInProgress = true;
    try {
        postDbHistoryRestoreProgress(event.source, {
            snapshotId: data.snapshotId,
            percent: 27,
            message: "브라우저 IndexedDB에서 저장본을 읽는 중입니다.",
            detail: "대용량 저장본은 잠시 시간이 걸릴 수 있습니다.",
            status: "progress"
        });
        const snapshot = await readDbHistorySnapshotById(data.snapshotId);
        if (!snapshot) throw new Error("선택한 SaveDB 저장본을 찾을 수 없습니다.");
        postDbHistoryRestoreProgress(event.source, {
            snapshotId: data.snapshotId,
            percent: 30,
            message: "저장본 읽기를 완료했습니다. 이미지를 복원합니다.",
            detail: `${snapshot.imageCount || snapshot.images?.length || 0}개 이미지`,
            status: "progress"
        });
        await applyDbHistorySnapshot(snapshot, event.source);
    } catch (error) {
        console.error("SaveDB snapshot read failed:", error);
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

async function readDbHistorySnapshotById(snapshotId) {
    const db = await openFmaDatabase();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction(HISTORY_STORE_NAME, "readonly");
            const request = transaction.objectStore(HISTORY_STORE_NAME).get(snapshotId);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(
                request.error || new Error("IndexedDB 저장본 읽기에 실패했습니다.")
            );
            transaction.onabort = () => reject(
                transaction.error || new Error("IndexedDB 읽기 작업이 중단되었습니다.")
            );
        });
    } finally {
        db.close();
    }
}

async function applyDbHistorySnapshot(snapshot, progressTarget) {
    const snapshotId = snapshot.id || "";
    const restoredImages = Array.isArray(snapshot.images) ? snapshot.images : [];
    const total = restoredImages.length;
    const report = async (percent, message, detail = "") => {
        const value = Math.max(0, Math.min(100, Math.round(percent)));
        if (value < 100) {
            if (dom.loadingOverlay.style.display === "none") showLoading(message);
            else dom.loadingTitle.innerText = message;
            updateLoading(value);
        }
        postDbHistoryRestoreProgress(progressTarget, {
            snapshotId,
            percent: value,
            message,
            detail,
            status: value >= 100 ? "complete" : "progress"
        });
        await waitForDbRestorePaint();
    };

    try {
        await report(31, "SaveDB 저장본을 불러오는 중입니다.", `${total}개 이미지 복원 준비`);
        images = restoredImages;
        const chunkSize = Math.max(1, Math.ceil(Math.max(1, total) / 20));
        for (let index = 0; index < total; index++) {
            const item = images[index];
            if (!item.date) item.date = Date.now();
            if (!item.size) item.size = 0;
            if ((index + 1) % chunkSize === 0 || index === total - 1) {
                const ratio = (index + 1) / Math.max(1, total);
                await report(
                    34 + ratio * 34,
                    "저장된 이미지를 복원하는 중입니다.",
                    `${index + 1} / ${total} 이미지`
                );
            }
        }

        const state = snapshot.state || {};
        sortMode = ["latest", "oldest", "size", "type", "group"].includes(state.sortMode)
            ? state.sortMode
            : "latest";
        dom.sortSelect.value = sortMode;
        orientation = state.orientation === "vert" ? "vert" : "horz";
        viewMode = state.viewMode === 2 ? 2 : 1;
        navStep = state.navStep === 2 ? 2 : 1;
        zoom = Number.isFinite(Number(state.zoom)) ? Number(state.zoom) : 1;
        changeGrid([1, 2, 3, 4].includes(Number(state.gridColumns)) ? Number(state.gridColumns) : 2);
        currentIndex = images.length
            ? Math.max(0, Math.min(images.length - 1, Number(state.currentIndex) || 0))
            : 0;
        updateModeButtons();
        updateStepButtons();

        await report(72, "갤러리 목록을 구성하는 중입니다.", `${total}개 이미지`);
        renderGallery();
        await report(82, "즐겨찾기와 보기 상태를 복원하는 중입니다.");
        renderFavorites();
        dom.imageCount.innerText = "Images: " + images.length;
        await report(90, "현재 이미지를 화면에 표시하는 중입니다.");
        if (images.length) {
            if (orientation === "vert") renderVerticalPreview();
            else showImage(currentIndex);
        }
        await report(96, "복원된 상태를 브라우저 저장소에 기록하는 중입니다.");
        await saveCurrentImagesToDB(true);
        updateLoading(100);
        postDbHistoryRestoreProgress(progressTarget, {
            snapshotId,
            percent: 100,
            message: "SaveDB 저장본을 모두 불러왔습니다.",
            detail: `${total}개 이미지 복원 완료`,
            status: "complete"
        });
        await new Promise(resolve => window.setTimeout(resolve, 450));
        hideLoading();
    } catch (error) {
        console.error("SaveDB restore failed:", error);
        hideLoading();
        postDbHistoryRestoreProgress(progressTarget, {
            snapshotId,
            percent: 0,
            message: "SaveDB 복원 중 오류가 발생했습니다: " + error.message,
            status: "error"
        });
        alert("SaveDB 저장본을 불러오지 못했습니다: " + error.message);
    }
}

function waitForDbRestorePaint() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

function postDbHistoryRestoreProgress(target, payload) {
    if (!target || target.closed) return;
    try {
        target.postMessage(
            { type: "fma-db-history-restore-progress", ...payload },
            window.location.origin === "null" ? "*" : window.location.origin
        );
    } catch (error) {
        console.warn("DB history progress message failed:", error);
    }
}
