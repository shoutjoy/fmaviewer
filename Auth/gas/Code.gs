/*
 * FMA Viewer verified registration, password login, and status server
 * CODE VERSION: 2026-08-05-admin-recovery-v3
 * Google Apps Script의 함수 목록에서 version을 실행하면 현재 버전을 확인할 수 있습니다.
 */

const SHEET_NAME = 'Users';
const NOTIFICATION_EMAIL = 'shoutjoy1@yonsei.ac.kr';
const EXPECTED_SENDER_EMAIL = 'shoutjoy1@gmail.com';
const SERVER_VERSION = '2026-08-05-admin-recovery-v3';
const SPREADSHEET_ID = '1xNA955JIwe5cHETAMMMaCEfb1QtZnbuc9tKbEDQ573w';
const VERIFICATION_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_KDF_ITERATIONS = 600000;
const PENDING_TOKEN_PREFIX = 'fma_pending_token_';
const PENDING_EMAIL_PREFIX = 'fma_pending_email_';
const SESSION_PREFIX = 'fma_session_v1_';
const LOGIN_FAILURE_PREFIX = 'fma_login_failure_v1_';
const CREDENTIAL_PEPPER_KEY = 'fma_credential_pepper_v1';
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const ADMIN_ID = 'admin';
const ADMIN_INITIAL_PASSWORD = 'a1234567890';
const ADMIN_SHEET_NAME = 'Admin';
const ADMIN_SHEET_HEADERS = ['Category', 'ID', 'PW', 'etc', 'status'];
const ADMIN_TEMP_CATEGORY = 'Temporary';
const ADMIN_ACTUAL_CATEGORY = 'In fact';
const ADMIN_ACTIVE_STATUS = 'active';
const ADMIN_INACTIVE_STATUS = 'inactive';
const ADMIN_PASSWORD_FORMAT = 'pbkdf2-sha256-v1';
const ADMIN_SESSION_TTL_MS = 60 * 60 * 1000;
const ADMIN_SESSION_PREFIX = 'fma_admin_session_v1_';
const ADMIN_LOGIN_RATE_KEY = 'fma-admin-login:admin';
const SHEET_HEADERS = [
  'RequestedAt',
  'Email',
  'Status',
  'LastVerifiedAt',
  'VerifiedAt',
  'NotifiedAt',
  'NotificationError',
  'Name',
  'Organization',
  'Purpose',
  'PasswordSalt',
  'PasswordHash',
  'PasswordIterations',
  'PasswordUpdatedAt'
];

function version() {
  console.log('FMA Viewer Code.gs version: ' + SERVER_VERSION);
  return SERVER_VERSION;
}

function doPost(e) {
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') {
      console.warn('doPost는 웹 POST 요청으로 호출하십시오. 편집기에서는 authorizeServices 또는 testNotificationEmail을 실행할 수 있습니다.');
      return json_({ success: false, message: 'doPost must be called by an HTTP POST request.' });
    }

    const requestData = JSON.parse(e.postData.contents);
    const action = String(requestData.action || 'register').trim().toLowerCase();
    if (action === 'admin-login-params') return getAdminLoginParametersResponse_(requestData.adminId);
    if (action === 'admin-login') return handleAdminLoginPost_(requestData);
    if (action === 'admin-change-password') return handleAdminChangePasswordPost_(requestData);
    if (action === 'admin-status') return handleAdminStatusPost_(requestData);
    if (action === 'admin-logout') return handleAdminLogoutPost_(requestData);
    if (action === 'login') return handleLoginPost_(requestData);
    if (action === 'logout') return handleLogoutPost_(requestData);
    if (action === 'check' || action === 'status') return handleAuthenticatedStatusPost_(requestData, action);
    if (action !== 'register') {
      return json_({ success: false, message: '지원하지 않는 인증 요청입니다.', serverVersion: SERVER_VERSION });
    }
    return handleRegistrationPost_(requestData);
  } catch (error) {
    console.error(error);
    return json_({
      success: false,
      saved: false,
      serverVersion: SERVER_VERSION,
      message: String(error && error.message || error)
    });
  }
}

// Send a verification email. Credentials are written to Users only after the link is opened.
function handleRegistrationPost_(requestData) {
  const userEmail = normalizeEmail_(requestData.email);
  const requestId = String(requestData.requestId || '').trim().toLowerCase();
  const application = getApplicationDetails_(requestData);
  const passwordCredential = getPasswordCredentialRequest_(requestData);
  if (!isValidGmail_(userEmail)) {
    return json_({ success: false, saved: false, message: '올바른 @gmail.com 주소가 필요합니다.', serverVersion: SERVER_VERSION });
  }
  if (!/^[a-f0-9]{64}$/.test(requestId)) {
    return json_({ success: false, saved: false, message: '올바른 이메일 인증 요청 ID가 필요합니다.', serverVersion: SERVER_VERSION });
  }

  const now = new Date();
  const sheet = getUsersSheet_();
  const data = sheet.getDataRange().getValues();
  const row = findUserRow_(data, userEmail);
  if (row > 0) {
    const currentStatus = normalizeStatus_(data[row - 1][2]);
    if (currentStatus === 'Blocked') {
      return json_({
        success: false,
        saved: false,
        blocked: true,
        status: 'Blocked',
        serverVersion: SERVER_VERSION,
        message: '이 Gmail은 관리자에 의해 사용이 중지되었습니다.'
      });
    }
    if (currentStatus !== 'Active') {
      return json_({
        success: false,
        saved: false,
        invalidStatus: true,
        status: 'Invalid',
        serverVersion: SERVER_VERSION,
        message: 'Users 시트의 Status를 Active 또는 Blocked로 수정해 주세요.'
      });
    }
  }

  const pending = createPendingVerification_(userEmail, now, requestId, application, passwordCredential);
  try {
    sendVerificationEmail_(userEmail, now, pending.verificationUrl);
  } catch (mailError) {
    clearPendingVerification_(pending.tokenHash, userEmail);
    throw new Error('인증 메일 발송에 실패했습니다: ' + String(mailError && mailError.message || mailError));
  }

  return json_({
    success: true,
    registered: false,
    pending: true,
    verificationSent: true,
    serverVersion: SERVER_VERSION,
    status: 'Pending',
    email: userEmail,
    requestedAt: now.toISOString(),
    expiresAt: pending.expiresAt
  });
}

