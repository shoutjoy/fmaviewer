const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const values = new Map();
let activeGoogleEmail = 'sheet.owner@gmail.com';
let sheetOwnerEmail = 'sheet.owner@gmail.com';
const scriptProperties = {
  getProperty(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setProperty(key, value) {
    values.set(key, String(value));
    return this;
  },
  deleteProperty(key) {
    values.delete(key);
    return this;
  },
  getKeys() {
    return Array.from(values.keys());
  }
};

function toSignedBytes(buffer) {
  return Array.from(buffer, (byte) => (byte > 127 ? byte - 256 : byte));
}

const context = vm.createContext({
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Object,
  Array,
  RegExp,
  Error,
  Session: {
    getActiveUser: () => ({ getEmail: () => activeGoogleEmail })
  },
  SpreadsheetApp: {
    openById: () => ({
      getOwner: () => ({ getEmail: () => sheetOwnerEmail })
    })
  },
  HtmlService: {
    createHtmlOutput: (html) => ({
      html,
      setTitle() { return this; }
    })
  },
  ContentService: {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (text) => ({
      text,
      setMimeType() { return this; },
      getContent() { return this.text; }
    })
  },
  PropertiesService: {
    getScriptProperties: () => scriptProperties
  },
  LockService: {
    getScriptLock: () => ({
      waitLock() {},
      releaseLock() {}
    })
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    getUuid: () => crypto.randomUUID(),
    computeDigest: (_algorithm, value) => toSignedBytes(
      crypto.createHash('sha256').update(String(value), 'utf8').digest()
    ),
    computeHmacSha256Signature: (value, key) => toSignedBytes(
      crypto.createHmac('sha256', String(key)).update(String(value), 'utf8').digest()
    )
  }
});

const codePath = path.join(__dirname, '..', 'gas', 'Code.gs');
vm.runInContext(fs.readFileSync(codePath, 'utf8'), context, { filename: codePath });

const credential = context.getPasswordCredentialRequest_({
  passwordSalt: '0123456789abcdef0123456789abcdef',
  passwordVerifier: 'a'.repeat(64),
  passwordIterations: 600000
});
assert.equal(credential.salt, '0123456789abcdef0123456789abcdef');
assert.match(credential.hash, /^[a-f0-9]{64}$/);
assert.notEqual(credential.hash, 'a'.repeat(64), '서버에는 클라이언트 verifier 원문을 저장하면 안 됩니다.');
assert.equal(credential.iterations, 600000);
assert.throws(
  () => context.getPasswordCredentialRequest_({
    passwordSalt: 'short',
    passwordVerifier: 'a'.repeat(64),
    passwordIterations: 600000
  }),
  /솔트 형식/
);

assert.equal(context.constantTimeEquals_('same', 'same'), true);
assert.equal(context.constantTimeEquals_('same', 'different'), false);

const session = context.createSession_('security.test@gmail.com');
assert.match(session.token, /^[a-f0-9]{64}$/);
assert.equal(context.validateSession_('security.test@gmail.com', session.token).email, 'security.test@gmail.com');
assert.equal(context.validateSession_('another.user@gmail.com', session.token), null);
assert.equal(
  scriptProperties.getKeys().some((key) => key.includes(session.token)),
  false,
  '세션 저장소에는 원본 토큰이 노출되면 안 됩니다.'
);
context.revokeSession_('security.test@gmail.com', session.token);
assert.equal(context.validateSession_('security.test@gmail.com', session.token), null);

const initialAdminParams = JSON.parse(
  context.getAdminLoginParametersResponse_('admin').getContent()
);
assert.equal(initialAdminParams.success, true);
assert.equal(initialAdminParams.bootstrapPasswordRequired, true);
assert.equal(
  Array.from(values.values()).some((value) => String(value).includes('a1234567890')),
  false,
  '초기 관리자 비밀번호 원문은 Script Properties에 저장되면 안 됩니다.'
);

const invalidInitialAdminLogin = JSON.parse(context.handleAdminLoginPost_({
  adminId: 'admin',
  bootstrapPassword: 'wrong-password'
}).getContent());
assert.equal(invalidInitialAdminLogin.adminAuthenticated, false);

const initialAdminLogin = JSON.parse(context.handleAdminLoginPost_({
  adminId: 'admin',
  bootstrapPassword: 'a1234567890'
}).getContent());
assert.equal(initialAdminLogin.adminAuthenticated, true);
assert.equal(initialAdminLogin.passwordChangeRequired, true);
assert.match(initialAdminLogin.adminSessionToken, /^[a-f0-9]{64}$/);

const changedVerifier = 'c'.repeat(64);
const changedAdminPassword = JSON.parse(context.handleAdminChangePasswordPost_({
  adminSessionToken: initialAdminLogin.adminSessionToken,
  passwordSalt: 'fedcba9876543210fedcba9876543210',
  passwordVerifier: changedVerifier,
  passwordIterations: 600000
}).getContent());
assert.equal(changedAdminPassword.adminAuthenticated, true);
assert.equal(changedAdminPassword.passwordChangeRequired, false);
assert.equal(context.validateAdminSession_(initialAdminLogin.adminSessionToken), null);
assert.equal(context.validateAdminSession_(changedAdminPassword.adminSessionToken).adminId, 'admin');

const initialPasswordReuse = JSON.parse(context.handleAdminLoginPost_({
  adminId: 'admin',
  bootstrapPassword: 'a1234567890'
}).getContent());
assert.equal(initialPasswordReuse.adminAuthenticated, false, '비밀번호 변경 후 초기 비밀번호는 폐기되어야 합니다.');

const changedAdminLogin = JSON.parse(context.handleAdminLoginPost_({
  adminId: 'admin',
  passwordVerifier: changedVerifier
}).getContent());
assert.equal(changedAdminLogin.adminAuthenticated, true);
context.revokeAdminSession_(changedAdminLogin.adminSessionToken);
assert.equal(context.validateAdminSession_(changedAdminLogin.adminSessionToken), null);

for (let attempt = 0; attempt < 5; attempt += 1) {
  context.recordLoginFailure_('security.test@gmail.com');
}
assert.equal(context.getLoginRateLimit_('security.test@gmail.com').locked, true);
context.clearLoginFailure_('security.test@gmail.com');
assert.equal(context.getLoginRateLimit_('security.test@gmail.com').locked, false);

console.log('auth-security.test.cjs: 모든 검증 통과');
