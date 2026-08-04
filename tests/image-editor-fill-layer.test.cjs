const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const editorPath = path.join(__dirname, "..", "js", "image", "imageEditor.js");
const editorSource = fs.readFileSync(editorPath, "utf8");
const sandbox = {
    console,
    document: { addEventListener() {} },
    window: {},
    setTimeout,
    clearTimeout
};
vm.createContext(sandbox);
vm.runInContext(`${editorSource}\n;globalThis.__fillLayerTestApi = {
    createDefaultImageEditorConfig,
    cloneImageEditorConfig,
    normalizeEmptyLayer,
    drawImageEditorFillLayer
};`, sandbox, { filename: editorPath });

const api = sandbox.__fillLayerTestApi;

function createCanvasRecorder(width = 400, height = 300) {
    const calls = [];
    const context = {
        globalAlpha: 1,
        fillStyle: "",
        save() { calls.push(["save"]); },
        restore() { calls.push(["restore"]); },
        fillRect(...args) { calls.push(["fillRect", ...args, this.globalAlpha]); },
        createLinearGradient(...args) {
            const gradient = {
                type: "linear",
                args,
                stops: [],
                addColorStop(offset, color) { this.stops.push([offset, color]); }
            };
            calls.push(["linearGradient", gradient]);
            return gradient;
        },
        createRadialGradient(...args) {
            const gradient = {
                type: "radial",
                args,
                stops: [],
                addColorStop(offset, color) { this.stops.push([offset, color]); }
            };
            calls.push(["radialGradient", gradient]);
            return gradient;
        }
    };
    return {
        width,
        height,
        calls,
        context,
        getContext() { return context; }
    };
}

test("색상 레이어 설정은 FME 구성 복제 시 보존된다", () => {
    const config = api.createDefaultImageEditorConfig();
    config.emptyLayers.push(api.normalizeEmptyLayer({
        id: "fill-1",
        name: "색상 레이어",
        fill: {
            enabled: true,
            mode: "linear",
            color1: "#112233",
            color2: "#aabbcc",
            opacity: 0.42,
            angle: 135
        }
    }));
    config.layerOrder.push({ id: "fill-1", type: "empty" });

    const clone = api.cloneImageEditorConfig(config);
    assert.deepEqual(JSON.parse(JSON.stringify(clone.emptyLayers[0].fill)), {
        enabled: true,
        mode: "linear",
        color1: "#112233",
        color2: "#aabbcc",
        opacity: 0.42,
        angle: 135
    });
    assert.deepEqual(JSON.parse(JSON.stringify(clone.layerOrder)), [
        { id: "fill-1", type: "empty" }
    ]);
});

test("단색 레이어는 지정 Alpha로 캔버스 전체를 채운다", () => {
    const canvas = createCanvasRecorder();
    const layer = api.normalizeEmptyLayer({
        fill: { enabled: true, mode: "solid", color1: "#ff5500", opacity: 0.35 }
    });

    api.drawImageEditorFillLayer(canvas, layer);

    assert.equal(canvas.context.fillStyle, "#ff5500");
    assert.equal(canvas.calls.some(call => call[0] === "fillRect" &&
        call[3] === 400 && call[4] === 300 && call[5] === 0.35), true);
});

test("선형·방사형 그라데이션은 두 색상 스톱을 만든다", () => {
    for (const mode of ["linear", "radial"]) {
        const canvas = createCanvasRecorder();
        const layer = api.normalizeEmptyLayer({
            fill: {
                enabled: true,
                mode,
                color1: "#010203",
                color2: "#fefdfc",
                angle: 45
            }
        });

        api.drawImageEditorFillLayer(canvas, layer);

        const gradientCall = canvas.calls.find(call =>
            call[0] === (mode === "linear" ? "linearGradient" : "radialGradient")
        );
        assert.ok(gradientCall);
        assert.deepEqual(gradientCall[1].stops, [
            [0, "#010203"],
            [1, "#fefdfc"]
        ]);
        assert.equal(canvas.context.fillStyle, gradientCall[1]);
    }
});