function handleLoginPost_(requestData) {
  const userEmail = normalizeEmail_(requestData.email);
  const passwordVerifier = String(requestData.passwordVerifier || '').trim().toLowerCase();
  if (!isValidGmail_(userEmail) || !/^[a-f0-9]{64}$/.test(passwordVerifier)) {
    return loginFailureResponse_('이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  const limited = getLoginRateLimit_(userEmail);
  if (limited.locked) {
    return json_({
      success: false,
      authenticated: false,
      retryAfterSeconds: limited.retryAfterSeconds,
      serverVersion: SERVER_VERSION,
      message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'
    });
  }

  const sheet = getUsersSheet_();
  const data = sheet.getDataRange().getValues();
  const row = findUserRow_(data, userEmail);
  const userRecord = row > 0 ? data[row - 1] : null;
  const status = userRecord ? normalizeStatus_(userRecord[2]) : 'Invalid';
  const storedHash = String(userRecord && userRecord[11] || '').trim().toLowerCase();
  const submittedHash = hashPasswordVerifier_(passwordVerifier);
  const passwordConfigured = Boolean(
    userRecord &&
    /^[a-f0-9]{32,128}$/i.test(String(userRecord[10] || '')) &&
    /^[a-f0-9]{64}$/.test(storedHash)
  );
  const validCredential = passwordConfigured && constantTimeEquals_(submittedHash, storedHash);

  if (status === 'Blocked') {
    recordLoginFailure_(userEmail);
    return json_({
      success: false,
      authenticated: false,
      blocked: true,
      status: 'Blocked',
      serverVersion: SERVER_VERSION,
      message: '관리자에 의해 사용이 중지된 계정입니다.'
    });
  }
  if (status !== 'Active' || !validCredential) {
    recordLoginFailure_(userEmail);
    return json_({
      success: false,
      authenticated: false,
      passwordSetupRequired: Boolean(userRecord && status === 'Active' && !passwordConfigured),
      serverVersion: SERVER_VERSION,
      message: '이메일 또는 비밀번호가 올바르지 않습니다.'
    });
  }

  clearLoginFailure_(userEmail);
  const checkedAt = new Date();
  sheet.getRange(row, 4).setValue(checkedAt);
  const session = createSession_(userEmail);
  SpreadsheetApp.flush();
  return json_({
    success: true,
    authenticated: true,
    registered: true,
    status: 'Active',
    email: userEmail,
    sessionToken: session.token,
    expiresAt: session.expiresAt,
    checkedAt: checkedAt.toISOString(),
    serverVersion: SERVER_VERSION
  });
}

function handleLogoutPost_(requestData) {
  const userEmail = normalizeEmail_(requestData.email);
  const sessionToken = String(requestData.sessionToken || '').trim().toLowerCase();
  revokeSession_(userEmail, sessionToken);
  return json_({ success: true, authenticated: false, serverVersion: SERVER_VERSION });
}

function handleAuthenticatedStatusPost_(requestData, action) {
  const userEmail = normalizeEmail_(requestData.email);
  const sessionToken = String(requestData.sessionToken || '').trim().toLowerCase();
  const session = validateSession_(userEmail, sessionToken);
  if (!session) {
    return json_({
      success: false,
      authenticated: false,
      status: 'Unauthorized',
      serverVersion: SERVER_VERSION,
      message: '로그인 세션이 만료되었습니다.'
    });
  }

  const sheet = getUsersSheet_();
  const data = sheet.getDataRange().getValues();
  const row = findUserRow_(data, userEmail);
  if (row < 0) {
    revokeSession_(userEmail, sessionToken);
    return json_({ success: false, authenticated: false, status: 'Missing', serverVersion: SERVER_VERSION });
  }

  const status = normalizeStatus_(data[row - 1][2]);
  if (status !== 'Active') {
    revokeSession_(userEmail, sessionToken);
    return json_({
      success: true,
      authenticated: false,
      blocked: status === 'Blocked',
      invalidStatus: status === 'Invalid',
      status: status,
      serverVersion: SERVER_VERSION
    });
  }

  const checkedAt = new Date();
  if (action === 'check') {
    sheet.getRange(row, 4).setValue(checkedAt);
    SpreadsheetApp.flush();
  }
  return json_({
    success: true,
    authenticated: true,
    registered: true,
    status: 'Active',
    email: userEmail,
    checkedAt: checkedAt.toISOString(),
    verifiedAt: toIsoString_(data[row - 1][4]),
    serverVersion: SERVER_VERSION
  });
}

function getAdminLoginParametersResponse_(adminIdValue) {
  const adminId = String(adminIdValue || '').trim().toLowerCase();
  const credential = getAdminCredential_();
  if (adminId !== ADMIN_ID) return adminFailureResponse_('관리자 아이디 또는 비밀번호가 올바르지 않습니다.');
  return json_({
    success: true,
    adminId: ADMIN_ID,
    bootstrapPasswordRequired: Boolean(credential.passwordChangeRequired),
    passwordSalt: credential.passwordChangeRequired ? '' : credential.passwordSalt,
    passwordIterations: credential.passwordChangeRequired ? PASSWORD_KDF_ITERATIONS : credential.passwordIterations,
    serverVersion: SERVER_VERSION
  });
}

function handleAdminLoginPost_(requestData) {
  const adminId = String(requestData.adminId || '').trim().toLowerCase();
  const limited = getLoginRateLimit_(ADMIN_LOGIN_RATE_KEY);
  if (limited.locked) {
    return adminFailureResponse_('관리자 로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', {
      retryAfterSeconds: limited.retryAfterSeconds
    });
  }

  const credential = getAdminCredential_();
  let validCredential = false;
  if (credential && adminId === ADMIN_ID) {
    if (credential.passwordChangeRequired) {
      const bootstrapPassword = String(requestData.bootstrapPassword || '');
      validCredential = bootstrapPassword.length >= 10 && bootstrapPassword.length <= 128 &&
        constantTimeEquals_(bootstrapPassword, credential.initialPassword);
    } else {
      const verifier = String(requestData.passwordVerifier || '').trim().toLowerCase();
      validCredential = /^[a-f0-9]{64}$/.test(verifier) &&
        constantTimeEquals_(hashPasswordVerifier_(verifier), credential.passwordHash);
    }
  }

  if (!validCredential) {
    recordLoginFailure_(ADMIN_LOGIN_RATE_KEY);
    return adminFailureResponse_('관리자 아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  clearLoginFailure_(ADMIN_LOGIN_RATE_KEY);
  const session = createAdminSession_(ADMIN_ID);
  return json_({
    success: true,
    adminAuthenticated: true,
    adminId: ADMIN_ID,
    passwordChangeRequired: Boolean(credential.passwordChangeRequired),
    adminSessionToken: session.token,
    expiresAt: session.expiresAt,
    serverVersion: SERVER_VERSION
  });
}

function handleAdminChangePasswordPost_(requestData) {
  const currentSession = validateAdminSession_(requestData.adminSessionToken);
  if (!currentSession) return adminFailureResponse_('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.');

  const passwordCredential = getPasswordCredentialRequest_({
    passwordSalt: requestData.passwordSalt,
    passwordVerifier: requestData.passwordVerifier,
    passwordIterations: requestData.passwordIterations
  });
  const adminSheet = ensureAdminSheet_().sheet;
  adminSheet.getRange(2, 1, 2, ADMIN_SHEET_HEADERS.length).setValues([
    [ADMIN_TEMP_CATEGORY, ADMIN_ID, '', 'init pw', ADMIN_INACTIVE_STATUS],
    [
      ADMIN_ACTUAL_CATEGORY,
      ADMIN_ID,
      serializeAdminProtectedPassword_(passwordCredential),
      ADMIN_PASSWORD_FORMAT,
      ADMIN_ACTIVE_STATUS
    ]
  ]);
  SpreadsheetApp.flush();

  revokeAllAdminSessions_();
  const session = createAdminSession_(ADMIN_ID);
  return json_({
    success: true,
    adminAuthenticated: true,
    adminId: ADMIN_ID,
    passwordChangeRequired: false,
    adminSessionToken: session.token,
    expiresAt: session.expiresAt,
    serverVersion: SERVER_VERSION
  });
}

function handleAdminStatusPost_(requestData) {
  const session = validateAdminSession_(requestData.adminSessionToken);
  if (!session) return adminFailureResponse_('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.');
  return json_({
    success: true,
    adminAuthenticated: true,
    adminId: ADMIN_ID,
    passwordChangeRequired: Boolean(session.passwordChangeRequired),
    expiresAt: session.expiresAt,
    serverVersion: SERVER_VERSION
  });
}

function handleAdminLogoutPost_(requestData) {
  revokeAdminSession_(requestData.adminSessionToken);
  return json_({
    success: true,
    adminAuthenticated: false,
    serverVersion: SERVER_VERSION
  });
}

function adminFailureResponse_(message, extra) {
  return json_(Object.assign({
    success: false,
    adminAuthenticated: false,
    serverVersion: SERVER_VERSION,
    message: message
  }, extra || {}));
}

function getAdminCredential_() {
  const adminSheet = ensureAdminSheet_().sheet;
  const rows = readAdminSheetRows_(adminSheet).slice(1);
  let temporaryCredential = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const category = String(row[0] || '').trim().toLowerCase();
    const adminId = String(row[1] || '').trim().toLowerCase();
    const passwordValue = String(row[2] || '').trim();
    const status = String(row[4] || '').trim().toLowerCase();
    if (adminId !== ADMIN_ID || status !== ADMIN_ACTIVE_STATUS) continue;

    if (category === ADMIN_ACTUAL_CATEGORY.toLowerCase()) {
      const protectedPassword = parseAdminProtectedPassword_(passwordValue);
      if (!protectedPassword) continue;
      return {
        adminId: ADMIN_ID,
        initialPassword: '',
        passwordSalt: protectedPassword.salt,
        passwordHash: protectedPassword.hash,
        passwordIterations: protectedPassword.iterations,
        passwordChangeRequired: false
      };
    }

    if (category === ADMIN_TEMP_CATEGORY.toLowerCase() && passwordValue) {
      temporaryCredential = {
        adminId: ADMIN_ID,
        initialPassword: passwordValue,
        passwordSalt: '',
        passwordHash: '',
        passwordIterations: 0,
        passwordChangeRequired: true
      };
    }
  }
  return temporaryCredential;
}

function serializeAdminProtectedPassword_(credential) {
  return [
    'v1',
    credential.iterations,
    credential.salt,
    credential.hash
  ].join('$');
}

function parseAdminProtectedPassword_(value) {
  const parts = String(value || '').trim().split('$');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const iterations = Number(parts[1]);
  const salt = String(parts[2] || '').trim().toLowerCase();
  const hash = String(parts[3] || '').trim().toLowerCase();
  if (
    iterations !== PASSWORD_KDF_ITERATIONS ||
    !/^[a-f0-9]{32,128}$/.test(salt) ||
    !/^[a-f0-9]{64}$/.test(hash)
  ) return null;
  return { iterations: iterations, salt: salt, hash: hash };
}

function initializeAdminCredential_() {
  const currentSheet = getAdminSheet_();
  const currentData = readAdminSheetRows_(currentSheet);
  if (isAdminSheetReady_(currentData)) {
    if (clearLegacyAdminColumns_(currentSheet)) resetAdminRuntimeState_();
    return { created: false, adminId: ADMIN_ID, sheet: currentSheet };
  }

  const lock = LockService.getScriptLock();
  let adminSheet;
  lock.waitLock(10000);
  try {
    adminSheet = getAdminSheet_();
    const data = readAdminSheetRows_(adminSheet);
    if (isAdminSheetReady_(data)) {
      if (clearLegacyAdminColumns_(adminSheet)) resetAdminRuntimeState_();
      return { created: false, adminId: ADMIN_ID, sheet: adminSheet };
    }
    writeInitialAdminRow_(adminSheet);
    resetAdminRuntimeState_();
  } finally {
    lock.releaseLock();
  }
  return { created: true, adminId: ADMIN_ID, sheet: adminSheet };
}

function clearLegacyAdminColumns_(sheet) {
  const legacyColumnCount = Math.max(Number(sheet.getLastColumn() || 0) - ADMIN_SHEET_HEADERS.length, 0);
  if (!legacyColumnCount) return false;
  const rowCount = Math.max(sheet.getLastRow(), 3);
  const legacyRange = sheet.getRange(1, ADMIN_SHEET_HEADERS.length + 1, rowCount, legacyColumnCount);
  const hasLegacyContent = legacyRange.getValues().some(function(row) {
    return row.some(function(value) { return value !== '' && value != null; });
  });
  if (!hasLegacyContent) return false;
  legacyRange.clearContent();
  SpreadsheetApp.flush();
  return true;
}

function resetAdminRuntimeState_() {
  revokeAllAdminSessions_();
  clearLoginFailure_(ADMIN_LOGIN_RATE_KEY);
}

function getAdminSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(ADMIN_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(ADMIN_SHEET_NAME);
  return sheet;
}

function readAdminSheetRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];
  return sheet.getRange(1, 1, Math.max(lastRow, 3), ADMIN_SHEET_HEADERS.length).getValues();
}

function isAdminSheetReady_(data) {
  if (!Array.isArray(data) || data.length < 2) return false;
  const headers = data[0].map(function(value) { return String(value || '').trim(); });
  if (!ADMIN_SHEET_HEADERS.every(function(value, index) { return headers[index] === value; })) return false;
  return data.slice(1).some(function(row) {
    const category = String(row[0] || '').trim().toLowerCase();
    const adminId = String(row[1] || '').trim().toLowerCase();
    const passwordValue = String(row[2] || '').trim();
    const status = String(row[4] || '').trim().toLowerCase();
    if (adminId !== ADMIN_ID || status !== ADMIN_ACTIVE_STATUS) return false;
    if (category === ADMIN_TEMP_CATEGORY.toLowerCase()) return Boolean(passwordValue);
    return category === ADMIN_ACTUAL_CATEGORY.toLowerCase() && Boolean(parseAdminProtectedPassword_(passwordValue));
  });
}

function writeInitialAdminRow_(sheet) {
  const clearRows = Math.max(sheet.getLastRow(), 3);
  const clearColumns = Math.max(sheet.getLastColumn(), ADMIN_SHEET_HEADERS.length);
  sheet.getRange(1, 1, clearRows, clearColumns).clearContent();
  sheet.getRange(1, 1, 3, ADMIN_SHEET_HEADERS.length).setValues([
    ADMIN_SHEET_HEADERS,
    [ADMIN_TEMP_CATEGORY, ADMIN_ID, ADMIN_INITIAL_PASSWORD, 'init pw', ADMIN_ACTIVE_STATUS],
    [ADMIN_ACTUAL_CATEGORY, '', '', ADMIN_PASSWORD_FORMAT, ADMIN_INACTIVE_STATUS]
  ]);
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
}

function ensureAdminSheet_() {
  return initializeAdminCredential_();
}

function initializeAdminAccount() {
  const result = initializeAdminCredential_();
  if (!result.created) {
    console.log('관리자 계정은 이미 준비되어 있습니다. 비밀번호를 잊었다면 resetAdminAccount를 실행하세요.');
    return;
  }
  console.log('관리자 아이디: ' + ADMIN_ID);
  console.log('최초 임시 비밀번호: ' + ADMIN_INITIAL_PASSWORD);
  console.log('관리자 페이지에서 로그인한 뒤 새 비밀번호로 반드시 변경하세요.');
}

function resetAdminAccount() {
  writeInitialAdminRow_(getAdminSheet_());
  resetAdminRuntimeState_();
  console.log('관리자 계정을 임시 비밀번호 상태로 초기화했습니다.');
  console.log('관리자 아이디: ' + ADMIN_ID);
  console.log('초기 비밀번호: ' + ADMIN_INITIAL_PASSWORD);
}

function createAdminSession_(adminId) {
  cleanupExpiredAdminSessions_();
  const token = createRandomToken_();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();
  PropertiesService.getScriptProperties().setProperty(
    ADMIN_SESSION_PREFIX + sha256Hex_(token),
    JSON.stringify({
      adminId: adminId,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt
    })
  );
  return { token: token, expiresAt: expiresAt };
}

function validateAdminSession_(tokenValue) {
  const token = String(tokenValue || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const properties = PropertiesService.getScriptProperties();
  const key = ADMIN_SESSION_PREFIX + sha256Hex_(token);
  const raw = properties.getProperty(key);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    const credential = getAdminCredential_();
    if (
      Date.parse(session.expiresAt) <= Date.now() ||
      String(session.adminId || '').toLowerCase() !== ADMIN_ID ||
      !credential
    ) {
      properties.deleteProperty(key);
      return null;
    }
    session.passwordChangeRequired = Boolean(credential.passwordChangeRequired);
    return session;
  } catch (_) {
    properties.deleteProperty(key);
    return null;
  }
}

function revokeAdminSession_(tokenValue) {
  const token = String(tokenValue || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  PropertiesService.getScriptProperties().deleteProperty(ADMIN_SESSION_PREFIX + sha256Hex_(token));
}

function revokeAllAdminSessions_() {
  const properties = PropertiesService.getScriptProperties();
  properties.getKeys().filter(function(key) {
    return key.indexOf(ADMIN_SESSION_PREFIX) === 0;
  }).forEach(function(key) {
    properties.deleteProperty(key);
  });
}

function cleanupExpiredAdminSessions_() {
  const properties = PropertiesService.getScriptProperties();
  properties.getKeys().filter(function(key) {
    return key.indexOf(ADMIN_SESSION_PREFIX) === 0;
  }).forEach(function(key) {
    try {
      const record = JSON.parse(properties.getProperty(key) || 'null');
      if (!record || Date.parse(record.expiresAt) <= Date.now()) properties.deleteProperty(key);
    } catch (_) {
      properties.deleteProperty(key);
    }
  });
}

function loginFailureResponse_(message) {
  return json_({
    success: false,
    authenticated: false,
    serverVersion: SERVER_VERSION,
    message: message
  });
}

// Health, login parameters, and email-verification polling.
function doGet(e) {
  try {
    const action = String(e && e.parameter && e.parameter.action || '').toLowerCase();
    if (action === 'verify') {
      return verifyEmailAddress_(e && e.parameter && e.parameter.token);
    }

    if (action === 'health') {
      return json_({
        success: true,
        service: 'FMA Viewer verified email registration',
        version: SERVER_VERSION,
        status: 'OK',
        mailSender: EXPECTED_SENDER_EMAIL,
        mailSenderDetection: 'deployment-setting',
        expectedMailSender: EXPECTED_SENDER_EMAIL,
        authMode: 'email-password-session',
        message: '이메일 인증 및 비밀번호 로그인 서버가 정상입니다. 실제 발신자는 웹 앱 배포의 실행 사용자입니다.'
      });
    }

    if (action === 'login-params') {
      return getLoginParametersResponse_(e && e.parameter && e.parameter.email);
    }

    if (action !== 'check') {
      return json_({
        success: true,
        service: 'FMA Viewer verified email registration',
        version: SERVER_VERSION,
        message: 'Use POST action=register/login/status/check/logout, GET action=verify, login-params, or check with a verification request ID.'
      });
    }

    const userEmail = normalizeEmail_(e && e.parameter && e.parameter.email);
    if (!isValidGmail_(userEmail)) {
      return json_({
        success: false,
        registered: false,
        status: 'Invalid',
        serverVersion: SERVER_VERSION,
        message: '올바른 @gmail.com 주소가 필요합니다.'
      });
    }

    const requestId = String(e && e.parameter && e.parameter.requestId || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(requestId)) {
      return json_({
        success: false,
        registered: false,
        status: 'Invalid',
        serverVersion: SERVER_VERSION,
        message: '올바른 이메일 인증 요청 ID가 필요합니다.'
      });
    }

    const pending = getPendingVerificationByEmail_(userEmail);
    if (!pending || pending.requestIdHash !== sha256Hex_(requestId)) {
      return json_({
        success: true,
        registered: false,
        status: 'VerificationRequired',
        email: userEmail,
        serverVersion: SERVER_VERSION
      });
    }
    if (pending.state !== 'Verified') {
      return json_({
        success: true,
        registered: false,
        pending: true,
        status: 'Pending',
        email: userEmail,
        requestedAt: pending.requestedAt,
        expiresAt: pending.expiresAt,
        serverVersion: SERVER_VERSION
      });
    }

    const sheet = getUsersSheet_();
    const data = sheet.getDataRange().getValues();
    const row = findUserRow_(data, userEmail);
    if (row < 0) {
      return json_({
        success: true,
        registered: false,
        status: 'Missing',
        email: userEmail,
        serverVersion: SERVER_VERSION
      });
    }

    const status = normalizeStatus_(data[row - 1][2]);
    if (status === 'Blocked') {
      return json_({
        success: true,
        registered: false,
        blocked: true,
        status: 'Blocked',
        email: userEmail,
        serverVersion: SERVER_VERSION
      });
    }
    if (status !== 'Active') {
      return json_({
        success: true,
        registered: false,
        invalidStatus: true,
        status: 'Invalid',
        email: userEmail,
        serverVersion: SERVER_VERSION,
        message: 'Users 시트의 Status는 Active 또는 Blocked여야 합니다.'
      });
    }

    return json_({
      success: true,
      registered: true,
      verified: true,
      passwordConfigured: Boolean(data[row - 1][10] && data[row - 1][11]),
      status: 'Active',
      email: userEmail,
      checkedAt: new Date().toISOString(),
      verifiedAt: toIsoString_(data[row - 1][4]),
      serverVersion: SERVER_VERSION
    });
  } catch (error) {
    console.error(error);
    return json_({
      success: false,
      registered: false,
      status: 'Error',
      serverVersion: SERVER_VERSION,
      message: String(error && error.message || error)
    });
  }
}

function createPendingVerification_(userEmail, requestedAt, requestId, application, passwordCredential) {
  const serviceUrl = ScriptApp.getService().getUrl();
  if (!serviceUrl) {
    throw new Error('배포된 GAS 웹 앱 URL을 확인할 수 없습니다. 새 버전으로 웹 앱을 배포해 주세요.');
  }

  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const tokenHash = sha256Hex_(token);
  const emailHash = sha256Hex_(userEmail);
  const expiresAt = new Date(requestedAt.getTime() + VERIFICATION_TTL_MS).toISOString();
  const properties = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const previousTokenHash = properties.getProperty(PENDING_EMAIL_PREFIX + emailHash);
    if (previousTokenHash) properties.deleteProperty(PENDING_TOKEN_PREFIX + previousTokenHash);
    properties.setProperties((function() {
      const values = {};
      values[PENDING_TOKEN_PREFIX + tokenHash] = JSON.stringify({
        email: userEmail,
        tokenHash: tokenHash,
        requestIdHash: sha256Hex_(requestId),
        state: 'Pending',
        requestedAt: requestedAt.toISOString(),
        expiresAt: expiresAt,
        name: application.name,
        organization: application.organization,
        purpose: application.purpose,
        passwordSalt: passwordCredential.salt,
        passwordHash: passwordCredential.hash,
        passwordIterations: passwordCredential.iterations
      });
      values[PENDING_EMAIL_PREFIX + emailHash] = tokenHash;
      return values;
    })());
  } finally {
    lock.releaseLock();
  }

  return {
    tokenHash: tokenHash,
    expiresAt: expiresAt,
    verificationUrl: serviceUrl + '?action=verify&token=' + encodeURIComponent(token)
  };
}

function getPendingVerificationByEmail_(userEmail) {
  const properties = PropertiesService.getScriptProperties();
  const emailHash = sha256Hex_(userEmail);
  const tokenHash = properties.getProperty(PENDING_EMAIL_PREFIX + emailHash);
  if (!tokenHash) return null;

  const raw = properties.getProperty(PENDING_TOKEN_PREFIX + tokenHash);
  if (!raw) {
    properties.deleteProperty(PENDING_EMAIL_PREFIX + emailHash);
    return null;
  }

  try {
    const pending = JSON.parse(raw);
    const validUntil = pending.state === 'Verified' ? pending.grantExpiresAt : pending.expiresAt;
    if (normalizeEmail_(pending.email) !== userEmail || Date.parse(validUntil) <= Date.now()) {
      clearPendingVerification_(tokenHash, userEmail);
      return null;
    }
    return pending;
  } catch (error) {
    clearPendingVerification_(tokenHash, userEmail);
    return null;
  }
}

function clearPendingVerification_(tokenHash, userEmail) {
  const properties = PropertiesService.getScriptProperties();
  const keys = [];
  if (tokenHash) keys.push(PENDING_TOKEN_PREFIX + tokenHash);
  if (userEmail) keys.push(PENDING_EMAIL_PREFIX + sha256Hex_(userEmail));
  if (keys.length) deleteProperties_(properties, keys);
}

function deleteProperties_(properties, keys) {
  keys.forEach(function(key) { properties.deleteProperty(key); });
}

function verifyEmailAddress_(tokenValue) {
  const token = String(tokenValue || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return verificationPage_(false, '인증 링크가 올바르지 않습니다.', 'FMA Viewer에서 인증 메일을 다시 요청해 주세요.');
  }

  const tokenHash = sha256Hex_(token);
  const properties = PropertiesService.getScriptProperties();
  const raw = properties.getProperty(PENDING_TOKEN_PREFIX + tokenHash);
  if (!raw) {
    return verificationPage_(false, '이미 사용했거나 만료된 인증 링크입니다.', 'FMA Viewer가 열리지 않았다면 인증 메일을 다시 요청해 주세요.');
  }

  let pending;
  try {
    pending = JSON.parse(raw);
  } catch (error) {
    clearPendingVerification_(tokenHash, '');
    return verificationPage_(false, '인증 정보를 읽을 수 없습니다.', 'FMA Viewer에서 인증 메일을 다시 요청해 주세요.');
  }

  const userEmail = normalizeEmail_(pending.email);
  if (pending.state === 'Verified') {
    return verificationPage_(true, userEmail + ' 인증이 이미 완료되었습니다.', 'FMA Viewer 창으로 돌아가 이메일과 비밀번호로 로그인해 주세요.');
  }
  if (!isValidGmail_(userEmail) || Date.parse(pending.expiresAt) <= Date.now()) {
    clearPendingVerification_(tokenHash, userEmail);
    return verificationPage_(false, '인증 링크의 유효 시간이 지났습니다.', '인증 링크는 발송 후 30분 동안 사용할 수 있습니다. FMA Viewer에서 다시 신청해 주세요.');
  }

  let application;
  try {
    application = getApplicationDetails_(pending);
  } catch (error) {
    clearPendingVerification_(tokenHash, userEmail);
    return verificationPage_(false, '신청자 정보를 확인할 수 없습니다.', 'FMA Viewer에서 이름, 소속, 사용목적을 입력하고 인증 메일을 다시 요청해 주세요.');
  }

  const passwordSalt = String(pending.passwordSalt || '').trim().toLowerCase();
  const passwordHash = String(pending.passwordHash || '').trim().toLowerCase();
  const passwordIterations = Number(pending.passwordIterations);
  if (
    !/^[a-f0-9]{32,128}$/.test(passwordSalt) ||
    !/^[a-f0-9]{64}$/.test(passwordHash) ||
    !Number.isInteger(passwordIterations) ||
    passwordIterations < 200000 ||
    passwordIterations > 1000000
  ) {
    clearPendingVerification_(tokenHash, userEmail);
    return verificationPage_(false, '비밀번호 설정 정보를 확인할 수 없습니다.', 'FMA Viewer에서 인증 메일을 다시 요청해 주세요.');
  }

  const sheet = getUsersSheet_();
  const verifiedAt = new Date();
  const requestedAt = new Date(pending.requestedAt);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let row;
  let newlyVerified = false;

  try {
    const data = sheet.getDataRange().getValues();
    row = findUserRow_(data, userEmail);
    if (row > 0) {
      const currentStatus = normalizeStatus_(data[row - 1][2]);
      if (currentStatus === 'Blocked') {
        clearPendingVerification_(tokenHash, userEmail);
        return verificationPage_(false, '사용이 중지된 Gmail입니다.', '관리자에게 문의해 주세요.');
      }
      if (currentStatus !== 'Active') {
        return verificationPage_(false, '등록 상태가 올바르지 않습니다.', '관리자에게 Users 시트의 Status 확인을 요청해 주세요.');
      }
      sheet.getRange(row, 3, 1, 3).setValues([['Active', verifiedAt, verifiedAt]]);
      sheet.getRange(row, 8, 1, 3).setValues([[safeSheetText_(application.name), safeSheetText_(application.organization), safeSheetText_(application.purpose)]]);
      sheet.getRange(row, 11, 1, 4).setValues([[passwordSalt, passwordHash, passwordIterations, verifiedAt]]);
    } else {
      sheet.appendRow([
        Number.isNaN(requestedAt.getTime()) ? verifiedAt : requestedAt,
        userEmail,
        'Active',
        verifiedAt,
        verifiedAt,
        '',
        '',
        safeSheetText_(application.name),
        safeSheetText_(application.organization),
        safeSheetText_(application.purpose),
        passwordSalt,
        passwordHash,
        passwordIterations,
        verifiedAt
      ]);
      row = sheet.getLastRow();
      newlyVerified = true;
    }
    SpreadsheetApp.flush();
    pending.state = 'Verified';
    pending.verifiedAt = verifiedAt.toISOString();
    pending.grantExpiresAt = new Date(verifiedAt.getTime() + VERIFICATION_GRANT_TTL_MS).toISOString();
    pending.passwordConfigured = true;
    delete pending.passwordSalt;
    delete pending.passwordHash;
    delete pending.passwordIterations;
    properties.setProperty(PENDING_TOKEN_PREFIX + tokenHash, JSON.stringify(pending));
  } finally {
    lock.releaseLock();
  }

  if (newlyVerified) {
    try {
      sendNotificationEmail_(userEmail, application, requestedAt, verifiedAt);
      sheet.getRange(row, 6, 1, 2).setValues([[new Date(), '']]);
    } catch (mailError) {
      sheet.getRange(row, 7).setValue(String(mailError && mailError.message || mailError));
      console.error(mailError);
    }
    SpreadsheetApp.flush();
  }

  revokeAllSessionsForEmail_(userEmail);

  return verificationPage_(true, userEmail + ' 인증과 비밀번호 설정이 완료되었습니다.', 'FMA Viewer 창으로 돌아가 이메일과 비밀번호로 로그인해 주세요.');
}

function sendVerificationEmail_(userEmail, requestedAt, verificationUrl) {
  const expiresAtText = Utilities.formatDate(
    new Date(requestedAt.getTime() + VERIFICATION_TTL_MS),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
  const subject = '[FMA Viewer] 이메일 인증을 완료해 주세요';
  const body = [
    'FMA Viewer 이메일 인증과 전용 비밀번호 설정을 완료하려면 아래 인증 링크를 열어 주세요.',
    '',
    verificationUrl,
    '',
    '인증 링크 만료 시각: ' + expiresAtText,
    '본인이 신청하지 않았다면 이 메일을 무시해 주세요.'
  ].join('\n');
  const htmlBody = [
    '<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172333">',
    '<h2 style="margin-bottom:8px">FMA Viewer 이메일 인증</h2>',
    '<p><strong>' + escapeHtml_(userEmail) + '</strong> 주소로 인증 요청이 접수되었습니다.</p>',
    '<p>아래 버튼을 눌러 이메일 인증과 FMA Viewer 전용 비밀번호 설정을 완료해 주세요.</p>',
    '<p style="margin:24px 0"><a href="' + escapeHtml_(verificationUrl) + '" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#087f8c;color:#fff;text-decoration:none;font-weight:bold">이메일 인증 및 비밀번호 설정</a></p>',
    '<p style="color:#687587;font-size:12px">링크는 ' + escapeHtml_(expiresAtText) + '까지 유효합니다. 본인이 신청하지 않았다면 이 메일을 무시해 주세요.</p>',
    '</div>'
  ].join('');

  MailApp.sendEmail(userEmail, subject, body, {
    name: 'FMA Viewer 이메일 인증',
    htmlBody: htmlBody
  });
}

function verificationPage_(success, title, message) {
  const accent = success ? '#65d98b' : '#ff8c9c';
  const html = [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>FMA Viewer 이메일 인증</title></head>',
    '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07111c;color:#edf7ff;font-family:Arial,sans-serif">',
    '<main style="width:min(520px,calc(100% - 40px));padding:36px;border:1px solid #294257;border-radius:18px;background:#101e2c;text-align:center">',
    '<div style="width:56px;height:56px;margin:0 auto 20px;border-radius:50%;display:grid;place-items:center;background:' + accent + ';color:#07111c;font-size:28px;font-weight:bold">' + (success ? '&#10003;' : '!') + '</div>',
    '<h1 style="margin:0 0 12px;font-size:24px">' + escapeHtml_(title) + '</h1>',
    '<p style="margin:0;color:#a9bdcc;line-height:1.7">' + escapeHtml_(message) + '</p>',
    '</main></body></html>'
  ].join('');
  return HtmlService.createHtmlOutput(html).setTitle('FMA Viewer 이메일 인증');
}

function getUsersSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  ensureUsersSchema_(sheet);
  sheet.setFrozenRows(1);
  return sheet;
}

// Migrates the older Token/RequestId schema and removes duplicate emails.
function ensureUsersSchema_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    applyStatusValidation_(sheet);
    return;
  }

  const data = sheet.getRange(1, 1, lastRow, SHEET_HEADERS.length).getValues();
  const header = data[0].map(function(value) { return String(value || '').trim(); });
  const isCurrentSchema = SHEET_HEADERS.every(function(value, index) {
    return header[index] === value;
  });
  if (isCurrentSchema) return;

  const emailIndex = Math.max(header.indexOf('Email'), 1);
  const statusIndex = header.indexOf('Status');
  const lastVerifiedIndex = header.indexOf('LastVerifiedAt');
  const verifiedIndex = header.indexOf('VerifiedAt');
  const notifiedIndex = header.indexOf('NotifiedAt');
  const errorIndex = header.indexOf('NotificationError');
  const nameIndex = header.indexOf('Name');
  const organizationIndex = header.indexOf('Organization');
  const purposeIndex = header.indexOf('Purpose');
  const passwordSaltIndex = header.indexOf('PasswordSalt');
  const passwordHashIndex = header.indexOf('PasswordHash');
  const passwordIterationsIndex = header.indexOf('PasswordIterations');
  const passwordUpdatedAtIndex = header.indexOf('PasswordUpdatedAt');
  const usersByEmail = {};
  const emailOrder = [];

  for (let index = 1; index < data.length; index += 1) {
    const userEmail = normalizeEmail_(data[index][emailIndex]);
    if (!isValidGmail_(userEmail)) continue;

    if (!usersByEmail[userEmail]) {
      usersByEmail[userEmail] = [
        data[index][0] || new Date(),
        userEmail,
        'Active',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        ''
      ];
      emailOrder.push(userEmail);
    }

    const record = usersByEmail[userEmail];
    const sourceStatus = statusIndex >= 0 ? data[index][statusIndex] : '';
    const migratedStatus = normalizeLegacyStatus_(sourceStatus);
    if (
      migratedStatus === 'Blocked' ||
      (migratedStatus === 'Invalid' && record[2] !== 'Blocked')
    ) {
      // A blocked or invalid duplicate must never be overwritten by an active row.
      record[2] = migratedStatus;
    }
    if (lastVerifiedIndex >= 0 && data[index][lastVerifiedIndex]) {
      record[3] = data[index][lastVerifiedIndex];
    }
    if (verifiedIndex >= 0 && data[index][verifiedIndex]) {
      record[4] = data[index][verifiedIndex];
    } else if (!record[4] && migratedStatus === 'Active') {
      record[4] = data[index][0] || data[index][lastVerifiedIndex] || '';
    }
    if (notifiedIndex >= 0 && data[index][notifiedIndex]) {
      record[5] = data[index][notifiedIndex];
    }
    if (errorIndex >= 0 && data[index][errorIndex]) {
      record[6] = data[index][errorIndex];
    }
    if (nameIndex >= 0 && data[index][nameIndex]) {
      record[7] = data[index][nameIndex];
    }
    if (organizationIndex >= 0 && data[index][organizationIndex]) {
      record[8] = data[index][organizationIndex];
    }
    if (purposeIndex >= 0 && data[index][purposeIndex]) {
      record[9] = data[index][purposeIndex];
    }
    if (
      passwordSaltIndex >= 0 &&
      passwordHashIndex >= 0 &&
      data[index][passwordSaltIndex] &&
      data[index][passwordHashIndex]
    ) {
      record[10] = data[index][passwordSaltIndex];
      record[11] = data[index][passwordHashIndex];
      record[12] = passwordIterationsIndex >= 0 && data[index][passwordIterationsIndex]
        ? data[index][passwordIterationsIndex]
        : PASSWORD_KDF_ITERATIONS;
      record[13] = passwordUpdatedAtIndex >= 0 ? data[index][passwordUpdatedAtIndex] : '';
    }
  }

  const migratedRows = [SHEET_HEADERS].concat(emailOrder.map(function(email) {
    return usersByEmail[email];
  }));
  const clearRowCount = Math.max(lastRow, migratedRows.length);
  sheet.getRange(1, 1, clearRowCount, SHEET_HEADERS.length).clearContent();
  sheet.getRange(1, 1, migratedRows.length, SHEET_HEADERS.length).setValues(migratedRows);
  applyStatusValidation_(sheet);
  SpreadsheetApp.flush();
}

