/* =======================================================
   Password login, verified registration, and session checks
   ======================================================= */

const FMA_AUTH_SETTINGS = window.FMAAuthSettings || {};
const FMA_AUTH_STORAGE_PREFIX = String(FMA_AUTH_SETTINGS.storagePrefix || "fma_viewer");
const FMA_AUTH_APP_NAME = String(FMA_AUTH_SETTINGS.appName || "FMA Viewer");
const FMA_AUTH_PENDING_STORAGE = `${FMA_AUTH_STORAGE_PREFIX}_registration_pending_v5`;
const FMA_AUTH_REMEMBER_EMAIL_STORAGE = `${FMA_AUTH_STORAGE_PREFIX}_remembered_email_v1`;
const FMA_AUTH_SESSION_STORAGE = `${FMA_AUTH_STORAGE_PREFIX}_session_v1`;
const FMA_AUTH_LEGACY_STORAGES = [
    `${FMA_AUTH_STORAGE_PREFIX}_logout_position_v1`,
    `${FMA_AUTH_STORAGE_PREFIX}_registration_v4`,
    `${FMA_AUTH_STORAGE_PREFIX}_registration_v3`,
    `${FMA_AUTH_STORAGE_PREFIX}_access_approval_v2`,
    `${FMA_AUTH_STORAGE_PREFIX}_first_use_consent_v1`
];
const FMA_DEFAULT_GAS_WEB_APP_URL = String(FMA_AUTH_SETTINGS.gasWebAppUrl || "");
const FMA_AUTH_TIMEOUT_MS = Number(FMA_AUTH_SETTINGS.registrationTimeoutMs) || 60000;
const FMA_VERIFICATION_POLL_MS = Number(FMA_AUTH_SETTINGS.verificationPollMs) || 5000;
const FMA_VERIFICATION_RETRY_MS = Number(FMA_AUTH_SETTINGS.verificationRetryMs) || 30000;
const FMA_PASSWORD_ITERATIONS = Number(FMA_AUTH_SETTINGS.passwordIterations) || 600000;
const FMA_PASSWORD_LIMITS = Object.freeze({ min: 10, max: 128 });
const FMA_APPLICATION_LIMITS = Object.freeze({ name: 80, organization: 120, purpose: 500 });

let fmaPendingMemoryRecord = null;
let fmaVerificationPollTimer = null;
let fmaSessionSyncTimer = null;
let fmaBlockedWatchTimer = null;
let fmaBlockedWatchInFlight = false;
let fmaLastBlockedWatchAt = 0;

function getRuntimeAdminConfig() {
    try {
        if (window.FMAAdminConfig?.load) return window.FMAAdminConfig.load();
    } catch (error) {
        console.warn("FMA admin configuration could not be applied:", error);
    }
    return {
        gasWebAppUrl: FMA_DEFAULT_GAS_WEB_APP_URL,
        checksPerDay: 1,
        blockedCheckMinutes: 5
    };
}

function getAuthGasUrl() {
    return String(getRuntimeAdminConfig().gasWebAppUrl || FMA_DEFAULT_GAS_WEB_APP_URL);
}

function requireAuthGasUrl() {
    const gasWebAppUrl = getAuthGasUrl();
    if (!gasWebAppUrl) throw new Error("GAS_URL_NOT_CONFIGURED");
    return gasWebAppUrl;
}

async function waitForAuthSettings() {
    if (window.FMAAuthSettingsReady) await window.FMAAuthSettingsReady;
    if (!String(FMA_AUTH_SETTINGS.serverVersion || "")) {
        throw new Error("GAS_CODE_VERSION_UNAVAILABLE");
    }
    return FMA_AUTH_SETTINGS;
}

function getSessionSyncMs() {
    const config = getRuntimeAdminConfig();
    if (window.FMAAdminConfig?.getSyncIntervalMs) return window.FMAAdminConfig.getSyncIntervalMs(config);
    const checksPerDay = Math.min(Math.max(Number(config.checksPerDay) || 1, 1), 24);
    return (24 * 60 * 60 * 1000) / checksPerDay;
}

function getBlockedWatchMs() {
    const config = getRuntimeAdminConfig();
    if (window.FMAAdminConfig?.getBlockedCheckIntervalMs) {
        return window.FMAAdminConfig.getBlockedCheckIntervalMs(config);
    }
    const minutes = Math.min(Math.max(Number(config.blockedCheckMinutes) || 5, 1), 60);
    return minutes * 60 * 1000;
}

function isValidGmailAddress(value) {
    return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i.test(String(value || "").trim());
}

function normalizeGmailAddress(value) {
    const email = String(value || "").trim().toLowerCase();
    if (email && !email.includes("@")) return `${email}@gmail.com`;
    return email;
}

