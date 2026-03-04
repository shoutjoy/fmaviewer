/* =======================================================
   Database Logic (IndexedDB)
   ======================================================= */

const DB_NAME = "FMADatabase";
const STORE_NAME = "fma_store";
const KEY_NAME = "last_fma";

function initDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = checkLastData;
}

function checkLastData() {
    const request = indexedDB.open(DB_NAME, 1);
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
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(data, KEY_NAME);
    };
}

function restoreLastSession() {
    const request = indexedDB.open(DB_NAME, 1);
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

function saveCurrentImagesToDB() {
    saveToDB({ _isMerged: true, _data: images });
}
