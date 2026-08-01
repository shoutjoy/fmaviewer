let editorPayload = null;
const $ = id => document.getElementById(id);

function targetOrigin() {
    return location.origin === "null" ? "*" : location.origin;
}

function addCustomField(key = "", value = "") {
    const row = document.createElement("div");
    row.className = "custom-row";
    row.innerHTML = '<input class="key" placeholder="항목 이름"><input class="value" placeholder="값"><button class="danger" type="button">×</button>';
    row.querySelector(".key").value = key;
    row.querySelector(".value").value = value;
    row.querySelector("button").onclick = () => row.remove();
    $("custom").appendChild(row);
}

function renderPayload(payload) {
    editorPayload = payload;
    const item = payload.item || {};
    const metadata = item.metadata || {};
    $("technical").innerHTML = (payload.technical || []).map(([label, value]) =>
        `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("");
    $("path").value = item.path || "";
    $("group").value = item.group || "";
    $("createdAt").value = item.createdAt || "";
    $("title").value = metadata.title || "";
    $("author").value = metadata.author || "";
    $("copyright").value = metadata.copyright || "";
    $("keywords").value = Array.isArray(metadata.keywords) ? metadata.keywords.join(", ") : (metadata.keywords || "");
    $("description").value = metadata.description || "";
    $("custom").innerHTML = "";
    Object.entries(metadata.custom || {}).forEach(([key, value]) => addCustomField(key, String(value ?? "")));
    if (!Object.keys(metadata.custom || {}).length) addCustomField();
    $("embedded").textContent = payload.embeddedText || "이 이미지에 읽을 수 있는 메타정보가 없습니다.";
    $("status").textContent = "연결됨 · 저장하면 FMA Viewer에 즉시 반영됩니다.";
    document.title = `메타정보 · ${item.path || "이미지"}`;
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

function save() {
    if (!editorPayload) return;
    const custom = {};
    document.querySelectorAll(".custom-row").forEach(row => {
        const key = row.querySelector(".key").value.trim();
        if (key) custom[key] = row.querySelector(".value").value.trim();
    });
    window.opener?.postMessage({
        type: "fma-metadata-save",
        index: editorPayload.index,
        token: editorPayload.token,
        values: {
            path: $("path").value.trim(), group: $("group").value.trim(), createdAt: $("createdAt").value,
            metadata: { title: $("title").value.trim(), author: $("author").value.trim(), copyright: $("copyright").value.trim(),
                keywords: $("keywords").value.split(",").map(v => v.trim()).filter(Boolean), description: $("description").value.trim(), custom }
        }
    }, targetOrigin());
    $("status").textContent = "저장했습니다.";
}

window.addEventListener("message", event => {
    if (event.source !== window.opener || event.data?.type !== "fma-metadata-data") return;
    renderPayload(event.data.payload);
});
$("addField").onclick = () => addCustomField();
$("saveBtn").onclick = save;
$("cancelBtn").onclick = () => window.close();
$("closeBtn").onclick = () => window.close();
window.opener?.postMessage({ type: "fma-metadata-ready" }, targetOrigin());