function applyStatusValidation_(sheet) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Active', 'Blocked'], true)
    .setAllowInvalid(false)
    .setHelpText('Status는 Active 또는 Blocked만 선택할 수 있습니다.')
    .build();
  const rowCount = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 3, rowCount, 1).setDataValidation(rule);
}

function findUserRow_(data, userEmail) {
  for (let index = data.length - 1; index >= 1; index -= 1) {
    if (normalizeEmail_(data[index][1]) === userEmail) return index + 1;
  }
  return -1;
}

function normalizeStatus_(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'active') return 'Active';
  if (status === 'blocked') return 'Blocked';
  return 'Invalid';
}

// Used only while converting older versions of the Sheet schema.
function normalizeLegacyStatus_(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'blocked' || status === 'rejected' || status === 'denied') return 'Blocked';
  if (
    status === '' ||
    status === 'active' ||
    status === 'pending' ||
    status === 'notified' ||
    status === 'approved' ||
    status === 'saved' ||
    status === 'registered' ||
    status === 'notificationerror'
  ) return 'Active';
  return 'Invalid';
}

function sendNotificationEmail_(userEmail, application, requestedAt, verifiedAt) {
  const applicant = getApplicationDetails_(application);
  const requestedAtText = Utilities.formatDate(
    requestedAt,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
  const verifiedAtText = Utilities.formatDate(
    verifiedAt || new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
  const subject = '[FMA Viewer] 이메일 인증 완료: ' + userEmail;
  const body = [
    '새로운 사용자가 이메일 인증을 완료했습니다.',
    '',
    '신청자 이름: ' + applicant.name,
    '신청자 Gmail: ' + userEmail,
    '소속: ' + applicant.organization,
    '사용목적: ' + applicant.purpose,
    '신청 시각: ' + requestedAtText,
    '인증 시각: ' + verifiedAtText,
    '',
    '인증된 사용자 정보가 Google Sheet의 Users 탭에 Active로 저장되었습니다.'
  ].join('\n');
  const htmlBody = [
    '<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172333">',
    '<h2 style="margin-bottom:8px">FMA Viewer 이메일 인증 완료</h2>',
    '<p><strong>신청자 이름:</strong> ' + escapeHtml_(applicant.name) + '</p>',
    '<p><strong>신청자 Gmail:</strong> ' + escapeHtml_(userEmail) + '</p>',
    '<p><strong>소속:</strong> ' + escapeHtml_(applicant.organization) + '</p>',
    '<p><strong>사용목적:</strong><br>' + escapeHtml_(applicant.purpose).replace(/\n/g, '<br>') + '</p>',
    '<p><strong>신청 시각:</strong> ' + escapeHtml_(requestedAtText) + '</p>',
    '<p><strong>인증 시각:</strong> ' + escapeHtml_(verifiedAtText) + '</p>',
    '<p>인증된 사용자 정보가 Google Sheet의 <strong>Users</strong> 탭에 <strong>Active</strong>로 저장되었습니다.</p>',
    '</div>'
  ].join('');

  MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body, {
    name: 'FMA Viewer 신청 알림',
    htmlBody: htmlBody
  });
}

function getPasswordCredentialRequest_(source) {
  const salt = String(source && source.passwordSalt || '').trim().toLowerCase();
  const verifier = String(source && source.passwordVerifier || '').trim().toLowerCase();
  const iterations = Number(source && source.passwordIterations);
  if (!/^[a-f0-9]{32,128}$/.test(salt)) throw new Error('비밀번호 솔트 형식이 올바르지 않습니다.');
  if (!/^[a-f0-9]{64}$/.test(verifier)) throw new Error('비밀번호 인증 정보가 올바르지 않습니다.');
  if (!Number.isInteger(iterations) || iterations < 200000 || iterations > 1000000) {
    throw new Error('비밀번호 보안 반복 횟수가 올바르지 않습니다.');
  }
  return {
    salt: salt,
    hash: hashPasswordVerifier_(verifier),
    iterations: iterations
  };
}

function getLoginParametersResponse_(emailValue) {
  const userEmail = normalizeEmail_(emailValue);
  if (!isValidGmail_(userEmail)) {
    return json_({
      success: false,
      serverVersion: SERVER_VERSION,
      message: '올바른 @gmail.com 주소가 필요합니다.'
    });
  }

  const sheet = getUsersSheet_();
  const data = sheet.getDataRange().getValues();
  const row = findUserRow_(data, userEmail);
  const record = row > 0 ? data[row - 1] : null;
  const configured = Boolean(
    record &&
    normalizeStatus_(record[2]) === 'Active' &&
    /^[a-f0-9]{32,128}$/i.test(String(record[10] || '')) &&
    /^[a-f0-9]{64}$/i.test(String(record[11] || ''))
  );
  const storedIterations = configured ? Number(record[12]) : NaN;
  const iterations = configured
    && Number.isInteger(storedIterations)
    && storedIterations >= 200000
    && storedIterations <= 1000000
    ? storedIterations
    : PASSWORD_KDF_ITERATIONS;
  const salt = configured
    ? String(record[10]).trim().toLowerCase()
    : hmacSha256Hex_('login-salt:' + userEmail, getCredentialPepper_()).slice(0, 32);
  return json_({
    success: true,
    passwordSalt: salt,
    passwordIterations: iterations,
    serverVersion: SERVER_VERSION
  });
}

function getCredentialPepper_() {
  const properties = PropertiesService.getScriptProperties();
  let pepper = String(properties.getProperty(CREDENTIAL_PEPPER_KEY) || '');
  if (/^[a-f0-9]{64}$/i.test(pepper)) return pepper.toLowerCase();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    pepper = String(properties.getProperty(CREDENTIAL_PEPPER_KEY) || '');
    if (!/^[a-f0-9]{64}$/i.test(pepper)) {
      pepper = createRandomToken_();
      properties.setProperty(CREDENTIAL_PEPPER_KEY, pepper);
    }
  } finally {
    lock.releaseLock();
  }
  return pepper.toLowerCase();
}

function createRandomToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
}

function bytesToHex_(bytes) {
  return bytes.map(function(byte) {
    return ('0' + (byte & 0xff).toString(16)).slice(-2);
  }).join('');
}

function hmacSha256Hex_(value, key) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(String(value), String(key)));
}

function hashPasswordVerifier_(verifier) {
  return hmacSha256Hex_('credential:' + String(verifier), getCredentialPepper_());
}

function constantTimeEquals_(leftValue, rightValue) {
  const left = String(leftValue || '');
  const right = String(rightValue || '');
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function createSession_(userEmail) {
  cleanupExpiredSessions_();
  const token = createRandomToken_();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  PropertiesService.getScriptProperties().setProperty(
    SESSION_PREFIX + sha256Hex_(token),
    JSON.stringify({ email: userEmail, createdAt: new Date().toISOString(), expiresAt: expiresAt })
  );
  return { token: token, expiresAt: expiresAt };
}

function validateSession_(userEmail, tokenValue) {
  const token = String(tokenValue || '').trim().toLowerCase();
  if (!isValidGmail_(userEmail) || !/^[a-f0-9]{64}$/.test(token)) return null;
  const properties = PropertiesService.getScriptProperties();
  const key = SESSION_PREFIX + sha256Hex_(token);
  const raw = properties.getProperty(key);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (normalizeEmail_(session.email) !== userEmail || Date.parse(session.expiresAt) <= Date.now()) {
      properties.deleteProperty(key);
      return null;
    }
    return session;
  } catch (error) {
    properties.deleteProperty(key);
    return null;
  }
}

