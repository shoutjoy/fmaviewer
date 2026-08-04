const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authDirectory = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(authDirectory, 'admin.html'), 'utf8');
const client = fs.readFileSync(path.join(authDirectory, 'admin-auth.js'), 'utf8');
const server = fs.readFileSync(path.join(authDirectory, 'gas', 'Code.gs'), 'utf8');

assert.match(html, /id="adminAuthGate"/);
assert.match(html, /id="adminShell" class="admin-shell" hidden/);
assert.match(html, /admin-auth\.js/);
assert.doesNotMatch(html, /<script src="admin\.js/);
assert.match(html, /id="adminLoginId"/);
assert.match(html, /id="adminLoginPassword"/);
assert.match(html, /id="adminPasswordChangeForm"[^>]*hidden/);
assert.match(html, /초기 비밀번호 <code>a1234567890<\/code>/);
assert.doesNotMatch(html, /initializeAdminAccount를 한 번 실행/);
assert.match(client, /action:\s*"admin-login-params"/);
assert.match(client, /action:\s*"admin-login"/);
assert.match(client, /action:\s*"admin-change-password"/);
assert.match(client, /action:\s*"admin-status"/);
assert.match(client, /GAS_VERSION_MISMATCH/);
assert.match(client, /new Set\(\[configuredUrl, defaultUrl\]/);
assert.match(client, /configApi\.save\(\{ \.\.\.config, gasWebAppUrl \}/);
assert.match(client, /sessionStorage\.setItem\(sessionKey/);
assert.match(client, /script\.src = "admin\.js/);
assert.match(server, /ADMIN_INITIAL_PASSWORD = 'a1234567890'/);
assert.match(server, /passwordChangeRequired:\s*true/);
assert.match(server, /handleAdminChangePasswordPost_/);
assert.match(server, /ADMIN_SESSION_TTL_MS = 60 \* 60 \* 1000/);
assert.doesNotMatch(server, /getSpreadsheetOwnerEmail_/);
assert.doesNotMatch(server, /ADMIN_GRANT_PREFIX/);

console.log('admin-auth.test.cjs: 초기 비밀번호·강제 변경 관리자 인증 계약 검증 통과');