function completeGmailInput(input) {
    const email = normalizeGmailAddress(input?.value);
    if (input && input.value !== email) input.value = email;
    return email;
}

function normalizeApplicationLine(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeApplicationPurpose(value) {
    return String(value || "").replace(/\r\n?/g, "\n").trim();
}

function readPendingRegistration() {
    try {
        const stored = JSON.parse(localStorage.getItem(FMA_AUTH_PENDING_STORAGE) || "null");
        if (stored) fmaPendingMemoryRecord = stored;
        return stored || fmaPendingMemoryRecord;
    } catch (_) {
        return fmaPendingMemoryRecord;
    }
}

function savePendingRegistration(record) {
    fmaPendingMemoryRecord = record;
    try {
        localStorage.setItem(FMA_AUTH_PENDING_STORAGE, JSON.stringify(record));
    } catch (error) {
        console.warn("FMA pending registration could not be persisted:", error);
    }
}

function removePendingRegistration() {
    fmaPendingMemoryRecord = null;
    try {
        localStorage.removeItem(FMA_AUTH_PENDING_STORAGE);
    } catch (_) {}
}

function removeLegacyAuthRecords() {
    try {
        FMA_AUTH_LEGACY_STORAGES.forEach(key => localStorage.removeItem(key));
    } catch (_) {}
}

function readRememberedEmail() {
    try {
        return String(localStorage.getItem(FMA_AUTH_REMEMBER_EMAIL_STORAGE) || "");
    } catch (_) {
        return "";
    }
}

function saveRememberedEmail(email, remember) {
    try {
        if (remember) localStorage.setItem(FMA_AUTH_REMEMBER_EMAIL_STORAGE, email);
        else localStorage.removeItem(FMA_AUTH_REMEMBER_EMAIL_STORAGE);
    } catch (_) {}
}

function readAuthSession() {
    try {
        const session = JSON.parse(sessionStorage.getItem(FMA_AUTH_SESSION_STORAGE) || "null");
        if (
            !session?.email ||
            !/^[a-f0-9]{64}$/i.test(String(session?.token || "")) ||
            Date.parse(session?.expiresAt || "") <= Date.now()
        ) {
            sessionStorage.removeItem(FMA_AUTH_SESSION_STORAGE);
            return null;
        }
        return session;
    } catch (_) {
        return null;
    }
}

function saveAuthSession(session) {
    try {
        sessionStorage.setItem(FMA_AUTH_SESSION_STORAGE, JSON.stringify(session));
    } catch (error) {
        console.warn("FMA login session could not be persisted:", error);
    }
}

function removeAuthSession() {
    try {
        sessionStorage.removeItem(FMA_AUTH_SESSION_STORAGE);
    } catch (_) {}
}

function handleLogoutButtonClick() {
    if (!window.confirm("로그아웃하시겠습니까?")) return;
    void logoutAuthenticatedUser();
}

function setAuthPageLocked(locked) {
    const modal = document.getElementById("firstUseModal");
    document.documentElement.classList.toggle("first-use-locked", locked);
    document.querySelectorAll("body > *").forEach(element => {
        if (element === modal || element.tagName === "SCRIPT") return;
        if (locked) element.setAttribute("inert", "");
        else element.removeAttribute("inert");
    });
}

function setAuthView(view) {
    document.querySelectorAll("[data-auth-panel]").forEach(panel => {
        panel.hidden = panel.dataset.authPanel !== view;
    });
    document.querySelectorAll("[data-auth-actions]").forEach(actions => {
        actions.hidden = actions.dataset.authActions !== view;
    });

    const title = document.getElementById("firstUseTitle");
    const description = document.getElementById("firstUseDescription");
    const footerNote = document.getElementById("authFooterNote");
    if (view === "registration") {
        if (title) title.textContent = `${FMA_AUTH_APP_NAME} 이메일 인증`;
        if (description) description.textContent = "Gmail 인증을 완료하면 입력한 전용 비밀번호로 로그인할 수 있습니다.";
        if (footerNote) {
            footerNote.textContent = "인증 대기 중에도 입력 내용을 수정해 새 인증 메일을 보낼 수 있습니다.";
            footerNote.hidden = false;
        }
    } else {
        if (title) title.textContent = `${FMA_AUTH_APP_NAME} 로그인`;
        if (description) description.textContent = `이메일과 ${FMA_AUTH_APP_NAME} 전용 비밀번호로 로그인해 주세요.`;
        if (footerNote) footerNote.hidden = true;
    }
}

function showAuthModal() {
    const modal = document.getElementById("firstUseModal");
    const logoutButton = document.getElementById("authLogoutButton");
    if (typeof closeUpscaleSettings === "function") closeUpscaleSettings();
    setAuthPageLocked(true);
    if (modal) {
        modal.style.display = "flex";
        delete modal.dataset.authResuming;
    }
    if (logoutButton) logoutButton.hidden = true;
}

function hideAuthModalForSessionResume() {
    const modal = document.getElementById("firstUseModal");
    const logoutButton = document.getElementById("authLogoutButton");
    setAuthPageLocked(true);
    if (modal) {
        modal.style.display = "none";
        modal.dataset.authResuming = "true";
    }
    if (logoutButton) logoutButton.hidden = true;
}

function unlockAuthenticatedApp(email) {
    const modal = document.getElementById("firstUseModal");
    const logoutButton = document.getElementById("authLogoutButton");
    if (modal) {
        modal.style.display = "none";
        delete modal.dataset.authResuming;
    }
    setAuthPageLocked(false);
    if (logoutButton) {
        logoutButton.hidden = false;
        logoutButton.title = `${email} 계정 로그아웃`;
        logoutButton.setAttribute("aria-label", `${email} 계정 로그아웃`);
    }
}

function setMessage(id, message, tone = "pending") {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.dataset.tone = tone;
    element.hidden = !message;
}

function showLoginStatus(message, tone = "pending") {
    setMessage("authLoginStatus", message, tone);
}

function showLoginError(message) {
    setMessage("authLoginError", message, "error");
}

function showRegistrationStatus(message, tone = "pending") {
    setMessage("firstUseStatus", message, tone);
}

function showRegistrationError(message) {
    setMessage("firstUseError", message, "error");
}

function showLoginView(options = {}) {
    showAuthModal();
    setAuthView("login");
    const emailInput = document.getElementById("authLoginEmail");
    if (options.email && emailInput) emailInput.value = options.email;
    showLoginStatus(options.message || "", options.tone || "pending");
    showLoginError(options.error || "");
    setLoginBusy(false);
    const focusTarget = options.focusPassword ? document.getElementById("authLoginPassword") : emailInput;
    focusTarget?.focus();
}

function readApplicationForm(completeEmail = false) {
    const emailInput = document.getElementById("firstUseGmail");
    return {
        email: completeEmail
            ? completeGmailInput(emailInput)
            : String(emailInput?.value || "").trim().toLowerCase(),
        name: normalizeApplicationLine(document.getElementById("firstUseName")?.value),
        organization: normalizeApplicationLine(document.getElementById("firstUseOrganization")?.value),
        purpose: normalizeApplicationPurpose(document.getElementById("firstUsePurpose")?.value)
    };
}

function fillApplicationForm(application = {}) {
    const values = {
        firstUseGmail: String(application.email || ""),
        firstUseName: String(application.name || ""),
        firstUseOrganization: String(application.organization || ""),
        firstUsePurpose: String(application.purpose || "")
    };
    Object.entries(values).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value;
    });
}