function revokeSession_(userEmail, tokenValue) {
  const token = String(tokenValue || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  const properties = PropertiesService.getScriptProperties();
  const key = SESSION_PREFIX + sha256Hex_(token);
  const raw = properties.getProperty(key);
  if (!raw) return;
  try {
    const session = JSON.parse(raw);
    if (!userEmail || normalizeEmail_(session.email) === normalizeEmail_(userEmail)) properties.deleteProperty(key);
  } catch (error) {
    properties.deleteProperty(key);
  }
}

function revokeAllSessionsForEmail_(userEmail) {
  const properties = PropertiesService.getScriptProperties();
  properties.getKeys().filter(function(key) {
    return key.indexOf(SESSION_PREFIX) === 0;
  }).forEach(function(key) {
    try {
      const session = JSON.parse(properties.getProperty(key) || 'null');
      if (normalizeEmail_(session && session.email) === userEmail) properties.deleteProperty(key);
    } catch (error) {
      properties.deleteProperty(key);
    }
  });
}

function cleanupExpiredSessions_() {
  const properties = PropertiesService.getScriptProperties();
  properties.getKeys().filter(function(key) {
    return key.indexOf(SESSION_PREFIX) === 0;
  }).forEach(function(key) {
    try {
      const session = JSON.parse(properties.getProperty(key) || 'null');
      if (!session || Date.parse(session.expiresAt) <= Date.now()) properties.deleteProperty(key);
    } catch (error) {
      properties.deleteProperty(key);
    }
  });
}

function getLoginRateLimit_(userEmail) {
  const properties = PropertiesService.getScriptProperties();
  const key = LOGIN_FAILURE_PREFIX + sha256Hex_(userEmail);
  const raw = properties.getProperty(key);
  if (!raw) return { locked: false, retryAfterSeconds: 0 };
  try {
    const record = JSON.parse(raw);
    const lockedUntil = Number(record.lockedUntil || 0);
    if (lockedUntil > Date.now()) {
      return { locked: true, retryAfterSeconds: Math.ceil((lockedUntil - Date.now()) / 1000) };
    }
    if (Date.now() - Number(record.firstAt || 0) > LOGIN_FAILURE_WINDOW_MS) {
      properties.deleteProperty(key);
    }
  } catch (error) {
    properties.deleteProperty(key);
  }
  return { locked: false, retryAfterSeconds: 0 };
}

function recordLoginFailure_(userEmail) {
  const properties = PropertiesService.getScriptProperties();
  const key = LOGIN_FAILURE_PREFIX + sha256Hex_(userEmail);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = Date.now();
    let record = { count: 0, firstAt: now, lockedUntil: 0 };
    try {
      const saved = JSON.parse(properties.getProperty(key) || 'null');
      if (saved && now - Number(saved.firstAt || 0) <= LOGIN_FAILURE_WINDOW_MS) record = saved;
    } catch (_) {}
    record.count = Number(record.count || 0) + 1;
    if (record.count >= LOGIN_MAX_FAILURES) record.lockedUntil = now + LOGIN_LOCK_MS;
    properties.setProperty(key, JSON.stringify(record));
  } finally {
    lock.releaseLock();
  }
}

