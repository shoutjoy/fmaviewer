(async function initializePasswordAdminAccess() {
    "use strict";

    if (window.FMAAuthSettingsReady) await window.FMAAuthSettingsReady;
    const settings = window.FMAAuthSettings || {};
    const configApi = window.FMAAdminConfig;
    if (!configApi) throw new Error("FMAAdminConfig is not available.");

    const prefix = String(settings.storagePrefix || "fma_viewer");
    const sessionKey = `${prefix}_admin_session_v2`;
    const gate = document.getElementById("adminAuthGate");
    const shell = document.getElementById("adminShell");
    const status = document.getElementById("adminAuthStatus");
    const description = document.getElementById("adminAuthDescription");
    const initialPasswordNotice = document.getElementById("adminInitialPasswordNotice");
    const loginForm = document.getElementById("adminLoginForm");
    const adminIdInput = document.getElementById("adminLoginId");
    const passwordInput = document.getElementById("adminLoginPassword");
    const loginButton = document.getElementById("adminLoginButton");
    const changeForm = document.getElementById("adminPasswordChangeForm");
    const newPasswordInput = document.getElementById("adminNewPassword");
    const newPasswordConfirmInput = document.getElementById("adminNewPasswordConfirm");
    const changeButton = document.getElementById("adminPasswordChangeButton");
    const logoutButton = document.getElementById("adminLogoutButton");
    const connectionCheckButton = document.getElementById("adminConnectionCheckButton");
    const expectedServerVersionLabel = document.getElementById("adminExpectedServerVersion");
    const bootstrapGasUrlField = document.getElementById("adminBootstrapGasUrlField");
    const bootstrapGasUrlInput = document.getElementById("adminBootstrapGasUrl");
    let adminLoaded = false;
    let pendingChangeSession = null;

    function setStatus(message, tone = "success") {
        status.textContent = message || "";
        status.dataset.tone = tone;
        status.hidden = !message;
    }


    function setGateBusy(task = "") {
        const busy = Boolean(task);
        adminIdInput.disabled = busy;
        passwordInput.disabled = busy;
        bootstrapGasUrlInput.disabled = busy;
        loginButton.disabled = busy;
        connectionCheckButton.disabled = busy;
        loginButton.textContent = task === "login" ? "로그인 확인 중…" : "로그인";
        connectionCheckButton.textContent = task === "connection" ? "인증 서버 확인 중…" : "인증 서버 연결 및 버전 점검";
    }

    function setChangeBusy(busy) {
        newPasswordInput.disabled = busy;
        newPasswordConfirmInput.disabled = busy;
        changeButton.disabled = busy;
        changeButton.textContent = busy ? "비밀번호 변경 중…" : "비밀번호 변경 후 관리자 열기";
    }

    function createRandomHex(byteLength = 16) {
        if (!window.crypto?.getRandomValues) throw new Error("안전한 브라우저 난수 기능을 사용할 수 없습니다.");
        const bytes = new Uint8Array(byteLength);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    }

    function hexToBytes(hex) {
        if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error("비밀번호 보안 정보를 확인할 수 없습니다.");
        return Uint8Array.from(hex.match(/.{2}/g), value => parseInt(value, 16));
    }

    function bytesToHex(buffer) {
        return Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, "0")).join("");
    }

    async function derivePasswordVerifier(password, saltHex, iterations) {
        if (!window.crypto?.subtle || typeof TextEncoder === "undefined") {
            throw new Error("이 브라우저에서는 안전한 비밀번호 처리를 사용할 수 없습니다.");
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

    function validateNewPassword(password, confirmation) {
        if (password !== confirmation) throw new Error("새 비밀번호 확인이 일치하지 않습니다.");
        if (password.length < 10 || password.length > 128) {
            throw new Error("새 비밀번호는 10~128자로 입력해 주세요.");
        }
        const typeCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
            .filter(pattern => pattern.test(password)).length;
        if (typeCount < 3) throw new Error("영문 대·소문자, 숫자, 특수문자 중 세 종류 이상을 사용해 주세요.");
    }

    function readSession() {
        try {
            const session = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
            if (!session || session.adminId !== "admin" ||
                !/^[a-f0-9]{64}$/i.test(String(session.token || "")) ||
                Date.parse(session.expiresAt) <= Date.now()) {
                sessionStorage.removeItem(sessionKey);
                return null;
            }
            return session;
        } catch (_) {
            sessionStorage.removeItem(sessionKey);
            return null;
        }
    }

    function saveSession(result) {
        const session = {
            adminId: String(result.adminId || "admin").toLowerCase(),
            token: String(result.adminSessionToken || "").toLowerCase(),
            expiresAt: String(result.expiresAt || ""),
            passwordChangeRequired: Boolean(result.passwordChangeRequired)
        };
        sessionStorage.setItem(sessionKey, JSON.stringify(session));
        return session;
    }

    function clearSession() {
        sessionStorage.removeItem(sessionKey);
        pendingChangeSession = null;
    }

    function createAdminRequestError(message, code) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    function normalizeServerVersion(value) {
        return String(value || "")
            .normalize("NFKC")
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .trim();
    }

    function assertExpectedServerVersion(result) {
        const expectedVersion = normalizeServerVersion(settings.serverVersion);
        if (!expectedVersion) {
            throw createAdminRequestError(
                `Auth/gas/Code.gs 버전을 확인하지 못했습니다. ${String(settings.serverVersionError || "Code.gs 배포 상태를 확인해 주세요.")}`,
                "CODE_VERSION_UNAVAILABLE"
            );
        }
        const actualVersion = normalizeServerVersion(result?.serverVersion || result?.version);
        if (actualVersion !== expectedVersion) {
            throw createAdminRequestError(
                `현재 GAS 배포는 구버전입니다(${actualVersion || "확인 불가"}). 관리자 로그인에는 ${expectedVersion}이 필요합니다. Apps Script의 Code.gs를 교체한 뒤 기존 웹 앱을 새 버전으로 재배포해 주세요.`,
                "GAS_VERSION_MISMATCH"
            );
        }
    }

    async function readJsonResponse(response) {
        const text = await response.text();
        if (response.redirected && /accounts\.google\.com/i.test(response.url || "")) {
            throw createAdminRequestError("Google 로그인을 요구하는 관리자용 GAS 주소가 저장되어 있습니다.", "GAS_AUTH_REQUIRED");
        }
        if (!response.ok || /^\s*(?:<!doctype|<html)/i.test(text)) {
            throw createAdminRequestError("저장된 GAS 주소가 공개 JSON 서버가 아닙니다.", "GAS_HTML_RESPONSE");
        }
        try {
            return JSON.parse(text);
        } catch (_) {
            throw createAdminRequestError("관리자 인증 서버가 JSON을 반환하지 않았습니다.", "GAS_INVALID_JSON");
        }
    }

    async function requestAdminActionAtUrl(gasWebAppUrl, payload) {
        const action = String(payload?.action || "");
        const timeoutMs = action === "admin-login" || action === "admin-change-password"
            ? 60000
            : 30000;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(gasWebAppUrl, {
                method: "POST",
                cache: "no-store",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            const result = await readJsonResponse(response);
            assertExpectedServerVersion(result);
            return result;
        } catch (error) {
            if (error?.name === "AbortError") {
                throw createAdminRequestError(
                    `관리자 인증 서버가 ${Math.round(timeoutMs / 1000)}초 안에 응답하지 않았습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.`,
                    "GAS_TIMEOUT"
                );
            }
            throw error;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    async function postAdminAction(payload, preferredGasWebAppUrl = "") {
        const config = configApi.load();
        const configuredUrl = String(preferredGasWebAppUrl || config.gasWebAppUrl || "");
        if (!configuredUrl) throw new Error("먼저 GAS 웹 앱의 /exec 배포 URL을 입력하고 연결을 점검해 주세요.");
        return requestAdminActionAtUrl(configuredUrl, payload);
    }

    function readBootstrapGasUrl() {
        return configApi.normalizeGasWebAppUrl(bootstrapGasUrlInput.value);
    }

    function saveBootstrapGasUrl(gasWebAppUrl) {
        const current = configApi.load();
        const saved = configApi.save({ ...current, gasWebAppUrl }, { recordHistory: false });
        bootstrapGasUrlInput.value = saved.gasWebAppUrl;
        bootstrapGasUrlField.hidden = false;
        return saved;
    }

    async function requestUsingBootstrapUrl(payload, saveAfterSuccess = true) {
        const gasWebAppUrl = readBootstrapGasUrl();
        const result = await requestAdminActionAtUrl(gasWebAppUrl, payload);
        if (saveAfterSuccess) saveBootstrapGasUrl(gasWebAppUrl);
        return result;
    }

    function loadAdminApplication(session) {
        gate.hidden = true;
        shell.hidden = false;
        const identityBadge = document.getElementById("adminIdentityBadge");
        if (identityBadge) identityBadge.textContent = session.adminId;
        if (adminLoaded) return;
        adminLoaded = true;
        const script = document.createElement("script");
        script.src = "admin.js?v=20260805-11";
        script.async = false;
        script.onerror = () => {
            adminLoaded = false;
            shell.hidden = true;
            gate.hidden = false;
            setStatus("관리자 설정 모듈을 불러오지 못했습니다.", "error");
        };
        document.body.appendChild(script);
    }

    function showLoginGate(message = "", tone = "success") {
        shell.hidden = true;
        gate.hidden = false;
        loginForm.hidden = false;
        changeForm.hidden = true;
        description.textContent = "FMA Viewer 관리자 아이디와 비밀번호를 입력해 주세요.";
        passwordInput.value = "";
        newPasswordInput.value = "";
        newPasswordConfirmInput.value = "";
        if (message) setStatus(message, tone);
        else setStatus("");
        window.setTimeout(() => passwordInput.focus(), 0);
    }

    async function checkAdminConnection() {
        setGateBusy("connection");
        setStatus("인증 서버 연결, 코드 버전과 Admin 시트를 확인하고 있습니다…", "success");
        try {
            const parameters = await requestUsingBootstrapUrl({ action: "admin-login-params", adminId: "admin" });
            if (!parameters?.success) throw new Error(parameters?.message || "Admin 시트의 관리자 계정을 확인할 수 없습니다.");
            initialPasswordNotice.hidden = !parameters.bootstrapPasswordRequired;
            setStatus(
                `연결 정상 · 서버 버전 ${String(settings.serverVersion || "확인 불가")} · Admin 시트 준비 완료`,
                "success"
            );
        } catch (error) {
            setStatus(String(error?.message || error), "error");
        } finally {
            setGateBusy();
        }
    }

    function showPasswordChange(session) {
        pendingChangeSession = session;
        shell.hidden = true;
        gate.hidden = false;
        loginForm.hidden = true;
        changeForm.hidden = false;
        initialPasswordNotice.hidden = true;
        description.textContent = "최초 로그인 보안을 위해 새 관리자 비밀번호를 설정해야 합니다.";
        setStatus("임시 비밀번호로 로그인했습니다. 새 비밀번호 설정을 완료해 주세요.", "success");
        window.setTimeout(() => newPasswordInput.focus(), 0);
    }

    async function login(event) {
        event.preventDefault();
        const adminId = String(adminIdInput.value || "").trim().toLowerCase();
        const password = String(passwordInput.value || "");
        if (adminId !== "admin" || !password) {
            setStatus("관리자 아이디와 비밀번호를 입력해 주세요.", "error");
            return;
        }

        setGateBusy("login");
        setStatus("관리자 로그인을 확인하고 있습니다…", "success");
        try {
            const gasWebAppUrl = readBootstrapGasUrl();
            const parameters = await requestUsingBootstrapUrl({ action: "admin-login-params", adminId });
            if (!parameters?.success) throw new Error(parameters?.message || "관리자 계정이 아직 준비되지 않았습니다.");
            initialPasswordNotice.hidden = !parameters.bootstrapPasswordRequired;

            const payload = { action: "admin-login", adminId };
            if (parameters.bootstrapPasswordRequired) {
                payload.bootstrapPassword = password;
            } else {
                payload.passwordVerifier = await derivePasswordVerifier(
                    password,
                    String(parameters.passwordSalt || ""),
                    Number(parameters.passwordIterations || settings.passwordIterations || 600000)
                );
            }

            const result = await postAdminAction(payload, gasWebAppUrl);
            if (!result?.success || !result?.adminAuthenticated ||
                !/^[a-f0-9]{64}$/i.test(String(result.adminSessionToken || ""))) {
                throw new Error(result?.message || "관리자 아이디 또는 비밀번호가 올바르지 않습니다.");
            }
            passwordInput.value = "";
            const session = saveSession(result);
            if (session.passwordChangeRequired) showPasswordChange(session);
            else loadAdminApplication(session);
        } catch (error) {
            clearSession();
            setStatus(String(error?.message || error), "error");
        } finally {
            setGateBusy();
        }
    }

    async function changePassword(event) {
        event.preventDefault();
        const session = pendingChangeSession || readSession();
        if (!session) {
            showLoginGate("관리자 세션이 만료되었습니다. 다시 로그인해 주세요.", "error");
            return;
        }

        const password = String(newPasswordInput.value || "");
        const confirmation = String(newPasswordConfirmInput.value || "");
        try {
            validateNewPassword(password, confirmation);
        } catch (error) {
            setStatus(String(error?.message || error), "error");
            return;
        }

        setChangeBusy(true);
        setStatus("새 관리자 비밀번호를 안전하게 저장하고 있습니다…", "success");
        try {
            const passwordSalt = createRandomHex(16);
            const passwordIterations = Number(settings.passwordIterations || 600000);
            const passwordVerifier = await derivePasswordVerifier(password, passwordSalt, passwordIterations);
            const result = await postAdminAction({
                action: "admin-change-password",
                adminSessionToken: session.token,
                passwordSalt,
                passwordVerifier,
                passwordIterations
            });
            if (!result?.success || !result?.adminAuthenticated) {
                throw new Error(result?.message || "관리자 비밀번호를 변경하지 못했습니다.");
            }
            newPasswordInput.value = "";
            newPasswordConfirmInput.value = "";
            pendingChangeSession = null;
            initialPasswordNotice.hidden = true;
            const updatedSession = saveSession(result);
            loadAdminApplication(updatedSession);
        } catch (error) {
            setStatus(String(error?.message || error), "error");
        } finally {
            setChangeBusy(false);
        }
    }

    async function verifySession(session) {
        const result = await postAdminAction({
            action: "admin-status",
            adminSessionToken: session.token
        });
        if (!result?.success || !result?.adminAuthenticated) {
            throw new Error(result?.message || "관리자 세션이 만료되었습니다.");
        }
        return saveSession(result);
    }

    async function logout() {
        const session = readSession();
        logoutButton.disabled = true;
        try {
            if (session) {
                await postAdminAction({
                    action: "admin-logout",
                    adminSessionToken: session.token
                });
            }
        } catch (error) {
            console.warn("Admin logout request failed:", error);
        } finally {
            clearSession();
            logoutButton.disabled = false;
            showLoginGate("관리자 계정에서 로그아웃했습니다.", "success");
        }
    }

    async function initialize() {
        loginForm.addEventListener("submit", event => void login(event));
        changeForm.addEventListener("submit", event => void changePassword(event));
        logoutButton.addEventListener("click", () => void logout());
        connectionCheckButton.addEventListener("click", () => void checkAdminConnection());
        expectedServerVersionLabel.textContent = String(settings.serverVersion || "Code.gs 확인 실패");
        const initialConfig = configApi.load();
        bootstrapGasUrlInput.value = String(initialConfig.gasWebAppUrl || "");
        bootstrapGasUrlField.hidden = false;

        const session = readSession();
        if (!session) {
            showLoginGate();
            if (bootstrapGasUrlInput.value) {
                setStatus("기본 인증 서버가 설정되어 있습니다. 로그인하거나 연결 상태를 먼저 점검할 수 있습니다.", "success");
            } else {
                setStatus("GAS 웹 앱의 /exec 배포 URL을 입력해 주세요.", "success");
            }
            return;
        }
        setStatus("기존 관리자 세션을 확인하고 있습니다…", "success");
        try {
            const verified = await verifySession(session);
            if (verified.passwordChangeRequired) showPasswordChange(verified);
            else loadAdminApplication(verified);
        } catch (error) {
            clearSession();
            showLoginGate(String(error?.message || error), "error");
        }
    }

    void initialize();
})();
