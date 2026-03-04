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
        await walkAsync(data, "$");
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
    hideLoading();
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
                    group: img.group
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
