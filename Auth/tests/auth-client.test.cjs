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
elements.set('authLoginEmail', { id: 'authLoginEmail', disabled: false, textContent: '', value: '' });
elements.set('firstUseModal', { id: 'firstUseModal', style: { display: 'flex' }, dataset: {} });
elements.set('authLogoutButton', { id: 'authLogoutButton', hidden: false });
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

assert.equal(context.normalizeGmailAddress(' ShoutJoy97 '), 'shoutjoy97@gmail.com');
assert.equal(context.normalizeGmailAddress('User.Name@gmail.com'), 'user.name@gmail.com');
assert.equal(context.normalizeGmailAddress('user@example.com'), 'user@example.com');
elements.get('authLoginEmail').value = 'shoutjoy97';
assert.equal(context.completeGmailInput(elements.get('authLoginEmail')), 'shoutjoy97@gmail.com');
assert.equal(elements.get('authLoginEmail').value, 'shoutjoy97@gmail.com');

context.hideAuthModalForSessionResume();
assert.equal(elements.get('firstUseModal').style.display, 'none');
assert.equal(elements.get('firstUseModal').dataset.authResuming, 'true');
assert.equal(elements.get('authLogoutButton').hidden, true);

context.handleLogoutButtonClick();
assert.equal(confirmMessage, '로그아웃하시겠습니까?');

const indexSource = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const modalSource = fs.readFileSync(path.join(__dirname, '..', 'modal.js'), 'utf8');
assert.match(
  indexSource,
  /id="authLogoutButton" class="settings-logout-button"/,
  '로그아웃 버튼은 앱 설정 하단에 있어야 합니다.'
);
assert.match(modalSource, /설정 푸터가 없는 독립 연동 프로젝트/);
assert.match(modalSource, /hasResumableSession/);
assert.match(fs.readFileSync(codePath, 'utf8'), /resumeSession\(session\)[\s\S]*hideAuthModalForSessionResume\(\)/);
assert.doesNotMatch(fs.readFileSync(codePath, 'utf8'), /beginLogoutButtonDrag|positionLogoutButton/);

console.log('auth-client.test.cjs: 인증 입력, 세션 복원 숨김 및 설정 푸터 로그아웃 검증 통과');
