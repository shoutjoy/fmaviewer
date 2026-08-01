/* FMA Viewer verified email registration and status sync server (Google Apps Script) */

const SHEET_NAME = 'Users';
const NOTIFICATION_EMAIL = 'shoutjoy1@yonsei.ac.kr';
const EXPECTED_SENDER_EMAIL = 'shoutjoy1@gmail.com';
const SERVER_VERSION = '2026-08-02-email-verify-4';
const SPREADSHEET_ID = '1xNA955JIwe5cHETAMMMaCEfb1QtZnbuc9tKbEDQ573w';
const VERIFICATION_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
const PENDING_TOKEN_PREFIX = 'fma_pending_token_';
const PENDING_EMAIL_PREFIX = 'fma_pending_email_';
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
  'Purpose'
];

// Send a verification email. A new user is not written to Users until the link is opened.
function doPost(e) {
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') {
      console.warn('doPost는 웹 POST 요청으로 호출하십시오. 편집기에서는 authorizeServices 또는 testNotificationEmail을 실행할 수 있습니다.');
      return json_({
        success: false,
        saved: false,
        message: 'doPost must be called by an HTTP POST request.'
      });
    }

    const requestData = JSON.parse(e.postData.contents);
    const userEmail = normalizeEmail_(requestData.email);
    const requestId = String(requestData.requestId || '').trim().toLowerCase();
    const application = getApplicationDetails_(requestData);
    if (!isValidGmail_(userEmail)) {
      return json_({
        success: false,
        saved: false,
        message: '올바른 @gmail.com 주소가 필요합니다.'
      });
    }
    if (!/^[a-f0-9]{64}$/.test(requestId)) {
      return json_({
        success: false,
        saved: false,
        message: '올바른 이메일 인증 요청 ID가 필요합니다.'
      });
    }

    const now = new Date();
    const sheet = getUsersSheet_();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
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
            message: '이 Gmail은 관리자에 의해 사용이 중지되었습니다.'
          });
        }
        if (currentStatus !== 'Active') {
          return json_({
            success: false,
            saved: false,
            invalidStatus: true,
            status: 'Invalid',
            message: 'Users 시트의 Status를 Active 또는 Blocked로 수정해 주세요.'
          });
        }

      }
    } finally {
      lock.releaseLock();
    }

    const pending = createPendingVerification_(userEmail, now, requestId, application);
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
  } catch (error) {
    console.error(error);
    return json_({
      success: false,
      saved: false,
      message: String(error && error.message || error)
    });
  }
}

