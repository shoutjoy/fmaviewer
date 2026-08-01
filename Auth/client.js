/* =======================================================
   First-use registration, periodic Sheet sync, and block watching
   ======================================================= */

const FMA_AUTH_SETTINGS = window.FMAAuthSettings || {};
const FMA_AUTH_STORAGE_PREFIX = String(FMA_AUTH_SETTINGS.storagePrefix || "fma_viewer");
const FMA_AUTH_APP_NAME = String(FMA_AUTH_SETTINGS.appName || "FMA Viewer");
const FMA_FIRST_USE_STORAGE = `${FMA_AUTH_STORAGE_PREFIX}_registration_v4`;
const FMA_FIRST_USE_LEGACY_STORAGES = [
    `${FMA_AUTH_STORAGE_PREFIX}_registration_v3`,
    `${FMA_AUTH_STORAGE_PREFIX}_access_approval_v2`,
    `${FMA_AUTH_STORAGE_PREFIX}_first_use_consent_v1`
];
const FMA_DEFAULT_GAS_WEB_APP_URL = String(FMA_AUTH_SETTINGS.gasWebAppUrl || "");
const FMA_REGISTRATION_TIMEOUT_MS = Number(FMA_AUTH_SETTINGS.registrationTimeoutMs) || 60000;
const FMA_REGISTRATION_RETRY_MS = Number(FMA_AUTH_SETTINGS.registrationRetryMs) || (60 * 60 * 1000);
const FMA_VERIFICATION_POLL_MS = Number(FMA_AUTH_SETTINGS.verificationPollMs) || 5000;
const FMA_VERIFICATION_RETRY_MS = Number(FMA_AUTH_SETTINGS.verificationRetryMs) || 30000;
const FMA_APPLICATION_LIMITS = Object.freeze({ name: 80, organization: 120, purpose: 500 });

let firstUseMemoryRecord = null;
let registrationSyncTimer = null;
let verificationPollTimer = null;
let blockedWatchTimer = null;
let blockedWatchInFlight = false;
let lastBlockedWatchAt = 0;

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

function getRegistrationGasUrl() {
    return String(getRuntimeAdminConfig().gasWebAppUrl || FMA_DEFAULT_GAS_WEB_APP_URL);
}

function getRegistrationSyncMs() {
    const config = getRuntimeAdminConfig();
    if (window.FMAAdminConfig?.getSyncIntervalMs) {
        return window.FMAAdminConfig.getSyncIntervalMs(config);
    }
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

function readFirstUseRecord() {
    try {
        const stored = JSON.parse(localStorage.getItem(FMA_FIRST_USE_STORAGE) || "null");
        if (stored) firstUseMemoryRecord = stored;
        return stored || firstUseMemoryRecord;
    } catch (_) {
        return firstUseMemoryRecord;
    }
}

function saveFirstUseRecord(record) {
    firstUseMemoryRecord = record;
    try {
        localStorage.setItem(FMA_FIRST_USE_STORAGE, JSON.stringify(record));
    } catch (error) {
        console.warn("FMA registration record could not be persisted:", error);
    }
}

function removeFirstUseRecord() {
    firstUseMemoryRecord = null;
    try {
        localStorage.removeItem(FMA_FIRST_USE_STORAGE);
    } catch (_) {}
}

function removeLegacyFirstUseRecords() {
    try {
        FMA_FIRST_USE_LEGACY_STORAGES.forEach(key => localStorage.removeItem(key));
    } catch (_) {}
}

function isValidGmailAddress(value) {
    return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i.test(String(value || "").trim());
}

function normalizeApplicationLine(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeApplicationPurpose(value) {
    return String(value || "").replace(/\r\n?/g, "\n").trim();
}

function hasCompleteApplicationDetails(application) {
    const name = normalizeApplicationLine(application?.name);
    const organization = normalizeApplicationLine(application?.organization);
    const purpose = normalizeApplicationPurpose(application?.purpose);
    return Boolean(
        name && name.length <= FMA_APPLICATION_LIMITS.name &&
        organization && organization.length <= FMA_APPLICATION_LIMITS.organization &&
        purpose && purpose.length <= FMA_APPLICATION_LIMITS.purpose
    );
}

function readApplicationForm() {
    return {
        email: String(document.getElementById("firstUseGmail")?.value || "").trim().toLowerCase(),
        name: normalizeApplicationLine(document.getElementById("firstUseName")?.value),
        organization: normalizeApplicationLine(document.getElementById("firstUseOrganization")?.value),
        purpose: normalizeApplicationPurpose(document.getElementById("firstUsePurpose")?.value)
    };
}

function fillApplicationForm(application = {}) {
    const values = {
        email: String(application.email || ""),
        name: String(application.name || ""),
        organization: String(application.organization || ""),
        purpose: String(application.purpose || "")
    };
    Object.entries({
        firstUseGmail: values.email,
        firstUseName: values.name,
        firstUseOrganization: values.organization,
        firstUsePurpose: values.purpose
    }).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value;
    });
}