function clearLoginFailure_(userEmail) {
  PropertiesService.getScriptProperties().deleteProperty(LOGIN_FAILURE_PREFIX + sha256Hex_(userEmail));
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function getApplicationDetails_(source) {
  const name = String(source && source.name || '').replace(/\s+/g, ' ').trim();
  const organization = String(source && source.organization || '').replace(/\s+/g, ' ').trim();
  const purpose = String(source && source.purpose || '').replace(/\r\n?/g, '\n').trim();
  if (!name || name.length > 80) throw new Error('신청자 이름을 80자 이내로 입력해 주세요.');
  if (!organization || organization.length > 120) throw new Error('소속을 120자 이내로 입력해 주세요.');
  if (!purpose || purpose.length > 500) throw new Error('사용목적을 500자 이내로 입력해 주세요.');
  return { name: name, organization: organization, purpose: purpose };
}

// Prevent applicant-entered text from being interpreted as a Sheet formula.
function safeSheetText_(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function getMailSenderEmail_() {
  try {
    return normalizeEmail_(Session.getEffectiveUser().getEmail());
  } catch (error) {
    return '';
  }
}

function isValidGmail_(value) {
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i.test(value);
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, function(character) {
    return ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[character];
  });
}

function sha256Hex_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  ).map(function(byte) {
    return ('0' + (byte & 0xff).toString(16)).slice(-2);
  }).join('');
}

