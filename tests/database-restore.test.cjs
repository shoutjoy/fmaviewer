const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "storage", "database.js"),
    "utf8"
);
const context = {
    console,
    URL,
    Date,
    Math,
    Map,
    Set,
    Promise,
    images: [],
    sortedImageOrder: [],
    window: {
        addEventListener() {},
        clearTimeout,
        setTimeout,
        location: { origin: "null" }
    },
    document: {
        addEventListener() {},
        querySelectorAll() { return []; }
    },
    requestAnimationFrame(callback) { callback(); }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "database.js" });

const summary = vm.runInContext(`createDbImageSummary({
    imageId: "record-1",
    blobId: "blob-1",
    payload: {
        path: "sample.png",
        size: 1234,
        isFav: true,
        metadata: { title: "Sample", width: 800, nested: { skip: true } },
        fmeProject: { veryLarge: "payload" }
    }
})`, context);
assert.equal(summary.recordId, "record-1");
assert.equal(summary.blobId, "blob-1");
assert.equal(summary.payload.path, "sample.png");
assert.equal(summary.payload.metadata.title, "Sample");
assert.equal("fmeProject" in summary.payload, false);
assert.equal("nested" in summary.payload.metadata, false);

const restored = vm.runInContext(
    `createDbImageFromSummary(${JSON.stringify(summary)}, "record-1", 0, "2026-08-04T00:00:00.000Z")`,
    context
);
assert.equal(restored.dbRecordId, "record-1");
assert.equal(restored.dbImageId, "blob-1");
assert.equal(restored._dbMetadataLoaded, false);
assert.match(restored.thumbnailSrc, /^data:image\/svg\+xml/);

context.images = [restored];
vm.runInContext("dbRestoreItemsById = new Map([[\"record-1\", images[0]]])", context);
vm.runInContext(`applyDbMetadataEntry("record-1", {
    imageId: "record-1",
    blobId: "blob-1",
    payload: { path: "sample.png", metadata: { title: "Loaded" } },
    payloadRefs: [],
    thumbnailBlob: null,
    metaToken: "token-1"
})`, context);
assert.equal(restored._dbMetadataLoaded, true);
assert.equal(restored.metadata.title, "Loaded");
assert.equal(restored.dbMetaToken, "token-1");

context.images = Array.from({ length: 30 }, (_, index) => ({ dbRecordId: `record-${index}` }));
context.sortedImageOrder = Array.from({ length: 30 }, (_, index) => 29 - index);
const foreground = vm.runInContext("collectDbForegroundRecords(5)", context);
assert.equal(foreground.length, 12);
assert.equal(foreground[0].recordId, "record-5");
assert.equal(new Set(foreground.map(record => record.recordId)).size, foreground.length);

console.log("database-restore.test.cjs: SaveDB 요약 및 우선 복원 검증 통과");
