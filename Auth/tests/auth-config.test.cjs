const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const latestUrl = 'https://script.google.com/macros/s/AKfycbxb89OH02WBeIljK-PY8-jqp6DYy31AnzqGh4U9DsPok2Zer6ccfFVXYsymXan5Gw5R/exec';
const previousUrl = 'https://script.google.com/macros/s/AKfycbylMbOHMhWgGrFZb00zkidmvGdtRg7qYQUfFSuKSiwW4Lj1j1H2An_bpRgPCbsRlRjM/exec';
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
assert.equal(JSON.parse(localStorage.getItem(storageKey)).gasWebAppUrl, latestUrl);

values.clear();
const freshBrowserConfig = windowMock.FMAAdminConfig.load();
assert.equal(freshBrowserConfig.gasWebAppUrl, latestUrl, '새 브라우저도 최신 GAS URL을 기본값으로 사용해야 합니다.');

console.log('auth-config.test.cjs: 브라우저 간 GAS URL 마이그레이션 검증 통과');
