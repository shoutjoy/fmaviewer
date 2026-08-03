const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const latestUrl = 'https://script.google.com/macros/s/AKfycbxb89OH02WBeIljK-PY8-jqp6DYy31AnzqGh4U9DsPok2Zer6ccfFVXYsymXan5Gw5R/exec';
const previousUrl = 'https://script.google.com/macros/s/AKfycbylMbOHMhWgGrFZb00zkidmvGdtRg7qYQUfFSuKSiwW4Lj1j1H2An_bpRgPCbsRlRjM/exec';
const spreadsheetId = '1xNA955JIwe5cHETAMMMaCEfb1QtZnbuc9tKbEDQ573w';
const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=2013460554#gid=2013460554`;
const appsScriptProjectUrl = 'https://script.google.com/u/0/home/projects/1uhzkAW5vS8kqRVG761QgQ_ft0yw7ujXpGGXm4lX-l9SGlcmGCAdb5zRB/edit';
const values = new Map();
const localStorage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key)
};
const windowMock = {
  localStorage,
  location: { search: '', pathname: '/', hash: '' },
  history: { replaceState() {} },
  dispatchEvent() {}
};
const context = vm.createContext({
  window: windowMock,
  localStorage,
  URL,
  URLSearchParams,
  CustomEvent: class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options && options.detail;
    }
  },
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Object,
  Array,
  Set,
  Error
});

const authDirectory = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(authDirectory, 'settings.js'), 'utf8'), context);
assert.equal(windowMock.FMAAuthSettings.gasWebAppUrl, latestUrl);
assert.equal(windowMock.FMAAuthSettings.spreadsheetUrl, spreadsheetUrl);
assert.equal(windowMock.FMAAuthSettings.appsScriptProjectUrl, appsScriptProjectUrl);

const storageKey = 'fma_viewer_admin_config_v2';
localStorage.setItem(storageKey, JSON.stringify({
  gasWebAppUrl: previousUrl,
  checksPerDay: 1,
  blockedCheckMinutes: 5,
  updatedAt: '2026-08-03T00:00:00.000Z'
}));
vm.runInContext(fs.readFileSync(path.join(authDirectory, 'config.js'), 'utf8'), context);

const migrated = windowMock.FMAAdminConfig.load();
assert.equal(migrated.gasWebAppUrl, latestUrl, '이전 브라우저의 구 GAS URL은 최신 배포 URL로 이동해야 합니다.');
assert.equal(migrated.spreadsheetUrl, spreadsheetUrl, '기존 설정에는 기본 Google Sheet 주소가 보완되어야 합니다.');
assert.equal(migrated.appsScriptProjectUrl, appsScriptProjectUrl, '기존 설정에는 기본 Apps Script 편집기 주소가 보완되어야 합니다.');
assert.equal(JSON.parse(localStorage.getItem(storageKey)).gasWebAppUrl, latestUrl);

values.clear();
const freshBrowserConfig = windowMock.FMAAdminConfig.load();
assert.equal(freshBrowserConfig.gasWebAppUrl, latestUrl, '새 브라우저도 최신 GAS URL을 기본값으로 사용해야 합니다.');
assert.equal(freshBrowserConfig.spreadsheetUrl, spreadsheetUrl);
assert.equal(freshBrowserConfig.appsScriptProjectUrl, appsScriptProjectUrl);

assert.equal(windowMock.FMAAdminConfig.getSpreadsheetId(spreadsheetUrl), spreadsheetId);
assert.throws(
  () => windowMock.FMAAdminConfig.normalizeSpreadsheetUrl('https://example.com/not-a-sheet'),
  /Google Sheet/
);
assert.equal(
  windowMock.FMAAdminConfig.normalizeAppsScriptProjectUrl(appsScriptProjectUrl),
  appsScriptProjectUrl
);
assert.equal(windowMock.FMAAdminConfig.normalizeAppsScriptProjectUrl(''), '');

const gasTemplate = "const SPREADSHEET_ID = 'old-id';\nfunction doGet() {}\n";
const configuredGasCode = windowMock.FMAAdminConfig.applySpreadsheetIdToGasCode(gasTemplate, spreadsheetUrl);
assert.match(configuredGasCode, new RegExp(`const SPREADSHEET_ID = '${spreadsheetId}';`));
assert.doesNotMatch(configuredGasCode, /old-id/);
assert.throws(
  () => windowMock.FMAAdminConfig.applySpreadsheetIdToGasCode('function doGet() {}', spreadsheetUrl),
  /SPREADSHEET_ID/
);

console.log('auth-config.test.cjs: GAS·Google Sheet·Apps Script 설정 검증 통과');
