const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const values = new Map();
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

for (let attempt = 0; attempt < 5; attempt += 1) {
  context.recordLoginFailure_('security.test@gmail.com');
}
assert.equal(context.getLoginRateLimit_('security.test@gmail.com').locked, true);
context.clearLoginFailure_('security.test@gmail.com');
assert.equal(context.getLoginRateLimit_('security.test@gmail.com').locked, false);

console.log('auth-security.test.cjs: 모든 검증 통과');
