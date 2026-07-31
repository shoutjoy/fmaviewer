/* FMA Viewer SaveDB history manager */

const FMA_DB_NAME = "FMADatabase";
const FMA_DB_VERSION = 2;
const FMA_HISTORY_STORE = "fma_history";

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

function openHistoryDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(FMA_DB_NAME, FMA_DB_VERSION);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("fma_store")) db.createObjectStore("fma_store");
            if (!db.objectStoreNames.contains(FMA_HISTORY_STORE)) {
                const store = db.createObjectStore(FMA_HISTORY_STORE, { keyPath: "id" });
                store.createIndex("savedAt", "savedAt");
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB를 열지 못했습니다."));
    });
}

async function getHistorySnapshots() {
    const db = await openHistoryDatabase();
    const records = await new Promise((resolve, reject) => {
        const transaction = db.transaction(FMA_HISTORY_STORE, "readonly");
        const request = transaction.objectStore(FMA_HISTORY_STORE).openCursor();
        const summaries = [];
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(summaries);
                return;
            }
            const record = cursor.value || {};
            summaries.push({
                id: record.id,
                name: record.name,
                savedAt: record.savedAt,
                imageCount: record.imageCount || record.images?.length || 0,
                approximateBytes: record.approximateBytes || 0,
                state: record.state || {},
                previewSrc: record.images?.[0]?.src || ""
            });
            cursor.continue();
        };
        request.onerror = () => reject(request.error);
    });
    db.close();
    return records.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

async function renderHistorySnapshots() {
    historyDom.status.style.display = "block";
    historyDom.status.innerText = "DB 히스토리를 불러오는 중…";
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
    fragment.querySelector(".saved-at").innerText =
        new Date(record.savedAt).toLocaleString("ko-KR");

    const firstImage = record.previewSrc;
    if (typeof firstImage === "string" && firstImage.startsWith("data:image")) {
        const image = document.createElement("img");
        image.src = firstImage;
        image.alt = "저장 상태 첫 이미지";
        fragment.querySelector(".db-history-thumb").replaceChildren(image);
    }

    const state = record.state || {};
    const badges = [
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
    if (!window.opener || window.opener.closed) {
        alert("FMA Viewer 창이 닫혀 있습니다. FMA Viewer의 SaveDB 메뉴에서 이 창을 다시 여세요.");
        return;
    }
    activeRestoreId = record.id;
    setHistoryRestoreButtonsDisabled(true);
    showHistoryRestoreProgress(
        4,
        "저장본 정보를 확인하고 있습니다.",
        `${record.imageCount || 0}개 이미지 · ${formatHistoryBytes(record.approximateBytes || 0)}`
    );
    await waitForHistoryPaint();
    setHistoryRestoreProgress(12, "FMA Viewer에 저장본 불러오기를 요청하고 있습니다.");
    await waitForHistoryPaint();
    try {
        window.opener.postMessage({
            type: "fma-db-history-restore",
            snapshotId: record.id
        }, getHistoryMessageOrigin());
        setHistoryRestoreProgress(24, "FMA Viewer가 IndexedDB 저장본을 직접 읽고 있습니다.");
        window.opener.focus();
    } catch (error) {
        finishHistoryRestoreProgress(false, "저장본을 FMA Viewer로 전달하지 못했습니다: " + error.message);
    }
}

function getHistoryMessageOrigin() {
    return window.location.origin === "null" ? "*" : window.location.origin;
}

function waitForHistoryPaint() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
    if (data.status === "complete") {
        finishHistoryRestoreProgress(true, data.message);
    } else if (data.status === "error") {
        finishHistoryRestoreProgress(false, data.message);
    } else {
        setHistoryRestoreProgress(data.percent, data.message, data.detail);
    }
}

async function deleteHistorySnapshot(record) {
    if (!confirm(`“${record.name || "FMA SaveDB"}” 저장본을 삭제할까요?`)) return;
    const db = await openHistoryDatabase();
    await new Promise((resolve, reject) => {
        const transaction = db.transaction(FMA_HISTORY_STORE, "readwrite");
        transaction.objectStore(FMA_HISTORY_STORE).delete(record.id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    await renderHistorySnapshots();
}

async function deleteAllHistorySnapshots() {
    if (!confirm("SaveDB 히스토리를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    const db = await openHistoryDatabase();
    await new Promise((resolve, reject) => {
        const transaction = db.transaction(FMA_HISTORY_STORE, "readwrite");
        transaction.objectStore(FMA_HISTORY_STORE).clear();
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    await renderHistorySnapshots();
}

function historySortLabel(value) {
    return {
        latest: "최신순",
        oldest: "오래된순",
        size: "크기순",
        type: "종류별",
        group: "그룹별"
    }[value] || "최신순";
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
document.addEventListener("DOMContentLoaded", renderHistorySnapshots);
