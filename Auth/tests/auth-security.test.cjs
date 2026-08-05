const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const values = new Map();
let activeGoogleEmail = 'sheet.owner@gmail.com';
let sheetOwnerEmail = 'sheet.owner@gmail.com';
let adminSheet = null;
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

function createMockSheet() {
  const cells = [];
  function ensureCell(row, column) {
    while (cells.length < row) cells.push([]);
    while (cells[row - 1].length < column) cells[row - 1].push('');
  }
  return {
    getLastRow() {
      for (let row = cells.length; row > 0; row -= 1) {
        if ((cells[row - 1] || []).some((value) => value !== '' && value != null)) return row;
      }
      return 0;
    },
    getLastColumn() {
      return cells.reduce((lastColumn, row) => {
        for (let column = row.length; column > 0; column -= 1) {
          if (row[column - 1] !== '' && row[column - 1] != null) return Math.max(lastColumn, column);
        }
        return lastColumn;
      }, 0);
    },
    getRange(startRow, startColumn, numRows = 1, numColumns = 1) {
      return {
        getValues() {
          return Array.from({ length: numRows }, (_, rowOffset) =>
            Array.from({ length: numColumns }, (_, columnOffset) => {
              ensureCell(startRow + rowOffset, startColumn + columnOffset);
              return cells[startRow + rowOffset - 1][startColumn + columnOffset - 1];
            })
          );
        },
        setValues(rows) {
          rows.forEach((row, rowOffset) => row.forEach((value, columnOffset) => {
            ensureCell(startRow + rowOffset, startColumn + columnOffset);
            cells[startRow + rowOffset - 1][startColumn + columnOffset - 1] = value;
          }));
          return this;
        },
        clearContent() {
          for (let rowOffset = 0; rowOffset < numRows; rowOffset += 1) {
            for (let columnOffset = 0; columnOffset < numColumns; columnOffset += 1) {
              ensureCell(startRow + rowOffset, startColumn + columnOffset);
              cells[startRow + rowOffset - 1][startColumn + columnOffset - 1] = '';
            }
          }
          return this;
        }
      };
    },
    setFrozenRows() {},
    snapshot() { return cells.map((row) => row.slice()); }
  };
}

const mockSpreadsheet = {
  getOwner: () => ({ getEmail: () => sheetOwnerEmail }),
  getSheetByName: (name) => name === 'Admin' ? adminSheet : null,
  insertSheet: (name) => {
    if (name !== 'Admin') throw new Error(`Unexpected sheet: ${name}`);
    adminSheet = createMockSheet();
    return adminSheet;
  }
};

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
    openById: () => mockSpreadsheet,
    flush() {}
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
assert.deepEqual(adminSheet.snapshot()[0].slice(0, 5), ['Category', 'ID', 'PW', 'etc', 'status']);
assert.equal(adminSheet.snapshot()[1][0], 'Temporary');
assert.equal(adminSheet.snapshot()[1][1], 'admin');
assert.equal(adminSheet.snapshot()[1][2], 'a1234567890');
assert.equal(adminSheet.snapshot()[1][4], 'active');
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
assert.equal(adminSheet.snapshot()[1][2], '', '비밀번호 변경 후 Admin 시트의 임시 비밀번호는 지워져야 합니다.');
assert.equal(adminSheet.snapshot()[1][4], 'inactive');
assert.equal(adminSheet.snapshot()[2][0], 'In fact');
assert.equal(adminSheet.snapshot()[2][1], 'admin');
assert.match(String(adminSheet.snapshot()[2][2]), /^v1\$600000\$[a-f0-9]{32,128}\$[a-f0-9]{64}$/);
assert.equal(adminSheet.snapshot()[2][3], 'pbkdf2-sha256-v1');
assert.equal(adminSheet.snapshot()[2][4], 'active');
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

adminSheet = createMockSheet();
adminSheet.getRange(1, 1, 3, 7).setValues([
  ['Category', 'ID', 'PW', 'etc', 'status', 'passwordChangeRequired', 'updatedAt'],
  ['Temporary', 'admin', 'a1234567890', 'init pw', 'active', true, new Date()],
  ['In fact', '', '', 'pbkdf2-sha256-v1', 'inactive', '', '']
]);
for (let attempt = 0; attempt < 5; attempt += 1) {
  context.recordLoginFailure_('fma-admin-login:admin');
}
const staleAdminSession = context.createAdminSession_('admin');
assert.equal(context.getLoginRateLimit_('fma-admin-login:admin').locked, true);
const existingLayoutParams = JSON.parse(context.getAdminLoginParametersResponse_('admin').getContent());
assert.equal(existingLayoutParams.success, true);
assert.equal(existingLayoutParams.bootstrapPasswordRequired, true);
assert.equal(adminSheet.snapshot()[1][2], 'a1234567890', '기존 Category/ID/PW 시트 구조를 덮어쓰면 안 됩니다.');
assert.deepEqual(
  adminSheet.snapshot().slice(0, 3).map((row) => row.slice(5, 7)),
  [['', ''], ['', ''], ['', '']],
  '이전 관리자 스키마의 passwordChangeRequired/updatedAt 열 값은 자동 정리되어야 합니다.'
);
assert.equal(context.getLoginRateLimit_('fma-admin-login:admin').locked, false, '스키마 복구 시 관리자 로그인 잠금도 해제해야 합니다.');
assert.equal(context.validateAdminSession_(staleAdminSession.token), null, '스키마 복구 시 이전 관리자 세션을 폐기해야 합니다.');
const recoveredAdminLogin = JSON.parse(context.handleAdminLoginPost_({
  adminId: 'admin',
  bootstrapPassword: 'a1234567890'
}).getContent());
assert.equal(recoveredAdminLogin.adminAuthenticated, true, '복구 후 초기 관리자 비밀번호로 로그인할 수 있어야 합니다.');
context.revokeAdminSession_(recoveredAdminLogin.adminSessionToken);

for (let attempt = 0; attempt < 5; attempt += 1) {
  context.recordLoginFailure_('security.test@gmail.com');
}
assert.equal(context.getLoginRateLimit_('security.test@gmail.com').locked, true);
context.clearLoginFailure_('security.test@gmail.com');
assert.equal(context.getLoginRateLimit_('security.test@gmail.com').locked, false);

console.log('auth-security.test.cjs: 모든 검증 통과');