function toIsoString_(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run once before deploying. This also consolidates existing duplicate rows.
function authorizeServices() {
  const sheet = getUsersSheet_();
  applyStatusValidation_(sheet);
  getCredentialPepper_();
  const adminSetup = initializeAdminCredential_();
  cleanupExpiredSessions_();
  console.log('인증 메일 발신 계정: ' + getMailSenderEmail_());
  console.log('등록 사용자 수: ' + Math.max(sheet.getLastRow() - 1, 0));
  console.log('비밀번호 로그인용 서버 보안 키가 준비되었습니다.');
  if (adminSetup.created) {
    console.log('관리자 아이디: ' + ADMIN_ID);
    console.log('최초 임시 비밀번호: ' + ADMIN_INITIAL_PASSWORD);
    console.log('첫 관리자 로그인 직후 새 비밀번호로 변경해야 합니다.');
  }
  console.log('남은 일일 메일 발송 한도: ' + MailApp.getRemainingDailyQuota());
}

// Run manually to confirm that the deployment account can send email.
function testVerificationEmail() {
  const subject = '[FMA Viewer] 인증 메일 발송 테스트';
  const body = [
    'FMA Viewer 인증 메일 발송 테스트입니다.',
    '',
    '이 메일이 도착했다면 Apps Script의 MailApp 권한과 발신 계정이 정상입니다.',
    '예상 발신 계정: ' + EXPECTED_SENDER_EMAIL,
    '테스트 시각: ' + new Date().toISOString()
  ].join('\n');

  MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body, {
    name: 'FMA Viewer 이메일 인증'
  });
  console.log('인증 메일 테스트 발송 완료: ' + NOTIFICATION_EMAIL);
}

