/* =======================================================
   First-use consent and Gmail notification
   ======================================================= */

const FMA_FIRST_USE_STORAGE = "fma_viewer_first_use_consent_v1";
const FMA_FIRST_USE_RECIPIENT = "shoutjoy1@yonsei.ac.kr";
const FMA_FIRST_USE_ENDPOINT = `https://formsubmit.co/ajax/${FMA_FIRST_USE_RECIPIENT}`;

function readFirstUseRecord() {
    try {
        return JSON.parse(localStorage.getItem(FMA_FIRST_USE_STORAGE) || "null");
    } catch (_) {
        return null;
    }
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
    return `${address}이 FMA Viewer를 ${formatFirstUseTimestamp(new Date(firstUsedAt))}에 사용합니다.`;
}

function updateFirstUseMailPreview(email, firstUsedAt = new Date().toISOString()) {
    const preview = document.getElementById("firstUseMailPreview");
    if (preview) preview.textContent = createFirstUseMessage(email, firstUsedAt);
}

async function sendFirstUseNotification(email, firstUsedAt) {
    const message = createFirstUseMessage(email, firstUsedAt);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(FMA_FIRST_USE_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                name: "FMA Viewer 사용자",
                email,
                message,
                _subject: "FMA Viewer 사용 알림",
                _template: "basic",
                _captcha: "false"
            }),
            signal: controller.signal
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false || result?.success === "false") {
            throw new Error(result?.message || `HTTP ${response.status}`);
        }
        return result;
    } finally {
        clearTimeout(timeoutId);
    }
}

function setFirstUseSending(sending) {
    const submitButton = document.getElementById("btnFirstUseContinue");
    const emailInput = document.getElementById("firstUseGmail");
    const consentInput = document.getElementById("firstUsePrivacyConsent");
    if (submitButton) {
        submitButton.disabled = sending;
        submitButton.textContent = sending ? "사용 알림을 보내는 중..." : "자동 알림 보내고 FMA Viewer 시작";
    }
    if (emailInput) emailInput.disabled = sending;
    if (consentInput) consentInput.disabled = sending;
}

function describeSendError(error) {
    if (error?.name === "AbortError") {
        return "자동 전송 시간이 초과되었습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.";
    }
    if (/activate form/i.test(String(error?.message || ""))) {
        return "FormSubmit 최초 연결 승인이 필요합니다. shoutjoy1@yonsei.ac.kr 받은편지함에서 'Activate Form' 메일을 승인한 뒤 다시 시도해 주세요.";
    }
    if (location.protocol === "file:") {
        return "자동 전송에 실패했습니다. 브라우저의 로컬 파일 제한일 수 있습니다. README의 로컬 HTTP 서버 방식으로 앱을 실행한 뒤 다시 시도해 주세요.";
    }
    return `자동 전송에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. (${error?.message || "전송 오류"})`;
}

function saveFirstUseRecord(record) {
    localStorage.setItem(FMA_FIRST_USE_STORAGE, JSON.stringify(record));
}

function unlockFirstUseModal(modal) {
    modal.style.display = "none";
    setFirstUsePageLocked(false);
}

function createFirstUseRecord(email, firstUsedAt) {
    return {
        email,
        firstUsedAt,
        consentedAt: firstUsedAt,
        privacyPolicyVersion: "2026-08-01",
        notificationMethod: "formsubmit-ajax",
        notificationSentAt: new Date().toISOString()
    };
}

async function completeFirstUseConsent() {
    const modal = document.getElementById("firstUseModal");
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
        showFirstUseError("개인정보 처리방침을 읽고 동의해야 앱을 시작할 수 있습니다.");
        consentInput?.focus();
        return;
    }

    const firstUsedAt = new Date().toISOString();
    updateFirstUseMailPreview(email, firstUsedAt);
    setFirstUseSending(true);
    try {
        await sendFirstUseNotification(email, firstUsedAt);
        saveFirstUseRecord(createFirstUseRecord(email, firstUsedAt));
        unlockFirstUseModal(modal);
    } catch (error) {
        console.error("FMA first-use notification failed:", error);
        showFirstUseError(describeSendError(error));
    } finally {
        setFirstUseSending(false);
    }
}

function showFirstUseError(message) {
    const error = document.getElementById("firstUseError");
    if (!error) return;
    error.textContent = message;
    error.hidden = !message;
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

function initFirstUseConsent() {
    const modal = document.getElementById("firstUseModal");
    const button = document.getElementById("btnFirstUseContinue");
    if (!modal || !button) return;

    const record = readFirstUseRecord();
    if (record?.email && record?.consentedAt) {
        modal.style.display = "none";
        setFirstUsePageLocked(false);
        return;
    }

    setFirstUsePageLocked(true);
    modal.style.display = "flex";
    button.addEventListener("click", completeFirstUseConsent);
    const emailInput = document.getElementById("firstUseGmail");
    updateFirstUseMailPreview(emailInput?.value);
    emailInput?.addEventListener("input", event => updateFirstUseMailPreview(event.currentTarget.value));
    emailInput?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            completeFirstUseConsent();
        }
    });
}

document.addEventListener("DOMContentLoaded", initFirstUseConsent);
