const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const authDirectory = path.join(__dirname, '..');

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
const documentMock = { currentScript: { src: 'https://fmaviewer.example/Auth/settings.js' } };
const windowMock = {
  localStorage,
  document: documentMock,
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
  Error,
  document: documentMock,
  fetch: async () => ({
    ok: true,
    status: 200,
    text: async () => fs.readFileSync(path.join(authDirectory, 'gas', 'Code.gs'), 'utf8')
  })
});

(async function run() {
const codeSource = fs.readFileSync(path.join(authDirectory, 'gas', 'Code.gs'), 'utf8');
const generatedVersionSource = fs.readFileSync(path.join(authDirectory, 'gas', 'version.generated.js'), 'utf8');
const codeVersion = codeSource.match(/const\s+SERVER_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const generatedVersion = generatedVersionSource.match(/FMA_CODE_GS_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
assert.equal(generatedVersion, codeVersion, '로컬 fallback 버전은 Code.gs SERVER_VERSION과 같아야 합니다.');

const fallbackWindow = {
  FMA_CODE_GS_VERSION: generatedVersion,
  document: documentMock,
  location: { href: 'file:///C:/app/Auth/admin.html', protocol: 'file:' }
};
const fallbackContext = vm.createContext({
  window: fallbackWindow,
  document: documentMock,
  URL,
  Date,
  String,
  Object,
  Error,
  console,
  fetch: async () => { throw new Error('file fetch blocked'); }
});
vm.runInContext(fs.readFileSync(path.join(authDirectory, 'settings.js'), 'utf8'), fallbackContext);
await fallbackWindow.FMAAuthSettingsReady;
assert.equal(fallbackWindow.FMAAuthSettings.serverVersion, codeVersion);
assert.equal(fallbackWindow.FMAAuthSettings.serverVersionError, '');

vm.runInContext(fs.readFileSync(path.join(authDirectory, 'settings.js'), 'utf8'), context);
await windowMock.FMAAuthSettingsReady;
assert.equal(windowMock.FMAAuthSettings.gasWebAppUrl, '');
assert.equal(windowMock.FMAAuthSettings.serverVersion, '2026-08-05-admin-sheet-account-v2');
assert.match(windowMock.FMAAuthSettings.serverVersionSourceUrl, /\/Auth\/gas\/Code\.gs$/);
assert.equal(windowMock.FMAAuthSettings.spreadsheetUrl, spreadsheetUrl);
assert.equal(windowMock.FMAAuthSettings.appsScriptProjectUrl, appsScriptProjectUrl);

const storageKey = 'fma_viewer_admin_config_v3';
const legacyStorageKey = 'fma_viewer_admin_config_v2';
localStorage.setItem(legacyStorageKey, JSON.stringify({
  gasWebAppUrl: previousUrl,
  checksPerDay: 1,
  blockedCheckMinutes: 5,
  updatedAt: '2026-08-03T00:00:00.000Z'
}));
vm.runInContext(fs.readFileSync(path.join(authDirectory, 'config.js'), 'utf8'), context);

const migrated = windowMock.FMAAdminConfig.load();
assert.equal(migrated.gasWebAppUrl, '', '이전 하드코딩 GAS URL은 새 설정에서 자동 사용하면 안 됩니다.');
assert.equal(migrated.spreadsheetUrl, spreadsheetUrl, '기존 설정에는 기본 Google Sheet 주소가 보완되어야 합니다.');
assert.equal(migrated.appsScriptProjectUrl, appsScriptProjectUrl, '기존 설정에는 기본 Apps Script 편집기 주소가 보완되어야 합니다.');
assert.equal(localStorage.getItem(storageKey), null);

values.clear();
const freshBrowserConfig = windowMock.FMAAdminConfig.load();
assert.equal(freshBrowserConfig.gasWebAppUrl, '', '새 브라우저는 GAS URL을 직접 입력해야 합니다.');
assert.equal(freshBrowserConfig.spreadsheetUrl, spreadsheetUrl);
assert.equal(freshBrowserConfig.appsScriptProjectUrl, appsScriptProjectUrl);

const savedDeployment = windowMock.FMAAdminConfig.save({ ...freshBrowserConfig, gasWebAppUrl: latestUrl }, { recordHistory: false });
assert.equal(savedDeployment.gasWebAppUrl, latestUrl);
assert.equal(JSON.parse(localStorage.getItem(storageKey)).gasWebAppUrl, latestUrl);

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
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