// Health check, full registration sync, and lightweight block-status check.
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
        message: '이메일 인증 서버가 정상입니다. 실제 발신자는 웹 앱 배포의 실행 사용자입니다.'
      });
    }

    if (action !== 'check' && action !== 'status') {
      return json_({
        success: true,
        service: 'FMA Viewer verified email registration',
        message: 'Use POST to request verification, GET action=verify to approve, GET action=check to sync, or GET action=status to watch blocking.'
      });
    }

    const userEmail = normalizeEmail_(e && e.parameter && e.parameter.email);
    if (!isValidGmail_(userEmail)) {
      return json_({
        success: false,
        registered: false,
        status: 'Invalid',
        message: '올바른 @gmail.com 주소가 필요합니다.'
      });
    }

    const requestId = String(e && e.parameter && e.parameter.requestId || '').trim().toLowerCase();
    let pending = null;
    let approvedRequest = false;
    if (action === 'check' && requestId) {
      if (!/^[a-f0-9]{64}$/.test(requestId)) {
        return json_({
          success: false,
          registered: false,
          status: 'Invalid',
          message: '올바른 이메일 인증 요청 ID가 필요합니다.'
        });
      }

      pending = getPendingVerificationByEmail_(userEmail);
      if (!pending || pending.requestIdHash !== sha256Hex_(requestId)) {
        return json_({
          success: true,
          registered: false,
          status: 'VerificationRequired',
          email: userEmail
        });
      }

      if (pending.state === 'Verified') {
        approvedRequest = true;
      } else {
        return json_({
          success: true,
          registered: false,
          pending: true,
          status: 'Pending',
          email: userEmail,
          requestedAt: pending.requestedAt,
          expiresAt: pending.expiresAt
        });
      }
    }

    const sheet = getUsersSheet_();
    const data = sheet.getDataRange().getValues();
    const row = findUserRow_(data, userEmail);
    if (row < 0) {
      pending = pending || getPendingVerificationByEmail_(userEmail);
      if (pending) {
        return json_({
          success: true,
          registered: false,
          pending: true,
          status: 'Pending',
          email: userEmail,
          requestedAt: pending.requestedAt,
          expiresAt: pending.expiresAt
        });
      }
      return json_({
        success: true,
        registered: false,
        status: 'Missing',
        email: userEmail
      });
    }

    const status = normalizeStatus_(data[row - 1][2]);
    if (status === 'Blocked') {
      return json_({
        success: true,
        registered: false,
        blocked: true,
        status: 'Blocked',
        email: userEmail
      });
    }
    if (status !== 'Active') {
      return json_({
        success: true,
        registered: false,
        invalidStatus: true,
        status: 'Invalid',
        email: userEmail,
        message: 'Users 시트의 Status는 Active 또는 Blocked여야 합니다.'
      });
    }

    // Fast block watching must not change the full-sync timestamp.
    if (action === 'status') {
      return json_({
        success: true,
        registered: true,
        status: 'Active',
        email: userEmail,
        checkedAt: new Date().toISOString(),
        verifiedAt: toIsoString_(data[row - 1][4])
      });
    }

    const checkedAt = new Date();
    sheet.getRange(row, 3, 1, 2).setValues([[
      'Active',
      checkedAt
    ]]);
    SpreadsheetApp.flush();
    if (approvedRequest && pending) {
      clearPendingVerification_(pending.tokenHash, userEmail);
    }

    return json_({
      success: true,
      registered: true,
      status: 'Active',
      email: userEmail,
      checkedAt: checkedAt.toISOString(),
      verifiedAt: toIsoString_(data[row - 1][4])
    });
  } catch (error) {
    console.error(error);
    return json_({
      success: false,
      registered: false,
      status: 'Error',
      message: String(error && error.message || error)
    });
  }
}

function createPendingVerification_(userEmail, requestedAt, requestId, application) {
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
        purpose: application.purpose
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
    return verificationPage_(true, userEmail + ' 인증이 이미 완료되었습니다.', 'FMA Viewer 창으로 돌아가면 자동으로 시작됩니다.');
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
        safeSheetText_(application.purpose)
      ]);
      row = sheet.getLastRow();
      newlyVerified = true;
    }
    SpreadsheetApp.flush();
    pending.state = 'Verified';
    pending.verifiedAt = verifiedAt.toISOString();
    pending.grantExpiresAt = new Date(verifiedAt.getTime() + VERIFICATION_GRANT_TTL_MS).toISOString();
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

  return verificationPage_(true, userEmail + ' 인증이 완료되었습니다.', 'FMA Viewer 창으로 돌아가면 자동으로 시작됩니다.');
}

function sendVerificationEmail_(userEmail, requestedAt, verificationUrl) {
  const expiresAtText = Utilities.formatDate(
    new Date(requestedAt.getTime() + VERIFICATION_TTL_MS),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
  const subject = '[FMA Viewer] 이메일 인증을 완료해 주세요';
  const body = [
    'FMA Viewer 사용 신청을 완료하려면 아래 인증 링크를 열어 주세요.',
    '',
    verificationUrl,
    '',
    '인증 링크 만료 시각: ' + expiresAtText,
    '본인이 신청하지 않았다면 이 메일을 무시해 주세요.'
  ].join('\n');
  const htmlBody = [
    '<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172333">',
    '<h2 style="margin-bottom:8px">FMA Viewer 이메일 인증</h2>',
    '<p><strong>' + escapeHtml_(userEmail) + '</strong> 주소로 사용 신청이 접수되었습니다.</p>',
    '<p>아래 버튼을 눌러 이메일 인증을 완료해 주세요.</p>',
    '<p style="margin:24px 0"><a href="' + escapeHtml_(verificationUrl) + '" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#087f8c;color:#fff;text-decoration:none;font-weight:bold">이메일 인증하기</a></p>',
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
  console.log('인증 메일 발신 계정: ' + getMailSenderEmail_());
  console.log('등록 사용자 수: ' + Math.max(sheet.getLastRow() - 1, 0));
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
