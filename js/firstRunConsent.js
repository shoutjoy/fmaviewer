/* =======================================================
   First-use registration, periodic Sheet sync, and block watching
   ======================================================= */

const FMA_FIRST_USE_STORAGE = "fma_viewer_registration_v3";
const FMA_FIRST_USE_LEGACY_STORAGES = [
    "fma_viewer_access_approval_v2",
    "fma_viewer_first_use_consent_v1"
];
const FMA_NOTIFICATION_RECIPIENT = "shoutjoy1@yonsei.ac.kr";
const FMA_DEFAULT_GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw4Q4MEQtQlI40FE4_xKFyXbs88-uqQ-7lMERXTjljsMHkQ5LiGcQoTA666pxRMjbAU/exec";
const FMA_REGISTRATION_TIMEOUT_MS = 60000;
const FMA_REGISTRATION_RETRY_MS = 60 * 60 * 1000;

let firstUseMemoryRecord = null;
let registrationSyncTimer = null;
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

function formatFirstUseTimestamp(date) {
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}년 ${pad(date.getMonth() + 1)}월 ${pad(date.getDate())}일 ${pad(date.getHours())}시 ${pad(date.getMinutes())}분`;
}

function createFirstUseMessage(email, firstUsedAt) {
    const address = String(email || "입력된 메일").trim();
    return `${address}이 FMA Viewer를 ${formatFirstUseTimestamp(new Date(firstUsedAt))}에 사용 신청했습니다.`;
}

function updateFirstUseMailPreview(email, firstUsedAt = new Date().toISOString()) {
    const preview = document.getElementById("firstUseMailPreview");
    if (preview) preview.textContent = createFirstUseMessage(email, firstUsedAt);
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
    const emailInput = document.getElementById("firstUseGmail");
    const consentInput = document.getElementById("firstUsePrivacyConsent");
    const locked = mode === "requesting" || mode === "checking";

    if (emailInput) emailInput.disabled = locked;
    if (consentInput) consentInput.disabled = locked;
    if (!button) return;

    button.disabled = locked;
    if (mode === "requesting") button.textContent = "신청 정보 저장 중...";
    else if (mode === "checking") button.textContent = "등록 상태 동기화 중...";
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

function showRegistrationForm(message = "", email = "", blocked = false, errorMessage = "") {
    clearRegistrationTimers();
    const modal = document.getElementById("firstUseModal");
    const emailInput = document.getElementById("firstUseGmail");
    const consentInput = document.getElementById("firstUsePrivacyConsent");

    setFirstUsePageLocked(true);
    if (modal) modal.style.display = "flex";
    if (emailInput) emailInput.value = email;
    if (consentInput) consentInput.checked = false;
    updateFirstUseMailPreview(email);
    setFirstUseMode("idle");
    showFirstUseStatus(message, blocked ? "error" : "pending");
    showFirstUseError(blocked
        ? errorMessage || "이 Gmail은 관리자에 의해 사용이 중지되었습니다. 다른 Gmail로 신청할 수 있습니다."
        : "");
    emailInput?.focus();
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
        consentedAt: requestedAt,
        privacyPolicyVersion: "2026-08-01",
        notificationMethod: "gas-registration-notification",
        notificationRecipient: FMA_NOTIFICATION_RECIPIENT,
        notificationSent: result.notificationSent !== false,
        notificationWarning: String(result.warning || "")
    };
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

function clearBlockedWatchTimer() {
    if (blockedWatchTimer) clearTimeout(blockedWatchTimer);
    blockedWatchTimer = null;
}

function clearRegistrationTimers() {
    clearRegistrationSyncTimer();
    clearBlockedWatchTimer();
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

async function requestRegistration(userEmail) {
    const requestedAt = new Date().toISOString();
    setFirstUseMode("requesting");
    showFirstUseError("");
    showFirstUseStatus(`${userEmail}을 승인중입니다.`, "pending");
    updateFirstUseMailPreview(userEmail, requestedAt);

    try {
        const result = await fetchGasJson(getRegistrationGasUrl(), {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ email: userEmail })
        });
        if (!result?.success || !result?.saved || result?.blocked) {
            throw new Error(result?.message || "GAS_REGISTRATION_REJECTED");
        }

        const record = createRegistrationRecord(userEmail, result, requestedAt);
        saveFirstUseRecord(record);
        removeLegacyFirstUseRecords();
        scheduleRegistrationSync(record);
        scheduleBlockedWatch(record);

        if (result.notificationSent === false) {
            console.warn("Registration saved but administrator notification failed:", result.warning);
        }

        alert("사용 신청 정보가 저장되었습니다. FMA Viewer를 시작합니다.");
        unlockFirstUseModal();
    } catch (error) {
        console.error("FMA registration failed:", error);
        showFirstUseStatus("", "pending");
        showFirstUseError(describeGasError(error));
        setFirstUseMode("idle");
    }
}

async function verifyRegistration(record) {
    const modal = document.getElementById("firstUseModal");
    const emailInput = document.getElementById("firstUseGmail");
    const consentInput = document.getElementById("firstUsePrivacyConsent");

    clearRegistrationTimers();
    setFirstUsePageLocked(true);
    if (modal) modal.style.display = "flex";
    if (emailInput) emailInput.value = record.email || "";
    if (consentInput) consentInput.checked = true;
    updateFirstUseMailPreview(record.email, record.requestedAt || new Date().toISOString());
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
    const emailInput = document.getElementById("firstUseGmail");
    const consentInput = document.getElementById("firstUsePrivacyConsent");
    const email = String(emailInput?.value || "").trim().toLowerCase();

    showFirstUseError("");
    if (!isValidGmailAddress(email)) {
        showFirstUseError("@gmail.com 주소를 정확히 입력해 주세요.");
        emailInput?.focus();
        return;
    }
    if (!consentInput?.checked) {
        showFirstUseError("개인정보 처리방침을 읽고 동의해야 사용 신청을 저장할 수 있습니다.");
        consentInput?.focus();
        return;
    }

    void requestRegistration(email);
}

function initFirstUseRegistration() {
    const modal = document.getElementById("firstUseModal");
    const button = document.getElementById("btnFirstUseContinue");
    if (!modal || !button) return;

    button.addEventListener("click", completeFirstUseRegistration);
    const emailInput = document.getElementById("firstUseGmail");
    emailInput?.addEventListener("input", event => updateFirstUseMailPreview(event.currentTarget.value));
    emailInput?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            completeFirstUseRegistration();
        }
    });

    removeLegacyFirstUseRecords();
    const existingRecord = readFirstUseRecord();
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