function testNotificationEmail() {
  sendNotificationEmail_('test-user@gmail.com', {
    name: '테스트 사용자',
    organization: '테스트 소속',
    purpose: '인증 완료 알림 메일 테스트'
  }, new Date(), new Date());
  console.log('테스트 알림 메일 발송 요청 완료: ' + NOTIFICATION_EMAIL);
}

function retryFailedNotifications() {
  const sheet = getUsersSheet_();
  const data = sheet.getDataRange().getValues();
  let retried = 0;

  for (let index = 1; index < data.length; index += 1) {
    const status = normalizeStatus_(data[index][2]);
    const hasError = Boolean(data[index][6]);
    const hasNotifiedAt = Boolean(data[index][5]);
    if (status !== 'Active' || !hasError || hasNotifiedAt) continue;

    const row = index + 1;
    try {
      sendNotificationEmail_(normalizeEmail_(data[index][1]), {
        name: data[index][7],
        organization: data[index][8],
        purpose: data[index][9]
      }, data[index][0] || new Date(), data[index][4] || new Date());
      sheet.getRange(row, 6, 1, 2).setValues([[
        new Date(),
        ''
      ]]);
      retried += 1;
    } catch (error) {
      sheet.getRange(row, 7).setValue(String(error && error.message || error));
    }
  }

  SpreadsheetApp.flush();
  console.log('알림 메일 재시도 완료: ' + retried + '건');
}