function formatAuthTimestamp(date) {
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}년 ${pad(date.getMonth() + 1)}월 ${pad(date.getDate())}일 ${pad(date.getHours())}시 ${pad(date.getMinutes())}분`;
}

function updateApplicationPreview(application = readApplicationForm(), requestedAt = new Date().toISOString()) {
    const preview = document.getElementById("firstUseMailPreview");
    if (!preview) return;
    const name = normalizeApplicationLine(application.name) || "입력된 이름";
    const email = String(application.email || "입력된 메일").trim();
    const organization = normalizeApplicationLine(application.organization) || "입력된 소속";
    const purpose = normalizeApplicationPurpose(application.purpose) || "입력된 사용목적";
    preview.textContent = `${name} · ${email} · ${organization}\n사용목적: ${purpose}\n신청시각: ${formatAuthTimestamp(new Date(requestedAt))}`;
}

function showRegistrationView(options = {}) {
    showAuthModal();
    setAuthView("registration");
    if (options.application) fillApplicationForm(options.application);
    else if (options.email) {
        const emailInput = document.getElementById("firstUseGmail");
        if (emailInput) emailInput.value = options.email;
    }
    const consent = document.getElementById("firstUsePrivacyConsent");
    if (typeof options.consented === "boolean" && consent) consent.checked = options.consented;
    updateApplicationPreview();
    showRegistrationStatus(options.message || "", options.tone || "pending");
    showRegistrationError(options.error || "");
    setRegistrationMode(options.verifying ? "verifying" : "idle");
    (options.focusPassword ? document.getElementById("firstUsePassword") : document.getElementById("firstUseName"))?.focus();
}

function setLoginBusy(busy) {
    ["authLoginEmail", "authLoginPassword", "authRememberEmail", "btnShowRegistration"].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.disabled = busy;
    });
    const button = document.getElementById("btnAuthLogin");
    if (button) {
        button.disabled = busy;
        button.textContent = busy ? "로그인 확인 중..." : "로그인";
    }
}

function setRegistrationMode(mode) {
    const requesting = mode === "requesting";
    [
        "firstUseGmail",
        "firstUseName",
        "firstUseOrganization",
        "firstUsePassword",
        "firstUsePasswordConfirm",
        "firstUsePurpose",
        "firstUsePrivacyConsent",
        "btnBackToLogin"
    ].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.disabled = requesting;
    });

    const button = document.getElementById("btnFirstUseContinue");
    if (!button) return;
    button.disabled = requesting;
    if (requesting) button.textContent = "인증 메일 발송 중...";
    else if (mode === "verifying") button.textContent = "수정 내용으로 인증 메일 다시 보내기";
    else button.textContent = "인증 메일 보내기";
}

function createRandomHex(byteLength) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
    if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error("INVALID_PASSWORD_SALT");
    return Uint8Array.from(hex.match(/.{2}/g), value => parseInt(value, 16));
}

function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, "0")).join("");
}

async function derivePasswordVerifier(password, saltHex, iterations) {
    if (!window.crypto?.subtle || typeof TextEncoder === "undefined") {
        throw new Error("WEB_CRYPTO_UNAVAILABLE");
    }
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        hash: "SHA-256",
        salt: hexToBytes(saltHex),
        iterations
    }, key, 256);
    return bytesToHex(bits);
}

async function readGasJson(response) {
    const text = await response.text();
    const contentType = response.headers?.get?.("content-type") || "";
    if (response.redirected && /accounts\.google\.com/i.test(response.url || "")) throw new Error("GAS_AUTH_REQUIRED");
    if (/text\/html/i.test(contentType) || /^\s*<!doctype html/i.test(text)) throw new Error("GAS_AUTH_REQUIRED");
    if (!response.ok) throw new Error(`GAS_HTTP_${response.status}`);
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error("GAS_INVALID_JSON");
    }
}

async function fetchGasJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FMA_AUTH_TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return await readGasJson(response);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function postAuthAction(payload) {
    await waitForAuthSettings();
    return fetchGasJson(requireAuthGasUrl(), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    });
}

function verifyServerVersion(result) {
    const expectedVersion = String(FMA_AUTH_SETTINGS.serverVersion || "");
    if (!expectedVersion) throw new Error("GAS_CODE_VERSION_UNAVAILABLE");
    const actualVersion = String(result?.serverVersion || result?.version || "");
    if (actualVersion !== expectedVersion) {
        throw new Error("GAS_SERVER_VERSION_MISMATCH");
    }
}

function describeAuthError(error) {
    if (error?.name === "AbortError") return "인증 서버가 60초 안에 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.";
    if (error?.message === "GAS_AUTH_REQUIRED") {
        return "GAS 웹 앱 공개 권한이 올바르지 않습니다. 관리자에게 배포 설정 확인을 요청해 주세요.";
    }
    if (error?.message === "GAS_SERVER_VERSION_MISMATCH") {
        return "로그인 기능이 포함된 최신 GAS 코드가 아직 배포되지 않았습니다.";
    }
    if (error?.message === "GAS_URL_NOT_CONFIGURED") {
        return "인증 서버 주소가 설정되지 않았습니다. 관리자가 관리자 페이지에서 GAS /exec 배포 URL을 먼저 등록해야 합니다.";
    }
    if (error?.message === "GAS_CODE_VERSION_UNAVAILABLE") {
        return "앱의 Auth/gas/Code.gs 버전을 확인하지 못했습니다. 웹 배포에 Code.gs가 포함되어 있는지 확인해 주세요.";
    }
    if (error?.message === "WEB_CRYPTO_UNAVAILABLE") {
        return "이 환경에서는 안전한 비밀번호 처리를 사용할 수 없습니다. HTTPS 또는 localhost에서 최신 브라우저로 열어 주세요.";
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(String(error?.message || ""))) {
        return "인증 서버에 연결하지 못했습니다. 인터넷 연결과 GAS 배포 URL을 확인해 주세요.";
    }
    return `인증 처리 중 오류가 발생했습니다. (${error?.message || "알 수 없는 오류"})`;
}

async function getLoginParameters(email) {
    await waitForAuthSettings();
    const url = new URL(requireAuthGasUrl());
    url.searchParams.set("action", "login-params");
    url.searchParams.set("email", email);
    url.searchParams.set("_", String(Date.now()));
    const result = await fetchGasJson(url.toString(), { method: "GET", cache: "no-store" });
    verifyServerVersion(result);
    if (!result?.success || !/^[a-f0-9]{32,128}$/i.test(String(result.passwordSalt || ""))) {
        throw new Error(result?.message || "LOGIN_PARAMETERS_INVALID");
    }
    const iterations = Number(result.passwordIterations);
    if (!Number.isInteger(iterations) || iterations < 200000 || iterations > 1000000) {
        throw new Error("LOGIN_PARAMETERS_INVALID");
    }
    return { salt: result.passwordSalt, iterations };
}

async function performLogin() {
    const emailInput = document.getElementById("authLoginEmail");
    const passwordInput = document.getElementById("authLoginPassword");
    const rememberInput = document.getElementById("authRememberEmail");
    const email = completeGmailInput(emailInput);
    const password = String(passwordInput?.value || "");

    showLoginError("");
    showLoginStatus("");
    if (!isValidGmailAddress(email)) {
        showLoginError("@gmail.com 주소를 정확히 입력해 주세요.");
        emailInput?.focus();
        return;
    }
    if (password.length < FMA_PASSWORD_LIMITS.min || password.length > FMA_PASSWORD_LIMITS.max) {
        showLoginError(`비밀번호는 ${FMA_PASSWORD_LIMITS.min}~${FMA_PASSWORD_LIMITS.max}자로 입력해 주세요.`);
        passwordInput?.focus();
        return;
    }

    setLoginBusy(true);
    showLoginStatus("비밀번호를 안전하게 확인하고 있습니다…", "pending");
    try {
        const parameters = await getLoginParameters(email);
        const passwordVerifier = await derivePasswordVerifier(password, parameters.salt, parameters.iterations);
        const result = await postAuthAction({ action: "login", email, passwordVerifier });
        verifyServerVersion(result);
        if (!result?.success || !result?.authenticated || !/^[a-f0-9]{64}$/i.test(String(result.sessionToken || ""))) {
            const message = result?.blocked
                ? "관리자에 의해 사용이 중지된 계정입니다."
                : result?.passwordSetupRequired
                    ? "이 계정에는 로그인 비밀번호가 없습니다. 아래 ‘이메일 인증하기’에서 비밀번호를 설정해 주세요."
                    : result?.message || "이메일 또는 비밀번호가 올바르지 않습니다.";
            throw new Error(message);
        }

        const session = {
            email,
            token: result.sessionToken,
            expiresAt: result.expiresAt,
            lastVerifiedAt: result.checkedAt || new Date().toISOString()
        };
        saveRememberedEmail(email, Boolean(rememberInput?.checked));
        saveAuthSession(session);
        if (passwordInput) passwordInput.value = "";
        clearAuthTimers();
        unlockAuthenticatedApp(email);
        scheduleSessionSync(session);
        scheduleBlockedWatch(session, 1000);
    } catch (error) {
        console.warn("FMA login failed:", error);
        showLoginStatus("");
        const knownMessage = /비밀번호|계정|사용이 중지/.test(String(error?.message || ""));
        showLoginError(knownMessage ? String(error.message) : describeAuthError(error));
    } finally {
        setLoginBusy(false);
    }
}

function validateRegistrationForm() {
    const application = readApplicationForm(true);
    const passwordInput = document.getElementById("firstUsePassword");
    const passwordConfirmInput = document.getElementById("firstUsePasswordConfirm");
    const password = String(passwordInput?.value || "");
    const passwordConfirm = String(passwordConfirmInput?.value || "");
    const consent = document.getElementById("firstUsePrivacyConsent");

    if (!application.name || application.name.length > FMA_APPLICATION_LIMITS.name) {
        throw Object.assign(new Error("신청자 이름을 80자 이내로 입력해 주세요."), { focusId: "firstUseName" });
    }
    if (!application.organization || application.organization.length > FMA_APPLICATION_LIMITS.organization) {
        throw Object.assign(new Error("소속을 120자 이내로 입력해 주세요."), { focusId: "firstUseOrganization" });
    }
    if (!isValidGmailAddress(application.email)) {
        throw Object.assign(new Error("@gmail.com 주소를 정확히 입력해 주세요."), { focusId: "firstUseGmail" });
    }
    if (password.length < FMA_PASSWORD_LIMITS.min || password.length > FMA_PASSWORD_LIMITS.max) {
        throw Object.assign(new Error(`비밀번호는 ${FMA_PASSWORD_LIMITS.min}~${FMA_PASSWORD_LIMITS.max}자로 입력해 주세요.`), { focusId: "firstUsePassword" });
    }
    if (password !== passwordConfirm) {
        throw Object.assign(new Error("비밀번호 확인이 일치하지 않습니다."), { focusId: "firstUsePasswordConfirm" });
    }
    if (!application.purpose || application.purpose.length > FMA_APPLICATION_LIMITS.purpose) {
        throw Object.assign(new Error("사용목적을 500자 이내로 입력해 주세요."), { focusId: "firstUsePurpose" });
    }
    if (!consent?.checked) {
        throw Object.assign(new Error("개인정보 처리방침을 읽고 동의해야 인증 메일을 보낼 수 있습니다."), { focusId: "firstUsePrivacyConsent" });
    }
    return { application, password };
}

async function requestRegistration() {
    showRegistrationError("");
    let validated;
    try {
        validated = validateRegistrationForm();
    } catch (error) {
        showRegistrationError(error.message);
        document.getElementById(error.focusId)?.focus();
        return;
    }

    const { application, password } = validated;
    const requestedAt = new Date().toISOString();
    const requestId = createRandomHex(32);
    const passwordSalt = createRandomHex(16);
    clearVerificationPollTimer();
    setRegistrationMode("requesting");
    showRegistrationStatus(`${application.email}로 보낼 인증 요청을 준비하고 있습니다…`, "pending");
    updateApplicationPreview(application, requestedAt);

    try {
        const passwordVerifier = await derivePasswordVerifier(password, passwordSalt, FMA_PASSWORD_ITERATIONS);
        const result = await postAuthAction({
            action: "register",
            ...application,
            requestId,
            passwordSalt,
            passwordVerifier,
            passwordIterations: FMA_PASSWORD_ITERATIONS
        });
        verifyServerVersion(result);
        if (!result?.success || !result?.pending || !result?.verificationSent) {
            throw new Error(result?.message || "인증 메일을 보내지 못했습니다.");
        }

        const pendingRecord = {
            ...application,
            requestId,
            status: "Pending",
            requestedAt: result.requestedAt || requestedAt,
            expiresAt: result.expiresAt || ""
        };
        savePendingRegistration(pendingRecord);
        removeLegacyAuthRecords();
        const passwordInput = document.getElementById("firstUsePassword");
        const passwordConfirmInput = document.getElementById("firstUsePasswordConfirm");
        if (passwordInput) passwordInput.value = "";
        if (passwordConfirmInput) passwordConfirmInput.value = "";
        showRegistrationStatus(
            `${application.email}로 인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요. 입력 내용을 수정하면 새 인증 메일을 보낼 수 있습니다.`,
            "success"
        );
        setRegistrationMode("verifying");
        scheduleVerificationPoll(pendingRecord, 1500);
    } catch (error) {
        console.error("FMA registration failed:", error);
        const knownMessage = /인증|Gmail|비밀번호|Status|사용이 중지/.test(String(error?.message || ""));
        showRegistrationStatus("");
        showRegistrationError(knownMessage ? String(error.message) : describeAuthError(error));
        setRegistrationMode("idle");
    }
}

function isCurrentPending(record) {
    const current = readPendingRegistration();
    return Boolean(current?.email === record?.email && current?.requestId === record?.requestId);
}

function clearVerificationPollTimer() {
    if (fmaVerificationPollTimer) clearTimeout(fmaVerificationPollTimer);
    fmaVerificationPollTimer = null;
}

function scheduleVerificationPoll(record, delay = FMA_VERIFICATION_POLL_MS) {
    clearVerificationPollTimer();
    if (!record?.email || !/^[a-f0-9]{64}$/i.test(String(record?.requestId || ""))) return;
    fmaVerificationPollTimer = setTimeout(() => {
        const current = readPendingRegistration();
        if (current?.email && current?.requestId) void verifyPendingRegistration(current);
    }, Math.max(Number(delay) || FMA_VERIFICATION_POLL_MS, 500));
}

async function verifyPendingRegistration(record) {
    if (!isCurrentPending(record)) return;
    clearVerificationPollTimer();
    try {
        await waitForAuthSettings();
        const url = new URL(requireAuthGasUrl());
        url.searchParams.set("action", "check");
        url.searchParams.set("email", record.email);
        url.searchParams.set("requestId", record.requestId);
        url.searchParams.set("_", String(Date.now()));
        const result = await fetchGasJson(url.toString(), { method: "GET", cache: "no-store" });
        verifyServerVersion(result);
        if (!isCurrentPending(record)) return;

        if (result?.verified || (result?.registered && result?.passwordConfigured)) {
            removePendingRegistration();
            const emailInput = document.getElementById("authLoginEmail");
            if (emailInput) emailInput.value = record.email;
            showLoginView({
                email: record.email,
                message: "이메일 인증과 비밀번호 설정이 완료되었습니다. 비밀번호를 입력해 로그인해 주세요.",
                tone: "success",
                focusPassword: true
            });
            return;
        }

        if (result?.blocked || result?.status === "Blocked") {
            removePendingRegistration();
            showRegistrationView({
                application: record,
                error: "관리자에 의해 사용이 중지된 Gmail입니다.",
                verifying: false
            });
            return;
        }

        if (result?.pending || result?.status === "Pending") {
            const updated = { ...record, expiresAt: result.expiresAt || record.expiresAt || "" };
            savePendingRegistration(updated);
            const registrationPanel = document.getElementById("authRegistrationPanel");
            if (registrationPanel && !registrationPanel.hidden) {
                showRegistrationStatus("인증 메일의 링크를 기다리고 있습니다. 입력 내용은 계속 수정할 수 있습니다.", "pending");
                setRegistrationMode("verifying");
            }
            scheduleVerificationPoll(updated);
            return;
        }

        removePendingRegistration();
        showRegistrationView({
            application: record,
            message: "인증 요청이 만료되었거나 교체되었습니다. 내용을 확인하고 새 인증 메일을 보내 주세요."
        });
    } catch (error) {
        console.warn("Email verification status check failed; retrying:", error);
        if (!isCurrentPending(record)) return;
        scheduleVerificationPoll(record, FMA_VERIFICATION_RETRY_MS);
    }
}

function clearSessionSyncTimer() {
    if (fmaSessionSyncTimer) clearTimeout(fmaSessionSyncTimer);
    fmaSessionSyncTimer = null;
}

function clearBlockedWatchTimer() {
    if (fmaBlockedWatchTimer) clearTimeout(fmaBlockedWatchTimer);
    fmaBlockedWatchTimer = null;
}

function clearAuthTimers() {
    clearSessionSyncTimer();
    clearBlockedWatchTimer();
}

function scheduleSessionSync(session, delayOverride) {
    clearSessionSyncTimer();
    const lastCheckedAt = Date.parse(session?.lastVerifiedAt || "") || Date.now();
    const delay = Number.isFinite(delayOverride)
        ? Math.max(delayOverride, 1000)
        : Math.max(lastCheckedAt + getSessionSyncMs() - Date.now(), 1000);
    fmaSessionSyncTimer = setTimeout(() => void verifyActiveSession(true), delay);
}

function scheduleBlockedWatch(session, delayOverride) {
    clearBlockedWatchTimer();
    if (!session?.email || !session?.token) return;
    const delay = Number.isFinite(delayOverride) ? Math.max(delayOverride, 250) : getBlockedWatchMs();
    fmaBlockedWatchTimer = setTimeout(() => void verifyActiveSession(false), delay);
}

async function requestSessionStatus(session, fullCheck) {
    return postAuthAction({
        action: fullCheck ? "check" : "status",
        email: session.email,
        sessionToken: session.token
    });
}

function lockForSessionResult(session, result) {
    clearAuthTimers();
    removeAuthSession();
    const message = result?.blocked || result?.status === "Blocked"
        ? "관리자에 의해 사용이 중지된 계정입니다."
        : "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.";
    showLoginView({ email: session?.email || "", error: message });
}

async function verifyActiveSession(fullCheck) {
    const session = readAuthSession();
    if (!session || fmaBlockedWatchInFlight) return;
    fmaBlockedWatchInFlight = true;
    if (!fullCheck) fmaLastBlockedWatchAt = Date.now();

    try {
        const result = await requestSessionStatus(session, fullCheck);
        verifyServerVersion(result);
        if (!result?.authenticated || result?.blocked || result?.status === "Blocked" || result?.status === "Invalid") {
            lockForSessionResult(session, result);
            return;
        }
        const updated = fullCheck
            ? { ...session, lastVerifiedAt: result.checkedAt || new Date().toISOString() }
            : session;
        if (fullCheck) saveAuthSession(updated);
        scheduleSessionSync(updated);
        scheduleBlockedWatch(updated);
    } catch (error) {
        console.warn("Authenticated status check failed; keeping the active session until retry:", error);
        scheduleSessionSync(session, Math.min(getSessionSyncMs(), 15 * 60 * 1000));
        scheduleBlockedWatch(session);
    } finally {
        fmaBlockedWatchInFlight = false;
    }
}

async function resumeSession(session) {
    hideAuthModalForSessionResume();
    setLoginBusy(true);
    try {
        const result = await requestSessionStatus(session, false);
        verifyServerVersion(result);
        if (!result?.authenticated || result?.blocked || result?.status !== "Active") {
            lockForSessionResult(session, result);
            return;
        }
        unlockAuthenticatedApp(session.email);
        scheduleSessionSync(session);
        scheduleBlockedWatch(session, 1000);
    } catch (error) {
        removeAuthSession();
        showLoginView({ email: session.email, error: describeAuthError(error) });
    } finally {
        setLoginBusy(false);
    }
}

async function logoutAuthenticatedUser() {
    const session = readAuthSession();
    clearAuthTimers();
    removeAuthSession();
    showLoginView({ email: session?.email || readRememberedEmail(), message: "로그아웃했습니다.", tone: "success" });
    if (!session) return;
    try {
        await postAuthAction({ action: "logout", email: session.email, sessionToken: session.token });
    } catch (error) {
        console.warn("Server session logout could not be completed:", error);
    }
}

function openRegistrationFromLogin() {
    const loginEmail = completeGmailInput(document.getElementById("authLoginEmail"));
    const pending = readPendingRegistration();
    showRegistrationView({
        application: pending || { email: loginEmail },
        consented: Boolean(pending),
        message: pending
            ? "보낸 인증 메일을 기다리고 있습니다. 모든 입력값을 수정한 뒤 새 인증 메일을 보낼 수도 있습니다."
            : "정보와 전용 비밀번호를 입력해 이메일 인증을 시작해 주세요.",
        verifying: Boolean(pending)
    });
}

function returnToLogin() {
    const registrationEmail = completeGmailInput(document.getElementById("firstUseGmail"));
    const passwordInput = document.getElementById("firstUsePassword");
    const passwordConfirmInput = document.getElementById("firstUsePasswordConfirm");
    if (passwordInput) passwordInput.value = "";
    if (passwordConfirmInput) passwordConfirmInput.value = "";
    showLoginView({ email: registrationEmail || readRememberedEmail() });
}

function checkSessionAfterReturn() {
    if (document.visibilityState !== "visible") return;
    const pending = readPendingRegistration();
    if (pending?.email && pending?.requestId) void verifyPendingRegistration(pending);
    const session = readAuthSession();
    if (!session || Date.now() - fmaLastBlockedWatchAt < getBlockedWatchMs()) return;
    void verifyActiveSession(false);
}

function rescheduleAfterAdminConfigChange() {
    const session = readAuthSession();
    if (!session) return;
    clearAuthTimers();
    scheduleSessionSync(session);
    scheduleBlockedWatch(session, 1000);
}

function initFMAAuthentication() {
    const modal = document.getElementById("firstUseModal");
    if (!modal) return;

    document.getElementById("btnAuthLogin")?.addEventListener("click", performLogin);
    document.getElementById("btnShowRegistration")?.addEventListener("click", openRegistrationFromLogin);
    document.getElementById("btnBackToLogin")?.addEventListener("click", returnToLogin);
    document.getElementById("btnFirstUseContinue")?.addEventListener("click", requestRegistration);
    const logoutButton = document.getElementById("authLogoutButton");
    logoutButton?.addEventListener("click", handleLogoutButtonClick);

    ["authLoginEmail", "authLoginPassword"].forEach(id => {
        document.getElementById(id)?.addEventListener("keydown", event => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void performLogin();
        });
    });
    ["firstUseGmail", "firstUseName", "firstUseOrganization", "firstUsePurpose"].forEach(id => {
        document.getElementById(id)?.addEventListener("input", () => updateApplicationPreview());
    });
    ["authLoginEmail", "firstUseGmail"].forEach(id => {
        document.getElementById(id)?.addEventListener("blur", event => {
            completeGmailInput(event.currentTarget);
            if (id === "firstUseGmail") updateApplicationPreview();
        });
    });

    removeLegacyAuthRecords();
    const rememberedEmail = readRememberedEmail();
    const loginEmailInput = document.getElementById("authLoginEmail");
    const rememberInput = document.getElementById("authRememberEmail");
    if (loginEmailInput) loginEmailInput.value = rememberedEmail;
    if (rememberInput) rememberInput.checked = Boolean(rememberedEmail);

    const pending = readPendingRegistration();
    if (pending?.email && pending?.requestId) scheduleVerificationPoll(pending, 1000);

    const session = readAuthSession();
    if (session) {
        void resumeSession(session);
        return;
    }
    showLoginView({
        email: rememberedEmail,
        message: pending ? "이메일 인증 응답을 기다리는 중입니다. 인증을 마치면 이 화면에서 로그인하세요." : ""
    });
}

window.addEventListener("beforeunload", () => {
    clearVerificationPollTimer();
    clearAuthTimers();
});
window.addEventListener("fma-admin-config-changed", rescheduleAfterAdminConfigChange);
window.addEventListener("online", checkSessionAfterReturn);
document.addEventListener("visibilitychange", checkSessionAfterReturn);
window.addEventListener("storage", event => {
    if (event.key === window.FMAAdminConfig?.STORAGE_KEY) rescheduleAfterAdminConfigChange();
});
document.addEventListener("DOMContentLoaded", initFMAAuthentication);
