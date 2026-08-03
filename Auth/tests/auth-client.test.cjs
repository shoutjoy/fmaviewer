const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const registrationIds = [
  'firstUseGmail',
  'firstUseName',
  'firstUseOrganization',
  'firstUsePassword',
  'firstUsePasswordConfirm',
  'firstUsePurpose',
  'firstUsePrivacyConsent',
  'btnBackToLogin',
  'btnFirstUseContinue'
];
const elements = new Map(registrationIds.map((id) => [id, { id, disabled: false, textContent: '' }]));
const noOp = () => {};
let confirmMessage = '';
const documentMock = {
  getElementById: (id) => elements.get(id) || null,
  querySelectorAll: () => [],
  addEventListener: noOp,
  documentElement: { classList: { toggle: noOp } }
};
const windowMock = {
  FMAAuthSettings: {},
  addEventListener: noOp,
  crypto: crypto.webcrypto,
  confirm: (message) => {
    confirmMessage = message;
    return false;
  }
};

const context = vm.createContext({
  window: windowMock,
  document: documentMock,
  console,
  crypto: crypto.webcrypto,
  TextEncoder,
  Uint8Array,
  URL,
  URLSearchParams,
  AbortController,
  setTimeout,
  clearTimeout,
  localStorage: {},
  sessionStorage: {}
});

const codePath = path.join(__dirname, '..', 'client.js');
vm.runInContext(fs.readFileSync(codePath, 'utf8'), context, { filename: codePath });

context.setRegistrationMode('verifying');
for (const id of registrationIds.slice(0, -1)) {
  assert.equal(elements.get(id).disabled, false, `${id}는 인증 대기 중에도 수정 가능해야 합니다.`);
}
assert.equal(elements.get('btnFirstUseContinue').disabled, false);
assert.equal(elements.get('btnFirstUseContinue').textContent, '수정 내용으로 인증 메일 다시 보내기');

context.setRegistrationMode('requesting');
for (const id of registrationIds) {
  assert.equal(elements.get(id).disabled, true, `${id}는 실제 발송 처리 중에는 중복 요청 방지를 위해 잠겨야 합니다.`);
}

context.setRegistrationMode('idle');
for (const id of registrationIds) {
  assert.equal(elements.get(id).disabled, false, `${id}는 발송 처리 후 다시 활성화되어야 합니다.`);
}

assert.deepEqual(
  { ...context.clampLogoutButtonCoordinates(-50, 900, 42, 42, 800, 600) },
  { x: 8, y: 550 },
  '플로팅 로그아웃 버튼은 화면 밖으로 이동하면 안 됩니다.'
);

context.handleLogoutButtonClick({ preventDefault: noOp, stopPropagation: noOp });
assert.equal(confirmMessage, '로그아웃하시겠습니까?');

console.log('auth-client.test.cjs: 인증 입력 및 플로팅 로그아웃 검증 통과');