function createVerificationRequestId() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function formatFirstUseTimestamp(date) {
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}년 ${pad(date.getMonth() + 1)}월 ${pad(date.getDate())}일 ${pad(date.getHours())}시 ${pad(date.getMinutes())}분`;
}

function createFirstUseMessage(application, firstUsedAt) {
    const name = normalizeApplicationLine(application?.name) || "입력된 이름";
    const address = String(application?.email || "입력된 메일").trim();
    const organization = normalizeApplicationLine(application?.organization) || "입력된 소속";
    const purpose = normalizeApplicationPurpose(application?.purpose) || "입력된 사용목적";
    return `${name} · ${address} · ${organization}\n사용목적: ${purpose}\n신청시각: ${formatFirstUseTimestamp(new Date(firstUsedAt))}`;
}

function updateFirstUseMailPreview(application = readApplicationForm(), firstUsedAt = new Date().toISOString()) {
    const preview = document.getElementById("firstUseMailPreview");
    if (preview) preview.textContent = createFirstUseMessage(application, firstUsedAt);
}

function showFirstUseError(message) {
    const error = document.getElementById("firstUseError");
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
}

function showFirstUseStatus(message, tone = "pending") {
    const status = document.getElementById("firstUseStatus");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
    status.hidden = !message;
}

function setFirstUseMode(mode) {
    const button = document.getElementById("btnFirstUseContinue");
    const consentInput = document.getElementById("firstUsePrivacyConsent");
    const locked = mode === "requesting" || mode === "checking" || mode === "verifying";

    ["firstUseGmail", "firstUseName", "firstUseOrganization", "firstUsePurpose"].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.disabled = locked;
    });
    if (consentInput) consentInput.disabled = locked;
    if (!button) return;

    button.disabled = mode === "requesting" || mode === "checking";
    if (mode === "requesting") button.textContent = "인증 메일 발송 중...";
    else if (mode === "checking") button.textContent = "등록 상태 동기화 중...";
    else if (mode === "verifying") button.textContent = "인증 메일 다시 보내기";
    else button.textContent = "사용 신청하고 시작";
}

function setFirstUsePageLocked(locked) {
    const modal = document.getElementById("firstUseModal");
    document.documentElement.classList.toggle("first-use-locked", locked);
    document.querySelectorAll("body > *").forEach(element => {
        if (element === modal || element.tagName === "SCRIPT") return;
        if (locked) element.setAttribute("inert", "");
        else element.removeAttribute("inert");
    });
}

function unlockFirstUseModal() {
    const modal = document.getElementById("firstUseModal");
    if (modal) modal.style.display = "none";
    setFirstUsePageLocked(false);
}

function showRegistrationForm(message = "", email = "", blocked = false, errorMessage = "", application = {}) {
    clearRegistrationTimers();
    const modal = document.getElementById("firstUseModal");
    const consentInput = document.getElementById("firstUsePrivacyConsent");

    setFirstUsePageLocked(true);
    if (modal) modal.style.display = "flex";
    fillApplicationForm({ ...application, email });
    if (consentInput) consentInput.checked = false;
    updateFirstUseMailPreview(readApplicationForm());
    setFirstUseMode("idle");
    showFirstUseStatus(message, blocked ? "error" : "pending");
    showFirstUseError(blocked
        ? errorMessage || "이 Gmail은 관리자에 의해 사용이 중지되었습니다. 다른 Gmail로 신청할 수 있습니다."
        : "");
    document.getElementById("firstUseName")?.focus();
}

async function readGasJson(response) {
    const text = await response.text();
    const contentType = response.headers?.get?.("content-type") || "";
    if (response.redirected && /accounts\.google\.com/i.test(response.url || "")) {
        throw new Error("GAS_AUTH_REQUIRED");
    }
    if (/text\/html/i.test(contentType) || /^\s*<!doctype html/i.test(text)) {
        throw new Error("GAS_AUTH_REQUIRED");
    }
    if (!response.ok) throw new Error(`GAS_HTTP_${response.status}`);
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error("GAS_INVALID_JSON");
    }
}

async function fetchGasJson(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FMA_REGISTRATION_TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return await readGasJson(response);
    } finally {
        clearTimeout(timeoutId);
    }
}

function describeGasError(error) {
    if (error?.name === "AbortError") {
        return "신청 서버가 60초 안에 응답하지 않았습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.";
    }
    if (error?.message === "GAS_AUTH_REQUIRED") {
        return "GAS 웹 앱이 로그인을 요구하고 있습니다. 배포 설정을 '실행 사용자: 나', '액세스 권한: 모든 사용자'로 변경해야 합니다.";
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(String(error?.message || ""))) {
        return "신청 서버에 연결하지 못했습니다. GAS 공개 배포 설정과 배포 URL을 확인해 주세요.";
    }
    if (error?.message === "GAS_VERIFICATION_NOT_SENT") {
        return "현재 GAS가 이메일 인증 기능이 없는 이전 버전입니다. Auth/gas/Code.gs를 적용한 새 버전으로 재배포해 주세요.";
    }
    if (error?.message === "GAS_SERVER_VERSION_MISMATCH") {
        return "현재 GAS가 신청자 정보 저장 기능이 없는 이전 버전입니다. 최신 Auth/gas/Code.gs를 새 버전으로 재배포해 주세요.";
    }
    return `신청 정보 처리 중 오류가 발생했습니다. (${error?.message || "알 수 없는 오류"})`;
}

function createRegistrationRecord(email, result, requestedAt) {
    const checkedAt = result.checkedAt || new Date().toISOString();
    return {
        email,
        status: "Registered",
        requestedAt,
        registeredAt: new Date().toISOString(),
        lastVerifiedAt: checkedAt,
        emailVerifiedAt: result.verifiedAt || checkedAt,
        consentedAt: requestedAt,
        privacyPolicyVersion: String(FMA_AUTH_SETTINGS.privacyPolicyVersion || "2026-08-02-2"),
        verificationMethod: "email-link"
    };
}

function createPendingRegistrationRecord(application, requestId, result, requestedAt) {
    return {
        email: application.email,
        name: application.name,
        organization: application.organization,
        purpose: application.purpose,
        requestId,
        status: "Pending",
        requestedAt: result.requestedAt || requestedAt,
        expiresAt: result.expiresAt || "",
        consentedAt: requestedAt,
        privacyPolicyVersion: String(FMA_AUTH_SETTINGS.privacyPolicyVersion || "2026-08-02-2"),
        verificationMethod: "email-link"
    };
}

function isCurrentPendingRegistration(record) {
    const current = readFirstUseRecord();
    return Boolean(
        current?.email === record?.email &&
        current?.requestId === record?.requestId &&
        String(current?.status || "").toLowerCase() === "pending"
    );
}

function getLastVerifiedTime(record) {
    const value = Date.parse(record?.lastVerifiedAt || record?.registeredAt || record?.requestedAt || "");
    return Number.isFinite(value) ? value : 0;
}

function registrationNeedsSync(record) {
    return Date.now() - getLastVerifiedTime(record) >= getRegistrationSyncMs();
}

function clearRegistrationSyncTimer() {
    if (registrationSyncTimer) clearTimeout(registrationSyncTimer);
    registrationSyncTimer = null;
}

function clearVerificationPollTimer() {
    if (verificationPollTimer) clearTimeout(verificationPollTimer);
    verificationPollTimer = null;
}

function clearBlockedWatchTimer() {
    if (blockedWatchTimer) clearTimeout(blockedWatchTimer);
    blockedWatchTimer = null;
}

function clearRegistrationTimers() {
    clearRegistrationSyncTimer();
    clearVerificationPollTimer();
    clearBlockedWatchTimer();
}

function scheduleVerificationPoll(record, delay = FMA_VERIFICATION_POLL_MS) {
    clearVerificationPollTimer();
    if (!record?.email || String(record.status).toLowerCase() !== "pending") return;
    verificationPollTimer = setTimeout(() => {
        const current = readFirstUseRecord();
        if (current?.email && String(current.status).toLowerCase() === "pending") {
            void verifyPendingRegistration(current);
        }
    }, Math.max(Number(delay) || FMA_VERIFICATION_POLL_MS, 500));
}

function scheduleRegistrationSync(record, delayOverride) {
    clearRegistrationSyncTimer();
    const syncIntervalMs = getRegistrationSyncMs();
    const normalDelay = Math.max(
        getLastVerifiedTime(record) + syncIntervalMs - Date.now(),
        1000
    );
    const delay = Number.isFinite(delayOverride) ? delayOverride : normalDelay;
    registrationSyncTimer = setTimeout(() => {
        const current = readFirstUseRecord();
        if (current?.email) void verifyRegistration(current);
    }, delay);
}

function scheduleBlockedWatch(record, delayOverride) {
    clearBlockedWatchTimer();
    if (!record?.email || String(record.status).toLowerCase() !== "registered") return;

    const delay = Number.isFinite(delayOverride)
        ? Math.max(delayOverride, 250)
        : getBlockedWatchMs();
    blockedWatchTimer = setTimeout(() => {
        const current = readFirstUseRecord();
        if (current?.email && String(current.status).toLowerCase() === "registered") {
            void verifyBlockedStatus(current);
        }
    }, delay);
}

function lockFromServerStatus(record, result) {
    removeFirstUseRecord();
    if (result?.blocked || result?.status === "Blocked") {
        showRegistrationForm(
            "Google Sheet에서 Blocked 상태가 확인되어 앱 사용을 중지했습니다.",
            record.email,
            true
        );
        return;
    }

    showRegistrationForm(
        "Google Sheet의 Status 값이 올바르지 않아 안전을 위해 앱을 중지했습니다.",
        record.email,
        true,
        "Users 시트의 Status를 Active 또는 Blocked로 정확히 수정해 주세요."
    );
}

async function verifyBlockedStatus(record) {
    if (blockedWatchInFlight) return;
    blockedWatchInFlight = true;
    clearBlockedWatchTimer();
    lastBlockedWatchAt = Date.now();

    try {
        const url = new URL(getRegistrationGasUrl());
        url.searchParams.set("action", "status");
        url.searchParams.set("email", record.email);
        url.searchParams.set("_", String(Date.now()));
        const result = await fetchGasJson(url.toString(), {
            method: "GET",
            cache: "no-store"
        });

        if (result?.blocked || result?.status === "Blocked" || result?.invalidStatus || result?.status === "Invalid") {
            lockFromServerStatus(record, result);
            return;
        }

        // Missing rows are handled by the less frequent full registration sync.
        // This watcher exists only to stop a currently open app quickly.
        scheduleBlockedWatch(record);
    } catch (error) {
        console.warn("Blocked status watch failed; retrying at the next interval:", error);
        scheduleBlockedWatch(record);
    } finally {
        blockedWatchInFlight = false;
    }
}

async function requestRegistration(application) {
    const userEmail = application.email;
    const requestedAt = new Date().toISOString();
    const requestId = createVerificationRequestId();
    clearVerificationPollTimer();
    removeFirstUseRecord();
    setFirstUseMode("requesting");
    showFirstUseError("");
    showFirstUseStatus(`${userEmail}을 승인중입니다.`, "pending");
    updateFirstUseMailPreview(application, requestedAt);

    try {
        const result = await fetchGasJson(getRegistrationGasUrl(), {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ ...application, requestId })
        });
        if (
            result?.success === true &&
            String(result?.serverVersion || "") !== String(FMA_AUTH_SETTINGS.serverVersion || "")
        ) {
            throw new Error("GAS_SERVER_VERSION_MISMATCH");
        }
        if (!result?.success || result?.blocked) {
            throw new Error(result?.message || "GAS_REGISTRATION_REJECTED");
        }

        if (!result.pending || !result.verificationSent) {
            throw new Error(result?.message || "GAS_VERIFICATION_NOT_SENT");
        }

        const pendingRecord = createPendingRegistrationRecord(application, requestId, result, requestedAt);
        saveFirstUseRecord(pendingRecord);
        removeLegacyFirstUseRecords();
        showFirstUseStatus(`${userEmail}로 인증 메일을 보냈습니다. 메일의 인증 링크를 눌러 주세요.`, "pending");
        setFirstUseMode("verifying");
        scheduleVerificationPoll(pendingRecord, 1500);
    } catch (error) {
        console.error("FMA registration failed:", error);
        showFirstUseStatus("", "pending");
        showFirstUseError(describeGasError(error));
        setFirstUseMode("idle");
    }
}

async function verifyPendingRegistration(record) {
    const modal = document.getElementById("firstUseModal");
    const consentInput = document.getElementById("firstUsePrivacyConsent");

    if (!hasCompleteApplicationDetails(record)) {
        removeFirstUseRecord();
        showRegistrationForm(
            "신청자 정보 항목이 추가되었습니다. 이름, 소속, 사용목적을 입력하고 인증 메일을 다시 요청해 주세요.",
            record.email || ""
        );
        return;
    }

    clearVerificationPollTimer();
    setFirstUsePageLocked(true);
    if (modal) modal.style.display = "flex";
    fillApplicationForm(record);
    if (consentInput) consentInput.checked = true;
    updateFirstUseMailPreview(record, record.requestedAt || new Date().toISOString());
    showFirstUseError("");
    showFirstUseStatus(`${record.email}의 이메일 인증 응답을 기다리고 있습니다.`, "pending");
    setFirstUseMode("verifying");

    try {
        const url = new URL(getRegistrationGasUrl());
        url.searchParams.set("action", "check");
        url.searchParams.set("email", record.email);
        url.searchParams.set("requestId", record.requestId || "");
        url.searchParams.set("_", String(Date.now()));
        const result = await fetchGasJson(url.toString(), {
            method: "GET",
            cache: "no-store"
        });

        if (!isCurrentPendingRegistration(record)) return;

        if (result?.success === false) {
            throw new Error(result?.message || "GAS_VERIFICATION_CHECK_FAILED");
        }

        if (result?.success && result?.registered && !result?.blocked) {
            const registeredRecord = createRegistrationRecord(
                record.email,
                result,
                record.requestedAt || new Date().toISOString()
            );
            saveFirstUseRecord(registeredRecord);
            scheduleRegistrationSync(registeredRecord);
            scheduleBlockedWatch(registeredRecord);
            alert(`이메일 인증이 완료되었습니다. ${FMA_AUTH_APP_NAME}를 시작합니다.`);
            unlockFirstUseModal();
            return;
        }

        if (result?.blocked || result?.status === "Blocked" || result?.invalidStatus || result?.status === "Invalid") {
            lockFromServerStatus(record, result);
            return;
        }

        if (result?.pending || result?.status === "Pending") {
            const updatedRecord = {
                ...record,
                expiresAt: result.expiresAt || record.expiresAt || ""
            };
            saveFirstUseRecord(updatedRecord);
            scheduleVerificationPoll(updatedRecord);
            return;
        }

        removeFirstUseRecord();
        showRegistrationForm(
            "인증 요청이 만료되었거나 취소되었습니다. 인증 메일을 다시 요청해 주세요.",
            record.email,
            false,
            "",
            record
        );
    } catch (error) {
        console.warn("Email verification status check failed; retrying:", error);
        if (!isCurrentPendingRegistration(record)) return;
        showFirstUseStatus("인증 상태 서버 연결을 재시도하고 있습니다…", "pending");
        scheduleVerificationPoll(record, FMA_VERIFICATION_RETRY_MS);
    }
}

async function verifyRegistration(record) {
    const modal = document.getElementById("firstUseModal");
    const consentInput = document.getElementById("firstUsePrivacyConsent");

    clearRegistrationTimers();
    setFirstUsePageLocked(true);
    if (modal) modal.style.display = "flex";
    fillApplicationForm({ email: record.email || "" });
    if (consentInput) consentInput.checked = true;
    updateFirstUseMailPreview({ email: record.email }, record.requestedAt || new Date().toISOString());
    showFirstUseError("");
    showFirstUseStatus("Google Sheet의 등록 이메일을 확인하고 있습니다…", "pending");
    setFirstUseMode("checking");

    try {
        const url = new URL(getRegistrationGasUrl());
        url.searchParams.set("action", "check");
        url.searchParams.set("email", record.email);
        url.searchParams.set("_", String(Date.now()));
        const result = await fetchGasJson(url.toString(), {
            method: "GET",
            cache: "no-store"
        });

        if (result?.success === false && result?.status === "Error") {
            throw new Error(result?.message || "GAS_STATUS_CHECK_FAILED");
        }

        if (result?.success && result?.registered && !result?.blocked) {
            const updatedRecord = {
                ...record,
                status: "Registered",
                lastVerifiedAt: result.checkedAt || new Date().toISOString()
            };
            saveFirstUseRecord(updatedRecord);
            scheduleRegistrationSync(updatedRecord);
            scheduleBlockedWatch(updatedRecord);
            unlockFirstUseModal();
            return;
        }

        if (result?.blocked || result?.status === "Blocked" || result?.invalidStatus || result?.status === "Invalid") {
            lockFromServerStatus(record, result);
            return;
        }

        removeFirstUseRecord();
        showRegistrationForm(
            "Google Sheet에 등록 이메일이 없어 다시 신청해야 합니다.",
            record.email,
            false
        );
    } catch (error) {
        // A temporary outage should not lock out an already registered browser.
        console.warn("Daily registration sync failed; allowing temporary access:", error);
        scheduleRegistrationSync(record, FMA_REGISTRATION_RETRY_MS);
        scheduleBlockedWatch(record);
        unlockFirstUseModal();
    }
}

function completeFirstUseRegistration() {
    const consentInput = document.getElementById("firstUsePrivacyConsent");
    const application = readApplicationForm();

    showFirstUseError("");
    if (!application.name || application.name.length > FMA_APPLICATION_LIMITS.name) {
        showFirstUseError("신청자 이름을 80자 이내로 입력해 주세요.");
        document.getElementById("firstUseName")?.focus();
        return;
    }
    if (!application.organization || application.organization.length > FMA_APPLICATION_LIMITS.organization) {
        showFirstUseError("소속을 120자 이내로 입력해 주세요.");
        document.getElementById("firstUseOrganization")?.focus();
        return;
    }
    if (!isValidGmailAddress(application.email)) {
        showFirstUseError("@gmail.com 주소를 정확히 입력해 주세요.");
        document.getElementById("firstUseGmail")?.focus();
        return;
    }
    if (!application.purpose || application.purpose.length > FMA_APPLICATION_LIMITS.purpose) {
        showFirstUseError("사용목적을 500자 이내로 입력해 주세요.");
        document.getElementById("firstUsePurpose")?.focus();
        return;
    }
    if (!consentInput?.checked) {
        showFirstUseError("개인정보 처리방침을 읽고 동의해야 사용 신청을 저장할 수 있습니다.");
        consentInput?.focus();
        return;
    }

    fillApplicationForm(application);
    void requestRegistration(application);
}

function initFirstUseRegistration() {
    const modal = document.getElementById("firstUseModal");
    const button = document.getElementById("btnFirstUseContinue");
    if (!modal || !button) return;

    button.addEventListener("click", completeFirstUseRegistration);
    const emailInput = document.getElementById("firstUseGmail");
    ["firstUseGmail", "firstUseName", "firstUseOrganization", "firstUsePurpose"].forEach(id => {
        document.getElementById(id)?.addEventListener("input", () => updateFirstUseMailPreview());
    });
    emailInput?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            completeFirstUseRegistration();
        }
    });

    removeLegacyFirstUseRecords();
    const existingRecord = readFirstUseRecord();
    if (existingRecord?.email && String(existingRecord.status).toLowerCase() === "pending") {
        if (/^[a-f0-9]{64}$/i.test(String(existingRecord.requestId || ""))) {
            void verifyPendingRegistration(existingRecord);
        } else {
            removeFirstUseRecord();
            showRegistrationForm("보안이 강화된 이메일 인증을 다시 요청해 주세요.", existingRecord.email);
        }
        return;
    }
    if (existingRecord?.email && String(existingRecord.status).toLowerCase() === "registered") {
        if (registrationNeedsSync(existingRecord)) void verifyRegistration(existingRecord);
        else {
            unlockFirstUseModal();
            scheduleRegistrationSync(existingRecord);
            scheduleBlockedWatch(existingRecord, 1000);
        }
        return;
    }

    showRegistrationForm();
}

function rescheduleAfterAdminConfigChange() {
    const record = readFirstUseRecord();
    if (!record?.email || String(record.status).toLowerCase() !== "registered") return;
    clearRegistrationTimers();
    if (registrationNeedsSync(record)) void verifyRegistration(record);
    else {
        scheduleRegistrationSync(record);
        scheduleBlockedWatch(record, 1000);
    }
}

function checkBlockedStatusAfterReturn() {
    if (document.visibilityState !== "visible") return;
    const record = readFirstUseRecord();
    if (record?.email && String(record.status).toLowerCase() === "pending") {
        void verifyPendingRegistration(record);
        return;
    }
    if (!record?.email || String(record.status).toLowerCase() !== "registered") return;
    if (Date.now() - lastBlockedWatchAt < getBlockedWatchMs()) return;
    void verifyBlockedStatus(record);
}

window.addEventListener("beforeunload", clearRegistrationTimers);
window.addEventListener("fma-admin-config-changed", rescheduleAfterAdminConfigChange);
window.addEventListener("online", checkBlockedStatusAfterReturn);
document.addEventListener("visibilitychange", checkBlockedStatusAfterReturn);
window.addEventListener("storage", event => {
    if (event.key === window.FMAAdminConfig?.STORAGE_KEY) rescheduleAfterAdminConfigChange();
});
document.addEventListener("DOMContentLoaded", initFirstUseRegistration);
