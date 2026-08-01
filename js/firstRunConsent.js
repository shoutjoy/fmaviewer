/* =======================================================
   First-use consent and Gmail compose
   ======================================================= */

const FMA_FIRST_USE_STORAGE = "fma_viewer_first_use_consent_v1";
const FMA_FIRST_USE_RECIPIENT = "shoutjoy1@yonsei.ac.kr";
const FMA_GMAIL_COMPOSE_ENDPOINT = "https://mail.google.com/mail/u/";

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

function createGmailComposeUrl(email, firstUsedAt) {
    const params = new URLSearchParams({
        authuser: email,
        view: "cm",
        fs: "1",
        to: FMA_FIRST_USE_RECIPIENT,
        su: "FMA Viewer 사용 알림",
        body: createFirstUseMessage(email, firstUsedAt)
    });
    return `${FMA_GMAIL_COMPOSE_ENDPOINT}?${params.toString()}`;
}

function openGmailCompose(email, firstUsedAt) {
    const composeWindow = window.open(createGmailComposeUrl(email, firstUsedAt), "_blank");
    if (!composeWindow) throw new Error("POPUP_BLOCKED");
    try {
        composeWindow.opener = null;
    } catch (_) {}
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
        notificationMethod: "gmail-compose",
        gmailComposeOpenedAt: new Date().toISOString()
    };
}

function completeFirstUseConsent() {
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
    try {
        openGmailCompose(email, firstUsedAt);
        saveFirstUseRecord(createFirstUseRecord(email, firstUsedAt));
        unlockFirstUseModal(modal);
    } catch (error) {
        console.error("FMA Gmail compose could not be opened:", error);
        showFirstUseError("Gmail 작성 화면을 열지 못했습니다. 브라우저의 팝업 허용 후 다시 눌러 주세요.");
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
